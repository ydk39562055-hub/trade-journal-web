import test from 'node:test';
import assert from 'node:assert/strict';
import {exchangeToken} from './vault.mjs';
test('token refresh preserves account binding and rotates both tokens at fixed official endpoint',async()=>{
  const config={clientId:'example-id',clientSecret:'example-secret',accountId:'42',mode:'production',environment:'demo'};
  const before=Date.now();
  const next=await exchangeToken(config,{grant_type:'refresh_token',refresh_token:'old'},async(url,options)=>{
    assert.equal(url.origin,'https://openapi.ctrader.com');assert.equal(url.pathname,'/apps/token');
    assert.equal(options.redirect,'error');assert.equal(url.searchParams.get('refresh_token'),'old');
    return {ok:true,json:async()=>({accessToken:'new-access',refreshToken:'new-refresh',expiresIn:3600})};
  });
  assert.equal(next.accountId,'42');assert.equal(next.mode,'production');assert.equal(next.environment,'demo');
  assert.equal(next.accessToken,'new-access');assert.equal(next.refreshToken,'new-refresh');
  assert.ok(next.expiresAt>=before+3600000);
});
test('malformed token responses cannot replace stored credentials',async()=>{
  const config={clientId:'example',clientSecret:'private-value'};
  await assert.rejects(exchangeToken(config,{},async()=>({ok:false})),/^Error: CTRADER_TOKEN_EXCHANGE_FAILED$/);
  for(const token of [{errorCode:'FAIL',description:'private-value'},{accessToken:'x',refreshToken:'y',expiresIn:0},{accessToken:'x',expiresIn:30}])
    await assert.rejects(exchangeToken(config,{},async()=>({ok:true,json:async()=>token})),/^Error: CTRADER_TOKEN_INVALID$/);
  assert.deepEqual(config,{clientId:'example',clientSecret:'private-value'});
});
