import { mkdir, readFile, rename, realpath, open } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const inside = (parent, child) => {
  const rel = relative(parent, child);
  return !rel || (!rel.startsWith('..') && !isAbsolute(rel));
};

export async function openPrivateStore(path) {
  if (!path || !isAbsolute(path)) throw new Error('ABSOLUTE_PRIVATE_DATA_DIR_REQUIRED');
  const repository = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const directory = resolve(path);
  if (inside(repository, directory)) throw new Error('PRIVATE_DATA_MUST_BE_OUTSIDE_PUBLIC_REPOSITORY');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actual = await realpath(directory);
  if (inside(repository, actual)) throw new Error('PRIVATE_DATA_MUST_BE_OUTSIDE_PUBLIC_REPOSITORY');
  // An OS-released SQLite lock survives process crashes without stale PID lock files.
  const lock = new DatabaseSync(resolve(actual, 'collector-lock.sqlite'));
  try { lock.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE;'); }
  catch { lock.close(); throw new Error('COLLECTOR_ALREADY_RUNNING'); }
  const location = name => {
    if (!/^[a-z-]+\.json$/.test(name)) throw new Error('INVALID_PRIVATE_FILE_NAME');
    return resolve(actual, name);
  };
  return {
    async read(name) {
      try { return JSON.parse(await readFile(location(name), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT') return null; throw new Error('EXISTING_LEDGER_UNREADABLE'); }
    },
    async write(name, value) {
      const target = location(name), temp = target + '.' + randomUUID() + '.tmp';
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
      finally { await file.close(); }
      await rename(temp, target);
    },
    close() { lock.close(); },
  };
}
