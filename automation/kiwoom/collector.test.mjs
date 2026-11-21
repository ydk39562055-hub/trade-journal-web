import test from 'node:test';import assert from 'node:assert/strict';
import {KiwoomClient} from './client.mjs';import {windows,collect,makeFeed} from './history.mjs';
test('read-only client rejects orders before network',async()=>{let called=false;const c=new KiwoomClient({},()=>{called=true;});await assert.rejects(()=>c.get('ust10000',{}),/READ_ONLY/);assert.equal(called,false);});
test('2026 history is split into non-overlapping monthly windows',()=>{const w=windows('20260924');assert.equal(w.length,9);assert.deepEqual(w[1],{strt_dt:'20260201',end_dt:'20260228'});assert.equal(w.at(-1).end_dt,'20260924');});
test('privacy whitelist excludes raw account and order identifiers; zero is valid',()=>{
 const f=makeFeed({collectedAt:'2026-09-24',balance:{result_list:[]},valuation:{aset_evlt_amt:'000000',account:'PRIVATE'},orders:[{ord_dt:'20260924',ord_no:'PRIVATE_ORDER',cntr_qty:'1',cntr_uv:'100',crnc_code:'USD',stk_cd:'TEST',slby_tp_nm:'매수'}]});
 assert.equal(f.account.balance,'0');assert.equal(f.rows.length,1);assert.equal(f.rows[0].executedAt,null);assert.equal(f.rows[0].pnl,null);assert.ok(!JSON.stringify(f).includes('PRIVATE'));assert.equal(f.holdings.length,0);
 assert.throws(()=>makeFeed({balance:{result_list:[]},valuation:{},orders:[]}),/VALUATION_MISSING/);
});
test('all monthly pages queried and historic facts preserved',async()=>{
 const calls=[];const snap=await collect({get:async(id,b)=>{calls.push([id,b]);return {result_list:[],aset_evlt_amt:'0'};}},{orders:[{ord_dt:'20260102',ord_no:'a'}]},new Date('2026-09-24T00:00:00Z'));
 assert.equal(calls.filter(([id])=>id==='ust21180').length,9);assert.equal(snap.orders.length,1);
});
