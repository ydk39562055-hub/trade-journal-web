function useFpFeed(code, refresh, feedType = 'fp-data') {
  const [view, setView] = React.useState({feed:null,status:null,loading:!!code,error:''});
  React.useEffect(() => {
    let alive=true, timer, busy=false, current=null;
    setView({feed:null,status:null,loading:!!code,error:''});
    if(!code) return;
    async function update(){
      if(busy||!alive)return; busy=true;
      try {
        const status=await TJBroker.pull(code,feedType === 'data' ? 'status' : 'fp-status');
        const feed=!current?.feed||(status.revision&&status.revision!==current.status?.revision)
          ? await TJBroker.pull(code,feedType) : current.feed;
        current={feed,status}; if(alive)setView({...current,loading:false,error:''});
        await TJBroker.cache(code,current,false,feedType).catch(()=>{});
      }catch{if(alive)setView(v=>({...v,loading:false,error:(feedType === 'data' ? '토스' : 'FP')+' 최신 상태를 확인하지 못했어요.'}));}
      finally{busy=false;}
    }
    async function start(){current=await TJBroker.cache(code,undefined,false,feedType).catch(()=>null);
      if(!alive)return; if(current?.feed)setView({...current,loading:true,error:''});
      await update(); if(alive)timer=setInterval(()=>{if(!document.hidden)update();},60000);
    }
    const wake=()=>{if(!document.hidden)update();}; start(); document.addEventListener('visibilitychange',wake);
    return ()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',wake);};
  },[code,refresh,feedType]);
  return view;
}
function BrokerPanel({ code, onConnect, memos, onAddMemo, onRemoveMemo, syncId, imports = [], onImport, onRemoveImport, market = null, entries = [], onEditDetail }) {
  const [view, setView] = React.useState({ feed: null, status: null, loading: !!code, error: '' });
  const [input, setInput] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [side, setSide] = React.useState('all');
  const [month, setMonth] = React.useState('all');
  const [limit, setLimit] = React.useState(40);
  const [refresh, setRefresh] = React.useState(0);
  const fp = useFpFeed(market === '스윙' ? '' : code, refresh);
  const [manage, setManage] = React.useState(false);
  const [meritzOpen, setMeritzOpen] = React.useState(false);
  const [broker, setBroker] = React.useState('all');
  const file = React.useRef();

  React.useEffect(() => {
    let alive = true, timer, current = null, busy = false;
    setView({ feed: null, status: null, loading: !!code, error: '' });
    if (!code || market === '선물') return;
    async function update() {
      if (busy || !alive) return;
      busy = true;
      try {
        const status = await TJBroker.pull(code, 'status');
        const changed = !current?.feed || (status.revision && status.revision !== current.status?.revision);
        const feed = changed ? await TJBroker.pull(code, 'data') : current.feed;
        current = { feed, status };
        if (alive) setView({ ...current, loading: false, error: '' });
        await TJBroker.cache(code, current).catch(() => {});
      } catch {
        if (alive) setView(v => ({ ...v, loading: false,
          error: '최신 상태를 확인하지 못했어요. 저장된 기록은 계속 볼 수 있어요.' }));
      } finally { busy = false; }
    }
    async function start() {
      current = await TJBroker.cache(code).catch(() => null);
      if (!alive) return;
      if (current?.feed) setView({ ...current, loading: true, error: '' });
      await update();
      if (alive) timer = setInterval(() => { if (!document.hidden) update(); }, 60000);
    }
    const wake = () => { if (!document.hidden) update(); };
    start(); document.addEventListener('visibilitychange', wake);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, [code, refresh, market]);
  React.useEffect(() => setLimit(40), [search, side, month, broker, market]);

  async function connect(raw) {
    setConnecting(true); setConnectionError('');
    try {
      const next = TJBroker.clean(raw);
      await TJBroker.pull(next, market === '선물' ? 'fp-status' : 'status');
      onConnect(next); setInput(''); setManage(false);
    } catch (e) { setConnectionError(e.message || '연결하지 못했어요.'); }
    finally { setConnecting(false); }
  }
  const rows = TJBroker.journalRows([...(view.feed?.rows || []), ...(fp.feed?.rows || []), ...imports], market);
  const months = [...new Set(rows.map(r => r.tradedAtKorea?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const selected = rows.filter(r => (market || broker === 'all' || r.source === broker) && (side === 'all' || r.side === side)
    && (month === 'all' || r.tradedAtKorea?.startsWith(month))
    && (!search || `${r.name} ${r.symbol}`.toLowerCase().includes(search.toLowerCase())));
  const last = view.status?.collectedAt || view.status?.lastSuccessAt;
  const stale = !last || Date.now() - Date.parse(last) > 15 * 60000;
  const fpLast = fp.status?.collectedAt || fp.status?.lastSuccessAt;
  const fpStale = !fpLast || Date.now() - Date.parse(fpLast) > 15 * 60000;
  const fpHealth = !code ? '연결 준비' : fp.loading ? '상태 확인 중' : fp.error ? (fp.feed ? '오프라인 보기' : '수집 내역 대기')
    : fp.status?.state === 'error' ? '수집 확인 필요' : fpStale ? 'PC 수집 대기' : '자동 수집 중';
  const health = !code ? '연결 준비' : view.loading ? '상태 확인 중' : view.error ? '오프라인 보기'
    : view.status?.state === 'error' ? '수집 확인 필요' : stale ? 'PC 수집 대기' : '자동 수집 중';
  const stamp = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '아직 없음';

  return <section className="broker-panel">
    <header className="broker-heading">
      <div><div className="seclabel">BROKER JOURNAL</div><h2>{market ? `${market} 자동 일지` : '연결·가져오기'}</h2><p>{market === '선물' ? 'FP Markets 체결 · 진입·SL·TP·R과 복기 메모' : market === '스윙' ? '토스증권 체결 · 국내·미국 주식과 복기 메모' : 'FP Markets → 선물 · 토스증권 → 스윙'}</p></div>
      {code && <button className="btn-ghost" onClick={() => setManage(!manage)}>연결 관리</button>}
    </header>
    <div className="broker-connections" style={market ? {gridTemplateColumns:"1fr"} : undefined}>
      {market !== '선물' && <div className="broker-connection"><strong>토스증권</strong><span className={'broker-health ' + (!stale && !view.error && view.status?.state === 'ok' ? 'good' : '')}>{health}</span>
        <small>마지막 수집 {stamp(last)} · 5분 간격</small></div>}
      {market !== '스윙' && <div className="broker-connection"><strong>FP Markets</strong><span className={'broker-health ' + (!fpStale && !fp.error && fp.status?.state === 'ok' ? 'good' : '')}>{fpHealth}</span><small>마지막 수집 {stamp(fpLast)} · 5분 간격</small>
        {fp.feed?.account&&<div className="fp-account"><small>확정 잔액</small><b>{fp.feed.account.currency==='USD'?'$':fp.feed.account.currency+' '}{TJBroker.decimal(fp.feed.account.balance)}</b><small>보유 포지션 {fp.feed.account.openPositions}개 · 미실현손익 별도</small></div>}</div>}
    </div>
    {!market && <div className="meritz-summary"><div><strong>메리츠증권</strong><small>국내·미국 · 체결 알림 / 화면 캡처</small></div><button className="btn-ghost" onClick={()=>setMeritzOpen(true)}>기록 가져오기</button></div>}
    {(!code || manage) && <div className="broker-setup">
      <h3>{code ? '다른 기기에서도 같은 기록 보기' : 'PC 수집기 연결'}</h3>
      <p>PC의 연결 파일을 한 번 선택하면 이후 거래는 자동으로 들어와요. 토스 API 키는 이 화면에 입력하지 마세요.</p>
      <input ref={file} type="file" accept=".json,application/json" aria-label="자동 기록 연결 파일" onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return;
        try { if (f.size > 4096) throw new Error(); const j = JSON.parse(await f.text());
          if (j.kind !== 'trade-journal-broker-connection') throw new Error(); await connect(j.code);
        } catch { setConnectionError('PC에서 만든 자동기록 연결 파일을 선택해 주세요.'); }
        e.target.value = '';
      }} />
      <div className="broker-connect-input"><input type="password" autoComplete="off" placeholder="자동 기록 연결코드" aria-label="자동 기록 연결코드" value={input} onChange={e => setInput(e.target.value)} />
        <button className="btn-primary" disabled={connecting || !input} onClick={() => connect(input)}>{connecting ? '확인 중…' : '연결'}</button></div>
      {code && <div className="broker-actions"><button className="btn-ghost" onClick={async () => {
        try { await navigator.clipboard.writeText(code); setConnectionError('연결코드를 복사했어요. 내 기기에서만 사용해 주세요.'); }
        catch { setConnectionError('이 브라우저에서는 복사할 수 없어요. 연결 파일을 사용해 주세요.'); }
      }}>연결코드 복사</button><button className="btn-ghost" onClick={() => { TJBroker.cache(code, undefined, true).catch(() => {}); TJBroker.cache(code, undefined, true, 'fp-data').catch(() => {}); onConnect(''); setManage(false); }}>이 기기 연결 해제</button></div>}
      <small>{syncId ? '일지 동기화가 켜져 있어 연결 설정과 매매 메모도 다른 기기와 공유돼요.' : '매매 메모도 휴대폰과 공유하려면 설정에서 일지 동기화를 켜 주세요.'}</small>
      {connectionError && <p role="status">{connectionError}</p>}
    </div>}
    {(code || imports.length>0) && <>
      {code && market !== '선물' && (view.error || stale || view.status?.state === 'error') && <p className="broker-notice" role="status">{view.error || (view.status?.state === 'error'
        ? '최근 수집이 완료되지 않았어요. PC의 자동수집 상태 파일에서 연결 상태를 확인해 주세요.'
        : 'PC가 꺼져 있거나 절전 중이면 마지막 기록을 보여줘요. PC 수집기가 다시 실행되면 새 거래가 반영돼요.')}</p>}
      <div className="broker-toolbar"><input aria-label="종목 검색" placeholder="종목명 또는 티커 검색" value={search} onChange={e => setSearch(e.target.value)} />
        {!market && <select aria-label="증권사 필터" value={broker} onChange={e=>setBroker(e.target.value)}><option value="all">전체 증권사</option><option value="toss">토스</option><option value="fpmarkets">FP Markets</option><option value="meritz">메리츠</option></select>}
        <select aria-label="기록 월" value={month} onChange={e => setMonth(e.target.value)}><option value="all">전체 기간</option>{months.map(m => <option key={m}>{m}</option>)}</select>
        <select aria-label="매수 매도 필터" value={side} onChange={e => setSide(e.target.value)}><option value="all">매수·매도</option><option value="BUY">매수</option><option value="SELL">매도</option></select></div>
      <div className="broker-count"><strong>{selected.length.toLocaleString()}건</strong><span>{view.feed?.periodStart?.slice(0,10) || '2026-01-01'}부터 · 한국 시간</span><button className="btn-ghost" style={{marginLeft:'auto',whiteSpace:'nowrap'}} onClick={() => setRefresh(n => n + 1)}>새로고침</button></div>
      <p className="broker-explanation">{market === '선물' ? 'FP Markets 체결별 기록 · 수량은 계약 단위예요.' : market === '스윙' ? '토스 분할 체결은 주문별로 합쳐 보여줘요.' : '메리츠 기록은 확인 후 저장할 수 있어요.'} 원본 체결은 그대로 보관하고, 상세 일지에 직접 확정한 결과·손익을 통계에 반영해요.</p>
      {code && market !== '스윙' && (fp.error || fp.status?.state === 'error') && <p className="broker-notice" role="status">{fp.error || 'FP Markets 최근 수집을 완료하지 못했어요. 마지막 기록을 보관하고 있어요.'}</p>}
      <div className="broker-list">{selected.slice(0, limit).map(row => <BrokerTrade key={row.id} row={row} review={fp.feed?.reviews?.[row.reviewId]} detail={entries.find(e=>e.brokerTradeId===row.id && e.brokerSource===row.source)} onEditDetail={onEditDetail}
        memos={memos.filter(m => m.brokerTradeId === row.id)} onAddMemo={onAddMemo} onRemoveMemo={onRemoveMemo} onRemoveImport={onRemoveImport} />)}</div>
      {!(market === '선물' ? fp.loading : view.loading) && selected.length === 0 && <div className="broker-empty">{rows.length ? '조건에 맞는 거래가 없어요.' : '수집된 체결 기록이 아직 없어요.'}</div>}
      {limit < selected.length && <button className="btn-ghost broker-more" onClick={() => setLimit(n => n + 40)}>기록 더 보기 ({Math.min(limit, selected.length)} / {selected.length})</button>}
    </>}
    {meritzOpen && <MeritzModal code={code} imports={imports} onSave={onImport} onClose={()=>setMeritzOpen(false)}/>}
  </section>;
}

function BrokerTrade({ row, review, detail, onEditDetail, memos, onAddMemo, onRemoveMemo, onRemoveImport }) {
  const [text, setText] = React.useState('');
  const [photos,setPhotos]=React.useState([]),[chartLink,setChartLink]=React.useState(''),[attachmentError,setAttachmentError]=React.useState(''),[processing,setProcessing]=React.useState(false),[expandedPhoto,setExpandedPhoto]=React.useState(null);
  async function attach(files){
    setAttachmentError('');setProcessing(true);
    try{const room=3-photos.length;if(files.length>room)throw new Error('한 메모에는 캡처를 최대 3장까지 넣을 수 있어요.');
      const added=[];for(const file of files)added.push(await TJAttachments.image(file));setPhotos(p=>[...p,...added]);
    }catch(e){setAttachmentError(e.message);}finally{setProcessing(false);}
  }
  function save(){try{const link=TJAttachments.link(chartLink);if(onAddMemo(row,text.trim()||'차트 복기',{photos,chartLink:link})===false){setAttachmentError('저장하지 못했어요. 저장 공간을 확인해 주세요.');return;}setText('');setPhotos([]);setChartLink('');setAttachmentError('');}catch(e){setAttachmentError(e.message);}}
  const fp = row.source === 'fpmarkets';
  const money = (value, currency=row.currency) => value == null ? '미확정' : (currency === 'USD' ? '$' : currency === 'KRW' ? '₩' : currency ? currency + ' ' : '') + TJBroker.decimal(value);
  const time = row.executedAt ? new Date(row.executedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '시각 미확정';
  return <article className="broker-trade">
    <div className="broker-trade-head"><div><strong>{row.name || row.symbol}</strong><span>{row.symbol}</span></div>
      <b className={'broker-side ' + (row.side === 'BUY' ? 'buy' : 'sell')}>{row.side === 'BUY' ? '매수' : row.side === 'SELL' ? '매도' : '확인 필요'}</b></div>
    <div className="broker-trade-date">{row.tradedAtKorea || '날짜 미확정'} · {time} · {fp?'FP Markets':row.source==='meritz'?'메리츠증권':'토스증권'} · {fp?(row.action==='close'?'청산':'진입'):(row.currency==='KRW'?'국내':'미국')}</div>
    <div className="broker-numbers"><div><small>체결 수량</small><b>{TJBroker.decimal(row.quantity)}{fp?' 단위':'주'}</b></div><div><small>{fp?'체결가':'평균 체결가'}</small><b>{money(row.averagePrice,fp?row.priceCurrency:row.currency)}</b></div><div><small>{fp?'브로커 총손익':'체결 대금'}</small><b>{money(fp?row.grossProfit:row.filledAmount)}</b></div></div>
    {fp&&<FpReview review={review}/>}
    <section style={{borderTop:'1px solid var(--border)',paddingTop:12,marginTop:12}}>
      <button className="btn-primary" onClick={()=>onEditDetail(row,review)}>{detail ? '일지 전체 수정' : '＋ 상세 일지 작성'}</button>
      <p className="broker-explanation">진입 근거·전략·SL·TP·R·결과·손익·태그·사진을 추가할 수 있어요. 직접 확정한 손익은 일지 통계에도 반영돼요.</p>
      {detail && <div>
        <strong>내가 보완한 일지</strong>
        <p style={{whiteSpace:'pre-wrap'}}>{detail.body || detail.reason || '상세 항목 저장됨'}</p>
        <div className="broker-fees">{[['전략',detail.strategy],['타임프레임',detail.timeframe],['진입',detail.entry_price],['SL',detail.stop_price],['TP',detail.target_price],['청산',detail.exit_price],['R',detail.realized_r],['손익',detail.pnl],['결과',({win:'익절',loss:'손절',be:'본전',holding:'보유중'})[detail.result]]].filter(([,v])=>v!=null && v!=='').map(([label,value])=><span key={label}>{label} {value}</span>)}</div>
        <p>{[...(detail.setups||[]),...(detail.errors||[])].join(' · ')}</p>
        <div className="fp-photo-list">{(detail.photos||[]).filter(TJAttachments.safeImage).map((p,i)=><button key={i} aria-label={'상세 일지 사진 '+(i+1)+' 확대'} onClick={()=>setExpandedPhoto(p)}><img src={p} alt={'상세 일지 사진 '+(i+1)}/></button>)}</div>
      </div>}
    </section>
    <details><summary>수수료·매매 메모·캡처{memos.length ? ` (${memos.length})` : ''}</summary>
      <div className="broker-fees"><span>수수료 {money(row.commission)}</span>{fp?<><span>스왑 {money(row.swap)}</span><span>청산 수수료 {money(row.realisedCommission)}</span><span>환전 비용 {money(row.conversionFee)}</span></>:<><span>세금 {money(row.tax)}</span><span>결제일 {row.settlementDate || '미확정'}</span></>}</div>
      {fp&&<p className="broker-explanation">수수료 $0은 브로커 원본의 값이에요. 스프레드는 체결가에 반영돼요. 체결 수수료와 청산 수수료를 중복 차감하지 않도록 순손익은 아직 합산하지 않아요.</p>}
      {(row.historyUnavailable || row.issues?.length > 0) && <p className="broker-explanation">{row.historyUnavailable ? '최근 조회에서 확인되지 않은 과거 기록을 보관하고 있어요.' : '일부 정보가 미확정이에요. 다음 수집 때 다시 확인해요.'}</p>}
      {memos.map(m => <div className="broker-memo" key={m.id}><p>{m.text}</p><div className="fp-photo-list">{(m.photos||[]).filter(TJAttachments.safeImage).map((p,i)=><button key={i} aria-label={`저장한 차트 캡처 ${i+1} 확대`} onClick={()=>setExpandedPhoto(p)}><img src={p} alt={`차트 캡처 ${i+1}`}/></button>)}</div>{(()=>{try{const link=TJAttachments.link(m.chartLink);return link?<a href={link} target="_blank" rel="noopener noreferrer">트레이딩뷰 차트 열기 ↗</a>:null;}catch{return null;}})()}<button aria-label="매매 메모 삭제" onClick={() => onRemoveMemo(m.id)}>삭제</button></div>)}
      <textarea aria-label={`${row.symbol} 매매 메모`} placeholder="진입 이유, 잘한 점, 다음에 바꿀 점…" maxLength={4000} value={text} onChange={e => setText(e.target.value)} />
      <div className="fp-attachments" onPaste={e=>{const files=[...e.clipboardData.files];if(files.length&&!processing){e.preventDefault();attach(files);}}}>
        <label>트레이딩뷰 캡처 추가<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={processing} aria-label={`${row.symbol} 차트 캡처 추가`} onChange={e=>{attach([...e.target.files]);e.target.value='';}}/></label>
        <input type="url" aria-label={`${row.symbol} 트레이딩뷰 링크`} placeholder="트레이딩뷰 스냅샷 또는 차트 링크" value={chartLink} onChange={e=>setChartLink(e.target.value)}/>
        <small>이미지 파일 선택 또는 이 입력칸에서 이미지 붙여넣기 · 메모당 3장. 다른 기기에도 보려면 일지 동기화를 켜 주세요.</small>
        <div className="fp-photo-list">{photos.map((p,i)=><div key={i}><img src={p} alt={`첨부 예정 캡처 ${i+1}`}/><button onClick={()=>setPhotos(ps=>ps.filter((_,j)=>j!==i))}>첨부 취소</button></div>)}</div>
      </div>
      {attachmentError&&<p role="alert">{attachmentError}</p>}
      <button className="btn-ghost" disabled={processing||(!text.trim()&&!photos.length&&!chartLink.trim())} onClick={save}>{processing?'이미지 준비 중…':'메모·캡처 저장'}</button>
      {row.source==='meritz'&&<button className="btn-ghost" style={{marginLeft:8}} onClick={()=>onRemoveImport(row.id)}>가져온 기록 삭제</button>}
    </details>
    {expandedPhoto&&<div className="fp-lightbox" role="dialog" aria-modal="true" aria-label="차트 캡처 확대" onClick={()=>setExpandedPhoto(null)}><button autoFocus onClick={()=>setExpandedPhoto(null)} onKeyDown={e=>{if(e.key==='Escape')setExpandedPhoto(null);}}>닫기</button><img src={expandedPhoto} alt="저장한 차트 캡처 확대"/></div>}
  </article>;
}
window.BrokerPanel = BrokerPanel;
