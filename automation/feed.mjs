import { createHash } from 'node:crypto';

// A separate record in the user's existing Supabase project; never the manual journal's ID.
const RPC = 'https://oxogtsfxdjbctzehxvae.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_3vXShFC5dKvMqzUy1KkyGQ_sF0SzUY2';
export const digest = text => createHash('sha256').update(text).digest('hex');
export function cleanFeedCode(raw) {
  const value = String(raw || '').replace(/[\s-]/g, '');
  if (!/^TJBF[0-9a-f]{64}$/i.test(value)) throw new Error('INVALID_FEED_CODE');
  return 'TJBF' + value.slice(4).toLowerCase();
}
export const recordId = (code, type) => digest('trade-journal-broker-v1:' + type + ':' + cleanFeedCode(code));

export function makeFeed(snapshot) {
  const from = snapshot.journalFrom || '2026-01-01T00:00:00+09:00';
  const since = Date.parse(from);
  if (!Number.isFinite(since) || !/(Z|[+-]\d{2}:\d{2})$/.test(from)) throw new Error('INVALID_JOURNAL_START');
  const stocks = new Map((snapshot.symbols || []).map(s => [s.symbol, s.name]));
  const rows = [];
  for (const account of snapshot.accounts) {
    for (const h of account.holdings.items) if (!stocks.has(h.symbol)) stocks.set(h.symbol, h.name);
    const stale = new Set(account.notReturnedOrderIds);
    for (const execution of account.executions) {
      if (!execution.executedAt || Date.parse(execution.executedAt) < since) continue;
      const { accountId, orderId, ...facts } = execution;
      rows.push({ ...facts, id: digest(execution.id), name: stocks.get(execution.symbol) || execution.symbol,
        historyUnavailable: stale.has(orderId) });
    }
  }
  rows.sort((a, b) => (b.executedAt || '').localeCompare(a.executedAt || '') || a.id.localeCompare(b.id));
  return { kind: 'broker-feed', version: 1, source: 'toss', periodStart: from, rows };
}

export class FeedPublisher {
  #code; #fetch;
  constructor(code, fetchImpl = fetch) { this.#code = cleanFeedCode(code); this.#fetch = fetchImpl; }
  async #rpc(fn, body) {
    const response = await this.#fetch(RPC + fn, { method: 'POST', redirect: 'error',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('FEED_CLOUD_FAILED');
    try { return await response.json(); } catch { throw new Error('FEED_CLOUD_RESPONSE_INVALID'); }
  }
  async publish(snapshot, previousPublication = null) {
    const feed = makeFeed(snapshot), revision = digest(canonical(feed));
    const dataId = recordId(this.#code, 'data');
    const refresh = !previousPublication || previousPublication.revision !== revision
      || Date.now() - Date.parse(previousPublication.publishedAt) > 3600000;
    if (refresh) {
      await this.#rpc('sync_push', { p_sync_id: dataId, p_data: feed });
      const saved = await this.#rpc('sync_pull', { p_sync_id: dataId });
      // PostgreSQL jsonb reorders object keys, so verification uses canonical JSON.
      if (canonical(saved?.[0]?.data) !== canonical(feed)) throw new Error('FEED_VERIFY_FAILED');
    }
    // Mark success only after the data has been acknowledged and read back.
    await this.#rpc('sync_push', { p_sync_id: recordId(this.#code, 'status'), p_data: {
      kind: 'broker-status', version: 1, source: 'toss', state: 'ok', revision,
      collectedAt: snapshot.collectedAt, checkedAt: new Date().toISOString(), count: feed.rows.length,
    }});
    return { revision, publishedAt: refresh ? new Date().toISOString() : previousPublication.publishedAt };
  }
  async reportFailure(code, lastSuccessAt) {
    await this.#rpc('sync_push', { p_sync_id: recordId(this.#code, 'status'), p_data: {
      kind: 'broker-status', version: 1, source: 'toss', state: 'error',
      checkedAt: new Date().toISOString(), lastSuccessAt,
      code: /^[A-Z_0-9]+$/.test(code) ? code : 'COLLECTION_FAILED',
    }});
  }
}

export function canonical(value) {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export async function enrichSymbols(client, snapshot, previous) {
  const names = new Map((previous?.symbols || []).map(s => [s.symbol, s]));
  const all = [...new Set(snapshot.accounts.flatMap(a => a.executions.map(e => e.symbol)))];
  const wanted = all.filter(s => typeof s === 'string' && /^[A-Za-z0-9.-]+$/.test(s) && !names.has(s));
  async function load(batch) {
    try {
      const list = await client.get('/api/v1/stocks', null, { symbols: batch.join(',') });
      if (!Array.isArray(list)) throw new Error('INVALID_STOCKS_RESPONSE');
      for (const s of list) if (typeof s.symbol === 'string' && typeof s.name === 'string') names.set(s.symbol, { symbol: s.symbol, name: s.name });
    } catch (e) {
      // A delisted symbol can reject a whole batch. Isolate it without losing other names.
      if (e.status === 400 && batch.length > 1) {
        const middle = Math.floor(batch.length / 2);
        await load(batch.slice(0, middle)); await load(batch.slice(middle));
      } else snapshot.symbolLookupPending = true;
    }
  }
  for (let i = 0; i < wanted.length; i += 200) await load(wanted.slice(i, i + 200));
  snapshot.symbols = [...names.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
