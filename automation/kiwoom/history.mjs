import {digest} from '../feed.mjs';
const dec=v=>{const s=String(v??'').trim().replace(/,/g,'');return /^[+-]?\d+(\.\d+)?$/.test(s)?String(Number(s)):null;};
export function windows(end){
 const out=[];for(let m=1;m<=Number(end.slice(4,6));m++){
  const start='2026'+String(m).padStart(2,'0')+'01';
  const last='2026'+String(m).padStart(2,'0')+String(new Date(Date.UTC(2026,m,0)).getUTCDate());
  if(start<=end)out.push({strt_dt:start,end_dt:last<end?last:end});
 }return out;
}
export async function collect(client,previous=null,now=new Date()){
 const end=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now).replaceAll('-','');
 const balance=await client.get('ust21070',{stex_tp:'',stk_cd:''});
 const valuation=await client.get('ust21120',{cmsn_incl_tp:'1',exrt_tp:'0'});
 const orders=new Map((previous?.orders||[]).map(o=>[o.ord_dt+':'+o.ord_no,o]));
 for(const range of windows(end))for(const o of (await client.get('ust21180',{...range,slby_tp:'0',stex_tp:'',stk_cd:'',oppo_trde_tp:'%'})).result_list){
  if(!o.ord_dt||!o.ord_no)throw Error('KIWOOM_ORDER_ID_MISSING');orders.set(o.ord_dt+':'+o.ord_no,o);
 }
 return {collectedAt:now.toISOString(),balance,valuation,orders:[...orders.values()]};
}
export function makeFeed(snapshot){
 const holdings=snapshot.balance.result_list.map(h=>({id:digest('kiwoom-long:'+h.stk_cd),symbol:h.stk_cd,name:h.frgn_stk_nm,currency:h.crnc_code,quantity:dec(h.poss_qty),averagePurchasePrice:dec(h.frgn_stk_book_uv),marketValue:dec(h.evlt_amt),profitLoss:dec(h.pl_amt)}));
 if(holdings.some(h=>!h.symbol||h.quantity==null))throw Error('KIWOOM_HOLDING_INCOMPLETE');
 const rows=snapshot.orders.filter(o=>Number(dec(o.cntr_qty))>0&&/^2026\d{4}$/.test(o.ord_dt)).map(o=>({
  id:digest('kiwoom-long:'+o.ord_dt+':'+o.ord_no),source:'kiwoom',symbol:o.stk_cd,name:o.stk_nm,currency:o.crnc_code,
  side:o.slby_tp_nm?.includes('매수')?'BUY':o.slby_tp_nm?.includes('매도')?'SELL':'UNKNOWN',quantity:dec(o.cntr_qty),averagePrice:dec(o.cntr_uv),filledAmount:dec(o.cntr_amt),
  tradedAtKorea:o.ord_dt.slice(0,4)+'-'+o.ord_dt.slice(4,6)+'-'+o.ord_dt.slice(6,8),dateBasis:'orderDate',executedAt:null,commission:null,tax:null,pnl:null,issues:['execution_time_missing','fees_pending'],aggregation:'order'
 }));
 const total=dec(snapshot.valuation.aset_evlt_amt);if(total==null)throw Error('KIWOOM_VALUATION_MISSING');
 return {kind:'broker-feed',version:1,source:'kiwoom',checkedAt:snapshot.collectedAt,periodStart:'2026-01-01',rows,holdings,
 account:{balance:total,currency:'KRW',checkedAt:snapshot.collectedAt},scope:'US_SECURITIES_AND_DEPOSITS',historyDateBasis:'orderDate'};
}
