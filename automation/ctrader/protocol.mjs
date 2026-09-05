// Server-only, Node >= 24. Never load this file from the public journal page.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Spotware OpenApiModelMessages.proto: intentionally no trading operations.
const REQUESTS = new Map([
  [2100, 2101], [2102, 2103], [2112, 2113], [2114, 2115],
  [2121, 2122], [2124, 2125], [2133, 2134], [2149, 2150],
]);

export function integer(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('UNSAFE_INTEGER');
  if (!/^-?\d+$/.test(String(value))) throw new Error('INVALID_INTEGER');
  return BigInt(value);
}

export function parseWire(text) {
  // JSON.parse context.source prevents rounding 64-bit deal/account identifiers.
  return JSON.parse(text, (_key, value, context) =>
    typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)
      ? context.source : value);
}

export const stringifyWire = value => JSON.stringify(value, (_key, v) =>
  typeof v === 'bigint' ? JSON.rawJSON(v.toString()) : v);

export class ReadOnlyClient {
  #socket;
  #pending = new Map();
  #heartbeat;
  #queue = Promise.resolve();
  #lastSent = 0;
  #timeoutMs;
  #spacingMs;

  constructor({ timeoutMs = 15000, spacingMs = 260 } = {}) {
    this.#timeoutMs = timeoutMs;
    this.#spacingMs = spacingMs;
  }

  async connect(environment, WebSocketClass = globalThis.WebSocket) {
    if (!['live', 'demo'].includes(environment)) throw new Error('INVALID_ENVIRONMENT');
    if (this.#socket) throw new Error('ALREADY_CONNECTED');
    const ws = this.#socket = new WebSocketClass(`wss://${environment}.ctraderapi.com:5036`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new Error('CONNECT_TIMEOUT')); }, this.#timeoutMs);
      const finish = error => {
        clearTimeout(timer);
        ws.removeEventListener('open', opened);
        ws.removeEventListener('error', failed);
        ws.removeEventListener('close', failed);
        error ? reject(error) : resolve();
      };
      const opened = () => finish();
      const failed = () => finish(new Error('CONNECT_FAILED'));
      ws.addEventListener('open', opened);
      ws.addEventListener('error', failed);
      ws.addEventListener('close', failed);
    });
    ws.addEventListener('message', e => this.#receive(e.data));
    ws.addEventListener('error', () => this.close('CONNECTION_ERROR'));
    ws.addEventListener('close', () => this.close('CONNECTION_CLOSED'));
    this.#heartbeat = setInterval(() => {
      if (ws.readyState === 1) ws.send(stringifyWire({ payloadType: 51, payload: {} }));
    }, 10000);
    this.#heartbeat.unref?.();
  }

  async request(payloadType, payload = {}) {
    if (!REQUESTS.has(payloadType)) throw new Error('READ_ONLY_OPERATION_REQUIRED');
    // Serial admission keeps history requests below the official 5/second limit.
    const slot = this.#queue.then(async () => {
      await delay(Math.max(0, this.#spacingMs - (Date.now() - this.#lastSent)));
      this.#lastSent = Date.now();
    });
    this.#queue = slot.catch(() => {});
    await slot;
    if (this.#socket?.readyState !== 1) throw new Error('NOT_CONNECTED');
    const clientMsgId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(clientMsgId);
        reject(new Error('REQUEST_TIMEOUT'));
      }, this.#timeoutMs);
      this.#pending.set(clientMsgId, { resolve, reject, timer, expected: REQUESTS.get(payloadType) });
      try { this.#socket.send(stringifyWire({ clientMsgId, payloadType, payload })); }
      catch { clearTimeout(timer); this.#pending.delete(clientMsgId); reject(new Error('SEND_FAILED')); }
    });
  }

  #receive(text) {
    let message;
    try { message = parseWire(String(text)); }
    catch { this.close('INVALID_RESPONSE'); return; }
    if ([2147, 2148, 2164].includes(message.payloadType)) {
      this.close('ACCOUNT_CONNECTION_REVOKED'); return;
    }
    const pending = this.#pending.get(message.clientMsgId);
    if (!pending) return; // heartbeat and unsolicited execution events
    this.#pending.delete(message.clientMsgId);
    clearTimeout(pending.timer);
    if (message.payloadType !== pending.expected || message.payload?.errorCode) {
      // Do not echo server descriptions: they can include credentials or identifiers.
      pending.reject(new Error('API_REQUEST_REJECTED'));
    } else pending.resolve(message.payload);
  }

  close(reason = 'CLIENT_CLOSED') {
    clearInterval(this.#heartbeat);
    for (const p of this.#pending.values()) { clearTimeout(p.timer); p.reject(new Error(reason)); }
    this.#pending.clear();
    const ws = this.#socket;
    this.#socket = null;
    if (ws && ws.readyState < 2) ws.close();
  }
}
