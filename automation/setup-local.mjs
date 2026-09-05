import { readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { credentialsFromNote } from './toss/client.mjs';
import { cleanFeedCode } from './feed.mjs';
import { openPrivateStore } from './private-store.mjs';

let store;
try {
  const [directory, note] = process.argv.slice(2);
  if (!isAbsolute(directory || '') || !isAbsolute(note || '')) throw new Error('ABSOLUTE_PATHS_REQUIRED');
  store = await openPrivateStore(directory);
  credentialsFromNote(await readFile(note, 'utf8')); // Validate without copying the original API secret.
  const connection = resolve(directory, '자동기록_연결.json');
  try { cleanFeedCode(JSON.parse(await readFile(connection, 'utf8')).code); }
  catch (e) {
    if (e.code !== 'ENOENT') throw new Error('EXISTING_CONNECTION_INVALID');
    await writeFile(connection, JSON.stringify({ kind: 'trade-journal-broker-connection', version: 1,
      code: 'TJBF' + randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 });
  }
  const env = resolve(directory, 'collector.env');
  const envValue = value => {
    if (/[\r\n"\0]/.test(value)) throw new Error('INVALID_CONFIG_PATH');
    return '"' + value.replaceAll('\\', '/') + '"';
  };
  await writeFile(env, 'TOSS_NOTE_PATH=' + envValue(note) + '\nTJ_PRIVATE_DATA_DIR=' + envValue(directory)
    + '\nTJ_FEED_CODE_PATH=' + envValue(connection) + '\nTJ_INTERVAL_SECONDS=300\n', { mode: 0o600 });
  console.log('PC 수집 설정 준비 완료. API 키와 연결코드는 출력하지 않았습니다.');
} catch { console.error('PC 설정 실패. 파일 경로와 기존 설정을 확인해 주세요.'); process.exitCode = 1; }
finally { store?.close(); }
