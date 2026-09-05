import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { recordId } from './feed.mjs';
test('browser and PC resolve the same private feed; exact decimals survive display formatting', async () => {
  const window = {};
  const context = vm.createContext({ window, crypto, TextEncoder, Uint8Array });
  vm.runInContext(await readFile(new URL('../app/broker-feed.js', import.meta.url), 'utf8'), context);
  const code = 'TJBF' + 'af'.repeat(32);
  assert.equal(await window.TJBroker.recordId(code, 'data'), recordId(code, 'data'));
  assert.equal(await window.TJBroker.recordId(code, 'status'), recordId(code, 'status'));
  assert.equal(window.TJBroker.decimal('123456789123456789.0000000001'), '123,456,789,123,456,789.0000000001');
  assert.equal(window.TJBroker.decimal(null), '미확정');
});
