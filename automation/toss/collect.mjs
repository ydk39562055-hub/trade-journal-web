// Node 24+. One pass by default; --watch runs the same complete scan every 5 minutes.
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { TossClient, credentialsFromNote } from './client.mjs';
import { collectSnapshot } from './history.mjs';
import { openPrivateStore } from '../private-store.mjs';
import { FeedPublisher, enrichSymbols } from '../feed.mjs';

const env = process.env;
const stop = new AbortController();
process.once('SIGTERM', () => stop.abort());
process.once('SIGINT', () => stop.abort());
const safeCode = e => /^[A-Z][A-Z_0-9]+$/.test(e.message) ? e.message : 'COLLECTION_FAILED';
let store;
try {
  const watch = process.argv.includes('--watch');
  if (process.argv.slice(2).some(a => a !== '--watch')) throw new Error('INVALID_ARGUMENT');
  const interval = Number(env.TJ_INTERVAL_SECONDS || 300);
  if (!Number.isInteger(interval) || interval < 60 || interval > 3600) throw new Error('INVALID_INTERVAL');
  // Acquire the lock BEFORE issuing a token: Toss permits only one active token per client.
  store = await openPrivateStore(env.TJ_PRIVATE_DATA_DIR);
  const credentials = env.TOSS_NOTE_PATH
    ? credentialsFromNote(await readFile(env.TOSS_NOTE_PATH, 'utf8'))
    : { clientId: env.TOSS_CLIENT_ID, clientSecret: env.TOSS_CLIENT_SECRET };
  const client = new TossClient(credentials);
  const publisher = env.TJ_FEED_CODE_PATH
    ? new FeedPublisher(JSON.parse(await readFile(env.TJ_FEED_CODE_PATH, 'utf8')).code) : null;
  let previous = await store.read('toss-snapshot.json');
  let publication = await store.read('toss-publication.json');
  let failures = 0;
  do {
    try {
      const snapshot = await collectSnapshot(client, previous);
      snapshot.journalFrom = env.TJ_JOURNAL_FROM || '2026-01-01T00:00:00+09:00';
      await enrichSymbols(client, snapshot, previous);
      await store.write('toss-snapshot.json', snapshot);
      previous = snapshot;
      if (publisher) {
        publication = await publisher.publish(snapshot, publication);
        await store.write('toss-publication.json', publication);
      }
      const status = { source: 'toss', state: publisher ? 'synced' : 'collected_locally', collectedAt: snapshot.collectedAt,
        accounts: snapshot.accounts.length,
        orders: snapshot.accounts.reduce((n, a) => n + a.orders.length, 0),
        executions: snapshot.accounts.reduce((n, a) => n + a.executions.length, 0),
        usExecutions: snapshot.accounts.reduce((n, a) => n + a.executions.filter(e => e.currency === 'USD').length, 0),
        holdings: snapshot.accounts.reduce((n, a) => n + a.holdings.items.length, 0),
        cloudPublished: Boolean(publisher) };
      await store.write('toss-status.json', status);
      console.log(JSON.stringify(status));
      failures = 0;
    } catch (e) {
      failures++;
      const status = { source: 'toss', state: 'error', checkedAt: new Date().toISOString(),
        lastSuccessAt: previous?.collectedAt || null, code: safeCode(e), cloudPublished: false };
      await store.write('toss-status.json', status);
      console.error(JSON.stringify(status));
      if (publisher) await publisher.reportFailure(safeCode(e), previous?.collectedAt || null).catch(() => {});
      if (!watch) { process.exitCode = 1; break; }
    }
    if (!watch || stop.signal.aborted) break;
    await sleep(Math.min(3600, interval * 2 ** Math.min(failures, 4)) * 1000,
      undefined, { signal: stop.signal }).catch(e => { if (e.name !== 'AbortError') throw e; });
  } while (!stop.signal.aborted);
} catch (e) {
  console.error(JSON.stringify({ state: 'stopped', code: safeCode(e) }));
  process.exitCode = 1;
} finally { store?.close(); }
