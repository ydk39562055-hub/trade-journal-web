import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { openPrivateStore } from './private-store.mjs';

test('exclusive process lock prevents duplicate collectors; snapshot replacement is atomic and readable', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'tj-store-test-'));
  let first, second;
  try {
    first = await openPrivateStore(directory);
    await assert.rejects(openPrivateStore(directory), /ALREADY_RUNNING/);
    await first.write('toss-snapshot.json', { orders: [1] });
    await first.write('toss-snapshot.json', { orders: [1, 2] });
    assert.deepEqual(await first.read('toss-snapshot.json'), { orders: [1, 2] });
    await assert.rejects(first.write('../leak.json', {}), /FILE_NAME/);
    first.close(); first = null;
    second = await openPrivateStore(directory);
    assert.deepEqual(await second.read('toss-snapshot.json'), { orders: [1, 2] });
  } finally {
    first?.close(); second?.close();
    // Only this newly allocated absolute temporary test directory can be removed.
    assert.ok(directory.startsWith(resolve(tmpdir(), 'tj-store-test-')));
    await rm(directory, { recursive: true });
  }
});
