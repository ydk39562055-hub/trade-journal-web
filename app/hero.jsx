/* 거래일지 — 홈 HERO (대시보드 / 레저 / 포커스) + 루틴 카드 */
const { useState: useStateH } = React;

const usdH = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const fnumH = n => (n === Infinity ? '∞' : Math.round(n * 100) / 100);

/* 원칙/루틴 본문 렌더 (체크박스 인터랙션) */
function renderPrinciples(principles, checks, toggle) {
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
          <div style={{ maxHeight: defaultOpen ? 380 : 300, overflow: 'auto', paddingRight: 4 }}>
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

/* 잔고 밴드 (대시보드/포커스 공용) */
function BalanceBand({ balF, balS, totalBal, totalPnl, totalRet, onSeed, big }) {
  const empty = balF.seed == null && balS.seed == null && totalPnl === 0;
  if (empty) {
    return (
      <button onClick={onSeed} className="card" style={{ width: '100%', padding: 18, display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left', borderStyle: 'dashed' }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: 'var(--violet-50)', display: 'grid', placeItems: 'center', color: 'var(--violet)' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" /><path d="M16 12h.5" /></svg>
        </span>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>시드(초기자본) 설정</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>탭해서 선물·현물 자본을 입력하세요</div></div>
        <span style={{ color: 'var(--violet)', fontSize: 22 }}>＋</span>
      </button>
    );
  }
  const pos = totalPnl >= 0;
  return (
    <button onClick={onSeed} className="card" style={{
      width: '100%', textAlign: 'left', padding: big ? '24px 26px' : '20px 22px',
      background: 'linear-gradient(135deg, var(--surface), var(--violet-50))',
      display: 'flex', flexDirection: 'column', gap: big ? 16 : 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>총 잔고 <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>시드 설정</span></div>
          <div className="mono" style={{ fontSize: big ? 44 : 32, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-.02em', marginTop: 4 }}>{usdH(totalBal)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: big ? 19 : 16, fontWeight: 800, color: 'var(--ink)' }}>{pos ? '+' : '−'}${Math.abs(Math.round(totalPnl)).toLocaleString('en-US')}</span>
          {totalRet != null && <span className="pill mono" style={{ background: 'var(--bg-tint)', color: 'var(--ink-2)', fontSize: 12.5 }}>{pos ? '+' : '−'}{Math.abs(totalRet).toFixed(1)}%</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {[['선물', balF, 'var(--futures)'], ['현물', balS, 'var(--spot)']].map(([lab, b, c]) => (
          <div key={lab} style={{ flex: 1, background: 'var(--surface)', borderRadius: 11, padding: '10px 13px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: c }}>{lab}</div>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{b.seed != null || b.pnl !== 0 ? usdH(b.bal) : '–'}</div>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{b.pnl >= 0 ? '+' : '−'}${Math.abs(Math.round(b.pnl)).toLocaleString('en-US')}{b.ret != null ? ` · ${b.ret >= 0 ? '+' : ''}${b.ret.toFixed(1)}%` : ''}</div>
          </div>
        ))}
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

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 14 }}>회고 메모 <span style={{ color: 'var(--ink-4)', fontWeight: 500, fontSize: 12.5 }}>실수 복기 · 날짜를 눌러 기록</span></div>
      {wide
        ? <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20, alignItems: 'start' }}>{calendar}{panel}</div>
        : <div>{calendar}{panel}</div>}
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

/* ─────────────── HERO ─────────────── */
function Hero({ layout, stats: s, balF, balS, totalBal, totalPnl, totalRet, onSeed, onStats, routine, memo, showRoutine }) {
  const money = s.useMoney;

  /* ===== 레저: 미니멀 한 줄 요약 ===== */
  if (layout === 'ledger') {
    const cells = [
      ['총 잔고', usdH(totalBal), null],
      ['누적 손익', (totalPnl >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(totalPnl)).toLocaleString('en-US'), null],
      ['승률', Math.round(s.winRate) + '%', null],
      ['손익비', fnumH(s.pf), null],
      ['마감', s.closed.length + '건', null],
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
        <div className="card" style={{ padding: '4px 20px', cursor: 'pointer' }} onClick={onStats}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {cells.map(([l, v, c], i) => (
                <div key={l} style={{ padding: '16px 22px 16px 0', marginRight: 2, borderRight: i < cells.length - 1 ? '1px solid var(--border)' : 'none', paddingRight: 22 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{l}</div>
                  <div className="mono" style={{ fontSize: 20, fontWeight: 800, marginTop: 3, color: c || 'var(--ink)' }}>{v}</div>
                </div>
              ))}
            </div>
            {s.curve.length > 1 && <div style={{ width: 150, flexShrink: 0 }}><EquityCurve points={s.curve} money={money} height={56} showAxis={false} /></div>}
          </div>
        </div>
        <RoutineMemoRow routine={routine} memo={memo} showRoutine={showRoutine} />
      </div>
    );
  }

  /* ===== 포커스: 큰 잔고 + 루틴 전면 ===== */
  if (layout === 'focus') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: window.matchMedia('(min-width:860px)').matches ? '1fr 1fr' : '1fr', gap: 'var(--gap)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
          <BalanceBand balF={balF} balS={balS} totalBal={totalBal} totalPnl={totalPnl} totalRet={totalRet} onSeed={onSeed} big />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <KPI label="승률" value={Math.round(s.winRate) + '%'} />
            <KPI label="손익비" value={fnumH(s.pf)} />
            <KPI label="누적 R" value={(s.sumR > 0 ? '+' : '') + fnumH(s.sumR)} />
          </div>
          <CalendarMemoCard memo={memo} />
        </div>
        {showRoutine && <RoutineCard routine={routine} defaultOpen />}
      </div>
    );
  }

  /* ===== 대시보드(cockpit): KPI + 차트 ===== */
  const wide = window.matchMedia('(min-width:860px)').matches;
  const split = TJStats.curveSplit(s.pool);
  const multi = split.series.length > 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <BalanceBand balF={balF} balS={balS} totalBal={totalBal} totalPnl={totalPnl} totalRet={totalRet} onSeed={onSeed} />
      <div style={{ display: 'grid', gridTemplateColumns: wide ? '2fr 1fr' : '1fr', gap: 'var(--gap)' }}>
        {/* 자본 곡선 */}
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>누적 손익 곡선 ({money ? '금액' : 'R'})</div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{money ? ((s.sumP >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(s.sumP)).toLocaleString('en-US')) : ((s.sumR > 0 ? '+' : '') + fnumH(s.sumR) + 'R')}</div>
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

Object.assign(window, { Hero, RoutineCard, CalendarMemoCard, BalanceBand });
