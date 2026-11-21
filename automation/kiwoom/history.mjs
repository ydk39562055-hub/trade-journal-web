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
 const domestic=await collectDomestic(client,previous?.domestic,end);
 return {collectedAt:now.toISOString(),balance,valuation,orders:[...orders.values()],domestic};
}
// Weekdays from..to (YYYYMMDD, inclusive). Exchange holidays stay in: the broker simply returns no fills.
export function tradingDays(from,to){
 const out=[];const d=new Date(Date.UTC(+from.slice(0,4),+from.slice(4,6)-1,+from.slice(6,8)));
 for(;;d.setUTCDate(d.getUTCDate()+1)){
  const s=d.toISOString().slice(0,10).replaceAll('-','');if(s>to)return out;
  if(d.getUTCDay()%6!==0)out.push(s);
 }
}
// Domestic fills: kt00009 asks one order date at a time and only reaches back two months (live answer 506424), so the
// first run starts BACK_DAYS before today, never before 2026-01-01. The last checked day is asked again (it may have been
// mid-session), each asked day is replaced wholesale by the broker's answer, and at most maxDays are asked per invocation.
export const DOMESTIC_QUERY={stk_bond_tp:'1',mrkt_tp:'0',sell_tp:'0',qry_tp:'1',stk_cd:'',fr_ord_no:'',dmst_stex_tp:'%'};
export const BACK_DAYS=59;
const shift=(ymd,days)=>{const d=new Date(Date.UTC(+ymd.slice(0,4),+ymd.slice(4,6)-1,+ymd.slice(6,8)+days));return d.toISOString().slice(0,10).replaceAll('-','');};
export async function collectDomestic(client,previous=null,end,{maxDays=45}={}){
 const last=end<'20261231'?end:'20261231';
 let earliest=shift(last,-BACK_DAYS);if(earliest<'20260101')earliest='20260101';
 const prev=/^2026\d{4}$/.test(previous?.checkedThrough||'')&&previous.checkedThrough<=last?previous.checkedThrough:null;
 const resume=prev&&prev>earliest?prev:earliest;
 const fills=(previous?.fills||[]).filter(f=>f&&/^2026\d{4}$/.test(f.ord_dt||''));
 let checkedThrough=previous?.checkedThrough??null,kept=fills;
 for(const day of tradingDays(resume,last).slice(0,maxDays)){
  let res;
  try{res=await client.get('kt00009',{ord_dt:day,...DOMESTIC_QUERY});}
  catch(e){if(e.message!=='KIWOOM_OUT_OF_RANGE')throw e;checkedThrough=day;continue;}
  const fresh=(res.acnt_ord_cntr_prst_array||[]).filter(f=>Number(dec(f?.cntr_qty))>0).map(f=>{
   if(!String(f.ord_no||'').trim())throw Error('KIWOOM_ORDER_ID_MISSING');return {...f,ord_dt:day};
  });
  kept=[...kept.filter(f=>f.ord_dt!==day),...fresh];checkedThrough=day;
 }
 return {checkedThrough,fills:kept};
}
const SIDE=t=>/매수/.test(t||'')?'BUY':/매도/.test(t||'')?'SELL':'UNKNOWN';
function domesticRow(f){
 const date=f.ord_dt.slice(0,4)+'-'+f.ord_dt.slice(4,6)+'-'+f.ord_dt.slice(6,8);
 const code=/^[AJQ]?(\d{6})$/.exec(String(f.stk_cd||'').trim().toUpperCase())?.[1]??null;
 const tm=/^(\d{2}):?(\d{2}):?(\d{2})$/.exec(String(f.cntr_tm||'').trim());
 const quantity=dec(f.cntr_qty),averagePrice=dec(f.cntr_uv);
 return {id:digest('kiwoom-kr:'+f.ord_dt+':'+String(f.ord_no).trim()+':'+String(f.cntr_no||'').trim()),source:'kiwoom',market:'KR',symbol:code,name:String(f.stk_nm||'').trim()||null,currency:'KRW',
  side:SIDE(f.io_tp_nm),quantity,averagePrice,filledAmount:quantity!=null&&averagePrice!=null?String(Number(quantity)*Number(averagePrice)):null,
  tradedAtKorea:date,dateBasis:tm?'executionTime':'orderDate',executedAt:tm?new Date(date+'T'+tm[1]+':'+tm[2]+':'+tm[3]+'+09:00').toISOString():null,
  commission:null,tax:null,pnl:null,issues:tm?['fees_pending']:['execution_time_missing','fees_pending'],aggregation:'execution'};
}
export function makeFeed(snapshot){
 const holdings=snapshot.balance.result_list.map(h=>({id:digest('kiwoom-long:'+h.stk_cd),symbol:h.stk_cd,name:h.frgn_stk_nm,currency:h.crnc_code,quantity:dec(h.poss_qty),averagePurchasePrice:dec(h.frgn_stk_book_uv),marketValue:dec(h.evlt_amt),profitLoss:dec(h.pl_amt)}));
 if(holdings.some(h=>!h.symbol||h.quantity==null))throw Error('KIWOOM_HOLDING_INCOMPLETE');
 const rows=snapshot.orders.filter(o=>Number(dec(o.cntr_qty))>0&&/^2026\d{4}$/.test(o.ord_dt)).map(o=>({
  id:digest('kiwoom-long:'+o.ord_dt+':'+o.ord_no),source:'kiwoom',symbol:o.stk_cd,name:o.stk_nm,currency:o.crnc_code,
  side:o.slby_tp_nm?.includes('매수')?'BUY':o.slby_tp_nm?.includes('매도')?'SELL':'UNKNOWN',quantity:dec(o.cntr_qty),averagePrice:dec(o.cntr_uv),filledAmount:dec(o.cntr_amt),
  tradedAtKorea:o.ord_dt.slice(0,4)+'-'+o.ord_dt.slice(4,6)+'-'+o.ord_dt.slice(6,8),dateBasis:'orderDate',executedAt:null,commission:null,tax:null,pnl:null,issues:['execution_time_missing','fees_pending'],aggregation:'order'
 }));
 for(const f of snapshot.domestic?.fills||[])if(f&&/^2026\d{4}$/.test(f.ord_dt||'')&&Number(dec(f.cntr_qty))>0)rows.push(domesticRow(f));
 const total=dec(snapshot.valuation.aset_evlt_amt);if(total==null)throw Error('KIWOOM_VALUATION_MISSING');
 const through=snapshot.domestic?.checkedThrough;
 return {kind:'broker-feed',version:1,source:'kiwoom',checkedAt:snapshot.collectedAt,periodStart:'2026-01-01',rows,holdings,
 account:{balance:total,currency:'KRW',checkedAt:snapshot.collectedAt},scope:'US_SECURITIES_AND_DEPOSITS',historyDateBasis:'orderDate',
 domesticCheckedThrough:/^\d{8}$/.test(through||'')?through.slice(0,4)+'-'+through.slice(4,6)+'-'+through.slice(6,8):null};
}
