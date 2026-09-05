// Server only. Credentials are sent exclusively to Toss's official HTTPS origin.
import { setTimeout as sleep } from 'node:timers/promises';
import { parseWire } from '../ctrader/protocol.mjs';

const ORIGIN = 'https://openapi.tossinvest.com';
const SAFE_CODES = new Set(['invalid_client', 'invalid_request', 'ip-not-allowed',
  'account-not-found', 'account-header-required', 'rate-limit-exceeded',
  'invalid-token', 'expired-token', 'access-denied', 'forbidden']);

export class TossError extends Error {
  constructor(status, code) {
    super(`TOSS_HTTP_${status}`);
    this.status = status;
    this.code = SAFE_CODES.has(code) ? code : null;
  }
}

export function credentialsFromNote(note) {
  const lines = note.replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim());
  const result = {};
  for (const [key, label] of [['clientId', 'client[_ -]?id'], ['clientSecret', 'client[_ -]?secret']]) {
    const matches = [];
    const pattern = new RegExp(`^${label}\\s*(?:[:=]\\s*(.+))?$`, 'i');
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern);
      if (!match) continue;
      const value = match[1] || lines.slice(i + 1).find(Boolean);
      if (!value || !/^[A-Za-z0-9_.~+/=-]{12,512}$/.test(value)) throw new Error('INVALID_CREDENTIAL_FORMAT');
      matches.push(value);
    }
    if (matches.length !== 1) throw new Error('CREDENTIAL_LABEL_MISSING_OR_DUPLICATED');
    result[key] = matches[0];
  }
  return result;
}

export class TossClient {
  #credentials; #fetch; #sleep; #token = null; #expiresAt = 0;
  #queue = Promise.resolve(); #lastRequest = 0;
  constructor(credentials, { fetchImpl = fetch, delay = sleep } = {}) {
    if (!credentials?.clientId || !credentials?.clientSecret) throw new Error('TOSS_CREDENTIALS_REQUIRED');
    this.#credentials = credentials; this.#fetch = fetchImpl; this.#sleep = delay;
  }
  async #response(path, options) {
    const response = await this.#fetch(ORIGIN + path, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    let body;
    try { body = parseWire(await response.text()); }
    catch { throw new TossError(response.status, null); }
    if (!response.ok || body.error) throw new TossError(response.status,
      typeof body.error === 'string' ? body.error : body.error?.code);
    return body;
  }
  async #authenticate() {
    if (this.#token && Date.now() < this.#expiresAt - 60000) return;
    const body = await this.#response('/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials',
        client_id: this.#credentials.clientId, client_secret: this.#credentials.clientSecret }),
    });
    if (typeof body.access_token !== 'string' || body.token_type?.toLowerCase() !== 'bearer'
      || !Number.isSafeInteger(body.expires_in) || body.expires_in <= 60) throw new Error('INVALID_TOKEN_RESPONSE');
    this.#token = body.access_token; this.#expiresAt = Date.now() + body.expires_in * 1000;
  }
  get(path, accountSeq = null, query = {}) {
    // No caller-supplied method or origin: order placement/cancel/replace cannot pass.
    if (!['/api/v1/accounts', '/api/v1/orders', '/api/v1/holdings', '/api/v1/stocks'].includes(path)
      && !/^\/api\/v1\/orders\/[A-Za-z0-9_-]+$/.test(path)) throw new Error('READ_ONLY_OPERATION_REQUIRED');
    if (!['/api/v1/accounts', '/api/v1/stocks'].includes(path) && !/^\d+$/.test(String(accountSeq))) throw new Error('ACCOUNT_REQUIRED');
    const operation = this.#queue.then(async () => {
      await this.#sleep(Math.max(0, 350 - (Date.now() - this.#lastRequest)));
      this.#lastRequest = Date.now();
      const suffix = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null));
      for (let attempt = 0; attempt < 2; attempt++) {
        await this.#authenticate();
        const headers = { Authorization: `Bearer ${this.#token}` };
        if (accountSeq != null) headers['X-Tossinvest-Account'] = String(accountSeq);
        try {
          const body = await this.#response(path + (suffix.size ? '?' + suffix : ''), { method: 'GET', headers });
          if (!Object.hasOwn(body, 'result') || body.result == null) throw new Error('INCOMPLETE_TOSS_RESPONSE');
          return body.result;
        } catch (e) {
          // A token issued elsewhere invalidates this one. Reauthenticate once; never loop.
          if (e.status !== 401 || attempt !== 0) throw e;
          this.#token = null; this.#expiresAt = 0;
          await this.#sleep(1000);
        }
      }
    });
    this.#queue = operation.catch(() => {});
    return operation;
  }
}
