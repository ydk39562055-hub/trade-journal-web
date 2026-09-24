/* One account ledger feeds the original journal, home, statistics and assets.
   Broker snapshots remain immutable; saved entries are user annotations. */
(function () {
  const num = x => x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x);
  const currency = c => c === 'KRW' ? '₩' : c === 'USD' ? '$' : c;
  const result = p => p == null ? null : p > 0 ? 'win' : p < 0 ? 'loss' : 'be';
  const sum = xs => xs.length && xs.every(x => num(x) != null) ? xs.reduce((a,x)=>a+Number(x),0) : null;
  function build(saved, toss, fp, samples = []) {
    const generated = [], consumed = new Set();
    function attach(base, source, ids) {
      const matches = saved.filter(e=>e.brokerSource===source && (e.id===base.id || ids.includes(e.brokerTradeId)));
      matches.forEach(e=>consumed.add(e.id));
      const latest = [...matches].sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))[0];
      // All older notes/photos remain accessible when several fill annotations join one position.
      const entry = {...base, ...latest, id:base.id, market:base.market, brokerSource:source,
        brokerTradeId:base.brokerTradeId, brokerTradeIds:ids, automated:true, reviewed:matches.length>0,
        brokerFacts:base, relatedDetails:matches.filter(e=>e!==latest)};
      for (const k of ['pnl','result','realized_r','shares','entry_price','stop_price','target_price','exit_price','direction']) {
        if (base[k] != null) entry[k] = base[k];
      }
      // Incompatible legacy position-wide R values must never be counted once per fill.
      if (source==='fpmarkets' && base.realized_r == null && matches.length>1) entry.realized_r=null;
      if (base.id.startsWith('broker-holding:')) { entry.pnl=null; entry.realized_r=null; entry.result='holding'; }
      generated.push(entry);
    }
    const groups = new Map();
    for (const row of TJBroker.journalRows(fp?.rows||[], '선물')) {
      const key=row.reviewId || row.id;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(row);
    }
    for (const [key, rows] of groups) {
      rows.sort((a,b)=>a.executedAt.localeCompare(b.executedAt));
      const first=rows[0], last=rows.at(-1), review=fp?.reviews?.[key];
      const closes=rows.filter(r=>r.action==='close');
      const complete=rows.every(r=>!(r.issues||[]).length);
      const profits=closes.map(r=>{
        const values=[r.grossProfit,r.swap,r.realisedCommission,r.conversionFee].map(num);
        // cTrader closing detail commission already relates to the closed volume.
        // Do not subtract the separate deal commission again.
        return values.some(v=>v==null)||values[2]>0 ? null : values[0]+values[1]+values[2]-Math.abs(values[3]);
      });
      const pnl=complete ? sum(profits) : null;
      const holding=(review?.status || last.status)==='holding';
      const units=sum(closes.map(r=>r.quantity));
      const exit=units>0 && closes.every(r=>num(r.averagePrice)!=null) ? closes.reduce((a,r)=>a+Number(r.averagePrice)*Number(r.quantity),0)/units : null;
      attach({id:'broker-position:fpmarkets:'+key,brokerTradeId:first.id,
        market:'선물',ticker:first.symbol,currency:currency(first.currency),traded_at:last.tradedAtKorea,
        created_at:first.executedAt,body:'',photos:[],setups:[],errors:[],
        entry_price:num(review?.entryPrice),stop_price:num(review?.initialStop),target_price:num(review?.initialTarget),
        exit_price:exit,direction:review?.direction||first.direction,
        realized_r:!holding?num(review?.priceR):null,pnl,result:holding?'holding':result(pnl),
        brokerRows:rows,accountNote:pnl==null&&closes.length?'비용·이력 확인 필요':holding?'보유 포지션':'청산 포지션'},'fpmarkets',rows.map(r=>r.id));
    }
    for (const row of TJBroker.journalRows(toss?.rows||[], '스윙')) {
      const base=TJBroker.detailEntry(row);
      // Executed buy orders are history, not evidence that these shares are still held.
      attach({...base,shares:null,result:null,pnl:null,realized_r:null,brokerRows:[row],
        accountNote:row.side==='BUY'?'매수 체결':'매도 체결 · 실현손익 확인 필요'},'toss',[row.id]);
    }
    for (const h of toss?.holdings||[]) {
      if (!(num(h.quantity)>0)) continue;
      attach({id:'broker-holding:toss:'+h.id,brokerTradeId:'holding:'+h.id,
        market:'스윙',ticker:h.symbol,currency:currency(h.currency),
        traded_at:(toss.checkedAt||'').slice(0,10),created_at:toss.checkedAt,
        result:'holding',shares:num(h.quantity),entry_price:num(h.averagePurchasePrice),
        pnl:null,realized_r:null,body:'',photos:[],setups:[],errors:[],
        marketValue:num(h.marketValue),unrealizedPnl:num(h.profitLoss),accountNote:'토스 현재 보유'},'toss',['holding:'+h.id]);
    }
    return [...generated,...saved.filter(e=>{
      if (consumed.has(e.id)) return false;
      const sample=samples.find(s=>s.id===e.id);
      if (sample && !e.updated_at && Object.keys({...sample,...e}).filter(k=>k!=='created_at').every(k=>JSON.stringify(sample[k])===JSON.stringify(e[k]))) return false;
      return true;
    }).map(e=>{
      if (toss?.holdings && e.id.startsWith('broker-holding:toss:')) return {...e,result:null,pnl:null,realized_r:null,shares:0,accountNote:'이전 보유 복기'};
      return e;
    })];
  }
  function balance(manual,feed,source) {
    if (!feed) return manual;
    const usd=(v,c)=>num(v)==null?null:c==='USD'?num(v):c==='KRW'?TJ.toUSD(num(v),'₩'):null;
    if(source==='fpmarkets') {
      const value=usd(feed.account?.balance,feed.account?.currency);
      return {...manual,seed:null,deposit:0,base:null,broker:source,bal:value,ret:null,hasOpen:false,open:null,
        checkedAt:feed.account?.checkedAt,balanceLabel:'FP 확정 잔액',balanceNote:'미실현손익 별도 · 수집된 잔액 기준'};
    }
    const values=(feed.holdings||[]).map(h=>usd(h.marketValue,h.currency));
    const value=feed.holdings ? (values.length?sum(values):0) : null;
    return {...manual,seed:null,deposit:0,base:null,broker:source,bal:value,ret:null,checkedAt:feed.checkedAt,
      balanceLabel:'토스 보유 평가액',balanceNote:'주식 평가액만 포함 · 현금 매수가능금액은 총예수금과 달라 합산하지 않아요'};
  }
  window.TJAccount={build,balance};
})();
