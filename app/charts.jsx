/* 거래일지 — SVG 차트 컴포넌트 */
const { useState: useStateC } = React;

/* 작은 유틸 — 통화 기호는 TJ 전역 토글($/₩)을 따름 */
const fmtMoney = (n, sign) => sign ? TJ.moneyS(n) : TJ.money(n);
const fmtR = (n) => (n > 0 ? '+' : '') + (Math.round(n * 100) / 100) + 'R';

/* ─────────── 자본/누적손익 곡선 (단일 또는 선물·현물 다중) ─────────── */
function EquityCurve({ points, series, height = 150, money = true, showAxis = true }) {
  const W = 720, H = height, padL = 8, padR = 8, padT = 14, padB = showAxis ? 22 : 8;
  const [hover, setHover] = useStateC(null);

  // normalize → seriesList
  let seriesList = (series && series.length) ? series : null;
  if (!seriesList) {
    if (!points || points.length < 2) {
      return <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>데이터가 충분하지 않아요</div>;
    }
    const lastV = points[points.length - 1].value;
    seriesList = [{ name: '', color: lastV >= 0 ? 'var(--win)' : 'var(--loss)', points, area: true }];
  }
  const validLen = Math.max(...seriesList.map(s => s.points.length));
  if (validLen < 2) return <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>데이터가 충분하지 않아요</div>;

  const allVals = seriesList.flatMap(s => s.points.map(p => p.value));
  const min = Math.min(0, ...allVals), max = Math.max(0, ...allVals);
  const range = (max - min) || 1;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const single = seriesList.length === 1;
  const x = (i, n) => padL + (i / (n - 1)) * innerW;
  const y = v => padT + innerH - ((v - min) / range) * innerH;
  const zeroY = y(0);

  const labels = seriesList[0].points.map(p => p.label);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let idx = Math.round(((px - padL) / innerW) * (validLen - 1));
          idx = Math.max(0, Math.min(validLen - 1, idx));
          setHover(idx);
        }}>
        <defs>
          {seriesList.map((s, si) => (
            <linearGradient key={si} id={`eqg-${si}-${money ? 'm' : 'r'}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6b5640" stopOpacity="0.13" />
              <stop offset="100%" stopColor="#6b5640" stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 4" />
        {seriesList.map((s, si) => {
          const n = s.points.length;
          const linePts = s.points.map((p, i) => `${x(i, n).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
          const areaPath = single && s.area ? `M ${x(0, n).toFixed(1)},${zeroY.toFixed(1)} L ` +
            s.points.map((p, i) => `${x(i, n).toFixed(1)},${y(p.value).toFixed(1)}`).join(' L ') +
            ` L ${x(n - 1, n).toFixed(1)},${zeroY.toFixed(1)} Z` : null;
          return (
            <g key={si}>
              {areaPath && <path d={areaPath} fill={`url(#eqg-${si}-${money ? 'm' : 'r'})`} />}
              <polyline points={linePts} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1, n)} cy={y(s.points[n - 1].value)} r="3.6" fill={s.color} stroke="#fff" strokeWidth="2" />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover, validLen)} y1={padT - 6} x2={x(hover, validLen)} y2={H - padB} stroke="var(--ink-3)" strokeWidth="1" opacity="0.45" />
            {seriesList.map((s, si) => s.points[hover] != null && (
              <circle key={si} cx={x(hover, s.points.length)} cy={y(s.points[hover].value)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover != null && labels[hover] != null && (
        <div style={{
          position: 'absolute', top: 0, left: `${(x(hover, validLen) / W) * 100}%`,
          transform: `translateX(${hover > validLen / 2 ? '-100%' : '0'})`, pointerEvents: 'none',
          background: 'var(--ink)', color: '#fff', fontSize: 11.5, fontWeight: 600,
          padding: '6px 10px', borderRadius: 8, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-md)',
        }} className="mono">
          <div style={{ opacity: .6, fontSize: 10, fontWeight: 500, marginBottom: 2 }}>{labels[hover]}</div>
          {seriesList.map((s, si) => s.points[hover] != null && (
            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {!single && <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />}
              {!single && <span style={{ opacity: .8, fontWeight: 500 }}>{s.name}</span>}
              <span style={{ marginLeft: 'auto' }}>{money ? fmtMoney(s.points[hover].value, true) : fmtR(s.points[hover].value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────── 승률 도넛 ─────────── */
function WinDonut({ win, loss, be, size = 132 }) {
  const total = win + loss + be;
  const r = size / 2, stroke = 15, rad = r - stroke / 2 - 2;
  const C = 2 * Math.PI * rad;
  const decisive = win + loss;
  const pct = decisive ? Math.round((win / decisive) * 100) : 0;
  const segs = [
    { v: win, c: 'var(--win)' },
    { v: loss, c: 'var(--loss)' },
    { v: be, c: 'var(--be)' },
  ].filter(s => s.v > 0);
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={r} cy={r} r={rad} fill="none" stroke="var(--bg-tint)" strokeWidth={stroke} />
        {total > 0 && segs.map((s, i) => {
          const frac = s.v / total;
          const dash = frac * C;
          const el = (
            <circle key={i} cx={r} cy={r} r={rad} fill="none" stroke={s.c} strokeWidth={stroke}
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray .6s var(--ease)' }} />
          );
          acc += dash;
          return el;
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="mono" style={{ fontSize: size * 0.27, fontWeight: 800, lineHeight: 1, color: 'var(--ink)' }}>{pct}<span style={{ fontSize: size * 0.12 }}>%</span></div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 3 }}>승률</div>
      </div>
    </div>
  );
}

/* ─────────── R 분포 히스토그램 ─────────── */
function RDistribution({ rs, height = 130 }) {
  // bucket R values
  const buckets = [
    { key: '≤−2', test: r => r <= -1.5, c: 'var(--loss)' },
    { key: '−1', test: r => r > -1.5 && r < 0, c: 'var(--loss)' },
    { key: '0', test: r => r === 0, c: 'var(--be)' },
    { key: '+1', test: r => r > 0 && r < 1.5, c: 'var(--win)' },
    { key: '+2', test: r => r >= 1.5 && r < 2.5, c: 'var(--win)' },
    { key: '+3', test: r => r >= 2.5, c: 'var(--win)' },
  ];
  const counts = buckets.map(b => rs.filter(r => b.test(r)).length);
  const maxC = Math.max(1, ...counts);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height, padding: '0 2px' }}>
      {buckets.map((b, i) => (
        <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 6 }}>
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: counts[i] ? 'var(--ink-2)' : 'var(--ink-4)' }}>{counts[i] || ''}</div>
          <div style={{
            width: '78%', maxWidth: 38,
            height: `${(counts[i] / maxC) * (height - 42)}px`,
            minHeight: counts[i] ? 4 : 0,
            background: b.c, borderRadius: '6px 6px 3px 3px',
            transition: 'height .5s var(--ease)', opacity: counts[i] ? 1 : 0,
          }} />
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{b.key}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────── 가로 막대 (월별/방향별 손익) ─────────── */
function HBars({ rows, money = true }) {
  // rows: [{label, value}]
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r, i) => {
        const pos = r.value >= 0;
        const w = (Math.abs(r.value) / maxAbs) * 100;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{r.label}</div>
            <div style={{ position: 'relative', height: 22, display: 'flex', justifyContent: pos ? 'flex-start' : 'flex-end' }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              <div style={{
                position: 'absolute', top: 3, bottom: 3,
                [pos ? 'left' : 'right']: '50%',
                width: `${w / 2}%`,
                background: pos ? 'var(--win)' : 'var(--loss)',
                borderRadius: 5, opacity: .9, transition: 'width .5s var(--ease)',
              }} />
            </div>
            <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: pos ? 'var(--win)' : 'var(--loss)', textAlign: 'right', minWidth: 64 }}>
              {money ? fmtMoney(r.value, true) : fmtR(r.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { EquityCurve, WinDonut, RDistribution, HBars, fmtMoney, fmtR });
