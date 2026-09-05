function BrokerPanel({ code, onConnect, memos, onAddMemo, onRemoveMemo, syncId, imports = [], onImport, onRemoveImport }) {
  const [view, setView] = React.useState({ feed: null, status: null, loading: !!code, error: '' });
  const [input, setInput] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [side, setSide] = React.useState('all');
  const [month, setMonth] = React.useState('all');
  const [limit, setLimit] = React.useState(40);
  const [refresh, setRefresh] = React.useState(0);
  const [manage, setManage] = React.useState(false);
  const [meritzOpen, setMeritzOpen] = React.useState(false);
  const [broker, setBroker] = React.useState('all');
  const file = React.useRef();

  React.useEffect(() => {
    let alive = true, timer, current = null, busy = false;
    setView({ feed: null, status: null, loading: !!code, error: '' });
    if (!code) return;
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
  }, [code, refresh]);
  React.useEffect(() => setLimit(40), [search, side, month, broker]);

  async function connect(raw) {
    setConnecting(true); setConnectionError('');
    try {
      const next = TJBroker.clean(raw);
      await TJBroker.pull(next, 'status');
      onConnect(next); setInput(''); setManage(false);
    } catch (e) { setConnectionError(e.message || '연결하지 못했어요.'); }
    finally { setConnecting(false); }
  }
  const rows = [...(view.feed?.rows || []), ...imports.filter(r=>r.tradedAtKorea>='2026-01-01')]
    .sort((a,b)=>(b.executedAt||'').localeCompare(a.executedAt||''));
  const months = [...new Set(rows.map(r => r.tradedAtKorea?.slice(0, 7)).filter(Boolean))].sort().reverse();
  const selected = rows.filter(r => (broker === 'all' || r.source === broker) && (side === 'all' || r.side === side)
    && (month === 'all' || r.tradedAtKorea?.startsWith(month))
    && (!search || `${r.name} ${r.symbol}`.toLowerCase().includes(search.toLowerCase())));
  const last = view.status?.collectedAt || view.status?.lastSuccessAt;
  const stale = !last || Date.now() - Date.parse(last) > 15 * 60000;
  const health = !code ? '연결 준비' : view.loading ? '상태 확인 중' : view.error ? '오프라인 보기'
    : view.status?.state === 'error' ? '수집 확인 필요' : stale ? 'PC 수집 대기' : '자동 수집 중';
  const stamp = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '아직 없음';

  return <section className="broker-panel">
    <header className="broker-heading">
      <div><div className="seclabel">BROKER JOURNAL</div><h2>자동 기록</h2><p>체결 내역은 자동으로, 매매 생각은 메모로 남겨요.</p></div>
      {code && <button className="btn-ghost" onClick={() => setManage(!manage)}>연결 관리</button>}
    </header>
    <div className="broker-connections">
      <div className="broker-connection"><strong>토스증권</strong><span className={'broker-health ' + (!stale && !view.error && view.status?.state === 'ok' ? 'good' : '')}>{health}</span>
        <small>마지막 수집 {stamp(last)} · 5분 간격</small></div>
      <div className="broker-connection"><strong>FP Markets</strong><span className="broker-health">승인·계좌 연결 대기</span><small>연결이 끝나면 여기에 함께 기록돼요.</small></div>
    </div>
    <div className="meritz-summary"><div><strong>메리츠증권</strong><small>국내·미국 · 체결 알림 / 화면 캡처</small></div><button className="btn-ghost" onClick={()=>setMeritzOpen(true)}>기록 가져오기</button></div>
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
      }}>연결코드 복사</button><button className="btn-ghost" onClick={() => { TJBroker.cache(code, undefined, true).catch(() => {}); onConnect(''); setManage(false); }}>이 기기 연결 해제</button></div>}
      <small>{syncId ? '일지 동기화가 켜져 있어 연결 설정과 매매 메모도 다른 기기와 공유돼요.' : '매매 메모도 휴대폰과 공유하려면 설정에서 일지 동기화를 켜 주세요.'}</small>
      {connectionError && <p role="status">{connectionError}</p>}
    </div>}
    {(code || imports.length>0) && <>
      {code && (view.error || stale || view.status?.state === 'error') && <p className="broker-notice" role="status">{view.error || (view.status?.state === 'error'
        ? '최근 수집이 완료되지 않았어요. PC의 자동수집 상태 파일에서 연결 상태를 확인해 주세요.'
        : 'PC가 꺼져 있거나 절전 중이면 마지막 기록을 보여줘요. PC 수집기가 다시 실행되면 새 거래가 반영돼요.')}</p>}
      <div className="broker-toolbar"><input aria-label="종목 검색" placeholder="종목명 또는 티커 검색" value={search} onChange={e => setSearch(e.target.value)} />
        <select aria-label="증권사 필터" value={broker} onChange={e=>setBroker(e.target.value)}><option value="all">전체 증권사</option><option value="toss">토스</option><option value="meritz">메리츠</option></select>
        <select aria-label="기록 월" value={month} onChange={e => setMonth(e.target.value)}><option value="all">전체 기간</option>{months.map(m => <option key={m}>{m}</option>)}</select>
        <select aria-label="매수 매도 필터" value={side} onChange={e => setSide(e.target.value)}><option value="all">매수·매도</option><option value="BUY">매수</option><option value="SELL">매도</option></select></div>
      <div className="broker-count"><strong>{selected.length.toLocaleString()}건</strong><span>{view.feed?.periodStart?.slice(0,10) || '2026-01-01'}부터 · 한국 시간</span><button className="btn-ghost" style={{marginLeft:'auto',whiteSpace:'nowrap'}} onClick={() => setRefresh(n => n + 1)}>새로고침</button></div>
      <p className="broker-explanation">토스 분할 체결은 주문별로 합쳐 보여줘요. 메리츠는 확인해 저장한 거래를 보여줘요. 체결 대금은 매매 금액이며, 실현손익 통계에는 아직 합산하지 않아요.</p>
      <div className="broker-list">{selected.slice(0, limit).map(row => <BrokerTrade key={row.id} row={row}
        memos={memos.filter(m => m.brokerTradeId === row.id)} onAddMemo={onAddMemo} onRemoveMemo={onRemoveMemo} onRemoveImport={onRemoveImport} />)}</div>
      {!view.loading && selected.length === 0 && <div className="broker-empty">{rows.length ? '조건에 맞는 거래가 없어요.' : '수집된 체결 기록이 아직 없어요.'}</div>}
      {limit < selected.length && <button className="btn-ghost broker-more" onClick={() => setLimit(n => n + 40)}>기록 더 보기 ({Math.min(limit, selected.length)} / {selected.length})</button>}
    </>}
    {meritzOpen && <MeritzModal code={code} imports={imports} onSave={onImport} onClose={()=>setMeritzOpen(false)}/>}
  </section>;
}

function BrokerTrade({ row, memos, onAddMemo, onRemoveMemo, onRemoveImport }) {
  const [text, setText] = React.useState('');
  const money = value => value == null ? '미확정' : (row.currency === 'USD' ? '$' : row.currency === 'KRW' ? '₩' : row.currency + ' ') + TJBroker.decimal(value);
  const time = row.executedAt ? new Date(row.executedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '시각 미확정';
  return <article className="broker-trade">
    <div className="broker-trade-head"><div><strong>{row.name || row.symbol}</strong><span>{row.symbol}</span></div>
      <b className={'broker-side ' + (row.side === 'BUY' ? 'buy' : 'sell')}>{row.side === 'BUY' ? '매수' : row.side === 'SELL' ? '매도' : '확인 필요'}</b></div>
    <div className="broker-trade-date">{row.tradedAtKorea || '날짜 미확정'} · {time} · {row.source==='meritz'?'메리츠증권':'토스증권'} · {row.currency==='KRW'?'국내':'미국'}</div>
    <div className="broker-numbers"><div><small>체결 수량</small><b>{TJBroker.decimal(row.quantity)}주</b></div><div><small>평균 체결가</small><b>{money(row.averagePrice)}</b></div><div><small>체결 대금</small><b>{money(row.filledAmount)}</b></div></div>
    <details><summary>수수료·매매 메모{memos.length ? ` (${memos.length})` : ''}</summary>
      <div className="broker-fees"><span>수수료 {money(row.commission)}</span><span>세금 {money(row.tax)}</span><span>결제일 {row.settlementDate || '미확정'}</span></div>
      {(row.historyUnavailable || row.issues?.length > 0) && <p className="broker-explanation">{row.historyUnavailable ? '최근 조회에서 확인되지 않은 과거 기록을 보관하고 있어요.' : '일부 정보가 미확정이에요. 다음 수집 때 다시 확인해요.'}</p>}
      {memos.map(m => <div className="broker-memo" key={m.id}><p>{m.text}</p><button aria-label="매매 메모 삭제" onClick={() => onRemoveMemo(m.id)}>삭제</button></div>)}
      <textarea aria-label={`${row.symbol} 매매 메모`} placeholder="진입 이유, 잘한 점, 다음에 바꿀 점…" maxLength={4000} value={text} onChange={e => setText(e.target.value)} />
      <button className="btn-ghost" disabled={!text.trim()} onClick={() => { onAddMemo(row, text.trim()); setText(''); }}>메모 저장</button>
      {row.source==='meritz'&&<button className="btn-ghost" style={{marginLeft:8}} onClick={()=>onRemoveImport(row.id)}>가져온 기록 삭제</button>}
    </details>
  </article>;
}
window.BrokerPanel = BrokerPanel;
