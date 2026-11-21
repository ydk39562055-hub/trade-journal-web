import test from 'node:test';import assert from 'node:assert/strict';
import {KiwoomClient} from './client.mjs';import {windows,collect,makeFeed,tradingDays,collectDomestic} from './history.mjs';
test('read-only client rejects orders before network',async()=>{let called=false;const c=new KiwoomClient({},()=>{called=true;});await assert.rejects(()=>c.get('ust10000',{}),/READ_ONLY/);assert.equal(called,false);});
test('2026 history is split into non-overlapping monthly windows',()=>{const w=windows('20260924');assert.equal(w.length,9);assert.deepEqual(w[1],{strt_dt:'20260201',end_dt:'20260228'});assert.equal(w.at(-1).end_dt,'20260924');});
test('privacy whitelist excludes raw account and order identifiers; zero is valid',()=>{
 const f=makeFeed({collectedAt:'2026-09-24',balance:{result_list:[]},valuation:{aset_evlt_amt:'000000',account:'PRIVATE'},orders:[{ord_dt:'20260924',ord_no:'PRIVATE_ORDER',cntr_qty:'1',cntr_uv:'100',crnc_code:'USD',stk_cd:'TEST',slby_tp_nm:'매수'}]});
 assert.equal(f.account.balance,'0');assert.equal(f.rows.length,1);assert.equal(f.rows[0].executedAt,null);assert.equal(f.rows[0].pnl,null);assert.ok(!JSON.stringify(f).includes('PRIVATE'));assert.equal(f.holdings.length,0);
 assert.throws(()=>makeFeed({balance:{result_list:[]},valuation:{},orders:[]}),/VALUATION_MISSING/);
});
// Domestic fixtures are built from the official kt00009 response example (Kiwoom-REST-API kiwoom_api_spec.json @79e39336).
const KR=(over={})=>({stk_bond_tp:'1',ord_no:'0000050',stk_cd:'A069500',trde_tp:'시장가',io_tp_nm:'현금매수',ord_qty:'0000000001',ord_uv:'0000000000',cnfm_qty:'0000000000',rsrv_oppo:'',cntr_no:'0000001',acpt_tp:'접수',orig_ord_no:'0000000',stk_nm:'KODEX 200',setl_tp:'삼일결제',crd_deal_tp:'보통매매',cntr_qty:'0000000001',cntr_uv:'0000004900',comm_ord_tp:'영웅문4',mdfy_cncl_tp:'',cntr_tm:'13:07:47',dmst_stex_tp:'KRX',cond_uv:'0000000000',...over});
const reply=(body,headers={})=>({ok:true,json:async()=>body,headers:{get:k=>headers[k]??null}});
const fakeKiwoom=(pages)=>{const sent=[];return {sent,fetch:async(url,init)=>{sent.push({url,api:init.headers['api-id'],body:JSON.parse(init.body)});
 if(url.endsWith('/oauth2/token'))return reply({return_code:0,token:'t'.repeat(20)});return pages.shift();}};};
test('order, modify, cancel and transfer IDs are refused before any network call',async()=>{
 for(const id of ['kt10000','kt10001','kt10002','kt10003','kt10006','kt50000','ust20000','ust20001','ust20002','ust20003','au10002','kt00010']){
  let called=false;const c=new KiwoomClient({},()=>{called=true;});await assert.rejects(()=>c.get(id,{}),/READ_ONLY/,id);assert.equal(called,false,id);
 }
});
test('kt00009 goes to the domestic account path; an empty day (no list or []) is not an error',async()=>{
 const k=fakeKiwoom([reply({return_code:0,return_msg:'조회가 완료되었습니다'}),reply({return_code:0,acnt_ord_cntr_prst_array:[],sell_grntl_engg_amt:'000000000000'})]);
 const c=new KiwoomClient({appkey:'a',secretkey:'s'},k.fetch);
 assert.deepEqual((await c.get('kt00009',{ord_dt:'20261120'})).acnt_ord_cntr_prst_array,[]);
 assert.deepEqual((await c.get('kt00009',{ord_dt:'20261119'})).acnt_ord_cntr_prst_array,[]);
 assert.deepEqual(k.sent.map(s=>s.url),['https://api.kiwoom.com/oauth2/token','https://api.kiwoom.com/api/dostk/acnt','https://api.kiwoom.com/api/dostk/acnt']);
 assert.equal(k.sent[1].api,'kt00009');
 const us=fakeKiwoom([reply({return_code:0})]);
 await assert.rejects(()=>new KiwoomClient({},us.fetch).get('ust21180',{}),/INCOMPLETE/);
});
test('kt00009 continuation pages are joined',async()=>{
 const k=fakeKiwoom([reply({return_code:0,acnt_ord_cntr_prst_array:[KR()]},{'cont-yn':'Y','next-key':'n1'}),reply({return_code:0,acnt_ord_cntr_prst_array:[KR({cntr_no:'0000002'})]})]);
 const r=await new KiwoomClient({},k.fetch).get('kt00009',{ord_dt:'20261120'});
 assert.equal(r.acnt_ord_cntr_prst_array.length,2);
});
test('weekday list skips weekends and 2026 backfill is capped per run, then resumes from the last checked day',async()=>{
 assert.deepEqual(tradingDays('20261120','20261124'),['20261120','20261123','20261124']);
 const asked=[];const client={get:async(id,b)=>{asked.push(b.ord_dt);assert.equal(id,'kt00009');assert.equal(b.qry_tp,'1');return {acnt_ord_cntr_prst_array:[]};}};
 const first=await collectDomestic(client,null,'20261121',{maxDays:5});
 assert.deepEqual(asked,['20260923','20260924','20260925','20260928','20260929']);assert.equal(first.checkedThrough,'20260929'); // two-month reach
 asked.length=0;await collectDomestic(client,{checkedThrough:'20261120',fills:[]},'20261123');
 assert.deepEqual(asked,['20261120','20261123']);
 asked.length=0;await collectDomestic(client,null,'20260210',{maxDays:3});
 assert.deepEqual(asked,['20260101','20260102','20260105']); // never before 2026
 asked.length=0;const full=await collectDomestic(client,null,'20261121');
 assert.equal(asked.length,43);assert.equal(full.checkedThrough,'20261120'); // whole reach in one run
});
test('no-data answers (return_code 20 with 501724/571758) are empty lists; other 20s and the two-month limit are not',async()=>{
 const k=fakeKiwoom([
  reply({return_code:20,return_msg:'[2000](501724:관련자료가없습니다)'}),
  reply({return_code:20,return_msg:'[2000](571758:조회내역이 없습니다.)'}),
  reply({return_code:20,return_msg:'[2000](506424:최근 2개월간 조회 가능합니다.)'}),
  reply({return_code:20,return_msg:'[2000](123456:다른 오류)'}),
  reply({return_code:20,return_msg:'[2000](501724:관련자료가없습니다)'}),
 ]);
 const c=new KiwoomClient({},k.fetch);c.gapMs=0;
 assert.deepEqual((await c.get('kt00009',{})).acnt_ord_cntr_prst_array,[]);
 assert.deepEqual((await c.get('ust21180',{})).result_list,[]);
 await assert.rejects(()=>c.get('kt00009',{}),/KIWOOM_OUT_OF_RANGE/);
 await assert.rejects(()=>c.get('kt00009',{}),/KIWOOM_QUERY_20/);
 await assert.rejects(()=>c.get('ust21070',{}),/KIWOOM_QUERY_20/); // balance queries answer 0 when empty; a 20 there stays an error
 let n=0;const d=await collectDomestic({get:async()=>{if(n++===0)throw Error('KIWOOM_OUT_OF_RANGE');return {acnt_ord_cntr_prst_array:[KR()]};}},null,'20261120',{maxDays:2});
 assert.equal(d.fills.length,1);assert.equal(d.checkedThrough,'20260923');
 await assert.rejects(()=>collectDomestic({get:async()=>{throw Error('KIWOOM_QUERY_1700');}},null,'20261120'),/1700/);
});
test('a re-asked day is replaced by the broker answer (no double counting); a fill without order number fails',async()=>{
 const prev={checkedThrough:'20261120',fills:[{...KR({cntr_qty:'3'}),ord_dt:'20261120'},{...KR({ord_no:'0000010'}),ord_dt:'20261119'}]};
 const day=[KR({cntr_qty:'3'}),KR({cntr_no:'0000002',cntr_qty:'4'})];
 const d=await collectDomestic({get:async()=>({acnt_ord_cntr_prst_array:day})},prev,'20261120');
 assert.equal(d.fills.length,3);assert.equal(d.fills.filter(f=>f.ord_dt==='20261120').length,2);
 await assert.rejects(()=>collectDomestic({get:async()=>({acnt_ord_cntr_prst_array:[KR({ord_no:''})]})},null,'20260101'),/ORDER_ID_MISSING/);
});
test('domestic fills become KRW journal rows: buy, sell, partial fills, unfilled skipped, no raw identifiers',()=>{
 const base={collectedAt:'2026-11-20T08:00:00Z',balance:{result_list:[]},valuation:{aset_evlt_amt:'0'},orders:[]};
 const fills=[
  {...KR(),ord_dt:'20261120'},
  {...KR({ord_no:'0000061',io_tp_nm:'현금매도',stk_cd:'A005930',stk_nm:'삼성전자',cntr_qty:'0000000002',cntr_uv:'0000071300',cntr_tm:'09:00:05',cntr_no:'0000003'}),ord_dt:'20261120'},
  {...KR({ord_no:'0000070',ord_qty:'0000000010',cntr_qty:'0000000003',cntr_no:'0000004',cntr_tm:'10:00:00'}),ord_dt:'20261119'},
  {...KR({ord_no:'0000070',ord_qty:'0000000010',cntr_qty:'0000000004',cntr_no:'0000005',cntr_tm:'10:00:09'}),ord_dt:'20261119'},
  {...KR({ord_no:'0000071',cntr_qty:'0000000000',cntr_no:''}),ord_dt:'20261119'},
 ];
 const f=makeFeed({...base,domestic:{checkedThrough:'20261120',fills}});
 assert.equal(f.rows.length,4);assert.equal(f.domesticCheckedThrough,'2026-11-20');
 const [buy,sell,p1,p2]=f.rows;
 assert.deepEqual({symbol:buy.symbol,name:buy.name,currency:buy.currency,side:buy.side,quantity:buy.quantity,averagePrice:buy.averagePrice,filledAmount:buy.filledAmount,tradedAtKorea:buy.tradedAtKorea,executedAt:buy.executedAt,market:buy.market},
  {symbol:'069500',name:'KODEX 200',currency:'KRW',side:'BUY',quantity:'1',averagePrice:'4900',filledAmount:'4900',tradedAtKorea:'2026-11-20',executedAt:'2026-11-20T04:07:47.000Z',market:'KR'});
 assert.equal(sell.side,'SELL');assert.equal(sell.symbol,'005930');assert.equal(sell.filledAmount,'142600');assert.equal(sell.executedAt,'2026-11-20T00:00:05.000Z');
 assert.equal(Number(p1.quantity)+Number(p2.quantity),7);assert.notEqual(p1.id,p2.id);assert.equal(p1.dateBasis,'executionTime');assert.deepEqual(p1.issues,['fees_pending']);
 const text=JSON.stringify(f);for(const raw of ['0000050','0000061','0000070','A069500','영웅문4'])assert.ok(!text.includes(raw),raw);
 assert.equal(makeFeed({...base,domestic:{checkedThrough:'20261120',fills:[]}}).rows.length,0);
 assert.equal(makeFeed(base).domesticCheckedThrough,null);
});
test('all monthly pages queried and historic facts preserved',async()=>{
 const calls=[];const snap=await collect({get:async(id,b)=>{calls.push([id,b]);return {result_list:[],aset_evlt_amt:'0'};}},{orders:[{ord_dt:'20260102',ord_no:'a'}]},new Date('2026-09-24T00:00:00Z'));
 assert.equal(calls.filter(([id])=>id==='ust21180').length,9);assert.equal(snap.orders.length,1);
});
