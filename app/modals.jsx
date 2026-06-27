/* 거래일지 — 새 일지 / 시드 / 원칙 / 더보기 모달 */
const { useState: useStateM, useRef: useRefM, useEffect: useEffectM } = React;
const usdM = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

/* 진입 등급 → 권장 리스크 (선물·현물 공용) */
const GRADES = [
  { g: 'A+', risk: '1%', cond: '정렬 다 맞고 + SMT 버프까지', c: 'var(--win)' },
  { g: 'B', risk: '0.5%', cond: '컨펌은 됐는데 SMT 없음 / HTF 약함', c: 'var(--violet)' },
  { g: 'C', risk: '0% · 진입 안 함', cond: '애매하면', c: 'var(--loss)' },
];
function GradePicker({ value, onChange }) {
  const lbl = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '14px 0 6px' };
  const sel = GRADES.find(x => x.g === value);
  return (
    <>
      <label style={lbl}>등급 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>셋업 품질 → 권장 리스크</span></label>
      <div className="seg" style={{ width: '100%' }}>
        {GRADES.map(x => (
          <button key={x.g} className={value === x.g ? 'on' : ''} onClick={() => onChange(value === x.g ? null : x.g)}
            style={value === x.g ? { background: x.c, borderColor: x.c, color: '#fff' } : {}}>
            {x.g} <span style={{ opacity: .85, fontSize: 11.5 }}>· {x.risk.split(' ')[0]}</span>
          </button>
        ))}
      </div>
      {sel && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: `3px solid ${sel.c}` }}>
          <div className="mono" style={{ fontWeight: 800, color: sel.c, minWidth: 26 }}>{sel.g}</div>
          <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            <div>{sel.cond}</div>
            <div style={{ marginTop: 2, fontWeight: 700 }}>리스크 {sel.risk}</div>
          </div>
        </div>
      )}
    </>
  );
}

function compressImage(file) {
  return new Promise(res => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280; let w = img.width, h = img.height;
      if (w > max || h > max) { if (w > h) { h = h * max / w; w = max; } else { w = w * max / h; h = max; } }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(cv.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

/* ───────────── 새 일지 / 수정 ───────────── */
function EditorModal({ entry, onSave, onClose, spotAcct }) {
  const [d, setD] = useStateM(() => {
    const base = entry || { id: 'e-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), market: '선물', traded_at: new Date().toISOString().slice(0, 10), body: '', photos: [], created_at: new Date().toISOString() };
    const c = JSON.parse(JSON.stringify(base));
    if (!Array.isArray(c.setups)) c.setups = [];
    if (!Array.isArray(c.errors)) c.errors = [];
    if (!Array.isArray(c.photos)) c.photos = [];
    return c;
  });
  const [detailOpen, setDetailOpen] = useStateM(!!(entry && (entry.result || entry.direction || entry.entry_price || (entry.errors || []).length)));
  const fileRef = useRefM();
  const errRef = useRefM();
  const addErr = () => { const v = (errRef.current.value || '').trim(); if (v) { TJ.addErrorTag(v); if (!d.errors.includes(v)) toggleArr('errors', v); errRef.current.value = ''; } };
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const toggleArr = (k, t) => setD(p => { const a = p[k].slice(); const i = a.indexOf(t); if (i >= 0) a.splice(i, 1); else a.push(t); return { ...p, [k]: a }; });
  const numOrNull = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const isSpot = d.market === '현물';
  // 현물 자동 계산 — 매수금액 = 수량 × 평단가
  const cost = (isSpot && d.shares != null && d.entry_price != null) ? d.shares * d.entry_price : null;
  const autoW = cost != null && spotAcct > 0;            // 비중 자동(매수금액 ÷ 현물 잔고)
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

  const onFiles = async ev => {
    const arr = [];
    for (const f of ev.target.files) { const u = await compressImage(f); if (u) arr.push(u); }
    setD(p => ({ ...p, photos: [...p.photos, ...arr] }));
    ev.target.value = '';
  };

  const fld = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '14px 0 6px' };

  return (
    <Modal open onClose={onClose} title={entry ? '일지 수정' : '새 일지'} maxWidth={560} sheet={window.matchMedia('(max-width:560px)').matches}>
      {/* market */}
      <div className="seg" style={{ width: '100%' }}>
        {['선물', '현물'].map(m => (
          <button key={m} className={d.market === m ? 'on' : ''} onClick={() => set('market', m)}>{m}</button>
        ))}
      </div>

      {isSpot ? (
        <>
          <label style={fld}>종목</label>
          <input value={d.ticker ?? ''} onChange={e => set('ticker', e.target.value)} placeholder="BTC, 삼성전자, NVDA…" />
          <label style={fld}>보유 유형</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {TJ.HOLD_TYPES.map(h => (
              <span key={h} className={'chip' + (d.holdType === h ? ' on' : '')} onClick={() => set('holdType', d.holdType === h ? null : h)}>{h}</span>
            ))}
          </div>
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
              {autoW && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>매수금액 {usdM(cost)} ÷ 현물 잔고 {usdM(spotAcct)} = 계좌의 {d.weight}%</div>}
              {cost != null && !(spotAcct > 0) && <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 6 }}>현물 시드를 설정하면 비중이 자동 계산돼요</div>}

              <label style={fld}>분할 단계</label>
              <div className="seg" style={{ width: '100%' }}>
                {['1차', '2차', '3차', '추가'].map(sp => (
                  <button key={sp} className={d.split === sp ? 'on' : ''} onClick={() => set('split', d.split === sp ? null : sp)}>{sp}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><label style={fld}>목표가</label><input type="number" inputMode="decimal" value={d.target_price ?? ''} onChange={e => set('target_price', numOrNull(e.target.value))} /></div>
                <div style={{ flex: 1 }}><label style={fld}>손절가</label><input type="number" inputMode="decimal" value={d.stop_price ?? ''} onChange={e => set('stop_price', numOrNull(e.target.value))} /></div>
              </div>

              <label style={fld}>결과</label>
              <div className="seg" style={{ width: '100%' }}>
                {[['win', '익절'], ['loss', '손절'], ['holding', '보유중']].map(([v, l]) => (
                  <button key={v} className={d.result === v ? 'on' : ''} onClick={() => set('result', d.result === v ? null : v)}>{l}</button>
                ))}
              </div>

              <label style={fld}>손익금액 ($ · +이익 / −손실)</label>
              <input type="number" inputMode="decimal" value={d.pnl ?? ''} onChange={e => set('pnl', numOrNull(e.target.value))} />

              <label style={fld}>수익률 (%) {autoR && <span style={{ color: 'var(--violet)', fontWeight: 700 }}>· 자동</span>}</label>
              <input type="number" inputMode="decimal" placeholder="+18 / -5" value={d.return_pct ?? ''} onChange={e => set('return_pct', numOrNull(e.target.value))} />
              {autoR && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>손익 {usdM(d.pnl)} ÷ 매수금액 {usdM(cost)} = {d.return_pct}%</div>}
              {cost != null && cost !== 0 && d.pnl == null && <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 6 }}>손익금액을 적으면 수익률이 자동 계산돼요</div>}
            </>
          ) : (
            <>
              <GradePicker value={d.grade} onChange={g => set('grade', g)} />

              <label style={fld}>방향</label>
              <div className="seg" style={{ width: '100%' }}>
                {[['long', '롱'], ['short', '숏']].map(([v, l]) => (
                  <button key={v} className={d.direction === v ? 'on' : ''} onClick={() => set('direction', d.direction === v ? null : v)}>{l}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1.4 }}>
                  <label style={fld}>결과</label>
                  <div className="seg" style={{ width: '100%' }}>
                    {[['win', '익절'], ['loss', '손절'], ['be', '본전']].map(([v, l]) => (
                      <button key={v} className={d.result === v ? 'on' : ''} onClick={() => set('result', d.result === v ? null : v)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}><label style={fld}>R배수</label><input type="number" inputMode="decimal" placeholder="2 / -1" value={d.realized_r ?? ''} onChange={e => set('realized_r', numOrNull(e.target.value))} /></div>
              </div>

              <label style={fld}>손익금액 ($ · +이익 / −손실)</label>
              <input type="number" inputMode="decimal" value={d.pnl ?? ''} onChange={e => set('pnl', numOrNull(e.target.value))} />

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
        </div>
      )}

      <button className="btn" onClick={() => onSave(d)} style={{ width: '100%', marginTop: 22, padding: 14, fontSize: 15.5 }}>저장</button>
    </Modal>
  );
}

/* ───────────── 시드 설정 ───────────── */
function SettingsModal({ settings, onSave, onClose }) {
  const [fs, setFs] = useStateM(settings.futuresSeed ?? '');
  const [ss, setSs] = useStateM(settings.spotSeed ?? '');
  const [fd, setFd] = useStateM(settings.futuresDeposit || 0);
  const [sd, setSd] = useStateM(settings.spotDeposit || 0);
  const [addF, setAddF] = useStateM('');
  const [addS, setAddS] = useStateM('');
  const fld = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '14px 0 6px' };
  const usd = n => '$' + (Number(n) || 0).toLocaleString('en-US');
  const doAdd = (val, setTotal, total, setVal) => { const v = parseFloat(val); if (!isNaN(v) && v !== 0) { setTotal(total + v); setVal(''); } };
  const depBox = (val, setVal, total, setTotal, ph) => (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="number" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} placeholder={ph}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(val, setTotal, total, setVal); } }} style={{ flex: 1 }} />
        <button className="btn-ghost btn-sm" onClick={() => doAdd(val, setTotal, total, setVal)} style={{ whiteSpace: 'nowrap' }}>＋ 입금</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        누적 입금 <b style={{ color: 'var(--ink)' }}>{usd(total)}</b>
        {total !== 0 && <button onClick={() => setTotal(0)} style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>초기화</button>}
      </div>
    </>
  );
  return (
    <Modal open onClose={onClose} title="시드 · 입금 설정" sub="시드 + 추가 입금 + 손익 = 잔고로 자동 계산됩니다" maxWidth={420}>
      <label style={fld}>선물 시드 ($)</label>
      <input type="number" inputMode="decimal" value={fs} onChange={e => setFs(e.target.value)} placeholder="10000" />
      <label style={fld}>선물 추가 입금 — 금액 넣고 ＋입금</label>
      {depBox(addF, setAddF, fd, setFd, '예: 1000')}
      <label style={fld}>현물 시드 ($)</label>
      <input type="number" inputMode="decimal" value={ss} onChange={e => setSs(e.target.value)} placeholder="5000" />
      <label style={fld}>현물 추가 입금 — 금액 넣고 ＋입금</label>
      {depBox(addS, setAddS, sd, setSd, '예: 500')}
      <button className="btn" onClick={() => { onSave({ futuresSeed: fs === '' ? null : +fs, spotSeed: ss === '' ? null : +ss, futuresDeposit: +fd || 0, spotDeposit: +sd || 0 }); }} style={{ width: '100%', marginTop: 18, padding: 13 }}>저장</button>
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

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${window.innerWidth >= 980 ? 3 : 2}, minmax(0, 1fr))`, gap: 12, alignItems: 'stretch' }}>
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
function MenuModal({ entries, syncId, onImport, onReset, onSync, onClose }) {
  const fileRef = useRefM();
  const today = new Date().toISOString().slice(0, 10);
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const exportCSV = () => {
    const cols = ['traded_at', 'market', 'direction', 'entry_price', 'exit_price', 'result', 'realized_r', 'pnl', 'setups', 'errors', 'body'];
    const cell = (e, c) => { let v = (c === 'errors' || c === 'setups') ? (e[c] || []).join('|') : (e[c] ?? ''); v = String(v).replace(/"/g, '""'); return /[",\n]/.test(v) ? `"${v}"` : v; };
    const csv = '\uFEFF' + [cols.join(','), ...entries.map(e => cols.map(c => cell(e, c)).join(','))].join('\n');
    dl(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `거래일지_${today}.csv`); onClose();
  };
  const exportJSON = () => {
    dl(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 1)], { type: 'application/json' }), `거래일지_백업_${today}.json`); onClose();
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
        onChange={async ev => { const f = ev.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); const arr = Array.isArray(obj) ? obj : (obj.entries || []); onImport(arr); } catch (err) { alert('복원 실패: ' + err.message); } }} />
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>백업은 전체 일지를 파일 하나로 저장합니다. 복원 시 같은 ID는 덮어써요.</div>
      <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 10px' }} />
      <button className="btn-ghost" style={{ ...row, color: 'var(--loss)', marginBottom: 4 }} onClick={onReset}>샘플 데이터 지우기 — 새로 시작</button>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>처음 보이는 예시 거래 28건과 시드를 비우고 빈 일지로 시작합니다. (되돌릴 수 없음 — 필요하면 먼저 JSON 백업)</div>
    </Modal>
  );
}

/* ───────────── 회고 메모장 (달력형) ───────────── */
function MemoModal({ memos, onChange, onClose }) {
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [view, setView] = useStateM({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useStateM(todayStr);
  const [text, setText] = useStateM('');

  const byDate = {};
  memos.forEach(mm => { const d = (mm.at || '').slice(0, 10); if (!d) return; (byDate[d] = byDate[d] || []).push(mm); });

  const first = new Date(view.y, view.m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dstr = d => `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
  const shift = delta => setView(v => { const nd = new Date(v.y, v.m + delta, 1); return { y: nd.getFullYear(), m: nd.getMonth() }; });
  const selMemos = byDate[sel] || [];
  const add = () => {
    const t = text.trim(); if (!t) return;
    const at = `${sel} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    onChange([{ id: 'm-' + Date.now(), at, text: t }, ...memos]);
    setText('');
  };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <Modal open onClose={onClose} title="회고 메모장" sub="날짜를 눌러 그날의 실수·교훈을 적어두세요" maxWidth={460}>
      {/* 월 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
        <button className="btn-ghost btn-sm" onClick={() => shift(-1)} style={{ padding: '6px 11px' }}>‹</button>
        <div className="mono" style={{ fontSize: 15, fontWeight: 800, minWidth: 110, textAlign: 'center' }}>{view.y}년 {view.m + 1}월</div>
        <button className="btn-ghost btn-sm" onClick={() => shift(1)} style={{ padding: '6px 11px' }}>›</button>
      </div>

      {/* 요일 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
        {WD.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-4)', padding: '4px 0' }}>{w}</div>)}
      </div>
      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const ds = dstr(d);
          const has = byDate[ds];
          const isSel = ds === sel;
          const isToday = ds === todayStr;
          return (
            <button key={i} onClick={() => setSel(ds)} style={{
              aspectRatio: '1', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              background: isSel ? 'var(--violet)' : (has ? 'var(--violet-50)' : 'transparent'),
              color: isSel ? '#fff' : 'var(--ink-2)',
              border: isToday && !isSel ? '1.5px solid var(--violet)' : '1.5px solid transparent',
              transition: 'background .12s',
            }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: isSel || isToday ? 800 : 600 }}>{d}</span>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: has ? (isSel ? '#fff' : 'var(--violet)') : 'transparent' }} />
            </button>
          );
        })}
      </div>

      {/* 선택 날짜 메모 */}
      <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>{sel}{sel === todayStr ? ' · 오늘' : ''}</div>
        <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
          placeholder="이 날 무엇을 잘못했나? 다음엔 어떻게 할까?" style={{ minHeight: 70, fontSize: 13.5 }} />
        <button className="btn" onClick={add} disabled={!text.trim()} style={{ width: '100%', marginTop: 8, padding: 11, opacity: text.trim() ? 1 : .5 }}>이 날짜에 기록 추가</button>

        {selMemos.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selMemos.map(m => (
              <div key={m.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, flex: 1 }}>{(m.at || '').slice(11)}</span>
                  <button onClick={() => onChange(memos.filter(x => x.id !== m.id))} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-4)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--loss)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-4)'; }}>삭제</button>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
              </div>
            ))}
          </div>
        )}
        {selMemos.length === 0 && <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5, padding: '14px 0' }}>이 날엔 메모가 없어요.</div>}
      </div>
    </Modal>
  );
}

Object.assign(window, { EditorModal, SettingsModal, PrinciplesModal, MenuModal, MemoModal, SyncModal });
