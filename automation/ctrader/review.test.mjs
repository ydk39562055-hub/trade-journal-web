import test from 'node:test';
import assert from 'node:assert/strict';
import {analysePosition,chartWindow,decodeBars,enrichReviews} from './review.mjs';
const at='2026-08-20T10:00:00.000Z',time=Date.parse(at);
function position(sign=1){return {id:'ctrader:live:42:7',direction:sign===1?'long':'short',status:'closed',issues:[],executions:[
  {orderId:'1',dealId:'2',symbolId:'3',ticker:'TEST',action:'open',price:100,quantityUnits:'10',executedAt:at,side:sign===1?'buy':'sell'},
  {orderId:'4',dealId:'5',symbolId:'3',ticker:'TEST',action:'close',price:100+sign*20,quantityUnits:'4',executedAt:new Date(time+60000).toISOString()},
  {orderId:'6',dealId:'7',symbolId:'3',ticker:'TEST',action:'close',price:100+sign*5,quantityUnits:'6',executedAt:new Date(time+120000).toISOString()}]};}
const orders={'1':{relativeStopLoss:1000000,relativeTakeProfit:2000000,utcLastUpdateTimestamp:time},'4':{orderType:1},'6':{orderType:4,stopPrice:105,limitPrice:125}};
test('initial risk weights partial exits, preserves long/short sign, and labels protective exit as inference',()=>{
  const long=analysePosition(position(),orders);assert.equal(long.priceR,1.1);assert.equal(long.initialStop,90);assert.equal(long.initialTarget,120);
  assert.equal(long.executions[2].exitKind,'stop_likely');assert.equal(long.plannedR,2);
  const short=analysePosition(position(-1),orders);assert.equal(short.priceR,1.1);assert.equal(short.initialStop,110);
  const loss=position();loss.executions[1].price=90;loss.executions[2].price=90;assert.equal(analysePosition(loss,orders).priceR,-1);
});
test('missing, moved, invalid or multi-entry initial stops never invent R',()=>{
  for(const [p,o,reason] of [[position(),{},'order_unavailable'],[position(),{'1':{utcLastUpdateTimestamp:time}},'initial_stop_missing'],
    [position(),{'1':{relativeStopLoss:1000000}},'initial_stop_unverified'],
    [position(),{'1':{...orders['1'],utcLastUpdateTimestamp:time+5000}},'initial_stop_unverified'],
    [{...position(),status:'holding'},orders,'position_open'],[{...position(),issues:['incomplete']},orders,'incomplete_history']]){
    const r=analysePosition(p,o);assert.equal(r.priceR,null);assert.equal(r.reason,reason);
  }
  const p=position();p.executions.push({...p.executions[0],dealId:'9'});assert.equal(analysePosition(p,orders).reason,'multiple_entries');
});
test('chart range adapts to holding duration and stays in the requested year',()=>{
  const p=position();assert.equal(chartWindow(p,time+86400000).minutes,5);
  p.executions[2].executedAt=new Date(time+20*86400000).toISOString();assert.ok(chartWindow(p,time+21*86400000).minutes>=240);
  p.executions=p.executions.slice(0,1);p.executions[0].executedAt='2025-12-31T15:00:00Z';assert.equal(chartWindow(p,time).from,Date.parse('2025-12-31T15:00:00Z'));
});
test('candles decode 1e5 price scaling, sort, deduplicate and fail on truncation',()=>{
  const w={period:5,from:time,to:time+600000},b={low:10000000,deltaOpen:0,deltaHigh:200000,deltaClose:100000,utcTimestampInMinutes:time/60000};
  assert.deepEqual(decodeBars({period:5,symbolId:3,hasMore:false,trendbar:[b,b]},w,'3'),[[time/1000,100,102,100,101]]);
  assert.throws(()=>decodeBars({period:5,hasMore:true},w,'3'),/TRUNCATED/);
  assert.throws(()=>decodeBars({period:7},w,'3'),/MISMATCH/);
  assert.throws(()=>decodeBars({period:5,trendbar:[{...b,deltaHigh:0}]},w,'3'),/INVALID_CANDLE/);
});
test('review collector uses bounded time queries without count overriding from; closed reviews reuse cache',async()=>{
  const p=position(),calls=[];
  const client={request:async(type,args)=>{calls.push([type,args]);if(type===2181)return {ctidTraderAccountId:42,order:{orderId:String(args.orderId),...orders[String(args.orderId)]}};
    assert.equal('count' in args,false);return {ctidTraderAccountId:42,symbolId:3,period:5,hasMore:false,trendbar:[{low:10000000,deltaOpen:0,deltaHigh:200000,deltaClose:100000,utcTimestampInMinutes:time/60000}]};}};
  const result={snapshot:{accountId:'42'},inbox:[p]};await enrichReviews(client,result);assert.equal(calls.length,4);
  assert.equal(Object.values(result.reviews)[0].chart.bars.length,1);
  const next={snapshot:{accountId:'42'},inbox:[p]};await enrichReviews(client,next,result);assert.equal(calls.length,4);
  assert.ok(!JSON.stringify(result.reviews).includes('ctrader:live:42:7'));
});
