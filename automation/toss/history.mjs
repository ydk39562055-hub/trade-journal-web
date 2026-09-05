import { integer } from '../ctrader/protocol.mjs';

const accountId = value => {
  const n = integer(value);
  if (n <= 0n) throw new Error('INVALID_ACCOUNT_ID');
  return String(n);
};
const orderId = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error('INVALID_ORDER_ID');
  return value;
};
const money = value => {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^-?\d{1,40}(\.\d{1,30})?$/.test(value)) throw new Error('INVALID_DECIMAL');
  return value;
};
const positive = value => value != null && !value.startsWith('-') && /[1-9]/.test(value);
const date = value => {
  if (value == null) return null;
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('INVALID_EXECUTION_TIMESTAMP');
  }
  return value;
};

// One row is the cumulative execution of ONE ORDER, not an individual exchange fill.
// Repeated retrieval replaces this fact row; user annotations belong elsewhere.
export function makeExecution(account, order) {
  const quantity = money(order.execution?.filledQuantity);
  if (!positive(quantity)) return null;
  const e = order.execution;
  const issues = [];
  const price = money(e.averageFilledPrice), amount = money(e.filledAmount);
  const commission = money(e.commission), tax = money(e.tax);
  const executedAt = date(e.filledAt);
  if (!positive(price)) issues.push('execution_price_missing');
  if (amount == null) issues.push('filled_amount_missing');
  if (commission == null || tax == null) issues.push('fees_pending');
  if (!executedAt) issues.push('execution_time_missing');
  if (!['USD', 'KRW'].includes(order.currency)) issues.push('unsupported_currency');
  if (!['BUY', 'SELL'].includes(order.side)) issues.push('unknown_side');
  if (typeof order.symbol !== 'string' || !order.symbol) issues.push('symbol_missing');
  return {
    id: `toss:${accountId(account)}:${orderId(order.orderId)}`,
    source: 'toss', accountId: accountId(account), orderId: order.orderId,
    aggregation: 'order', symbol: order.symbol ?? null, side: order.side,
    status: order.status, currency: order.currency, quantity, averagePrice: price,
    filledAmount: amount, commission, tax, executedAt,
    tradedAtKorea: executedAt ? new Date(Date.parse(executedAt) + 9 * 3600000).toISOString().slice(0, 10) : null,
    settlementDate: e.settlementDate ?? null, orderedAt: date(order.orderedAt),
    issues,
    // An order's filledAmount is turnover, never realised profit. No guessed P&L.
    pnl: null, pnlStatus: 'unreconciled',
  };
}

export async function fetchOrders(client, account, { maxPages = 500 } = {}) {
  const rows = new Map(), duplicated = new Set(), cursors = new Set();
  let cursor;
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new Error('HISTORY_PAGE_LIMIT_REACHED');
    // Dates filter order CREATION, not execution. Full scans catch late fills and corrections.
    const result = await client.get('/api/v1/orders', account, { status: 'CLOSED', limit: 100, cursor });
    if (!Array.isArray(result.orders) || typeof result.hasNext !== 'boolean') throw new Error('INCOMPLETE_HISTORY_RESPONSE');
    for (const order of result.orders) {
      const key = orderId(order.orderId);
      if (rows.has(key)) duplicated.add(key);
      rows.set(key, order);
    }
    if (!result.hasNext) break;
    if (!result.orders.length || typeof result.nextCursor !== 'string' || !result.nextCursor
      || cursors.has(result.nextCursor)) throw new Error('HISTORY_CURSOR_STALLED');
    cursor = result.nextCursor; cursors.add(cursor);
  }
  const open = await client.get('/api/v1/orders', account, { status: 'OPEN' });
  if (!Array.isArray(open.orders) || open.hasNext === true) throw new Error('INCOMPLETE_OPEN_ORDERS');
  for (const order of open.orders) {
    const key = orderId(order.orderId);
    if (rows.has(key)) duplicated.add(key);
    rows.set(key, order);
  }
  // Pagination and OPEN/CLOSED can overlap while orders change. Resolve conflicts by ID.
  for (const key of duplicated) {
    const current = await client.get('/api/v1/orders/' + key, account);
    if (current.orderId !== key) throw new Error('ORDER_ID_MISMATCH');
    rows.set(key, current);
  }
  return [...rows.values()];
}

export async function collectSnapshot(client, previous = null, { now = () => new Date().toISOString() } = {}) {
  const startedAt = now();
  const accounts = await client.get('/api/v1/accounts');
  if (!Array.isArray(accounts) || !accounts.length) throw new Error('NO_ACCOUNTS_AVAILABLE');
  const ids = accounts.map(a => accountId(a.accountSeq));
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_ACCOUNT');
  if (previous && (previous.version !== 1 || previous.source !== 'toss'
    || !Array.isArray(previous.accounts))) throw new Error('INVALID_PREVIOUS_SNAPSHOT');
  if (previous?.accounts.some(a => !ids.includes(a.accountId))) throw new Error('PREVIOUS_ACCOUNT_NOT_AVAILABLE');
  const collected = [];
  for (const account of accounts) {
    const id = accountId(account.accountSeq);
    const old = previous?.accounts.find(a => a.accountId === id);
    const fetched = await fetchOrders(client, id);
    const seen = new Set(fetched.map(o => o.orderId));
    const orders = new Map((old?.orders || []).map(o => [o.orderId, o]));
    for (const order of fetched) orders.set(order.orderId, order);
    const holdings = await client.get('/api/v1/holdings', id);
    if (!Array.isArray(holdings?.items)) throw new Error('INCOMPLETE_HOLDINGS_RESPONSE');
    const executions = [...orders.values()].map(order => makeExecution(id, order)).filter(Boolean);
    collected.push({ accountId: id, accountType: account.accountType,
      orders: [...orders.values()], executions, holdings,
      // History retention can change. Previously observed facts are never silently deleted.
      notReturnedOrderIds: [...orders.keys()].filter(key => !seen.has(key)),
    });
  }
  return { version: 1, source: 'toss', startedAt, collectedAt: now(),
    coverage: 'all_currently_available_api_orders', accounts: collected };
}
