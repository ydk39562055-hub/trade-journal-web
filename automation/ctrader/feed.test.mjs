import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFpFeed,FpPublisher} from './feed.mjs';
import {recordId} from '../feed.mjs';
const code='TJBF'+'ab'.repeat(32);
function result(){return {snapshot:{accountId:'99123456',environment:'live',collectedAt:'2026-09-09T01:00:00Z',
  assets:[{assetId:'1',name:'JPY'}],symbols:[{symbolId:'9',quoteAssetId:'1'}]},
  inbox:[{currency:'USD',direction:'long',status:'closed',issues:[],executions:[{
    dealId:'88123456',orderId:'77123456',symbolId:'9',ticker:'USDJPY',side:'sell',action:'close',
    quantityUnits:'1000.00',price:150.123,commission:'-1.23',executedAt:'2025-12-31T15:00:00.000Z',tradedAtKorea:'2026-01-01',
    close:{grossProfit:'20.01',swap:'-0.03',realisedCommission:'-1.23',conversionFee:'0.02'}}]}]};}
test('FP feed keeps financial units, hides raw identifiers, separates quote and account currency',()=>{
  const feed=makeFpFeed(result()),row=feed.rows[0],text=JSON.stringify(feed);
  for(const secret of ['99123456','88123456','77123456'])assert.ok(!text.includes(secret));
  assert.equal(row.priceCurrency,'JPY');assert.equal(row.currency,'USD');assert.equal(row.quantity,'1000.00');
  assert.equal(row.grossProfit,'20.01');assert.equal(row.pnl,null);assert.equal(row.filledAmount,null);
  assert.equal(row.side,'SELL');assert.equal(row.action,'close');
  const unknown=result();unknown.snapshot.assets=[];assert.equal(makeFpFeed(unknown).rows[0].priceCurrency,null);
});
test('FP feed includes only this year and rejects invalid dates',()=>{
  const r=result();r.inbox[0].executions[0].executedAt='2025-12-31T14:59:59.999Z';assert.equal(makeFpFeed(r).rows.length,0);
  r.inbox[0].executions[0].executedAt='invalid';assert.throws(()=>makeFpFeed(r),/INVALID_EXECUTION_DATE/);
});
test('FP cloud writes its own records and verifies data before status',async()=>{
  const calls=[],saved=new Map();const publisher=new FpPublisher(code,async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});
    if(url.endsWith('sync_push'))saved.set(body.p_sync_id,body.p_data);
    return {ok:true,json:async()=>url.endsWith('sync_pull')?[{data:saved.get(body.p_sync_id)}]:null};
  });
  const published=await publisher.publish(result());assert.equal(calls.length,3);
  assert.deepEqual(calls.map(c=>c.body.p_sync_id),[recordId(code,'fp-data'),recordId(code,'fp-data'),recordId(code,'fp-status')]);
  await publisher.publish(result(),published);assert.equal(calls.length,4);
  assert.ok(!saved.has(recordId(code,'data')));
});
test('FP failed readback cannot publish success',async()=>{
  const calls=[];const publisher=new FpPublisher(code,async(url,options)=>{
    calls.push(JSON.parse(options.body));return {ok:true,json:async()=>[]};
  });
  await assert.rejects(publisher.publish(result()),/FP_CLOUD_VERIFY_FAILED/);assert.equal(calls.length,2);
});
