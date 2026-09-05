import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOrders, makeExecution, collectSnapshot } from './history.mjs';

const order = (id, extra = {}) => ({ orderId: id, symbol: 'US_TEST', currency: 'USD',
  side: 'BUY', status: 'FILLED', orderedAt: '2026-09-01T10:00:00+09:00',
  execution: { filledQuantity: '0.123456789012345678', averageFilledPrice: '99999999999.000000001',
    filledAmount: '12345678901.234', commission: '0.00', tax: null,
    filledAt: '2026-09-01T16:01:00Z', settlementDate: null }, ...extra });
const page = (orders, nextCursor = null) => ({ orders, nextCursor, hasNext: nextCursor != null });

test('all pages plus OPEN are fetched and overlapping cumulative executions are resolved by order ID', async () => {
  const calls = [];
  const current = order('same', { status: 'CANCELED' });
  const client = { get: async (path, account, query) => {
    calls.push({ path, account, query });
    if (path.endsWith('/same')) return current;
    if (query.status === 'OPEN') return page([order('same')]);
    return query.cursor ? page([order('two'), order('same')]) : page([order('same')], 'next');
  }};
  const result = await fetchOrders(client, '9223372036854775807');
  assert.equal(result.length, 2);
  assert.equal(result.find(o => o.orderId === 'same').status, 'CANCELED');
  assert.equal(calls.filter(c => c.path.endsWith('/same')).length, 1);
  assert.ok(calls.every(c => c.account === '9223372036854775807'));
});

test('pagination fails on cursor loops, missing completeness flags and unbounded history', async () => {
  await assert.rejects(fetchOrders({ get: async () => page([order('a')], 'loop') }, '1'), /CURSOR_STALLED/);
  await assert.rejects(fetchOrders({ get: async () => ({ orders: [] }) }, '1'), /INCOMPLETE/);
  await assert.rejects(fetchOrders({ get: async () => page([order('a')], 'next') }, '1', { maxPages: 1 }), /PAGE_LIMIT/);
});

test('exact decimals, KST date, partial cancellations and missing fees survive without invented P&L', () => {
  const result = makeExecution('1', order('a', { status: 'CANCELED' }));
  assert.equal(result.quantity, '0.123456789012345678');
  assert.equal(result.averagePrice, '99999999999.000000001');
  assert.equal(result.tradedAtKorea, '2026-09-02');
  assert.equal(result.commission, '0.00');
  assert.equal(result.tax, null);
  assert.deepEqual(result.issues, ['fees_pending']);
  assert.equal(result.pnl, null);
  assert.equal(makeExecution('1', order('a', { execution: { filledQuantity: '0.000' } })), null);
  assert.throws(() => makeExecution('1', order('a', { execution: { filledQuantity: 0.5 } })), /DECIMAL/);
});

function fixture(orders, holdings = { items: [] }) {
  return { get: async (path, _account, query) => path.endsWith('/accounts')
    ? [{ accountSeq: '1', accountType: 'BROKERAGE' }]
    : path.endsWith('/holdings') ? holdings
    : page(query.status === 'CLOSED' ? orders : []) };
}

test('recollection replaces facts, preserves disappeared history and never changes the input snapshot', async () => {
  const first = await collectSnapshot(fixture([order('a'), order('b')]));
  const original = JSON.stringify(first);
  const corrected = order('a', { execution: { ...order('a').execution, commission: '0.03' } });
  const second = await collectSnapshot(fixture([corrected]), first);
  assert.equal(JSON.stringify(first), original);
  assert.equal(second.accounts[0].executions.length, 2);
  assert.equal(second.accounts[0].executions[0].commission, '0.03');
  assert.deepEqual(second.accounts[0].notReturnedOrderIds, ['b']);
});

test('account disappearance and incomplete holdings fail without producing a new checkpoint', async () => {
  const first = await collectSnapshot(fixture([order('a')]));
  await assert.rejects(collectSnapshot(fixture([], {}), first), /HOLDINGS/);
  const changed = structuredClone(first); changed.accounts[0].accountId = '2';
  await assert.rejects(collectSnapshot(fixture([]), changed), /ACCOUNT_NOT_AVAILABLE/);
});
