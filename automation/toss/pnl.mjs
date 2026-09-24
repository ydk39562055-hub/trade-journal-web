// Derived journal P&L, not broker-certified or tax-basis P&L. Uses all retained history.
const n=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
export function reconcile(account){
 const groups=new Map(),out=new Map();
 for(const e of account.executions){const k=e.currency+':'+e.symbol;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
 for(const [key,rows] of groups){
  rows.sort((a,b)=>String(a.executedAt).localeCompare(String(b.executedAt))||a.id.localeCompare(b.id));
  let qty=0,cost=0,fees=0,reason=null;const calculated=[];
  for(let i=0;i<rows.length;i++){
   const e=rows[i],q=n(e.quantity),amount=n(e.filledAmount),fee=n(e.commission),tax=n(e.tax);
   if(!e.executedAt||q==null||q<=0||amount==null||amount<0||fee==null||fee<0||tax==null||tax<0||!['BUY','SELL'].includes(e.side)){reason='missing_cost_or_execution';break;}
   // Order aggregates cannot reconstruct an opposite-side fill interleaved during execution.
   if(rows.slice(0,i).some(p=>p.side!==e.side && Date.parse(p.executedAt)>=Date.parse(e.orderedAt||e.executedAt))){reason='interleaved_order_fills';break;}
   if(e.side==='BUY'){qty+=q;cost+=amount;fees+=fee+tax;}
   else {
    if(q>qty+1e-7||qty<=0){reason='purchase_history_missing';break;}
    const ratio=Math.min(1,q/qty),basis=cost*ratio,buyFees=fees*ratio;
    calculated.push([e.id,{pnl:String(Math.round((amount-basis-buyFees-fee-tax)*100)/100),pnlStatus:'calculated',pnlBasis:'moving_average_all_history',allocatedCost:String(basis),allocatedBuyFees:String(buyFees)}]);
    qty-=q;cost-=basis;fees-=buyFees;if(Math.abs(qty)<1e-7){qty=0;cost=0;fees=0;}
   }
  }
  const h=account.holdings.items.find(h=>h.currency+':'+h.symbol===key);
  if(!reason && Math.abs(qty-Number(h?.quantity||0))>1e-6)reason='holdings_quantity_mismatch';
  if(!reason && qty>0){const avg=n(h?.averagePurchasePrice);if(avg==null||Math.abs(cost/qty-avg)>Math.max(.01,Math.abs(avg)*.0001))reason='holdings_cost_mismatch';}
  for(const e of rows.filter(e=>e.side==='SELL'))out.set(e.id,{pnl:null,pnlStatus:'unreconciled',pnlReason:reason||'purchase_history_missing'});
  if(!reason)for(const [id,value]of calculated)out.set(id,value);
 }
 return out;
}
