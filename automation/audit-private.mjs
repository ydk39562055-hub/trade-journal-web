import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { credentialsFromNote } from './toss/client.mjs';
try {
  const [note, connection] = process.argv.slice(2);
  const credentials = credentialsFromNote(await readFile(note, 'utf8'));
  const code = JSON.parse(await readFile(connection, 'utf8')).code;
  const files = execFileSync('git', ['-c', 'safe.directory=' + process.cwd().replaceAll('\\', '/'),
    'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  let checked = 0;
  for (const path of files) {
    if (!/\.(js|jsx|mjs|json|html|css|md|ps1|sql|yml|yaml|example)$/.test(path)) continue;
    const text = await readFile(path, 'utf8'); checked++;
    if ([credentials.clientId, credentials.clientSecret, code].some(secret => text.includes(secret))) {
      throw new Error('PRIVATE_VALUE_IN_PUBLIC_SOURCE');
    }
  }
  console.log(JSON.stringify({ checkedFiles: checked, privateValuesInSource: false }));
} catch { console.error('배포 전 비밀정보 검사 실패. 공개 배포를 중단하세요.'); process.exitCode = 1; }
