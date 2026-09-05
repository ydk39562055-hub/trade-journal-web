// One collection pass for a future server scheduler. No journal writes or order APIs.
import { readFile, mkdir, writeFile, rename, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ReadOnlyClient } from './protocol.mjs';
import { collectSnapshot } from './history.mjs';

const env = process.env;
const needed = ['CTRADER_CLIENT_ID', 'CTRADER_CLIENT_SECRET', 'CTRADER_ACCESS_TOKEN',
  'CTRADER_ACCOUNT_ID', 'CTRADER_ENVIRONMENT', 'CTRADER_HISTORY_FROM', 'TJ_PRIVATE_DATA_DIR'];
const missing = needed.filter(key => !env[key]?.trim());
if (missing.length) {
  console.error('설정 대기: ' + missing.join(', '));
  process.exitCode = 2;
} else {
  const client = new ReadOnlyClient();
  try {
    const repository = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
    const dataDirectory = resolve(env.TJ_PRIVATE_DATA_DIR);
    const inside = (parent, path) => {
      const rel = relative(parent, path);
      return !rel || (!rel.startsWith('..') && !isAbsolute(rel));
    };
    // Fail before creating a directory in the public Pages checkout.
    if (inside(repository, dataDirectory)) throw new Error('PRIVATE_DATA_MUST_BE_OUTSIDE_PUBLIC_REPOSITORY');
    await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
    const actualDirectory = await realpath(dataDirectory);
    if (inside(repository, actualDirectory)) throw new Error('PRIVATE_DATA_MUST_BE_OUTSIDE_PUBLIC_REPOSITORY');
    if (!/^\d+$/.test(env.CTRADER_ACCOUNT_ID)) throw new Error('INVALID_ACCOUNT_ID');
    if (!['live', 'demo'].includes(env.CTRADER_ENVIRONMENT)) throw new Error('INVALID_ENVIRONMENT');
    const from = Date.parse(env.CTRADER_HISTORY_FROM);
    if (!Number.isFinite(from) || !/(Z|[+-]\d{2}:\d{2})$/.test(env.CTRADER_HISTORY_FROM)) throw new Error('HISTORY_FROM_REQUIRES_TIMEZONE');
    const path = resolve(actualDirectory, `${env.CTRADER_ENVIRONMENT}-${env.CTRADER_ACCOUNT_ID}.json`);
    let previous = null;
    try { previous = JSON.parse(await readFile(path, 'utf8')).snapshot; }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('EXISTING_LEDGER_UNREADABLE'); }
    const to = Date.now();
    await client.connect(env.CTRADER_ENVIRONMENT);
    const result = await collectSnapshot(client, {
      clientId: env.CTRADER_CLIENT_ID, clientSecret: env.CTRADER_CLIENT_SECRET,
      accessToken: env.CTRADER_ACCESS_TOKEN, accountId: env.CTRADER_ACCOUNT_ID,
      environment: env.CTRADER_ENVIRONMENT, from, to, previous,
    });
    // Ledger + checkpoint + inbox are committed together, only after a complete pass.
    // Deployment must run a single collector per account (no overlapping schedules).
    const temp = path + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
    await rename(temp, path);
    console.log(`조회 완료: 체결 ${result.snapshot.deals.length}건, 포지션 ${result.inbox.length}건. 일지 반영 전 대조 필요.`);
  } catch (e) {
    // Log known internal codes only, never URLs/payloads/tokens/file contents.
    const code = /^[A-Z][A-Z_]+$/.test(e.message) ? e.message : 'COLLECTION_FAILED';
    console.error('조회 중단: ' + code);
    process.exitCode = 1;
  } finally { client.close(); }
}
