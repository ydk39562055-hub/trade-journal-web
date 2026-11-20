import test from 'node:test';
import assert from 'node:assert/strict';
import { TossClient, credentialsFromNote } from './client.mjs';

const credentials = { clientId: 'test_client_id_123', clientSecret: 'test_secret_123456' };
const response = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
test('desktop note labels support separate lines and never ingest explanatory text', () => {
  assert.deepEqual(credentialsFromNote('토스\nClient ID\ntest_client_id_123\nClient Secret\ntest_secret_123456\nSecret은 외부 공유하지 마세요'), credentials);
  assert.throws(() => credentialsFromNote('Client ID\ntest_client_id_123\nClient ID\ntest_client_id_456\nClient Secret\ntest_secret_123456'));
});
test('authentication is single-flight, cached and sent only to the official host', async () => {
  const calls = [];
  const client = new TossClient(credentials, { delay: async () => {}, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return response(url.endsWith('/oauth2/token')
      ? { access_token: 'private_test_token', expires_in: 86400, token_type: 'Bearer' }
      : { result: [] });
  }});
  await Promise.all([client.get('/api/v1/accounts'), client.get('/api/v1/accounts')]);
  assert.equal(calls.filter(c => c.init.method === 'POST').length, 1);
  assert.ok(calls.every(c => c.url.startsWith('https://openapi.tossinvest.com/') && c.init.redirect === 'error'));
  assert.ok(calls.slice(1).every(c => c.init.method === 'GET' && c.init.headers.Authorization === 'Bearer private_test_token'));
  assert.throws(() => client.get('https://example.com/api/v1/accounts'));
  assert.throws(() => client.get('/api/v1/orders/123/cancel', 1));
});
test('buying power is an allowed GET inquiry for one account; order, modify and cancel paths stay refused', async () => {
  const calls = [];
  const client = new TossClient(credentials, { delay: async () => {}, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return response(url.endsWith('/oauth2/token')
      ? { access_token: 'private_test_token', expires_in: 86400, token_type: 'Bearer' }
      : { result: { currency: 'USD', cashBuyingPower: '3500.5' } });
  }});
  assert.deepEqual(await client.get('/api/v1/buying-power', '7', { currency: 'USD' }), { currency: 'USD', cashBuyingPower: '3500.5' });
  const read = calls.at(-1);
  assert.equal(read.url, 'https://openapi.tossinvest.com/api/v1/buying-power?currency=USD');
  assert.equal(read.init.method, 'GET');
  assert.equal(read.init.headers['X-Tossinvest-Account'], '7');
  assert.throws(() => client.get('/api/v1/buying-power', null, { currency: 'KRW' }), /ACCOUNT_REQUIRED/);
  for (const path of ['/api/v1/orders/123/cancel', '/api/v1/orders/123/modify', '/api/v1/orders/new/buy',
    '/api/v1/order', '/api/v1/buying-power/../orders', '/api/v1/buying-power/x'])
    assert.throws(() => client.get(path, 1), /READ_ONLY_OPERATION_REQUIRED/);
  assert.ok(calls.every(c => c.init.method === 'GET' || c.url.endsWith('/oauth2/token')));
});
test('server error messages cannot leak tokens or request bodies', async () => {
  const client = new TossClient(credentials, { delay: async () => {}, fetchImpl: async () => ({
    ok: false, status: 403, text: async () => JSON.stringify({ error: { code: 'ip-not-allowed', message: credentials.clientSecret } }),
  }) });
  await assert.rejects(client.get('/api/v1/accounts'), error => error.status === 403
    && error.code === 'ip-not-allowed' && !JSON.stringify(error).includes(credentials.clientSecret));
});

test('a revoked token is replaced once and a persistent rejection cannot cause a retry loop', async () => {
  for (const recover of [true, false]) {
    let tokens = 0, reads = 0;
    const client = new TossClient(credentials, { delay: async () => {}, fetchImpl: async url => {
      if (url.endsWith('/oauth2/token')) {
        tokens++;
        return response({ access_token: 'test_token_' + tokens, token_type: 'Bearer', expires_in: 86400 });
      }
      reads++;
      return recover && reads > 1 ? response({ result: [] }) : {
        ok: false, status: 401, text: async () => JSON.stringify({ error: 'expired-token' }),
      };
    }});
    if (recover) assert.deepEqual(await client.get('/api/v1/accounts'), []);
    else await assert.rejects(client.get('/api/v1/accounts'), e => e.status === 401);
    assert.equal(tokens, 2); assert.equal(reads, 2);
  }
});
