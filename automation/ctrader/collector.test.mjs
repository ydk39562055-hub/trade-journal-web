import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadOnlyClient, parseWire, stringifyWire, integer } from './protocol.mjs';
import { decimal, mergeDeals, fetchDeals, makeInbox, collectSnapshot } from './history.mjs';

const deal = (n, overrides = {}) => ({ dealId: String(n), orderId: String(n + 100), positionId: '8',
  symbolId: '9', filledVolume: 100, volume: 100, executionPrice: 20000,
  executionTimestamp: 1000 + n, dealStatus: 2, tradeSide: 1, commission: -10, moneyDigits: 2, ...overrides });
const close = (n, volume, overrides = {}) => deal(n, { tradeSide: 2, filledVolume: volume,
  closePositionDetail: { entryPrice: 20000, grossProfit: 4000, swap: -100, commission: -20,
    closedVolume: volume, moneyDigits: 2 }, ...overrides });
const snapshot = (deals, positions = []) => ({ accountId: '42', environment: 'live', currency: 'USD',
  symbols: [{ symbolId: '9', symbolName: 'US100' }], deals, positions });

test('64-bit identifiers round-trip as numeric JSON without rounding', () => {
  const input = '{"dealId":9223372036854775807,"price":1.125}';
  const parsed = parseWire(input);
  assert.equal(parsed.dealId, '9223372036854775807');
  assert.equal(parsed.price, 1.125);
  assert.equal(stringifyWire({ dealId: integer(parsed.dealId), price: parsed.price }), input);
  assert.throws(() => integer(9007199254740992), /UNSAFE/);
});

test('scaled money preserves signs, precision, missing values', () => {
  assert.equal(decimal(-10053099944n, 8), '-100.53099944');
  assert.equal(decimal(0, 2), '0.00');
  assert.equal(decimal(5, 0), '5');
  assert.equal(decimal(5, undefined), null);
  assert.equal(decimal(null, 2), null);
  assert.throws(() => decimal(1, -1), /INVALID/);
});

test('overlapping histories and delayed corrections do not duplicate deals', () => {
  const a = deal(1, { utcLastUpdateTimestamp: 3000 });
  const b = deal(1, { commission: -11, utcLastUpdateTimestamp: 4000 });
  const merged = mergeDeals([a], [b, a]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].commission, -11);
});

test('history splits saturated ranges without losing equal-time executions', async () => {
  const rows = [deal(1, { executionTimestamp: 1 }), deal(2, { executionTimestamp: 1 }), deal(3, { executionTimestamp: 3 })];
  const calls = [];
  const client = { request: async (type, p) => {
    calls.push([type, p.fromTimestamp, p.toTimestamp]);
    const found = rows.filter(d => d.executionTimestamp >= p.fromTimestamp && d.executionTimestamp <= p.toTimestamp);
    return { ctidTraderAccountId: 42, hasMore: found.length > 2, deal: found.slice(0, 2) };
  } };
  assert.equal((await fetchDeals(client, '42', 0, 3)).length, 3);
  assert.deepEqual(calls, [[2133, 0, 3], [2133, 0, 1], [2133, 2, 3]]);
});

test('irreducibly truncated and malformed histories fail instead of advancing', async () => {
  await assert.rejects(fetchDeals({ request: async () => ({ ctidTraderAccountId: 42, hasMore: true }) }, 42, 1, 1), /TRUNCATED/);
  await assert.rejects(fetchDeals({ request: async () => ({ ctidTraderAccountId: 42 }) }, 42, 1, 1), /INCOMPLETE/);
  await assert.rejects(fetchDeals({ request: async () => ({ ctidTraderAccountId: 99, hasMore: false }) }, 42, 1, 1), /MISMATCH/);
});

test('history queries use disjoint daily ranges and reject future overflow', async () => {
  const ranges = [];
  await fetchDeals({ request: async (_type, p) => {
    ranges.push([p.fromTimestamp, p.toTimestamp]);
    return { ctidTraderAccountId: 42, hasMore: false };
  } }, 42, 0, 86400000);
  assert.deepEqual(ranges, [[0, 86399999], [86400000, 86400000]]);
  await assert.rejects(fetchDeals({}, 42, 0, 2147483646001), /TIMESTAMP/);
});

test('partial closes group by position; original long direction survives sells', () => {
  const rows = [deal(1, { filledVolume: 1000 }), close(2, 400), close(3, 600)];
  const [item] = makeInbox(snapshot(rows));
  assert.equal(item.executions.length, 3);
  assert.equal(item.status, 'closed');
  assert.equal(item.direction, 'long');
  assert.equal(item.executions[1].quantityUnits, '4.00');
  assert.equal(item.executions[1].close.swap, '-1.00');
  assert.equal(item.executions[1].close.realisedCommission, '-0.20');
  assert.equal(item.reviewRequired, true);
  assert.equal('pnl' in item, false); // no guessed fee formula or automatic stats writes
});

test('partially filled executions use filled volume and ignore rejected orders', () => {
  const [item] = makeInbox(snapshot([deal(1, { dealStatus: 3, volume: 1000, filledVolume: 400 }),
    deal(2, { dealStatus: 4 }), close(3, 400)]));
  assert.equal(item.executions.length, 2);
  assert.equal(item.status, 'closed');
});

test('partial close is holding while broker reports remaining quantity', () => {
  const positions = [{ positionId: '8', tradeData: { volume: 600 } }];
  const [item] = makeInbox(snapshot([deal(1, { filledVolume: 1000 }), close(2, 400)], positions));
  assert.equal(item.status, 'holding');
  assert.equal(item.remainingUnits, '6.00');
});

test('missing opening executions and unknown currency require review', () => {
  const s = snapshot([close(2, 100)]); s.currency = null;
  const [item] = makeInbox(s);
  assert.equal(item.status, 'needs_review');
  assert.equal(item.direction, null);
  assert.ok(item.issues.includes('opening_execution_missing'));
  assert.ok(item.issues.includes('account_currency_missing'));
});

test('mixed reversal executions and missing price are retained for review', () => {
  const [item] = makeInbox(snapshot([deal(1, { filledVolume: 1000 }), close(2, 500, { filledVolume: 1000, executionPrice: undefined })]));
  assert.ok(item.issues.includes('reversal_or_mixed_execution'));
  assert.ok(item.issues.includes('execution_price_missing'));
});

test('same position IDs across environments/accounts never collide', () => {
  const s = snapshot([deal(1), close(2, 100)]);
  const ids = [s, { ...s, environment: 'demo' }, { ...s, accountId: '43' }].map(x => makeInbox(x)[0].id);
  assert.equal(new Set(ids).size, 3);
});

test('Korean journal dates preserve original UTC execution timestamp', () => {
  const at = Date.parse('2026-09-05T16:00:00Z');
  const [item] = makeInbox(snapshot([deal(1, { executionTimestamp: at })]));
  assert.equal(item.executions[0].tradedAtKorea, '2026-09-06');
  assert.equal(item.executions[0].executedAt, '2026-09-05T16:00:00.000Z');
});

function fakeClient(scope = 0, failedType = null) {
  const calls = [];
  return { calls, request: async (type, p) => {
    calls.push(type);
    if (type === failedType) throw new Error('TEST_FAILURE');
    if (type === 2100) return {};
    if (type === 2149) return { permissionScope: scope, accessToken: 'private-token', ctidTraderAccount: [{ ctidTraderAccountId: 42, isLive: true }] };
    const base = { ctidTraderAccountId: 42 };
    if (type === 2121) return { ...base, trader: { ...base, depositAssetId: 1 } };
    if (type === 2112) return { ...base, asset: [{ assetId: 1, name: 'USD' }] };
    if (type === 2114) return { ...base, symbol: [{ symbolId: 9, symbolName: 'US100' }] };
    if (type === 2133) return { ...base, hasMore: false, deal: [deal(1), close(2, 100)].filter(d => d.executionTimestamp >= p.fromTimestamp && d.executionTimestamp <= p.toTimestamp) };
    return base;
  } };
}
const options = { clientId: 'test-client', clientSecret: 'private-secret', accessToken: 'private-token',
  accountId: '42', environment: 'live', from: 0, to: 2000 };

test('snapshot contains no credentials and only calls read operations', async () => {
  const client = fakeClient();
  const result = await collectSnapshot(client, options);
  assert.equal(result.snapshot.through, 2000);
  assert.equal(result.inbox.length, 1);
  assert.ok(!JSON.stringify(result).includes('private-'));
  assert.deepEqual(client.calls, [2100, 2149, 2102, 2121, 2112, 2114, 2133, 2124]);
});

test('collection refuses trading tokens before authorizing any account', async () => {
  for (const scope of [1, 'SCOPE_TRADE', undefined]) {
    const client = fakeClient(scope === undefined ? null : scope);
    await assert.rejects(collectSnapshot(client, options), /VIEW_ONLY/);
    assert.deepEqual(client.calls, [2100, 2149]);
  }
});

test('incremental pass is idempotent; interrupted pass leaves previous checkpoint intact', async () => {
  const first = await collectSnapshot(fakeClient(), options);
  const second = await collectSnapshot(fakeClient(), { ...options, to: 3000, previous: first.snapshot });
  assert.equal(second.snapshot.deals.length, 2);
  assert.equal(second.snapshot.through, 3000);
  await assert.rejects(collectSnapshot(fakeClient(0, 2124), { ...options, to: 4000, previous: second.snapshot }), /TEST_FAILURE/);
  assert.equal(second.snapshot.through, 3000);
});

test('ledger account/start/environment changes fail closed', async () => {
  const first = await collectSnapshot(fakeClient(), options);
  await assert.rejects(collectSnapshot(fakeClient(), { ...options, accountId: '99', previous: first.snapshot }), /LEDGER_ACCOUNT/);
  await assert.rejects(collectSnapshot(fakeClient(), { ...options, from: 1, previous: first.snapshot }), /LEDGER_START/);
  await assert.rejects(collectSnapshot(fakeClient(), { ...options, environment: 'demo' }), /NOT_GRANTED/);
});

class FakeSocket extends EventTarget {
  static instances = [];
  readyState = 0;
  sent = [];
  constructor(url) {
    super(); this.url = url; FakeSocket.instances.push(this);
    queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); });
  }
  send(text) { this.sent.push(parseWire(text)); }
  reply(payload) { this.dispatchEvent(new MessageEvent('message', { data: stringifyWire(payload) })); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('wire client rejects order APIs locally and matches response types', async () => {
  const client = new ReadOnlyClient({ spacingMs: 0 });
  await client.connect('demo', FakeSocket);
  const ws = FakeSocket.instances.at(-1);
  try {
    await assert.rejects(client.request(2106, {}), /READ_ONLY/);
    assert.equal(ws.sent.length, 0);
    const pending = client.request(2121, { ctidTraderAccountId: 42n });
    await tick();
    ws.reply({ clientMsgId: ws.sent[0].clientMsgId, payloadType: 2122, payload: { ctidTraderAccountId: 42 } });
    assert.equal((await pending).ctidTraderAccountId, 42);
  } finally { client.close(); }
});

test('wire client sanitizes API errors and promptly rejects invalidated sessions', async () => {
  const client = new ReadOnlyClient({ spacingMs: 0 });
  await client.connect('demo', FakeSocket);
  const ws = FakeSocket.instances.at(-1);
  try {
    const p = client.request(2100, {});
    const rejected = assert.rejects(p, { message: 'API_REQUEST_REJECTED' });
    await tick();
    ws.reply({ clientMsgId: ws.sent[0].clientMsgId, payloadType: 2142, payload: { description: 'private-secret' } });
    await rejected;
    const pending = client.request(2121, {});
    const revoked = assert.rejects(pending, /REVOKED/);
    await tick(); ws.reply({ payloadType: 2147, payload: {} });
    await revoked;
  } finally { client.close(); }
});
