const FP_REASON={initial_entry_missing:'최초 진입 이력이 없어요.',multiple_entries:'추가 진입이 있어 최초 위험금액 확인이 필요해요.',incomplete_history:'거래 이력을 더 확인해야 해요.',order_unavailable:'진입 주문 정보를 확인하지 못했어요.',initial_stop_unverified:'주문 수정 이력이 있어 최초 손절가를 확정하지 않았어요.',initial_stop_missing:'진입 주문에 최초 손절가가 없어요.',position_open:'보유 중이라 최종 R은 아직 없어요.',invalid_execution:'수량·가격 확인이 필요해요.'};
const FP_EXIT={stop_out:'강제 청산',stop_likely:'손절 주문 추정',target_likely:'익절 주문 추정',protective_order:'손절·익절 주문',other_order:'일반 청산 주문',unknown:'청산 방식 미확정'};
const fpNum=v=>v==null?'미확정':Number(v).toLocaleString('en-US',{maximumFractionDigits:5});
const fpR=v=>v==null?'R 미확정':(v>0?'+':'')+Number(v).toFixed(2)+'R';
const fpTime=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
function FpReview({review}){
  const [open,setOpen]=React.useState(false);
  if(!review)return <p className="broker-explanation">복기 차트와 R을 수집하고 있어요. 다음 갱신 때 확인해 주세요.</p>;
  return <div className="fp-review">
    <button className="fp-review-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}><span>진입 차트 · 매매 복기</span><strong>{fpR(review.priceR)}</strong><span>{open?'접기':'열기'}</span></button>
    {open&&<div className="fp-review-body">
      <p className="broker-explanation">같은 포지션의 진입과 분할 청산을 모았어요. 각 체결에서 여는 이 복기는 동일한 거래 전체의 결과예요.</p>
      <div className="fp-risk-grid"><div><small>최초 진입가</small><b>{fpNum(review.entryPrice)}</b></div><div><small>최초 손절가</small><b>{fpNum(review.initialStop)}</b></div><div><small>최초 익절가</small><b>{fpNum(review.initialTarget)}</b></div><div><small>계획 R</small><b>{fpR(review.plannedR)}</b></div></div>
      <p className="broker-explanation">{review.priceR!=null?'가격 변동·청산 수량을 최초 위험폭과 비교한 비용 전 R이에요. 수수료·스왑을 반영한 순손익 R과 다를 수 있어요.':FP_REASON[review.reason]||'R을 계산할 초기 정보가 부족해요.'}</p>
      <FpCandleChart review={review}/>
      <div className="fp-executions">{review.executions.map((d,i)=><div key={d.id}><b>{d.action==='open'?'진입':'청산'} {i+1}</b><span>{fpTime(d.at)}</span><span>{fpNum(d.price)} · {fpNum(d.quantity)}단위</span>{d.exitKind&&<small>{FP_EXIT[d.exitKind]}</small>}</div>)}</div>
      <p className="broker-explanation">손절·익절 주문의 구분은 주문 가격과 체결가를 대조한 추정이에요. 손절가를 수익 구간으로 옮기면 손절 주문으로 청산돼도 +R일 수 있어요.</p>
    </div>}
  </div>;
}
function FpCandleChart({review}){
  const bars=review.chart?.bars||[];
  const [count,setCount]=React.useState(60),[start,setStart]=React.useState(()=>Math.max(0,bars.findIndex(b=>b[0]>=Date.parse(review.entryAt)/1000)-15)),[hover,setHover]=React.useState(null);
  if(!bars.length)return <p className="broker-notice">이 구간의 가격 차트를 아직 가져오지 못했어요. 주문 정보와 캡처는 계속 볼 수 있어요.</p>;
  const size=count?Math.min(count,bars.length):bars.length,offset=Math.min(start,bars.length-size),visible=bars.slice(offset,offset+size);
  const levels=[['진입',review.entryPrice,'#916338'],['최초 SL',review.initialStop,'#c84646'],['최초 TP',review.initialTarget,'#19866b']].filter(v=>Number.isFinite(v[1]));
  const low=Math.min(...visible.map(b=>b[3]),...levels.map(v=>v[1])),high=Math.max(...visible.map(b=>b[2]),...levels.map(v=>v[1]));
  const pad=Math.max((high-low)*.1,Math.abs(high)*.00001,.00001),min=low-pad,max=high+pad;
  const W=860,H=350,L=18,R=112,T=26,B=42,PW=W-L-R,PH=H-T-B;
  const x=i=>L+(i+.5)*PW/size,y=v=>T+(max-v)/(max-min)*PH;
  const selected=hover==null?null:visible[Math.max(0,Math.min(size-1,hover))];
  const move=e=>{const box=e.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(size-1,Math.floor(((e.clientX-box.left)/box.width*W-L)/PW*size))));};
  return <div className="fp-chart">
    <div className="fp-chart-tools"><strong>FP Markets · {review.chart.minutes<60?review.chart.minutes+'분':review.chart.minutes/60+'시간'}봉</strong><label>확대 <select aria-label="차트 확대" value={count} onChange={e=>{const n=Number(e.target.value);setCount(n);setStart(0);setHover(null);}}><option value="0">전체 구간</option><option value="120">120개 캔들</option><option value="60">60개 캔들</option></select></label></div>
    <div className="fp-chart-scroll"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${review.symbol} 진입 청산 복기 차트`} onPointerMove={move} onPointerLeave={()=>setHover(null)}>
      <rect width={W} height={H} fill="var(--surface,#fff)"/>
      {[0,1,2,3,4].map(i=>{const value=min+(max-min)*i/4;return <g key={i}><line x1={L} x2={W-R} y1={y(value)} y2={y(value)} stroke="var(--border,#ddd)"/><text x={W-R+6} y={y(value)+4} fontSize="12" fill="currentColor">{fpNum(value)}</text></g>;})}
      {visible.map((b,i)=>{const color=b[4]>=b[1]?'#19866b':'#c84646',bw=Math.max(1,Math.min(10,PW/size*.65));return <g key={b[0]}><line x1={x(i)} x2={x(i)} y1={y(b[2])} y2={y(b[3])} stroke={color}/><rect x={x(i)-bw/2} y={Math.min(y(b[1]),y(b[4]))} width={bw} height={Math.max(1,Math.abs(y(b[1])-y(b[4])))} fill={color}/></g>;})}
      {levels.map(([name,value,color],i)=><g key={name}><line x1={L} x2={W-R} y1={y(value)} y2={y(value)} stroke={color} strokeDasharray="5 5"/><text x={L+4} y={14+i*15} fontSize="12" fill={color}>{name} {fpNum(value)}</text></g>)}
      {review.executions.map((d,i)=>{const sec=Date.parse(d.at)/1000;if(sec<visible[0][0]||sec>=visible.at(-1)[0]+review.chart.minutes*60||!Number.isFinite(d.price))return null;
        let index=visible.findIndex(b=>b[0]>sec)-1;if(index<0)index=visible.length-1;
        const color=d.action==='open'?'#916338':'#526ac4';return <g key={d.id}><circle cx={x(index)} cy={y(d.price)} r="5" fill={color} stroke="white"/><text x={x(index)+7} y={y(d.price)+(i%2?18:-8)} fontSize="13" fill={color}>{d.action==='open'?'진입':'청산'}{i+1}</text></g>;})}
      {[0,Math.floor((size-1)/2),size-1].map((i,k)=><text key={k} x={x(i)} y={H-14} textAnchor={k===0?'start':k===2?'end':'middle'} fontSize="12" fill="currentColor">{fpTime(visible[i][0]*1000)}</text>)}
      {selected&&<line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} stroke="#888" strokeDasharray="3 3"/>}
    </svg></div>
    <div className="fp-candle-readout">{selected?`${fpTime(selected[0]*1000)} · 시 ${fpNum(selected[1])} / 고 ${fpNum(selected[2])} / 저 ${fpNum(selected[3])} / 종 ${fpNum(selected[4])}`:'캔들을 가리키거나 터치하면 가격을 볼 수 있어요. 좁은 화면에서는 차트를 좌우로 밀어 보세요.'}</div>
    {size<bars.length&&<label className="fp-chart-range">차트 구간 <input type="range" aria-label="차트 구간" min="0" max={bars.length-size} value={offset} onChange={e=>{setStart(Number(e.target.value));setHover(null);}}/></label>}
    <p className="broker-explanation">FP Markets 과거 시세로 재구성한 차트예요. 트레이딩뷰의 그림·지표는 포함하지 않으며, 시세 제공처에 따라 캔들이 다를 수 있어요.</p>
  </div>;
}
window.FpReview=FpReview;
