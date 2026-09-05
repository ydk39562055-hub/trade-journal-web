import { integer } from './protocol.mjs';

const DAY = 86400000;
const MAX_TIMESTAMP = 2147483646000;
const id = value => {
  const result = integer(value);
  if (result < 0n) throw new Error('INVALID_ID');
  return String(result);
};

function timestamp(value) {
  const n = Number(integer(value));
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_TIMESTAMP) throw new Error('INVALID_TIMESTAMP');
  return n;
}

export function mergeDeals(previous, incoming) {
  const map = new Map();
  for (const d of [...previous, ...incoming]) {
    const key = id(d.dealId);
    const time = timestamp(d.utcLastUpdateTimestamp ?? d.executionTimestamp);
    const old = map.get(key);
    if (!old || time >= timestamp(old.utcLastUpdateTimestamp ?? old.executionTimestamp)) map.set(key, d);
  }
  return [...map.values()].sort((a, b) => timestamp(a.executionTimestamp) - timestamp(b.executionTimestamp)
    || (integer(a.dealId) < integer(b.dealId) ? -1 : 1));
}

export async function fetchDeals(client, accountId, from, to) {
  from = timestamp(from); to = timestamp(to);
  if (from > to) throw new Error('INVALID_RANGE');
  const all = [];
  async function range(start, end) {
    const p = await client.request(2133, {
      ctidTraderAccountId: integer(accountId), fromTimestamp: start, toTimestamp: end, maxRows: 1000,
    });
    if (id(p.ctidTraderAccountId) !== id(accountId)) throw new Error('ACCOUNT_MISMATCH');
    if (typeof p.hasMore !== 'boolean') throw new Error('INCOMPLETE_HISTORY_RESPONSE');
    if (p.hasMore) {
      // Split time ranges, rather than skipping all deals with an equal timestamp.
      if (start === end) throw new Error('HISTORY_TRUNCATED_AT_SINGLE_MILLISECOND');
      const middle = Math.floor((start + end) / 2);
      await range(start, middle);
      await range(middle + 1, end);
      return;
    }
    if (p.deal !== undefined && !Array.isArray(p.deal)) throw new Error('INVALID_HISTORY_RESPONSE');
    for (const d of p.deal || []) {
      const executed = timestamp(d.executionTimestamp);
      if (executed < start || executed > end) throw new Error('HISTORY_OUTSIDE_RANGE');
      all.push(d);
    }
  }
  for (let start = from; start <= to;) {
    const end = Math.min(to, start + DAY - 1);
    await range(start, end);
    start = end + 1;
  }
  return mergeDeals([], all);
}

// Exact decimal text avoids treating raw cents as dollars, or overflowing integers.
export function decimal(raw, digits) {
  if (raw == null || digits == null) return null;
  digits = Number(digits);
  if (!Number.isInteger(digits) || digits < 0 || digits > 18) throw new Error('INVALID_MONEY_DIGITS');
  const n = integer(raw), sign = n < 0n ? '-' : '';
  const str = String(n < 0n ? -n : n).padStart(digits + 1, '0');
  return digits ? sign + str.slice(0, -digits) + '.' + str.slice(-digits) : sign + str;
}

export function makeInbox(snapshot) {
  const account = id(snapshot.accountId);
  if (!['live', 'demo'].includes(snapshot.environment)) throw new Error('INVALID_ENVIRONMENT');
  const symbols = new Map((snapshot.symbols || []).map(s => [id(s.symbolId), s.symbolName || s.name]));
  const open = new Map((snapshot.positions || []).map(p => [id(p.positionId), p]));
  const groups = new Map();
  for (const deal of mergeDeals([], snapshot.deals || [])) {
    if (![2, 3, 'FILLED', 'PARTIALLY_FILLED'].includes(deal.dealStatus)) continue;
    if (integer(deal.filledVolume) <= 0n) continue;
    const key = id(deal.positionId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(deal);
  }
  return [...groups].map(([positionId, deals]) => {
    const problems = new Set();
    let opening = 0n, closing = 0n;
    const facts = deals.map(d => {
      const c = d.closePositionDetail;
      const amount = integer(d.filledVolume);
      if (c) {
        if (c.closedVolume == null) problems.add('closed_volume_missing');
        else closing += integer(c.closedVolume);
        if (c.closedVolume != null && integer(c.closedVolume) !== amount) problems.add('reversal_or_mixed_execution');
      } else opening += amount;
      if (d.executionPrice == null || !Number.isFinite(d.executionPrice)) problems.add('execution_price_missing');
      if (![1, 2, 'BUY', 'SELL'].includes(d.tradeSide)) problems.add('trade_side_missing');
      if (!symbols.get(id(d.symbolId))) problems.add('symbol_missing');
      if (c && c.moneyDigits == null) problems.add('money_scale_missing');
      if (d.commission != null && d.moneyDigits == null) problems.add('money_scale_missing');
      const time = timestamp(d.executionTimestamp);
      return {
        dealId: id(d.dealId), orderId: id(d.orderId), symbolId: id(d.symbolId),
        ticker: symbols.get(id(d.symbolId)) || null,
        executedAt: new Date(time).toISOString(),
        tradedAtKorea: new Date(time + 9 * 3600000).toISOString().slice(0, 10),
        side: [1, 'BUY'].includes(d.tradeSide) ? 'buy' : [2, 'SELL'].includes(d.tradeSide) ? 'sell' : null,
        action: c ? 'close' : 'open', quantityUnits: decimal(d.filledVolume, 2),
        price: d.executionPrice ?? null,
        commission: decimal(d.commission, d.moneyDigits),
        close: c ? {
          entryPrice: c.entryPrice ?? null,
          closedUnits: decimal(c.closedVolume, 2),
          grossProfit: decimal(c.grossProfit, c.moneyDigits),
          swap: decimal(c.swap, c.moneyDigits),
          realisedCommission: decimal(c.commission, c.moneyDigits),
          conversionFee: decimal(c.pnlConversionFee, c.moneyDigits),
        } : null,
      };
    });
    const current = open.get(positionId);
    const currentVolume = current ? integer(current.tradeData.volume) : 0n;
    if (opening - closing !== currentVolume) problems.add('position_history_incomplete');
    if (!snapshot.currency) problems.add('account_currency_missing');
    const firstOpen = facts.find(d => d.action === 'open');
    // Direction must come from opening executions, not the opposite closing side.
    if (!firstOpen) problems.add('opening_execution_missing');
    if (new Set(facts.map(d => d.symbolId)).size !== 1) problems.add('mixed_symbols');
    if (new Set(facts.filter(d => d.action === 'open').map(d => d.side)).size > 1) problems.add('mixed_opening_sides');
    if (firstOpen && facts.some(d => d.action === 'close' && d.side === firstOpen.side)) problems.add('unexpected_closing_side');
    return {
      id: `ctrader:${snapshot.environment}:${account}:${positionId}`,
      source: 'ctrader', accountId: account, environment: snapshot.environment, positionId,
      currency: snapshot.currency || null, direction: firstOpen?.side === 'buy' ? 'long' : firstOpen?.side === 'sell' ? 'short' : null,
      status: problems.size ? 'needs_review' : current ? 'holding' : 'closed',
      remainingUnits: decimal(currentVolume, 2), issues: [...problems], executions: facts,
      // Raw financial components are retained separately until actual broker P&L is reconciled.
      reviewRequired: true,
    };
  });
}

export async function collectSnapshot(client, { clientId, clientSecret, accessToken, accountId, environment, from, to, previous = null }) {
  if (!['live', 'demo'].includes(environment)) throw new Error('INVALID_ENVIRONMENT');
  if (previous && (id(previous.accountId) !== id(accountId) || previous.environment !== environment)) throw new Error('LEDGER_ACCOUNT_MISMATCH');
  await client.request(2100, { clientId, clientSecret });
  const granted = await client.request(2149, { accessToken });
  if (![0, 'SCOPE_VIEW'].includes(granted.permissionScope)) throw new Error('VIEW_ONLY_TOKEN_REQUIRED');
  const selected = (granted.ctidTraderAccount || []).find(a => id(a.ctidTraderAccountId) === id(accountId));
  if (!selected || typeof selected.isLive !== 'boolean' || selected.isLive !== (environment === 'live')) throw new Error('ACCOUNT_NOT_GRANTED');
  const auth = await client.request(2102, { ctidTraderAccountId: integer(accountId), accessToken });
  if (id(auth.ctidTraderAccountId) !== id(accountId)) throw new Error('ACCOUNT_MISMATCH');
  const query = async (type, extra = {}) => {
    const res = await client.request(type, { ctidTraderAccountId: integer(accountId), ...extra });
    if (id(res.ctidTraderAccountId) !== id(accountId)) throw new Error('ACCOUNT_MISMATCH');
    return res;
  };
  const trader = (await query(2121)).trader;
  if (id(trader.ctidTraderAccountId) !== id(accountId)) throw new Error('ACCOUNT_MISMATCH');
  const assets = (await query(2112)).asset || [];
  const symbolsResult = await query(2114, { includeArchivedSymbols: true });
  const symbols = [...(symbolsResult.symbol || []), ...(symbolsResult.archivedSymbol || [])];
  const end = timestamp(to);
  const initial = timestamp(from);
  if (previous && timestamp(previous.from) !== initial) throw new Error('LEDGER_START_CHANGED');
  if (previous && timestamp(previous.through) > end) throw new Error('CLOCK_MOVED_BACKWARD');
  // Re-fetch a week to capture delayed updates. Failed collection returns no advanced checkpoint.
  const start = previous ? Math.max(initial, timestamp(previous.through) - 7 * DAY) : initial;
  const deals = mergeDeals(previous?.deals || [], await fetchDeals(client, accountId, start, end));
  const positions = (await query(2124)).position || [];
  const snapshot = {
    version: 1, accountId: id(accountId), environment,
    from: initial, through: end, collectedAt: new Date().toISOString(),
    currency: assets.find(a => id(a.assetId) === id(trader.depositAssetId))?.name || null,
    symbols, deals, positions,
  };
  // Authentication responses (which echo accessToken) never enter the output.
  return { snapshot, inbox: makeInbox(snapshot) };
}
