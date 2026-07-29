/* 거래일지 — 새 일지 / 시드 / 원칙 / 더보기 모달 */
const { useState: useStateM, useRef: useRefM, useEffect: useEffectM } = React;
const usdM = n => TJ.money(n);   // 통화 기호는 전역 토글($/₩)을 따름

/* 진입 등급 → 권장 리스크 (선물·현물 공용) */
const GRADES = [
  { g: 'A+', rp: 1, risk: '1% (혹은 풀 사이즈)', cond: '다 정렬 + SMT · delivery sentence가 한 번에 써진다', c: 'var(--win)' },
  { g: 'B', rp: 0.5, risk: '0.5%', cond: '컨펌은 됐는데 SMT 없음 / HTF 약하게 반대 / DOL 가까움', c: 'var(--violet)' },
  { g: 'C', rp: 0.25, risk: '0.25%', cond: '2~3개 빠지거나 애매함', c: 'var(--loss)' },
];
const gradeRp = g => { const x = GRADES.find(y => y.g === g); return x ? x.rp : null; };
/* 진입 근거 7체크 — 개수로 등급 기계 판정 */
const GRADE_CHECKS = [
  'HTF(일·4H) 방향과 일치',
  '위치 — 할인(롱)/프리미엄(숏) or 키 레벨(FVG·OB)',
  '시간 — 킬존·본장 + 매크로 윈도우',
  '스윕 — 키풀(아시아·전일 H/L·Equal) 청산',
  '컨펌 — SFP→Displacement→MSS/CISD+FVG 깔끔',
  'SMT 버프 — 상관자산 괴리',
  'DOL 멀고 명확 (R 잘 나옴)',
];
// 컨펌(스윕4·진입확인5) 미충족 → 진입 안 함, 전부=A+, 1개 빠짐=B, 그 외=C
function gradeFromChecks(arr) {
  if (!arr || !arr.length) return null;
  const has = i => arr.includes(i);
  if (!(has(4) && has(5))) return '—';
  if (arr.length === 7) return 'A+';
  if (arr.length === 6) return 'B';
  return 'C';
}
function GradeChecklist({ checks, onChange }) {
  const arr = Array.isArray(checks) ? checks : [];
  const lbl = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '14px 0 6px' };
  const toggle = i => {
    const next = arr.includes(i) ? arr.filter(x => x !== i) : [...arr, i].sort((a, b) => a - b);
    onChange(next, gradeFromChecks(next));
  };
  const g = gradeFromChecks(arr);
  const NOTRADE = { g: '—', cond: '컨펌(스윕 4 · 진입확인 5)이 안 됨 — 진입 보류', risk: '진입 안 함', c: 'var(--loss)' };
  const result = g === '—' ? NOTRADE : (g ? GRADES.find(x => x.g === g) : null);
  return (
    <>
      <label style={lbl}>등급 기록 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>참고·복기용 · 사이즈와 무관</span></label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {GRADE_CHECKS.map((txt, idx) => {
          const i = idx + 1, on = arr.includes(i);
          return (
            <button key={i} onClick={() => toggle(i)} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', textAlign: 'left', width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid ' + (on ? 'var(--violet-100)' : 'var(--border)'), background: on ? 'var(--violet-50)' : 'var(--surface)', transition: 'all .12s' }}>
              <span style={{ flexShrink: 0, width: 17, height: 17, marginTop: 1, borderRadius: 5, border: '1.8px solid ' + (on ? 'var(--violet)' : 'var(--border-strong)'), background: on ? 'var(--violet)' : 'transparent', display: 'grid', placeItems: 'center' }}>
                {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
              </span>
              <span style={{ flex: 1, fontSize: 12.5, color: on ? 'var(--ink)' : 'var(--ink-2)', lineHeight: 1.45 }}>
                <b className="mono" style={{ color: on ? 'var(--violet-600)' : 'var(--ink-4)', marginRight: 7 }}>{i}</b>{txt}
              </span>
            </button>
          );
        })}
      </div>
      {result && (
        <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginTop: 10, padding: '11px 13px', borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: `3px solid ${result.c}` }}>
          <div className="mono" style={{ fontWeight: 800, fontSize: 22, color: result.c, minWidth: 34, textAlign: 'center' }}>{result.g}</div>
          <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            <div>{result.cond}</div>
            <div style={{ marginTop: 2, fontWeight: 800, color: 'var(--ink)' }}>체크 {arr.length}/7 <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>· 기록용</span></div>
          </div>
        </div>
      )}
    </>
  );
}

const MAX_PHOTOS = 6;   // 거래당 사진 상한 (로컬 저장 용량 보호)
function compressImage(file) {
  return new Promise(res => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1024; let w = img.width, h = img.height;   // 해상도 상한 낮춤(1280→1024)
      if (w > max || h > max) { if (w > h) { h = h * max / w; w = max; } else { w = w * max / h; h = max; } }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(cv.toDataURL('image/jpeg', 0.6));                  // 화질 0.7→0.6 (용량 절감)
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

/* ───────────── 새 일지 / 수정 ───────────── */
function EditorModal({ entry, onSave, onClose, accts, defaultMarket, onAddMemo, defaultRisk }) {
  const [d, setD] = useStateM(() => {
    const base = entry || { id: 'e-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), market: defaultMarket || '선물', traded_at: new Date().toISOString().slice(0, 10), body: '', photos: [], created_at: new Date().toISOString() };
    const c = JSON.parse(JSON.stringify(base));
    if (!Array.isArray(c.setups)) c.setups = [];
    if (!Array.isArray(c.errors)) c.errors = [];
    if (!Array.isArray(c.photos)) c.photos = [];
    return c;
  });
  const [detailOpen, setDetailOpen] = useStateM(!!(entry && (entry.result || entry.direction || entry.entry_price || (entry.errors || []).length)));
  const fileRef = useRefM();
  const errRef = useRefM();
  const addErr = () => { const v = (errRef.current.value || '').trim(); if (v) { TJ.addErrorTag(v); if (!d.errors.includes(v)) toggleArr('errors', v); if (onAddMemo) onAddMemo(d.traded_at || new Date().toISOString().slice(0, 10), '⚠ 실수 — ' + v); errRef.current.value = ''; } };
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const toggleArr = (k, t) => setD(p => { const a = p[k].slice(); const i = a.indexOf(t); if (i >= 0) a.splice(i, 1); else a.push(t); return { ...p, [k]: a }; });
  const numOrNull = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const isSpot = d.market !== '선물';                     // 스윙·장기 = 현물성(종목·비중·수익률)
  const cur = isSpot ? (d.currency || '$') : '$';         // 거래 통화 (선물은 항상 $)
  const curFmt = n => TJ.fmt(n, cur);                     // 이 거래 통화 그대로 표기(환산 없음)
  const spotAcctUSD = (accts && accts[d.market]) || 0;    // 활성 시장 잔고(달러 기준)
  const spotAcct = cur === '₩' ? spotAcctUSD * TJ.rateKRW() : spotAcctUSD; // 거래 통화로 환산한 잔고(비중 계산용)
  const futAcct = (accts && accts['선물']) || 0;
  const setMarket = m => setD(p => ({ ...p, market: m, currency: m === '선물' ? '$' : (p.currency || '$') }));
  // 현물성 자동 계산 — 매수금액 = 수량 × 평단가 (거래 통화 그대로)
  const cost = (isSpot && d.shares != null && d.entry_price != null) ? d.shares * d.entry_price : null;
  const autoW = cost != null && spotAcct > 0;            // 비중 자동(매수금액 ÷ 해당 시장 잔고, 같은 통화)
  const autoR = cost != null && cost !== 0 && d.pnl != null;  // 수익률 자동(손익 ÷ 매수금액)
  useEffectM(() => {
    if (cost == null) return;
    setD(p => {
      let n = p;
      if (spotAcct > 0) { const w = Math.round(cost / spotAcct * 1000) / 10; if (p.weight !== w) n = { ...n, weight: w }; }
      if (cost !== 0 && p.pnl != null) { const r = Math.round(p.pnl / cost * 1000) / 10; if ((n.return_pct ?? null) !== r) n = { ...n, return_pct: r }; }
      return n;
    });
  }, [cost, d.pnl, spotAcct]);

  // 선물 자동 R — 1R = 이 거래 리스크(있으면) → 없으면 시드 설정의 기본 리스크
  const df = defaultRisk || {};                                  // { mode:'$'|'%', val }
  const dRiskMode = d.riskMode || '$';                           // 이 거래의 리스크 단위(입력용)
  const perRisk = numOrNull(d.riskVal);
  const usePerTrade = perRisk != null && perRisk > 0;
  const useMode = usePerTrade ? dRiskMode : (df.mode || '$');
  const useVal = usePerTrade ? perRisk : numOrNull(df.val);
  const oneR = (!isSpot && useVal != null && useVal > 0)
    ? (useMode === '%' ? (futAcct > 0 ? futAcct * (useVal / 100) : null) : useVal)
    : null;
  const oneRFromDefault = oneR != null && !usePerTrade;          // 기본값으로 잡혔는지
  const autoFR = oneR != null && oneR !== 0 && d.pnl != null;
  useEffectM(() => {
    if (!autoFR) return;
    const r = Math.round(d.pnl / oneR * 100) / 100;
    setD(p => (p.realized_r === r ? p : { ...p, realized_r: r }));
  }, [autoFR, d.pnl, oneR]);

  const onFiles = async ev => {
    const room = MAX_PHOTOS - d.photos.length;
    if (room <= 0) { alert(`사진은 거래당 최대 ${MAX_PHOTOS}장까지예요.`); ev.target.value = ''; return; }
    const files = [...ev.target.files].slice(0, room);
    const arr = [];
    for (const f of files) { const u = await compressImage(f); if (u) arr.push(u); }
    if (ev.target.files.length > room) alert(`사진은 거래당 최대 ${MAX_PHOTOS}장까지라 ${room}장만 추가했어요.`);
    setD(p => ({ ...p, photos: [...p.photos, ...arr] }));
    ev.target.value = '';
  };

  // 저장 — 결과와 손익 부호가 반대면(예: '손절'인데 +금액) 확인
  const submit = () => {
    const p = numOrNull(d.pnl);
    if (p != null && p !== 0 && ((d.result === 'loss' && p > 0) || (d.result === 'win' && p < 0))) {
      if (!confirm(`결과는 '${d.result === 'loss' ? '손절' : '익절'}'인데 손익금액이 ${p > 0 ? '+(이익)' : '−(손실)'}이에요.\n부호가 반대일 수 있어요 — 그대로 저장할까요?`)) return;
    }
    onSave(d);
  };
  const fld = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '14px 0 6px' };

  return (
    <Modal open onClose={onClose} title={entry ? '일지 수정' : '새 일지'} maxWidth={560} sheet={window.matchMedia('(max-width:560px)').matches}>
      {/* market */}
      <div className="seg" style={{ width: '100%' }}>
        {TJ.MARKETS.map(m => (
          <button key={m} className={d.market === m ? 'on' : ''} onClick={() => setMarket(m)}>{m}</button>
        ))}
      </div>

      {/* 선물 종류 — 외화 / 지수 */}
      {!isSpot && (
        <>
          <label style={fld}>종류 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>외화 / 지수</span></label>
          <div className="seg" style={{ width: '100%' }}>
            {['외화', '지수'].map(t => (
              <button key={t} className={d.futType === t ? 'on' : ''} onClick={() => set('futType', d.futType === t ? null : t)}>{t}</button>
            ))}
          </div>
        </>
      )}

      {/* 통화 — 스윙·장기만(선물은 항상 달러). 국내주식은 ₩로 그대로 입력 */}
      {isSpot && (
        <>
          <label style={fld}>통화 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>이 거래를 입력할 단위</span></label>
          <div className="seg" style={{ width: '100%' }}>
            {TJ.CURRENCIES.map(o => (
              <button key={o.v} className={cur === o.v ? 'on' : ''} onClick={() => set('currency', o.v)}>{o.label}</button>
            ))}
          </div>
        </>
      )}

      {isSpot ? (
        <>
          <label style={fld}>종목</label>
          <input value={d.ticker ?? ''} onChange={e => set('ticker', e.target.value)} placeholder="BTC, 삼성전자, NVDA…" />
        </>
      ) : (
        <>
          <label style={fld}>진입 타임프레임</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {TJ.TIMEFRAMES.map(tf => (
              <span key={tf} className={'chip' + (d.timeframe === tf ? ' on' : '')} onClick={() => set('timeframe', d.timeframe === tf ? null : tf)}>{tf}</span>
            ))}
          </div>
        </>
      )}

      <label style={fld}>날짜</label>
      <input type="date" value={d.traded_at} onChange={e => set('traded_at', e.target.value)} />

      <label style={fld}>메모 (자유롭게)</label>
      <textarea value={d.body} onChange={e => set('body', e.target.value)} placeholder="진입 이유, 느낀 점, 실수, 뭐든 자유롭게…" style={{ minHeight: 110 }} />

      <label style={fld}>사진 / 차트</label>
      <button className="btn-ghost" onClick={() => fileRef.current.click()} style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--ink-3)' }}>＋ 이미지 추가</button>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: 'none' }} />
      {d.photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {d.photos.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={p} onClick={() => openLightbox(p)} style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', cursor: 'zoom-in' }} />
              <button onClick={() => setD(pp => ({ ...pp, photos: pp.photos.filter((_, j) => j !== i) }))}
                style={{ position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: '50%', background: '#fff', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)', fontSize: 13, color: 'var(--ink-2)', display: 'grid', placeItems: 'center' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* details */}
      <button onClick={() => setDetailOpen(o => !o)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 0', padding: '12px 0', borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}>
        <span style={{ transition: 'transform .2s', transform: detailOpen ? 'rotate(90deg)' : 'none', color: 'var(--violet)' }}>▶</span>
        상세 입력 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12.5 }}>— 채우면 통계에 잡혀요</span>
      </button>

      {detailOpen && (
        <div style={{ animation: 'rise .2s ease' }}>
          {isSpot ? (
            <>
              <label style={fld}>진입 근거</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {TJ.SPOT_REASON_TAGS.map(t => <span key={t} className={'chip' + (d.setups.includes(t) ? ' on' : '')} onClick={() => toggleArr('setups', t)}>{t}</span>)}
              </div>

              <label style={fld}>진입 근거 (직접 작성)</label>
              <textarea value={d.reason ?? ''} onChange={e => set('reason', e.target.value)} placeholder="왜 샀나 — 내 생각 그대로…" style={{ minHeight: 70 }} />

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><label style={fld}>수량 (주)</label><input type="number" inputMode="decimal" value={d.shares ?? ''} onChange={e => set('shares', numOrNull(e.target.value))} placeholder="10" /></div>
                <div style={{ flex: 1 }}><label style={fld}>평단가</label><input type="number" inputMode="decimal" value={d.entry_price ?? ''} onChange={e => set('entry_price', numOrNull(e.target.value))} /></div>
              </div>

              <label style={fld}>비중 (%) {autoW && <span style={{ color: 'var(--violet)', fontWeight: 700 }}>· 자동</span>}</label>
              <input type="number" inputMode="decimal" value={d.weight ?? ''} onChange={e => set('weight', numOrNull(e.target.value))} placeholder="12" />
              {autoW && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>매수금액 {curFmt(cost)} ÷ {d.market} 잔고 {curFmt(spotAcct)} = 계좌의 {d.weight}%</div>}
              {cost != null && !(spotAcct > 0) && <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 6 }}>{d.market} 시드를 설정하면 비중이 자동 계산돼요</div>}

              <label style={fld}>결과</label>
              <div className="seg" style={{ width: '100%' }}>
                {[['win', '익절'], ['loss', '손절'], ['be', '본전'], ['holding', '보유중']].map(([v, l]) => (
                  <button key={v} className={d.result === v ? 'on' : ''} onClick={() => set('result', d.result === v ? null : v)}>{l}</button>
                ))}
              </div>

              <label style={fld}>손익금액 ({cur} · +이익 / −손실)</label>
              <input type="number" inputMode="decimal" value={d.pnl ?? ''} onChange={e => set('pnl', numOrNull(e.target.value))} />

              <label style={fld}>수익률 (%) {autoR && <span style={{ color: 'var(--violet)', fontWeight: 700 }}>· 자동</span>}</label>
              <input type="number" inputMode="decimal" placeholder="+18 / -5" value={d.return_pct ?? ''} onChange={e => set('return_pct', numOrNull(e.target.value))} />
              {autoR && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>손익 {curFmt(d.pnl)} ÷ 매수금액 {curFmt(cost)} = {d.return_pct}%</div>}
              {cost != null && cost !== 0 && d.pnl == null && <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 6 }}>손익금액을 적으면 수익률이 자동 계산돼요</div>}
            </>
          ) : (
            <>
              <GradeChecklist checks={d.gradeChecks} onChange={(c, g) => setD(p => ({ ...p, gradeChecks: c, grade: g }))} />

              <label style={fld}>방향</label>
              <div className="seg" style={{ width: '100%' }}>
                {[['long', '롱'], ['short', '숏']].map(([v, l]) => (
                  <button key={v} className={d.direction === v ? 'on' : ''} onClick={() => set('direction', d.direction === v ? null : v)}>{l}</button>
                ))}
              </div>

              <label style={fld}>결과</label>
              <div className="seg" style={{ width: '100%' }}>
                {[['win', '익절'], ['loss', '손절'], ['be', '본전']].map(([v, l]) => (
                  <button key={v} className={d.result === v ? 'on' : ''} onClick={() => set('result', d.result === v ? null : v)}>{l}</button>
                ))}
              </div>

              <label style={fld}>손익금액 ($ · +이익 / −손실)</label>
              <input type="number" inputMode="decimal" value={d.pnl ?? ''} onChange={e => set('pnl', numOrNull(e.target.value))} />

              <label style={fld}>리스크 (1R) <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>손절 시 잃는 금액 · 비우면 기본값</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="seg" style={{ width: 92, flexShrink: 0 }}>
                  {['$', '%'].map(m => (
                    <button key={m} className={dRiskMode === m ? 'on' : ''} onClick={() => set('riskMode', m)}>{m}</button>
                  ))}
                </div>
                <input type="number" inputMode="decimal" value={d.riskVal ?? ''} onChange={e => set('riskVal', numOrNull(e.target.value))}
                  placeholder={df.val != null ? `기본 ${df.mode === '%' ? df.val + '%' : '$' + df.val}` : (dRiskMode === '%' ? '0.5' : '100')} style={{ flex: 1 }} />
              </div>
              {oneR != null && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>1R = {curFmt(oneR)}{useMode === '%' ? ` (선물 잔고 × ${useVal}%)` : ''}{oneRFromDefault ? ' · 기본값 사용' : ''}</div>}

              <label style={fld}>R배수 {autoFR && <span style={{ color: 'var(--violet)', fontWeight: 700 }}>· 자동</span>}</label>
              <input type="number" inputMode="decimal" placeholder="2 / -1" value={d.realized_r ?? ''} onChange={e => set('realized_r', numOrNull(e.target.value))} />
              {autoFR && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>손익 {curFmt(d.pnl)} ÷ 1R {curFmt(oneR)} = {d.realized_r}R</div>}
              {!isSpot && d.pnl != null && oneR == null && <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 6 }}>리스크(1R)를 적거나, 시드 설정에서 선물 기본 리스크를 넣으면 손익만으로 R이 자동 계산돼요</div>}

              <label style={fld}>셋업 태그 (ICT)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {TJ.SETUP_TAGS.map(t => <span key={t} className={'chip' + (d.setups.includes(t) ? ' on' : '')} onClick={() => toggleArr('setups', t)}>{t}</span>)}
              </div>
            </>
          )}

          <label style={fld}>실수 태그 (직접 입력 가능)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {[...new Set([...TJ.getErrorTags(), ...d.errors])].map(t => <span key={t} className={'chip' + (d.errors.includes(t) ? ' on' : '')} onClick={() => toggleArr('errors', t)}
              style={d.errors.includes(t) ? { background: 'var(--loss)', borderColor: 'var(--loss)' } : {}}>{t}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            <input ref={errRef} placeholder="실수 직접 입력 후 추가" style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addErr(); } }} />
            <button className="btn-ghost btn-sm" onClick={addErr}>추가</button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>직접 입력한 실수는 거래 날짜의 회고 메모에도 자동 저장돼요</div>
        </div>
      )}

      <button className="btn" onClick={submit} style={{ width: '100%', marginTop: 22, padding: 14, fontSize: 15.5 }}>저장</button>
    </Modal>
  );
}

/* ───────────── 시드 설정 ───────────── */
function SettingsModal({ settings, onSave, onClose }) {
  // 선물 · 스윙 · 장기 3계좌 각각 시드/입금 분리
  const MK = [
    { key: '선물', seedK: 'futuresSeed', depK: 'futuresDeposit', c: 'var(--futures)', seedPh: '10000', depPh: '예: 1000' },
    { key: '스윙', seedK: 'swingSeed', depK: 'swingDeposit', c: 'var(--swing)', seedPh: '5000', depPh: '예: 500' },
    { key: '장기', seedK: 'longSeed', depK: 'longDeposit', c: 'var(--long)', seedPh: '5000', depPh: '예: 500' },
  ];
  const [seeds, setSeeds] = useStateM(() => { const o = {}; MK.forEach(m => o[m.key] = settings[m.seedK] ?? ''); return o; });
  const [deps, setDeps] = useStateM(() => { const o = {}; MK.forEach(m => o[m.key] = settings[m.depK] || 0); return o; });
  const [addv, setAddv] = useStateM({ '선물': '', '스윙': '', '장기': '' });
  const [cur, setCur] = useStateM(settings.currency === '₩' ? '₩' : '$');
  const [fRiskMode, setFRiskMode] = useStateM(settings.futuresRiskMode === '%' ? '%' : '$');   // 선물 기본 리스크 단위
  const [fRiskVal, setFRiskVal] = useStateM(settings.futuresRiskVal ?? '');                     // 선물 기본 리스크 값
  const fld = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '14px 0 6px' };
  const usd = n => '$' + (Number(n) || 0).toLocaleString('en-US');   // 시드·입금 입력은 항상 달러 기준
  const setSeed = (k, v) => setSeeds(p => ({ ...p, [k]: v }));
  const setDep = (k, v) => setDeps(p => ({ ...p, [k]: v }));
  const setAdd = (k, v) => setAddv(p => ({ ...p, [k]: v }));
  const doAdd = (k) => { const v = parseFloat(addv[k]); if (!isNaN(v) && v !== 0) { setDep(k, (deps[k] || 0) + v); setAdd(k, ''); } };
  const save = () => {
    const out = { currency: cur };
    MK.forEach(m => { out[m.seedK] = seeds[m.key] === '' ? null : +seeds[m.key]; out[m.depK] = +deps[m.key] || 0; });
    out.futuresRiskMode = fRiskMode;
    out.futuresRiskVal = (fRiskVal === '' || +fRiskVal <= 0) ? null : +fRiskVal;
    onSave(out);
  };
  return (
    <Modal open onClose={onClose} title="시드 · 입금 설정" sub="시드 + 추가 입금 + 손익 = 잔고로 자동 계산됩니다 (계좌별 분리)" maxWidth={420}>
      {/* 통화 — 앱 전체 표시 단위 ($ 달러 / ₩ 원화, ₩는 실시간 환산) */}
      <label style={{ ...fld, marginTop: 0 }}>통화 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>전체 표시 단위</span></label>
      <div className="seg" style={{ width: '100%' }}>
        {TJ.CURRENCIES.map(o => (
          <button key={o.v} className={cur === o.v ? 'on' : ''} onClick={() => setCur(o.v)}>{o.label}</button>
        ))}
      </div>
      {cur === '₩' && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 7, lineHeight: 1.5 }}>
          실시간 환율 <b style={{ color: 'var(--ink)' }}>$1 = ₩{Math.round(TJ.rateKRW()).toLocaleString('en-US')}</b> 로 환산해 표시합니다.
          <span style={{ color: 'var(--ink-4)' }}> 입력(시드·손익)은 달러 기준으로 넣어주세요.</span>
        </div>
      )}
      {MK.map((m, i) => (
        <div key={m.key} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, fontSize: 13.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: m.c }} />
            <span style={{ color: m.c }}>{m.key}</span>
          </div>
          <label style={fld}>{m.key} 시드 ($)</label>
          <input type="number" inputMode="decimal" value={seeds[m.key]} onChange={e => setSeed(m.key, e.target.value)} placeholder={m.seedPh} />
          <label style={fld}>{m.key} 추가 입금 — 금액 넣고 ＋입금</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" inputMode="decimal" value={addv[m.key]} onChange={e => setAdd(m.key, e.target.value)} placeholder={m.depPh}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(m.key); } }} style={{ flex: 1 }} />
            <button className="btn-ghost btn-sm" onClick={() => doAdd(m.key)} style={{ whiteSpace: 'nowrap' }}>＋ 입금</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            누적 입금 <b style={{ color: 'var(--ink)' }}>{usd(deps[m.key])}</b>
            {deps[m.key] !== 0 && <button onClick={() => setDep(m.key, 0)} style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>초기화</button>}
          </div>
          {m.key === '선물' && (
            <>
              <label style={fld}>선물 기본 리스크 (1R) <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>거래에 리스크 안 적으면 이 값으로 R 자동</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="seg" style={{ width: 92, flexShrink: 0 }}>
                  {['$', '%'].map(x => <button key={x} className={fRiskMode === x ? 'on' : ''} onClick={() => setFRiskMode(x)}>{x}</button>)}
                </div>
                <input type="number" inputMode="decimal" value={fRiskVal} onChange={e => setFRiskVal(e.target.value)} placeholder={fRiskMode === '%' ? '0.5' : '100'} style={{ flex: 1 }} />
              </div>
              {fRiskVal !== '' && +fRiskVal > 0 && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>1R = {fRiskMode === '%' ? `선물 잔고 × ${fRiskVal}%` : usd(fRiskVal)}</div>}
            </>
          )}
        </div>
      ))}
      <button className="btn" onClick={save} style={{ width: '100%', marginTop: 18, padding: 13 }}>저장</button>
    </Modal>
  );
}

/* ───────────── 원칙 ───────────── */
// 원문 텍스트 → 섹션 구조로 파싱 (편집은 원문 그대로 유지, 보기만 카드화)
function parsePrinciples(text) {
  const lines = (text || '').split('\n');
  const isHeading = l => /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(l) || /^오늘의 주문/.test(l) || /^리스크 관리/.test(l) || /^장 마감/.test(l);
  const kindOf = h => /^오늘의 주문/.test(h) ? 'order' : /^리스크 관리/.test(h) ? 'risk' : /^장 마감/.test(h) ? 'review' : 'normal';
  let title = '', routineLabel = '', cur = null; const sections = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (/^━/.test(l) || (/데일리 루틴/.test(l) && /매일/.test(l))) { routineLabel = l.replace(/━/g, '').trim(); continue; }
    if (!title && !isHeading(l) && !cur) { title = l; continue; }
    if (isHeading(l)) { cur = { title: l, kind: kindOf(l), items: [] }; sections.push(cur); continue; }
    if (!cur) { cur = { title: '', kind: 'normal', items: [] }; sections.push(cur); }
    cur.items.push(l);
  }
  return { title, routineLabel, sections };
}
function PItem({ text }) {
  const m = text.match(/^(☐|☑|▸|·|•|\d+[.)])\s*(.*)$/);
  const mk = m ? m[1] : ''; const body = m ? m[2] : text;
  const isNum = /^\d/.test(mk);
  let lead;
  if (mk === '☐' || mk === '☑') lead = <span style={{ flexShrink: 0, width: 14, height: 14, marginTop: 3, borderRadius: 4, border: '1.8px solid var(--border-strong)' }} />;
  else if (isNum) lead = <span style={{ flexShrink: 0, minWidth: 16, fontWeight: 800, color: 'var(--violet-600)', fontVariantNumeric: 'tabular-nums' }}>{mk.replace(/[).]/, '')}.</span>;
  else lead = <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', marginTop: 8, background: mk === '▸' ? 'var(--loss)' : 'var(--violet)' }} />;
  return (
    <div style={{ display: 'flex', gap: 9, fontSize: 13, lineHeight: 1.6, padding: '3.5px 0', color: 'var(--ink-2)' }}>
      {lead}
      <span style={{ wordBreak: 'break-word', flex: 1 }}>{body}</span>
    </div>
  );
}
function PrinciplesModal({ text, onSave, onClose }) {
  const [editing, setEditing] = useStateM(false);
  const [draft, setDraft] = useStateM(text);
  const P = parsePrinciples(text);
  const order = P.sections.find(s => s.kind === 'order');
  const grid = P.sections.filter(s => s.kind !== 'order');
  const isWide = window.matchMedia('(min-width:560px)').matches;
  return (
    <Modal open onClose={onClose} maxWidth={editing ? 720 : 1040} sheet={!isWide}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>매매 원칙</span>}>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12, gap: 8 }}>
        {editing
          ? <><button className="btn-ghost btn-sm" onClick={() => { setDraft(TJ.DEFAULT_PRINCIPLES); }}>기본값</button>
            <button className="btn btn-sm" onClick={() => { onSave(draft); setEditing(false); }}>저장</button></>
          : <button className="btn-ghost btn-sm" onClick={() => { setDraft(text); setEditing(true); }}>편집</button>}
      </div>

      {editing ? (
        <textarea value={draft} onChange={e => setDraft(e.target.value)} style={{ minHeight: '58vh', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'var(--font)' }} />
      ) : (
        <div>
          {P.title && <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.01em', marginBottom: 14, color: 'var(--ink)' }}>{P.title}</div>}

          {order && (
            <div style={{ background: 'var(--violet-50)', border: '1px solid var(--violet-100)', borderRadius: 14, padding: '13px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6, color: 'var(--violet-600)' }}>📌 {order.title}</div>
              {order.items.map((it, i) => <PItem key={i} text={it} />)}
            </div>
          )}

          {P.routineLabel && <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--ink-3)', margin: '2px 2px 10px' }}>{P.routineLabel}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(grid.length, window.innerWidth >= 980 ? 3 : 2))}, minmax(0, 1fr))`, gap: 12, alignItems: 'stretch' }}>
            {grid.map((s, i) => {
              const risk = s.kind === 'risk';
              return (
                <div key={i} style={{
                  border: '1px solid', borderColor: risk ? 'var(--loss)' : 'var(--border)',
                  background: risk ? 'rgba(176,74,74,.05)' : 'var(--surface, #fff)', borderRadius: 14, padding: '13px 15px',
                }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8, color: risk ? 'var(--loss)' : 'var(--ink)' }}>
                    {risk ? '⚠ ' : ''}{s.title}
                  </div>
                  {s.items.map((it, j) => <PItem key={j} text={it} />)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ───────────── 클라우드 동기화 (동기화 코드) ───────────── */
function SyncModal({ syncId, onEnable, onJoin, onDisable, onClose }) {
  const [mode, setMode] = useStateM(syncId ? 'on' : 'home'); // home | new | join | on
  const [code, setCode] = useStateM(syncId || '');
  const [joinVal, setJoinVal] = useStateM('');
  const [copied, setCopied] = useStateM(false);
  const fmt = c => (c || '').replace(/(.{5})(?=.)/g, '$1-'); // 보기용 하이픈
  const copy = () => {
    const txt = fmt(code);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {});
    else { setCopied(true); setTimeout(() => setCopied(false), 1600); }
  };
  const startNew = () => { const c = onEnable(); setCode(c); setMode('on'); };
  const doJoin = () => { if (onJoin(joinVal)) { setCode(window.TJSync ? TJSync.clean(joinVal) : joinVal); setMode('on'); } };

  const fld = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '14px 0 6px' };
  const big = { width: '100%', justifyContent: 'flex-start', gap: 12, padding: '16px', marginBottom: 10, fontSize: 14.5, fontWeight: 600, textAlign: 'left', alignItems: 'flex-start', flexDirection: 'column' };
  const codeBox = { fontFamily: 'var(--font-mono, monospace)', fontSize: 16, fontWeight: 700, letterSpacing: '.04em', wordBreak: 'break-all', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', lineHeight: 1.5, color: 'var(--ink)' };

  return (
    <Modal open onClose={onClose} title="다른 기기와 동기화" sub="로그인 없이, 동기화 코드 하나로 여러 컴퓨터가 같은 일지를 봅니다" maxWidth={460}>
      {mode === 'home' && (<>
        <button className="btn-ghost" style={big} onClick={startNew}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>☁ 이 기기 기록으로 새로 시작</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 500 }}>지금 이 컴퓨터의 일지를 클라우드에 올리고 코드를 만듭니다. (처음이면 이거)</span>
        </button>
        <button className="btn-ghost" style={big} onClick={() => setMode('join')}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>🔗 이미 코드가 있어요</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 500 }}>다른 컴퓨터에서 만든 코드를 입력해 그 기록을 불러옵니다.</span>
        </button>
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8, lineHeight: 1.55 }}>※ 코드는 비밀번호처럼 다루세요. 코드를 아는 사람만 이 일지를 볼 수 있습니다.</div>
      </>)}

      {mode === 'join' && (<>
        <label style={fld}>동기화 코드 붙여넣기</label>
        <textarea value={joinVal} onChange={e => setJoinVal(e.target.value)} placeholder="다른 컴퓨터의 코드 (예: AB3kq-9Fm2x-…)" style={{ minHeight: 64, fontSize: 14, letterSpacing: '.03em' }} />
        <button className="btn" onClick={doJoin} disabled={window.TJSync ? TJSync.clean(joinVal).length < 12 : joinVal.length < 12} style={{ width: '100%', marginTop: 12, padding: 13 }}>이 코드로 연결</button>
        <button className="btn-ghost btn-sm" onClick={() => setMode('home')} style={{ width: '100%', marginTop: 8 }}>← 뒤로</button>
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 10, lineHeight: 1.55 }}>연결하면 이 기기의 기존 기록과 클라우드 기록이 합쳐집니다(삭제 기록도 반영).</div>
      </>)}

      {mode === 'on' && (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--win)', flexShrink: 0 }} />
          <b style={{ fontSize: 14.5 }}>이 기기는 동기화 중</b>
        </div>
        <label style={fld}>내 동기화 코드 — 다른 컴퓨터에 이걸 입력하세요</label>
        <div style={codeBox}>{fmt(code)}</div>
        <button className="btn" onClick={copy} style={{ width: '100%', marginTop: 10, padding: 12 }}>{copied ? '복사됨 ✓' : '코드 복사'}</button>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 12, lineHeight: 1.6 }}>
          다른 컴퓨터에서 같은 주소를 열고 → 더보기 → 다른 기기와 동기화 → <b>"이미 코드가 있어요"</b> → 이 코드 붙여넣기. 그 뒤론 양쪽이 자동으로 같이 갱신됩니다.
        </div>
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 10px' }} />
        <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', color: 'var(--loss)' }} onClick={() => { if (confirm('이 기기에서만 동기화를 끕니다. 기록은 그대로 남고, 다시 코드를 입력하면 재연결됩니다.')) { onDisable(); onClose(); } }}>이 기기 동기화 끄기</button>
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8, lineHeight: 1.5 }}>※ 한 번에 한 기기에서 쓰는 걸 권장합니다(두 기기 동시 편집 시 마지막 저장이 우선).</div>
      </>)}
    </Modal>
  );
}

/* ───────────── 더보기 (CSV / JSON) ───────────── */
function MenuModal({ entries, syncId, onImport, onReset, onSync, onClose, blob }) {
  const fileRef = useRefM();
  const today = new Date().toISOString().slice(0, 10);
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const exportCSV = () => {
    const cols = ['traded_at', 'market', 'currency', 'ticker', 'direction', 'entry_price', 'result', 'realized_r', 'return_pct', 'pnl', 'setups', 'errors', 'body'];
    const cell = (e, c) => { let v = (c === 'errors' || c === 'setups') ? (e[c] || []).join('|') : (e[c] ?? ''); v = String(v).replace(/"/g, '""'); return /[",\n]/.test(v) ? `"${v}"` : v; };
    const csv = '\uFEFF' + [cols.join(','), ...entries.map(e => cols.map(c => cell(e, c)).join(','))].join('\n');
    dl(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `거래일지_${today}.csv`); onClose();
  };
  const exportJSON = () => {
    dl(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...(blob || { entries }) }, null, 1)], { type: 'application/json' }), `거래일지_백업_${today}.json`); onClose();
  };
  const row = { width: '100%', justifyContent: 'flex-start', gap: 12, padding: '15px 16px', marginBottom: 9, fontSize: 14.5, fontWeight: 600 };
  return (
    <Modal open onClose={onClose} title="더보기" maxWidth={440}>
      <button className="btn-ghost" style={{ ...row, color: syncId ? 'var(--win)' : 'var(--violet)' }} onClick={onSync}>
        ☁ 다른 기기와 동기화{syncId ? ' — 켜짐 ✓' : ''}
      </button>
      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 12px' }} />
      <button className="btn-ghost" style={row} onClick={exportCSV}>CSV 내보내기</button>
      <button className="btn-ghost" style={row} onClick={exportJSON}>JSON 백업 (내보내기)</button>
      <button className="btn-ghost" style={row} onClick={() => fileRef.current.click()}>JSON 복원 (가져오기)</button>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
        onChange={async ev => { const f = ev.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); onImport(obj); } catch (err) { alert('복원 실패: ' + err.message); } }} />
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>백업은 일지·회고·일기·설정을 파일 하나로 저장합니다. 복원 시 최신 것으로 병합돼요.</div>
      <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 10px' }} />
      <button className="btn-ghost" style={{ ...row, color: 'var(--loss)', marginBottom: 4 }} onClick={onReset}>초기화 — 계좌별 · 전체 · 예시 복원</button>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>현재 계좌만 비우기 / 3계좌 전부 비우기 / 앱 처음 상태(예시 28건)로 되돌리기 중에서 고릅니다. (되돌릴 수 없음 — 필요하면 먼저 JSON 백업)</div>
    </Modal>
  );
}

/* ───────────── 초기화 방식 선택 ───────────── */
function ResetModal({ market, entries, onResetMarket, onResetAll, onRestore, onClose }) {
  const cnt = m => entries.filter(e => e.market === m).length;
  const total = entries.length;
  const box = { width: '100%', textAlign: 'left', display: 'block', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10, background: 'var(--surface)' };
  const h = { fontSize: 14.5, fontWeight: 800, marginBottom: 3 };
  const d = { fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 };
  return (
    <Modal open onClose={onClose} title="초기화 방식" sub="어떻게 비울지 고르세요 · 되돌릴 수 없어요" maxWidth={440}>
      <button className="btn-ghost" style={box} onClick={() => onResetMarket(market)}>
        <div style={h}>현재 계좌만 — {market}</div>
        <div style={d}>{market} 일지 {cnt(market)}건과 {market} 시드만 비웁니다. 다른 두 계좌는 그대로 둡니다.</div>
      </button>
      <button className="btn-ghost" style={box} onClick={onResetAll}>
        <div style={{ ...h, color: 'var(--loss)' }}>전체 비우기 — 빈 일지</div>
        <div style={d}>선물·스윙·장기 3계좌 전부({total}건)와 모든 시드를 비우고 빈 일지로 시작합니다.</div>
      </button>
      <button className="btn-ghost" style={box} onClick={onRestore}>
        <div style={h}>예시로 되돌리기</div>
        <div style={d}>지금 일지를 모두 지우고, 앱 처음 상태(예시 거래 28건 + 기본 시드)로 복원합니다.</div>
      </button>
      <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 2, lineHeight: 1.5 }}>실행 직전 <b>백업 파일이 자동 저장</b>됩니다(안전장치). 동기화가 켜져 있으면 다른 기기에도 그대로 반영돼요.</div>
    </Modal>
  );
}


/* ───────────── 보유 현황 (스크린샷 자동입력 + 실시간 시세) ───────────── */
function HoldingsModal({ holdings, addHoldings, removeHolding, clearHoldings, addPositions, defaultAccount, onClose }) {
  const [acct, setAcct] = useStateM(defaultAccount === '장기' ? '장기' : '스윙');
  const [quotes, setQuotes] = useStateM({});
  const [loading, setLoading] = useStateM(false);
  const [asOf, setAsOf] = useStateM('');
  const [err, setErr] = useStateM('');
  const [busy, setBusy] = useStateM(false);          // 추출 중
  const [preview, setPreview] = useStateM(null);     // 추출 결과
  const fileRef = useRefM();

  const list = holdings.filter(h => h.account === acct);
  const symsKey = [...new Set(list.map(h => TJPortfolio.yahooSym(h)).filter(Boolean))].join(',');
  const symOf = c => c === 'KRW' ? '₩' : '$';
  const qOf = h => { const s = TJPortfolio.yahooSym(h); return (s && quotes[s]) || null; };   // {price,currency} — Yahoo
  const priceOf = h => { const q = qOf(h); return q ? q.price : null; };
  const liveSym = q => (q && q.currency === 'KRW') ? '₩' : '$';                                // 시세 통화(Yahoo가 알려줌)
  const avgUSD1 = h => (h.avgPrice != null && h.avgPrice > 0) ? TJ.toUSD(h.avgPrice, symOf(h.currency)) : null;  // 1주 평단(달러 환산)

  const refresh = async () => {
    const syms = symsKey ? symsKey.split(',') : [];
    if (!syms.length) { setAsOf(''); return; }
    setLoading(true); setErr('');
    try {
      const j = await TJPortfolio.quotes(syms);
      setQuotes(q => ({ ...q, ...(j.quotes || {}) }));
      setAsOf(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { setErr('시세 조회 실패 — 함수 배포 확인: ' + e.message); }
    setLoading(false);
  };
  useEffectM(() => { refresh(); }, [symsKey]);

  const valUSD = h => { const q = qOf(h); return q ? TJ.toUSD(q.price * h.qty, liveSym(q)) : null; };
  const totalUSD = list.reduce((a, h) => a + (valUSD(h) || 0), 0);
  const costUSD = list.reduce((a, h) => { const a1 = avgUSD1(h); return a + (a1 != null ? a1 * h.qty : 0); }, 0);
  const anyPrice = list.some(h => priceOf(h) != null);

  const onFiles = async ev => {
    const files = [...ev.target.files]; ev.target.value = '';
    if (!files.length) return;
    setBusy(true); setErr(''); setPreview(null);
    try {
      const parts = [];
      for (const f of files) { const durl = await compressImage(f); if (durl) parts.push({ mime: 'image/jpeg', data: durl.split(',')[1] }); }
      if (!parts.length) throw new Error('이미지를 못 읽었어요');
      const j = await TJPortfolio.extract(parts);
      const hs = (Array.isArray(j.holdings) ? j.holdings : []).filter(h => h && (h.name || h.ticker) && Number(h.qty) > 0);
      if (!hs.length) throw new Error('종목을 못 읽었어요. 보유목록이 잘 보이게 다시 찍어주세요.');
      setPreview(hs);
    } catch (e) { setErr('스크린샷 분석 실패: ' + e.message); }
    setBusy(false);
  };
  const confirmAdd = () => { if (preview && preview.length) { addHoldings(acct, preview); if (addPositions) addPositions(acct, preview); } setPreview(null); };

  return (
    <Modal open onClose={onClose} title="보유 현황" sub="스크린샷으로 추가 · 실시간 시세로 평가" maxWidth={520} sheet={window.matchMedia('(max-width:560px)').matches}>
      <div className="seg" style={{ width: '100%' }}>
        {['스윙', '장기'].map(a => <button key={a} className={acct === a ? 'on' : ''} onClick={() => setAcct(a)}>{a}</button>)}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '16px 0 4px' }}>
        <span className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{TJ.money(totalUSD)}</span>
        {costUSD > 0 && anyPrice && (() => { const pl = totalUSD - costUSD; return <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: pl >= 0 ? 'var(--win)' : 'var(--loss)' }}>{TJ.moneyS(pl)} · {(pl / costUSD * 100).toFixed(1)}%</span>; })()}
        <span style={{ flex: 1 }} />
        <button className="btn-ghost btn-sm" onClick={refresh} disabled={loading}>{loading ? '…' : '↻ 새로고침'}</button>
      </div>
      {asOf && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 4 }}>시세 기준 {asOf} · Yahoo</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--loss)', margin: '6px 0', lineHeight: 1.5 }}>{err}</div>}

      {list.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 13, padding: '22px 0', lineHeight: 1.6 }}>아직 {acct} 보유 종목이 없어요.<br />아래 버튼으로 스크린샷을 올려보세요.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {list.map(h => {
              const q = qOf(h), p = q ? q.price : null;
              const dsym = h.market === 'KR' ? '₩' : '$';                          // 국내주식=원, 해외=달러(한 행 한 통화)
              const v = p != null ? p * h.qty : null;
              const aps = avgUSD1(h), lps = p != null ? TJ.toUSD(p, dsym) : null;   // 1주 달러 환산
              const pl = (aps != null && lps != null) ? (lps - aps) / aps * 100 : null;
              const avgShow = h.avgPrice == null ? null : (symOf(h.currency) === dsym ? h.avgPrice : (dsym === '₩' ? aps * TJ.rateKRW() : aps));  // 평단도 행 통화로
              return (
                <div key={h.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name} <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600 }}>{h.ticker}</span></div>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{h.qty}주{avgShow != null ? ' · 평단 ' + TJ.fmt(avgShow, dsym) : ''}{p != null ? ' · 현재 ' + TJ.fmt(p, dsym) : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{v != null ? TJ.fmt(v, dsym) : '—'}</div>
                    {pl != null && <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: pl >= 0 ? 'var(--win)' : 'var(--loss)' }}>{pl >= 0 ? '+' : ''}{pl.toFixed(1)}%</div>}
                  </div>
                  <button onClick={() => removeHolding(h.id)} style={{ fontSize: 13, color: 'var(--ink-4)', flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color = 'var(--loss)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-4)'}>✕</button>
                </div>
              );
            })}
          </div>}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        {preview
          ? (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>읽은 종목 {preview.length}개 — {acct}에 추가할까요?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {preview.map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name} <span className="mono" style={{ color: 'var(--ink-4)' }}>{(h.ticker || '').toUpperCase()}</span></span>
                    <span className="mono" style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{Number(h.qty)}주{h.avgPrice != null ? ' · ' + h.avgPrice : ''} {h.currency === 'KRW' ? '₩' : '$'}</span>
                    <button onClick={() => setPreview(preview.filter((_, j) => j !== i))} style={{ color: 'var(--ink-4)', fontSize: 12, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={confirmAdd} disabled={!preview.length}>추가</button>
                <button className="btn-ghost" onClick={() => setPreview(null)}>취소</button>
              </div>
            </div>
          )
          : (
            <>
              <button className="btn-ghost" onClick={() => fileRef.current.click()} disabled={busy} style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--ink-3)' }}>{busy ? 'AI가 읽는 중…' : '📷 스크린샷으로 추가'}</button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: 'none' }} />
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6, lineHeight: 1.5 }}>증권사 보유목록을 찍어 올리면 종목·수량·진입가를 읽어 <b>{acct} 보유현황 + 일지(보유중)</b>에 넣어요. 나중에 그 일지를 손절/익절로 바꾸면 과거 거래처럼 기록됩니다. (토스=스윙, 메리츠·나무=장기)</div>
              {list.length > 0 && <button onClick={() => { if (confirm(acct + ' 보유 종목을 모두 비울까요?')) clearHoldings(acct); }} style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 10 }}>이 계좌 보유 비우기</button>}
            </>
          )}
      </div>
    </Modal>
  );
}

Object.assign(window, { EditorModal, SettingsModal, PrinciplesModal, MenuModal, ResetModal, SyncModal, HoldingsModal });
