import {integer} from './protocol.mjs';
import {digest,canonical} from '../feed.mjs';
const YEAR=Date.parse('2026-01-01T00:00:00+09:00');
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export const reviewId=p=>digest('fp-review:'+p.id);
export function analysePosition(p,orders){
  const opening=p.executions.filter(d=>d.action==='open'),closing=p.executions.filter(d=>d.action==='close');
  const first=opening[0],sign=p.direction==='long'?1:p.direction==='short'?-1:0;
  const o=first?orders[first.orderId]:null;
  let reason=null,sl=null,tp=null,r=null,plannedR=null;
  if(!first||!sign)reason='initial_entry_missing';
  else if(opening.length!==1)reason='multiple_entries';
  else if(p.issues.length)reason='incomplete_history';
  else if(!o)reason='order_unavailable';
  else if(o.utcLastUpdateTimestamp==null||!Number.isFinite(Number(o.utcLastUpdateTimestamp))||Number(o.utcLastUpdateTimestamp)>Date.parse(first.executedAt)+1000)reason='initial_stop_unverified';
  else {
    const distance=Number(o.relativeStopLoss)/100000;
    sl=positive(distance)?first.price-sign*distance:positive(o.stopLoss)?o.stopLoss:null;
    const target=Number(o.relativeTakeProfit)/100000;
    tp=positive(target)?first.price+sign*target:positive(o.takeProfit)?o.takeProfit:null;
    if(!positive(first.price)||sl==null||!(sign*(first.price-sl)>0)){sl=null;reason='initial_stop_missing';}
    else {
      const risk=Math.abs(first.price-sl),quantity=Number(first.quantityUnits);
      if(tp!=null)plannedR=sign*(tp-first.price)/risk;
      if(p.status!=='closed')reason='position_open';
      else if(!positive(quantity)||closing.some(d=>!positive(d.price)||!positive(Number(d.quantityUnits))))reason='invalid_execution';
      else r=closing.reduce((sum,d)=>sum+sign*(d.price-first.price)*Number(d.quantityUnits),0)/(risk*quantity);
    }
  }
  const executions=p.executions.map(d=>{
    const order=orders[d.orderId];let exitKind=null;
    if(d.action==='close'){
      if(order?.isStopOut)exitKind='stop_out';
      else if([4,'STOP_LOSS_TAKE_PROFIT'].includes(order?.orderType)){
        const stop=order.stopPrice,target=order.limitPrice;
        if(positive(stop)&&positive(target)&&positive(d.price)&&stop!==target){
          exitKind=Math.abs(d.price-stop)<Math.abs(d.price-target)?'stop_likely':'target_likely';
        }else exitKind='protective_order';
      }else if(order)exitKind='other_order';else exitKind='unknown';
    }
    return {id:digest('fp-execution:'+p.id+':'+d.dealId),at:d.executedAt,price:d.price,quantity:d.quantityUnits,action:d.action,side:d.side,exitKind};
  });
  return {id:reviewId(p),symbol:first?.ticker||p.executions[0]?.ticker||'',direction:p.direction,status:p.status,
    entryPrice:first?.price??null,entryAt:first?.executedAt??null,initialStop:sl,initialTarget:tp,
    priceR:r!=null&&Number.isFinite(r)?Number(r.toFixed(6)):null,plannedR:plannedR!=null&&Number.isFinite(plannedR)?Number(plannedR.toFixed(6)):null,
    rBasis:'initial-order-price-before-costs',reason,executions};
}
export function chartWindow(p,now){
  const times=p.executions.map(d=>Date.parse(d.executedAt));
  const start=Math.min(...times),finish=p.status==='holding'?now:Math.max(...times);
  const choices=[[5,5],[15,7],[60,9],[240,10],[1440,12]];
  const [minutes,period]=choices.find(([m])=>(finish-start)/(m*60000)<=350)||choices.at(-1);
  const step=minutes*60000;
  return {minutes,period,from:Math.max(YEAR,Math.floor(start/step)*step-45*step),to:Math.min(now,Math.ceil(finish/step)*step+20*step)};
}
export function decodeBars(response,window,symbolId){
  if(response.period!==window.period||response.symbolId!=null&&String(response.symbolId)!==String(symbolId))throw new Error('CHART_RESPONSE_MISMATCH');
  if(response.hasMore)throw new Error('CHART_TRUNCATED');
  const rows=new Map();
  for(const b of response.trendbar||[]){
    if([b.low,b.deltaOpen,b.deltaHigh,b.deltaClose,b.utcTimestampInMinutes].some(v=>v==null))throw new Error('INVALID_CANDLE');
    const low=integer(b.low),price=delta=>Number(low+integer(delta))/100000;
    const row=[Number(b.utcTimestampInMinutes)*60,price(b.deltaOpen),price(b.deltaHigh),Number(low)/100000,price(b.deltaClose)];
    if(row.some(v=>!Number.isFinite(v))||row[2]<Math.max(row[1],row[4])||row[3]>Math.min(row[1],row[4]))throw new Error('INVALID_CANDLE');
    if(row[0]*1000>=window.from&&row[0]*1000<=window.to)rows.set(row[0],row);
  }
  return [...rows.values()].sort((a,b)=>a[0]-b[0]);
}
export async function enrichReviews(client,result,previous=null,force=false,onProgress=()=>{}){
  const snapshot=result.snapshot,old=previous?.reviewCache||{},next={},reviews={};
  const query=async(type,p)=>{const r=await client.request(type,{ctidTraderAccountId:integer(snapshot.accountId),...p});
    if(String(r.ctidTraderAccountId)!==snapshot.accountId)throw new Error('ACCOUNT_MISMATCH');return r;};
  let n=0;
  for(const p of [...result.inbox].sort((a,b)=>b.executions.at(-1).executedAt.localeCompare(a.executions.at(-1).executedAt))){
    const key=reviewId(p),fingerprint=digest(canonical(p)),prior=old[key];
    if(!force&&prior?.version===1&&prior.fingerprint===fingerprint&&p.status==='closed'&&!prior.retry&&prior.review.chart?.complete){next[key]=prior;reviews[key]=prior.review;continue;}
    const orders={};let retry=false;
    for(const orderId of new Set(p.executions.map(d=>d.orderId)))try{
      const order=(await query(2181,{orderId:integer(orderId)})).order;
      if(String(order?.orderId)!==orderId)throw new Error('ORDER_MISMATCH');
      orders[orderId]=order;
    }catch{retry=true;}
    const review=analysePosition(p,orders),window=chartWindow(p,Date.now());
    try{
      const symbolId=p.executions[0].symbolId;
      const response=await query(2137,{symbolId:integer(symbolId),period:window.period,fromTimestamp:window.from,toTimestamp:window.to});
      const bars=decodeBars(response,window,symbolId);
      review.chart={minutes:window.minutes,bars,from:window.from,to:window.to,complete:p.status==='closed'&&Date.now()>Date.parse(p.executions.at(-1).executedAt)+20*window.minutes*60000,
        state:bars.length?'ok':'unavailable'};
      if(!bars.length)retry=true;
    }catch{review.chart={minutes:window.minutes,bars:[],state:'unavailable',complete:false};retry=true;}
    reviews[key]=review;next[key]={version:1,fingerprint,review,retry};
    onProgress(++n,result.inbox.length);
  }
  result.reviews=reviews;result.reviewCache=next;
  return result;
}
