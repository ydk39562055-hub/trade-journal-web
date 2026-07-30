/* 거래일지 — 홈 HERO (대시보드 / 레저 / 포커스) + 루틴 카드 */
const { useState: useStateH } = React;

const usdH = n => TJ.money(n);   // 통화 기호는 전역 토글($/₩)을 따름
const fnumH = n => (n === Infinity ? '∞' : Math.round(n * 100) / 100);

/* 원칙 원문 → 섹션 그룹(줄 원본 인덱스 보존: 체크박스 toggle용) */
function groupPrincipleLines(principles) {
  const lines = principles.split('\n');
  const isHeading = tx => /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(tx) || /^오늘의 주문/.test(tx) || /^리스크 관리/.test(tx) || /^장 마감/.test(tx);
  let title = '', routineLabel = '', cur = null; const sections = [];
  lines.forEach((line, i) => {
    const tx = line.replace(/^\s+/, '');
    if (!tx) return;
    if (tx.includes('━')) { routineLabel = tx.replace(/[━\s]+/g, ' ').trim(); return; }
    if (!title && !cur && !isHeading(tx) && !/^[·▸•\-☐☑]/.test(tx) && !/^\d+[.)]/.test(tx)) { title = tx; return; }
    if (isHeading(tx)) { cur = { title: tx, kind: /^오늘의 주문/.test(tx) ? 'order' : /^리스크 관리/.test(tx) ? 'risk' : /^장 마감/.test(tx) ? 'review' : 'normal', lines: [] }; sections.push(cur); return; }
    if (!cur) { cur = { title: '', kind: 'normal', lines: [] }; sections.push(cur); }
    cur.lines.push({ i, tx });
  });
  return { title, routineLabel, sections };
}
function PrincipleLine({ item, checks, toggle }) {
  const { i, tx } = item;
  if (tx.startsWith('☐') || tx.startsWith('☑')) {
    const done = checks.has(i);
    const body = tx.replace(/^[☐☑]\s?/, '');
    return (
      <button onClick={() => toggle(i)} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '4px 4px', borderRadius: 7, transition: 'background .12s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tint)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <span style={{ flexShrink: 0, width: 16, height: 16, marginTop: 2, borderRadius: 5, border: '1.8px solid ' + (done ? 'var(--violet)' : 'var(--border-strong)'), background: done ? 'var(--violet)' : 'transparent', display: 'grid', placeItems: 'center', transition: 'all .15s' }}>
          {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
        </span>
        <span style={{ fontSize: 12.5, lineHeight: 1.5, color: done ? 'var(--ink-4)' : 'var(--ink-2)', textDecoration: done ? 'line-through' : 'none' }}>{body}</span>
      </button>
    );
  }
  const m = tx.match(/^([·▸•\-]|\d+[.)])\s*(.*)$/);
  if (m) {
    const isNum = /^\d/.test(m[1]);
    const risk = m[1] === '▸';
    return (
      <div style={{ display: 'flex', gap: 9, fontSize: 12.5, lineHeight: 1.6, padding: '3.5px 2px', color: 'var(--ink-2)' }}>
        {isNum
          ? <span style={{ flexShrink: 0, minWidth: 16, fontWeight: 800, color: 'var(--violet-600)', fontVariantNumeric: 'tabular-nums' }}>{m[1].replace(/[).]/, '')}.</span>
          : <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: '50%', marginTop: 7, background: risk ? 'var(--loss)' : 'var(--violet)' }} />}
        <span style={{ wordBreak: 'break-word', flex: 1 }}>{m[2]}</span>
      </div>
    );
  }
  return <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: '2px 2px', color: 'var(--ink-3)', wordBreak: 'break-word' }}>{tx}</div>;
}
/* 원칙/루틴 본문 — 섹션 카드 그리드(좌우 펼침) + 체크박스 */
function renderPrinciples(principles, checks, toggle) {
  const G = groupPrincipleLines(principles);
  const order = G.sections.find(s => s.kind === 'order');
  const grid = G.sections.filter(s => s.kind !== 'order');
  const gcols = Math.max(1, Math.min(grid.length, window.innerWidth >= 980 ? 3 : 2));   // 카드 수보다 많은 열은 만들지 않음(1장이면 꽉 채움)
  const card = (s, key) => {
    const risk = s.kind === 'risk';
    return (
      <div key={key} style={{ border: '1px solid', borderColor: risk ? 'var(--loss)' : 'var(--border)', background: risk ? 'rgba(176,74,74,.05)' : 'var(--surface-2, transparent)', borderRadius: 12, padding: '10px 12px' }}>
        {s.title && <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6, color: risk ? 'var(--loss)' : 'var(--ink)' }}>{risk ? '⚠ ' : ''}{s.title}</div>}
        {s.lines.map(it => <PrincipleLine key={it.i} item={it} checks={checks} toggle={toggle} />)}
      </div>
    );
  };
  return (
    <div>
      {G.title && <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10, color: 'var(--ink)' }}>{G.title}</div>}
      {order && (
        <div style={{ background: 'var(--violet-50)', border: '1px solid var(--violet-100)', borderRadius: 12, padding: '10px 13px', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 5, color: 'var(--violet-600)' }}>📌 {order.title}</div>
          {order.lines.map(it => <PrincipleLine key={it.i} item={it} checks={checks} toggle={toggle} />)}
        </div>
      )}
      {G.routineLabel && <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--ink-3)', margin: '2px 2px 8px' }}>{G.routineLabel}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gcols}, minmax(0, 1fr))`, gap: 9, alignItems: 'stretch' }}>
        {grid.map((s, i) => card(s, i))}
      </div>
    </div>
  );
}
/* (구버전, 미사용) */
function renderPrinciplesOld(principles, checks, toggle) {
  return principles.split('\n').map((line, i) => {
    const tx = line.replace(/^\s+/, '');
    if (tx.startsWith('☐') || tx.startsWith('☑')) {
      const done = checks.has(i);
      const body = tx.replace(/^[☐☑]\s?/, '');
      return (
        <button key={i} onClick={() => toggle(i)} style={{
          display: 'flex', gap: 9, alignItems: 'flex-start', width: '100%', textAlign: 'left',
          padding: '5px 6px', borderRadius: 8, transition: 'background .12s',
        }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tint)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <span style={{
            flexShrink: 0, width: 17, height: 17, marginTop: 2, borderRadius: 5,
            border: '1.8px solid ' + (done ? 'var(--violet)' : 'var(--border-strong)'),
            background: done ? 'var(--violet)' : 'transparent', display: 'grid', placeItems: 'center',
            transition: 'all .15s',
          }}>{done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.55, color: done ? 'var(--ink-4)' : 'var(--ink-2)', textDecoration: done ? 'line-through' : 'none' }}>{body}</span>
        </button>
      );
    }
    if (line.includes('━')) {
      const label = line.replace(/[━\s]+/g, ' ').trim();
      return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--violet)', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>;
    }
    const isBullet = /^[·☐☑▸•\-]/.test(tx) || /^\d+[.)]/.test(tx);
    const isHead = /^[①②③④⑤⑥]/.test(tx) || (!!tx && !isBullet && !tx.includes('━') && tx.length <= 44 && !/[.?]$/.test(tx));
    return <div key={i} style={{
      fontSize: 13, lineHeight: 1.6, padding: '1px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      color: isHead ? 'var(--ink)' : 'var(--ink-3)', fontWeight: isHead ? 700 : 400, marginTop: isHead ? 8 : 0,
    }}>{line || '\u00A0'}</div>;
  });
}

/* 진행 링 */
function ProgressRing({ done, total, size = 44 }) {
  const r = size / 2, stroke = 4, rad = r - stroke - 1, C = 2 * Math.PI * rad;
  const frac = total ? done / total : 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={r} cy={r} r={rad} fill="none" stroke="var(--bg-tint)" strokeWidth={stroke} />
        <circle cx={r} cy={r} r={rad} fill="none" stroke="var(--violet)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${frac * C} ${C}`} style={{ transition: 'stroke-dasharray .5s var(--ease)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }} className="mono">{done}/{total}</div>
    </div>
  );
}

/* 루틴 카드 */
function RoutineCard({ routine, defaultOpen }) {
  const { items, checks, done, total, toggle, principles, open, setOpen, onEdit } = routine;
  const isOpen = defaultOpen ? true : open;
  const allDone = done === total && total > 0;
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button onClick={() => !defaultOpen && setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', minHeight: 68, textAlign: 'left' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>오늘의 루틴 &amp; 원칙 <span style={{ color: 'var(--ink-4)', fontWeight: 500, fontSize: 12.5 }}>ICT · 매일 읽기</span></div>
          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
              <div style={{ flex: 1, maxWidth: 160, height: 5, borderRadius: 99, background: 'var(--bg-tint)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: allDone ? 'var(--win)' : 'var(--violet)', borderRadius: 99, transition: 'width .4s var(--ease)' }} />
              </div>
              <span className="mono" style={{ fontSize: 11.5, color: allDone ? 'var(--win)' : 'var(--ink-3)', fontWeight: 700 }}>{allDone ? '완료 ✓' : `${done}/${total}`}</span>
            </div>
          )}
        </div>
        {!defaultOpen && <span style={{ color: 'var(--ink-4)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>▾</span>}
      </button>
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px 14px' }}>
          <div style={{ paddingRight: 2 }}>
            {renderPrinciples(principles, checks, toggle)}
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button className="btn-ghost btn-sm" onClick={onEdit}>원칙 편집</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* 잔고 밴드 — 선택한 시장(선물/스윙/장기)만 표시 (완전 분리) */
function BalanceBand({ market, bal, onSeed, big }) {
  const c = market === '선물' ? 'var(--futures)' : market === '장기' ? 'var(--long)' : 'var(--swing)';
  const empty = bal.seed == null && bal.pnl === 0;
  if (empty) {
    return (
      <button onClick={onSeed} className="card" style={{ width: '100%', padding: 18, display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left', borderStyle: 'dashed' }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: 'var(--violet-50)', display: 'grid', placeItems: 'center', color: c }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" /><path d="M16 12h.5" /></svg>
        </span>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{market} 시드(초기자본) 설정</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>탭해서 {market} 자본을 입력하세요</div></div>
        <span style={{ color: c, fontSize: 22 }}>＋</span>
      </button>
    );
  }
  const pos = bal.pnl >= 0;
  return (
    <button onClick={onSeed} className="card" style={{
      width: '100%', textAlign: 'left', padding: big ? '24px 26px' : '20px 22px',
      background: 'linear-gradient(135deg, var(--surface), var(--violet-50))',
      borderTop: `3px solid ${c}`,
      display: 'flex', flexDirection: 'column', gap: big ? 16 : 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: c }} />
            <span style={{ color: c }}>{market}</span>
            <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>잔고</span>
            <span style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 500 }}>시드 설정</span>
          </div>
          <div className="mono" style={{ fontSize: big ? 44 : 32, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-.02em', marginTop: 4 }}>{usdH(bal.bal)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: big ? 19 : 16, fontWeight: 800, color: 'var(--ink)' }}>{TJ.moneyS(bal.pnl)}</span>
          {bal.ret != null && <span className="pill mono" style={{ background: 'var(--bg-tint)', color: 'var(--ink-2)', fontSize: 12.5 }}>{pos ? '+' : '−'}{Math.abs(bal.ret).toFixed(1)}%</span>}
        </div>
      </div>
    </button>
  );
}

/* 회고 메모 — 인라인 달력 카드 */
function CalendarMemoCard({ memo }) {
  const { items, addOn, remove } = memo;
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [view, setView] = useStateH({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useStateH(todayStr);
  const [text, setText] = useStateH('');
  const [open, setOpen] = useStateH(() => { try { return localStorage.getItem('tj_memo_open') === '1'; } catch { return false; } });
  const toggleOpen = () => setOpen(v => { const nv = !v; try { localStorage.setItem('tj_memo_open', nv ? '1' : '0'); } catch {} return nv; });
  const [mode, setMode] = useStateH(() => { try { return localStorage.getItem('tj_memo_mode') === 'cal' ? 'cal' : 'list'; } catch { return 'list'; } });
  const setModeP = v => { setMode(v); try { localStorage.setItem('tj_memo_mode', v); } catch {} };

  const byDate = {};
  items.forEach(mm => { const d = (mm.at || '').slice(0, 10); if (d) (byDate[d] = byDate[d] || []).push(mm); });

  const startDow = new Date(view.y, view.m, 1).getDay();
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  const dstr = d => `${view.y}-${pad(view.m + 1)}-${pad(d)}`;
  const shift = delta => setView(v => { const nd = new Date(v.y, v.m + delta, 1); return { y: nd.getFullYear(), m: nd.getMonth() }; });
  const selMemos = byDate[sel] || [];
  const submit = () => { const t = text.trim(); if (!t) return; addOn(sel, t); setText(''); };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const wide = window.matchMedia('(min-width:760px)').matches;

  const calendar = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button className="btn-ghost btn-sm" onClick={() => shift(-1)} style={{ padding: '5px 11px' }}>‹</button>
        <div className="mono" style={{ fontSize: 14.5, fontWeight: 800 }}>{view.y}년 {view.m + 1}월</div>
        <button className="btn-ghost btn-sm" onClick={() => shift(1)} style={{ padding: '5px 11px' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
        {WD.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--ink-4)' }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const ds = dstr(d), has = byDate[ds], isSel = ds === sel, isToday = ds === todayStr;
          return (
            <button key={i} onClick={() => setSel(ds)} style={{
              aspectRatio: '1', borderRadius: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              background: isSel ? 'var(--violet)' : (has ? 'var(--violet-50)' : 'transparent'),
              color: isSel ? '#fff' : 'var(--ink-2)',
              border: isToday && !isSel ? '1.5px solid var(--violet)' : '1.5px solid transparent', transition: 'background .12s',
            }}>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: isSel || isToday ? 800 : 600 }}>{d}</span>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: has ? (isSel ? '#fff' : 'var(--violet)') : 'transparent' }} />
            </button>
          );
        })}
      </div>
    </div>
  );

  const panel = (
    <div style={!wide ? { marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 } : {}}>
      <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>{sel}{sel === todayStr ? ' · 오늘' : ''}</div>
      <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }}
        placeholder="이 날 무엇을 잘못했나? 다음엔 어떻게 할까?" style={{ minHeight: 66, fontSize: 13.5 }} />
      <button className="btn" onClick={submit} disabled={!text.trim()} style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 14, opacity: text.trim() ? 1 : .5 }}>이 날짜에 기록</button>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: wide ? 200 : 'none', overflow: wide ? 'auto' : 'visible', paddingRight: wide ? 2 : 0 }}>
        {selMemos.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5, padding: '10px 0' }}>이 날엔 메모가 없어요.</div>
          : selMemos.map(m => (
            <div key={m.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, flex: 1 }}>{(m.at || '').slice(11)}</span>
                <button onClick={() => remove(m.id)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-4)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--loss)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-4)'; }}>삭제</button>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
            </div>
          ))}
      </div>
    </div>
  );

  // 모아보기 — 내가 입력한 실수(회고)를 월별로, 최신순으로
  const allSorted = [...items].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const listMonths = [...new Set(allSorted.map(m => (m.at || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const curYM = todayStr.slice(0, 7);
  const [listMonth, setListMonth] = useStateH(() => listMonths[0] || curYM);
  const monthItems = allSorted.filter(m => (m.at || '').slice(0, 7) === listMonth);
  const ymShift = delta => { const [Y, M] = listMonth.split('-').map(Number); const nd = new Date(Y, M - 1 + delta, 1); setListMonth(`${nd.getFullYear()}-${pad(nd.getMonth() + 1)}`); };
  const ymLabel = ym => { const [Y, M] = ym.split('-').map(Number); return `${Y}년 ${M}월`; };
  const addToday = () => { const t = text.trim(); if (t) { addOn(todayStr, t); setText(''); setListMonth(curYM); } };

  const listView = (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addToday(); }}
        placeholder="실수한 거 입력 — 계속 쌓여서 위에 떠요" style={{ minHeight: 60, fontSize: 13.5 }} />
      <button className="btn" onClick={addToday} disabled={!text.trim()} style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 14, opacity: text.trim() ? 1 : .5 }}>실수 기록</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 10px' }}>
        <button className="btn-ghost btn-sm" onClick={() => ymShift(-1)} style={{ padding: '5px 12px' }}>‹</button>
        <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{ymLabel(listMonth)} <span style={{ color: 'var(--ink-4)', fontWeight: 600, fontSize: 12 }}>{monthItems.length}개</span></div>
        <button className="btn-ghost btn-sm" onClick={() => ymShift(1)} style={{ padding: '5px 12px' }}>›</button>
      </div>

      {monthItems.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5, padding: '18px 0' }}>이 달엔 기록한 실수가 없어요.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {monthItems.map(m => (
              <div key={m.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                <button onClick={() => remove(m.id)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-4)', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--loss)'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--ink-4)'; }}>삭제</button>
              </div>
            ))}
          </div>}
    </div>
  );

  return (
    <div className="card" style={{ padding: open ? 18 : '14px 18px' }}>
      <button onClick={toggleOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', marginBottom: open ? 14 : 0 }}>
        <div style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>회고 메모 <span style={{ color: 'var(--ink-4)', fontWeight: 500, fontSize: 12.5 }}>실수 복기 · 전체를 쭉 읽거나 날짜별로</span></div>
        {items.length > 0 && <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 700 }}>{items.length}개</span>}
        <span style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <>
          <div className="seg" style={{ width: '100%', marginBottom: 14 }}>
            <button className={mode === 'list' ? 'on' : ''} onClick={() => setModeP('list')}>모아보기</button>
            <button className={mode === 'cal' ? 'on' : ''} onClick={() => setModeP('cal')}>달력</button>
          </div>
          {mode === 'list'
            ? listView
            : (wide
              ? <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20, alignItems: 'start' }}>{calendar}{panel}</div>
              : <div>{calendar}{panel}</div>)}
        </>
      )}
    </div>
  );
}

/* 루틴 + 메모 나란히 */
function RoutineMemoRow({ routine, memo, showRoutine }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {showRoutine && <RoutineCard routine={routine} />}
      <CalendarMemoCard memo={memo} />
    </div>
  );
}

/* ─────────────── 성과 카드 1장 (곡선 · 승률 · R분포를 세그먼트로) ─────────────── */
function PerfCard({ stats: s, onStats, height = 96 }) {
  const [view, setView] = useStateH('curve');
  const money = s.useMoney;
  const split = TJStats.curveSplit(s.pool);
  const multi = split.series.length > 1;
  const seg = { padding: '5px 11px', fontSize: 11.5, borderRadius: 7 };
  return (
    <div className="card" style={{ padding: '13px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <div className="seg" style={{ padding: 2, borderRadius: 9 }}>
          {[['curve', '곡선'], ['win', '승률'], ['r', 'R 분포']].map(([v, l]) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)} style={seg}>{l}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button onClick={onStats} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--violet-600)' }}>통계 ›</button>
      </div>

      {view === 'curve' && (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)' }}>누적 손익 ({money ? '금액' : 'R'})</div>
          <div className="mono" style={{ fontSize: 23, fontWeight: 800, lineHeight: 1.3 }}>{money ? TJ.moneyS(s.sumP) : ((s.sumR > 0 ? '+' : '') + fnumH(s.sumR) + 'R')}</div>
          {split.series.length
            ? <EquityCurve series={multi ? split.series : null} points={!multi ? split.series[0].points : null} money={split.useMoney} height={height} />
            : <div style={{ color: 'var(--ink-3)', fontSize: 12.5, padding: '26px 0', textAlign: 'center' }}>거래를 기록하면 곡선이 그려져요</div>}
        </>
      )}

      {view === 'win' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 0' }}>
          <WinDonut win={s.wins} loss={s.losses} be={s.bes} size={96} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5 }}>
            {[['익절', s.wins, 'var(--win)'], ['손절', s.losses, 'var(--loss)'], ['본전', s.bes, 'var(--be)']].map(([l, n, c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />
                <span style={{ color: 'var(--ink-2)', flex: 1 }}>{l}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'r' && (s.rs.length
        ? <div style={{ paddingTop: 4 }}><RDistribution rs={s.rs} height={height + 8} /></div>
        : <div style={{ color: 'var(--ink-4)', fontSize: 12.5, padding: '30px 0', textAlign: 'center' }}>R 입력 시 표시</div>)}

      {s.closed && s.closed.length > 0 && (
        <div style={{ display: 'flex', gap: 14, marginTop: 8, paddingTop: 9, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>승률 {Math.round(s.winRate)}%</span>
          <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>PF {s.pf === Infinity ? '∞' : Math.round(s.pf * 100) / 100}</span>
          <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>기댓값 {money ? TJ.moneyS(s.avgP) : ((s.avgR > 0 ? '+' : '') + fnumH(s.avgR) + 'R')}</span>
        </div>
      )}
    </div>
  );
}

/* 이번 달 기분 흐름 — 일기 탭 상단 스트립 */
function MoodStrip({ diary }) {
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const todayS = `${ym}-${pad(now.getDate())}`;
  const days = now.getDate();
  const by = {}; (diary || []).forEach(x => { if (x && x.date) by[x.date] = x; });
  const C = { '좋음': 'var(--ink)', '보통': 'var(--ink-3)', '나쁨': 'var(--long)' };
  const cnt = { '좋음': 0, '보통': 0, '나쁨': 0 };
  const cells = [];
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${pad(d)}`, m = by[ds] && by[ds].mood;
    if (m && cnt[m] != null) cnt[m]++;
    cells.push({ ds, m });
  }
  const show = cells.slice(-15);
  return (
    <div className="card" style={{ padding: '13px 15px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span className="seclabel">이번 달 기분 흐름</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>좋음 {cnt['좋음']} · 보통 {cnt['보통']} · 나쁨 {cnt['나쁨']}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${show.length}, 1fr)`, gap: 4 }}>
        {show.map(c => (
          <span key={c.ds} title={c.ds + (c.m ? ' · ' + c.m : '')} style={{
            height: 26, borderRadius: 5,
            background: c.m ? C[c.m] : (c.ds === todayS ? 'var(--violet-50)' : '#efe8df'),
            border: c.ds === todayS ? '1.5px solid var(--violet)' : 'none',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>{show[0] ? show[0].ds.slice(5).replace('-', '/') : ''}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>오늘</span>
      </div>
    </div>
  );
}

/* 일기 탭 — 기분 흐름 + 하루 일기 / 회고 메모 / 루틴·원칙 */
function DiaryTab({ diary, upsert, memo, routine }) {
  const [sub, setSub] = useStateH('diary');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div className="seg" style={{ width: '100%' }}>
        {[['diary', '하루 일기'], ['memo', '회고 메모'], ['rule', '루틴·원칙']].map(([v, l]) => (
          <button key={v} className={sub === v ? 'on' : ''} onClick={() => setSub(v)} style={{ fontSize: 13 }}>{l}</button>
        ))}
      </div>
      {sub === 'diary' && <><MoodStrip diary={diary} /><DiaryHome diary={diary} upsert={upsert} alwaysOpen /></>}
      {sub === 'memo' && <CalendarMemoCard memo={memo} />}
      {sub === 'rule' && <RoutineCard routine={routine} defaultOpen />}
    </div>
  );
}

/* ─────────────── HERO ─────────────── */
function Hero({ stats: s, market, bal, onSeed, onStats, routine, memo, showRoutine }) {
  const money = s.useMoney;

  /* ===== 차트형(cockpit): 선택한 시장만 — 잔고 + KPI + 차트 ===== */
  const wide = window.matchMedia('(min-width:860px)').matches;
  const split = TJStats.curveSplit(s.pool);
  const multi = split.series.length > 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <BalanceBand market={market} bal={bal} onSeed={onSeed} />
      <div style={{ display: 'grid', gridTemplateColumns: wide ? '2fr 1fr' : '1fr', gap: 'var(--gap)' }}>
        {/* 자본 곡선 */}
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>누적 손익 곡선 ({money ? '금액' : 'R'})</div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{money ? TJ.moneyS(s.sumP) : ((s.sumR > 0 ? '+' : '') + fnumH(s.sumR) + 'R')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <button className="btn-ghost btn-sm" onClick={onStats}>통계 더보기</button>
              {multi && (
                <div style={{ display: 'flex', gap: 12 }}>
                  {split.series.map(se => (
                    <span key={se.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>
                      <span style={{ width: 9, height: 3, borderRadius: 2, background: se.color }} />{se.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {split.series.length ? <EquityCurve series={multi ? split.series : null} points={!multi ? split.series[0].points : null} money={split.useMoney} height={wide ? 168 : 130} /> : <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '30px 0', textAlign: 'center' }}>거래를 기록하면 곡선이 그려져요</div>}
        </div>
        {/* 승률 + R분포 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
          <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
            <WinDonut win={s.wins} loss={s.losses} be={s.bes} size={104} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
              {[['익절', s.wins, 'var(--win)'], ['손절', s.losses, 'var(--loss)'], ['본전', s.bes, 'var(--be)']].map(([l, n, c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />
                  <span style={{ color: 'var(--ink-2)', flex: 1 }}>{l}</span>
                  <span className="mono" style={{ fontWeight: 700 }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: '14px 16px 10px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 6 }}>R 분포</div>
            {s.rs.length ? <RDistribution rs={s.rs} height={104} /> : <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>R 입력 시 표시</div>}
          </div>
        </div>
      </div>
      {/* 코크핏: 루틴 + 메모 나란히 */}
      <RoutineMemoRow routine={routine} memo={memo} showRoutine={showRoutine} />
    </div>
  );
}

/* ─────────────── 매일 일기 (홈) ─────────────── */
const DIARY_MOODS = [['좋음', '🙂'], ['보통', '😐'], ['나쁨', '😞']];
const DIARY_MOOD_E = { '좋음': '🙂', '보통': '😐', '나쁨': '😞' };

// 하루 한 편 편집기 — 기분 + 자유 서술. blur/버튼/기분선택 시 저장.
function DiaryDayEditor({ date, entry, upsert }) {
  const [text, setText] = useStateH(entry?.text || '');
  const [mood, setMood] = useStateH(entry?.mood || null);
  const [saved, setSaved] = useStateH(false);
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1400); };
  const save = () => { upsert(date, { text: text.trim(), mood }); flash(); };
  const pickMood = v => { const nv = mood === v ? null : v; setMood(nv); upsert(date, { text: text.trim(), mood: nv }); flash(); };
  return (
    <div>
      <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
        {DIARY_MOODS.map(([v, e]) => (
          <button key={v} onClick={() => pickMood(v)} style={{
            flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 13, fontWeight: 700,
            border: '1.5px solid ' + (mood === v ? 'var(--violet)' : 'var(--border)'),
            background: mood === v ? 'var(--violet-50)' : 'var(--surface)', color: mood === v ? 'var(--violet-600)' : 'var(--ink-3)', transition: 'all .12s',
          }}>{e} {v}</button>
        ))}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} onBlur={save}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(); }}
        placeholder="오늘 하루 어땠는지 — 시장·멘탈·컨디션 뭐든 자유롭게…" style={{ minHeight: 96, fontSize: 14, lineHeight: 1.6 }} />
      <button className="btn" onClick={save} style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 14 }}>{saved ? '저장됨 ✓' : '저장'}</button>
    </div>
  );
}

function DiaryHome({ diary, upsert, alwaysOpen }) {
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const dLabel = ds => { const [Y, M, D] = ds.split('-').map(Number); return `${M}월 ${D}일 (${WD[new Date(Y, M - 1, D).getDay()]})`; };
  const byDate = {}; (diary || []).forEach(x => { if (x && x.date) byDate[x.date] = x; });
  const today = byDate[todayStr] || null;

  const past = (diary || []).filter(x => x && x.date && x.date !== todayStr && (x.text || x.mood)).sort((a, b) => b.date.localeCompare(a.date));
  const months = [...new Set(past.map(x => x.date.slice(0, 7)))].sort().reverse();
  const [open_, setOpen] = useStateH(() => { try { return localStorage.getItem('tj_diary_open') !== '0'; } catch { return true; } });
  const open = alwaysOpen ? true : open_;
  const toggleOpen = () => { if (alwaysOpen) return; setOpen(v => { const nv = !v; try { localStorage.setItem('tj_diary_open', nv ? '1' : '0'); } catch {} return nv; }); };
  const [pastOpen, setPastOpen] = useStateH(!!alwaysOpen);
  const [ym, setYm] = useStateH(() => months[0] || todayStr.slice(0, 7));
  const [editDate, setEditDate] = useStateH(null);
  const ymShift = d => { const [Y, M] = ym.split('-').map(Number); const nd = new Date(Y, M - 1 + d, 1); setYm(`${nd.getFullYear()}-${pad(nd.getMonth() + 1)}`); };
  const ymLabel = () => { const [Y, M] = ym.split('-').map(Number); return `${Y}년 ${M}월`; };
  const monthPast = past.filter(x => x.date.slice(0, 7) === ym);

  return (
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <button onClick={toggleOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', marginBottom: open ? 12 : 0 }}>
        <b style={{ fontSize: 16 }}>오늘 일기</b>
        <span className="mono" style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>{dLabel(todayStr)}</span>
        {today?.mood && <span style={{ fontSize: 13 }}>{DIARY_MOOD_E[today.mood]}</span>}
        {!open && !today?.text && !today?.mood && <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>· 오늘 기록 없음</span>}
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <>
      <DiaryDayEditor key={'today-' + (today?.updated_at || 'new')} date={todayStr} entry={today} upsert={upsert} />

      <button onClick={() => setPastOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'left' }}>
        지난 일기 {past.length > 0 && <span className="mono" style={{ color: 'var(--ink-4)', fontWeight: 600 }}>{past.length}편</span>}
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--ink-4)', transform: pastOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
      </button>

      {pastOpen && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button className="btn-ghost btn-sm" onClick={() => ymShift(-1)} style={{ padding: '5px 12px' }}>‹</button>
            <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{ymLabel()} <span style={{ color: 'var(--ink-4)', fontWeight: 600, fontSize: 12 }}>{monthPast.length}편</span></div>
            <button className="btn-ghost btn-sm" onClick={() => ymShift(1)} style={{ padding: '5px 12px' }}>›</button>
          </div>
          {monthPast.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5, padding: '16px 0' }}>이 달엔 일기가 없어요.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {monthPast.map(x => (
                  <div key={x.date} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: editDate === x.date ? 10 : 4 }}>
                      <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{dLabel(x.date)}</span>
                      {x.mood && <span style={{ fontSize: 12 }}>{DIARY_MOOD_E[x.mood]} {x.mood}</span>}
                      <span style={{ flex: 1 }} />
                      <button onClick={() => setEditDate(editDate === x.date ? null : x.date)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-4)' }}>{editDate === x.date ? '닫기' : '수정'}</button>
                    </div>
                    {editDate === x.date
                      ? <DiaryDayEditor key={x.date + (x.updated_at || '')} date={x.date} entry={x} upsert={upsert} />
                      : <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{x.text || <span style={{ color: 'var(--ink-4)' }}>내용 없음</span>}</div>}
                  </div>
                ))}
              </div>}
        </div>
      )}
        </>
      )}
    </div>
  );
}

Object.assign(window, { Hero, RoutineCard, CalendarMemoCard, BalanceBand, DiaryHome, PerfCard, DiaryTab, MoodStrip });
