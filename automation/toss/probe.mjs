// Read-only live connection check. Never prints credentials, account numbers or orders.
import { readFile } from 'node:fs/promises';
import { TossClient, credentialsFromNote } from './client.mjs';

try {
  const client = new TossClient(credentialsFromNote(await readFile(process.argv[2], 'utf8')));
  const accounts = await client.get('/api/v1/accounts');
  if (!Array.isArray(accounts)) throw new Error('INVALID_ACCOUNTS_RESPONSE');
  console.log(JSON.stringify({ stage: 'accounts', count: accounts.length }));
  for (const account of accounts) {
    const orders = await client.get('/api/v1/orders', account.accountSeq, { status: 'CLOSED', limit: 20 });
    if (!Array.isArray(orders.orders)) throw new Error('INVALID_ORDERS_RESPONSE');
    console.log(JSON.stringify({ stage: 'orders', returned: orders.orders.length,
      hasNext: orders.hasNext, executed: orders.orders.filter(o => Number(o.execution?.filledQuantity) > 0).length,
      usExecuted: orders.orders.filter(o => o.currency === 'USD' && Number(o.execution?.filledQuantity) > 0).length,
      executionFields: Object.keys(orders.orders.find(o => Number(o.execution?.filledQuantity) > 0)?.execution || {}) }));
  }
} catch (e) {
  console.error(JSON.stringify({ stage: 'failed', code: /^[A-Z][A-Z_0-9]+$/.test(e.message)
    ? e.message : 'CONNECTION_FAILED', apiCode: e.code || null }));
  process.exitCode = 1;
}
