import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFeed, FeedPublisher, cleanFeedCode, recordId } from './feed.mjs';
const code = 'TJBF' + 'ab'.repeat(32);
const snapshot = { collectedAt: '2026-09-05T15:00:00Z', accounts: [{
  accountId: 'sensitive_account', notReturnedOrderIds: [], holdings: { items: [] },
  executions: [{ id: 'toss:sensitive_account:private_order', accountId: 'sensitive_account', orderId: 'private_order',
    source: 'toss', symbol: 'TEST', executedAt: '2026-09-05T13:00:00Z', quantity: '0.00000000001', pnl: null }],
}] };

test('cloud feed removes account/order identifiers and is separate from the ordinary journal', () => {
  const feed = makeFeed(snapshot);
  assert.equal(feed.rows[0].quantity, '0.00000000001');
  assert.ok(!JSON.stringify(feed).includes('sensitive_account'));
  assert.ok(!JSON.stringify(feed).includes('private_order'));
  assert.throws(() => cleanFeedCode('ordinary-journal-code'));
  assert.notEqual(recordId(code, 'data'), recordId(code, 'status'));
  assert.notEqual(recordId(code, 'data'), code);
});

test('data is read back before successful status; unchanged data publishes only the small status', async () => {
  const records = new Map(), writes = [];
  const publisher = new FeedPublisher(code, async (url, options) => {
    assert.ok(url.startsWith('https://oxogtsfxdjbctzehxvae.supabase.co/rest/v1/rpc/'));
    const body = JSON.parse(options.body);
    if (url.endsWith('sync_push')) { records.set(body.p_sync_id, body.p_data); writes.push(body); }
    return { ok: true, json: async () => url.endsWith('sync_pull') ? [{ data: records.get(body.p_sync_id) }] : 'ok' };
  });
  const published = await publisher.publish(snapshot);
  assert.deepEqual(writes.map(w => w.p_data.kind), ['broker-feed', 'broker-status']);
  await publisher.publish(snapshot, published);
  assert.deepEqual(writes.map(w => w.p_data.kind), ['broker-feed', 'broker-status', 'broker-status']);
});

test('failed cloud verification cannot advertise a successful sync', async () => {
  const writes = [];
  const publisher = new FeedPublisher(code, async (url, options) => {
    if (url.endsWith('sync_push')) writes.push(JSON.parse(options.body));
    return { ok: true, json: async () => [] };
  });
  await assert.rejects(publisher.publish(snapshot), /VERIFY_FAILED/);
  assert.equal(writes.length, 1);
});

test('journal includes only executions since January 1 2026 in Korean time', () => {
  const s = structuredClone(snapshot);
  s.accounts[0].executions = [
    { ...snapshot.accounts[0].executions[0], id: 'old', executedAt: '2025-12-31T14:59:59Z' },
    { ...snapshot.accounts[0].executions[0], id: 'new', executedAt: '2025-12-31T15:00:00Z' },
    { ...snapshot.accounts[0].executions[0], id: 'unknown', executedAt: null },
  ];
  const feed = makeFeed(s);
  assert.equal(feed.rows.length, 1);
  assert.equal(feed.rows[0].executedAt, '2025-12-31T15:00:00Z');
  assert.equal(feed.periodStart, '2026-01-01T00:00:00+09:00');
});
