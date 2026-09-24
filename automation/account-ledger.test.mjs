import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function api(){
  const context={window:{},TJ:{toUSD:(v,c)=>c==='₩'?v/1400:v}};
  vm.createContext(context);
  for(const file of ['broker-feed.js','account-ledger.js','stats.js']){
    vm.runInContext(fs.readFileSync(new URL('../app/'+file,import.meta.url),'utf8'),context);
    Object.assign(context,context.window);
  }
  return context;
}
const row=(id,action,profit)=>({id,reviewId:'position',source:'fpmarkets',symbol:'TEST',currency:'USD',action,direction:'long',
  executedAt:'2026-09-20T00:00:0'+id+'Z',tradedAtKorea:'2026-09-20',quantity:'1',averagePrice:action==='close'?'110':'100',
  grossProfit:profit,swap:'-1',realisedCommission:'-2',commission:'-2',conversionFee:'0',issues:[],status:'closed'});
const feed={rows:[row('1','open',null),row('2','close','10'),row('3','close','20')],
  reviews:{position:{entryPrice:100,initialStop:95,initialTarget:110,priceR:3,status:'closed'}},
  account:{currency:'USD',balance:'777',checkedAt:'2026-09-20'}};
test('one FP position drives statistics once, with costs once and original annotations preserved',()=>{
  const {TJAccount,TJStats}=api();
  const saved=[{id:'old1',brokerSource:'fpmarkets',brokerTradeId:'2',body:'first memo',pnl:999,realized_r:3},
    {id:'old2',brokerSource:'fpmarkets',brokerTradeId:'3',body:'second memo',pnl:999,realized_r:3,updated_at:'2026-09-20'}];
  const entries=TJAccount.build(saved,null,feed);
  assert.equal(entries.length,1);assert.equal(entries[0].pnl,24);assert.equal(entries[0].realized_r,3);
  assert.equal(entries[0].body,'second memo');assert.equal(entries[0].relatedDetails[0].body,'first memo');
  assert.equal(TJStats.computeStats(entries,'선물').sumP,24);
  const bal=TJAccount.balance(TJStats.balanceOf(entries,'선물',10000,100),feed,'fpmarkets');
  assert.equal(bal.bal,777);assert.equal(bal.realized,24);
  assert.equal(saved[0].pnl,999);
});
test('unknown cost is never zero profit; open-position R is not realized',()=>{
  const {TJAccount}=api();const f=structuredClone(feed);
  f.rows[1].realisedCommission=null;f.reviews.position.status='holding';
  const e=TJAccount.build([],null,f)[0];assert.equal(e.pnl,null);assert.equal(e.realized_r,null);assert.equal(e.result,'holding');
});
test('Toss orders and actual holdings coexist; disposed buys never become current holdings',()=>{
  const {TJAccount}=api();const t={checkedAt:'2026-09-20',rows:[{id:'buy',source:'toss',side:'BUY',quantity:'10',averagePrice:'100',currency:'USD',tradedAtKorea:'2026-09-01'}],
    holdings:[{id:'h',symbol:'TEST',currency:'USD',quantity:'4',averagePurchasePrice:'100',marketValue:'440',profitLoss:'40'}]};
  const entries=TJAccount.build([],t,null);assert.equal(entries.length,2);
  assert.equal(entries.filter(e=>e.result==='holding').length,1);assert.equal(entries[0].pnl,null);
  assert.equal(TJAccount.balance({},t,'toss').bal,440);
  const saved=[entries[1]];t.holdings=[];
  assert.equal(TJAccount.build(saved,t,null).filter(e=>e.result==='holding').length,0);
  assert.equal(TJAccount.balance({},t,'toss').bal,0);
  assert.equal(TJAccount.balance({bal:999},{rows:[]},'toss').bal,null);
});
test('saved position edits and subsequent feed updates never duplicate entries',()=>{
  const {TJAccount}=api();const e=TJAccount.build([],null,feed)[0];
  const saved={...e,body:'review',updated_at:'2026-09-24'};
  const f=structuredClone(feed);f.rows[2].grossProfit='30';
  const out=TJAccount.build([saved],null,f);
  assert.equal(out.length,1);assert.equal(out[0].body,'review');assert.equal(out[0].pnl,34);
});
test('untouched demo entries do not inflate a linked account; edited notes stay',()=>{
  const {TJAccount}=api();const sample={id:'seed-1',market:'선물',pnl:100,body:'demo'};
  assert.equal(TJAccount.build([sample],null,feed,[sample]).some(e=>e.id==='seed-1'),false);
  assert.equal(TJAccount.build([{...sample,body:'my edit'}],null,feed,[sample]).some(e=>e.id==='seed-1'),true);
  assert.equal(TJAccount.build([sample],null,null,[sample]).length,1);
});
test('unreviewed automatic trades never imply perfect discipline or known zero profit',()=>{
  const {TJAccount,TJStats}=api();
  const e=TJAccount.build([],null,feed);
  assert.equal(TJStats.computeStats(e,'선물').adherence,null);
  assert.equal(TJStats.balanceOf([{market:'스윙',pnl:null}],'스윙',null,0).knownPnlCount,0);
  assert.equal(TJStats.balanceOf([{market:'스윙',pnl:0}],'스윙',null,0).knownPnlCount,1);
});
