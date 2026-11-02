/* 포트폴리오 — 자산 탭 안의 '구성·리밸런싱 / 월별 기록 / 배당'.

   ★ 2026-11-02 사용자 요청: "자산관리 포트폴리오.html 보고 섞어봐".
     그 파일에서 거래일지에 없던 것만 가져왔다 —
       · 통화·자산 클래스·국가·포지션별 구성 + 목표 비중 리밸런싱
       · 월말 투자 기록(시드·평가금·배당) → 시간가중 수익률, 지수(S&P·나스닥·코스피) 비교
       · 배당금 기록 + 연도별 배당 캘린더
       · 요약 대시보드, 국가·포지션 목록 편집, 현재가 일괄 갱신(같은 날 두 번째 요청)
     매매일지·주식 목록은 이미 일지/자산 탭에 더 자세히 있어서 옮기지 않았다.

   숫자는 모두 원화로 적고 원화로 보여준다(월말 기록·배당은 원래 원화로 결산하는 값).
   자산 합계만 앱의 달러 기준값을 TJ.rateKRW()로 환산해서 쓴다.

   ⚠ 색은 자산 탭과 같은 흙색 계열 — 파란색 쓰지 말 것(2026-08-09 요청). */

const PF_COUNTRIES = ['한국', '미국', '중국', '유럽', '기타'];
const PF_POSITIONS = ['공격수', '미드필더', '수비수', '골키퍼'];
const PF_PALETTE = ['#97633b', '#c2a05a', '#7f8b6c', '#9c7f8b', '#b58963', '#8d8475', '#d0b48a', '#bab2a6'];
const PF_EMPTY = { records: [], dividends: [], targets: {}, tags: {}, lists: {}, meta_at: '' };
/* 국가·포지션 목록 — 직접 바꾼 값이 있으면 그걸, 없으면 기본값 */
const pfLists = (pf) => {
  const l = (pf && pf.lists) || {};
  return { countries: (l.countries && l.countries.length) ? l.countries : PF_COUNTRIES, positions: (l.positions && l.positions.length) ? l.positions : PF_POSITIONS };
};

const pfKrw = (n) => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');
const pfKrwS = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + pfKrw(Math.abs(n));
const pfPct = (v, d = 2) => (isFinite(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(d) : '0.00') + '%';
const pfShort = (v) => {
  const a = Math.abs(v);
  if (a >= 1e8) return (v / 1e8).toFixed(a >= 1e9 ? 0 : 1) + '억';
  if (a >= 1e4) return Math.round(v / 1e4).toLocaleString('ko-KR') + '만';
  return Math.round(v).toLocaleString('ko-KR');
};
const pfNum = (v) => { if (v === '' || v == null) return 0; const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
const pfHas = (v) => v !== '' && v != null && isFinite(parseFloat(String(v).replace(/,/g, '')));
const pfYm = (p) => { const [y, m] = String(p).split('-'); return y.slice(2) + '.' + m; };
const pfToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const pfTone = (v) => (v > 0 ? 'var(--win)' : v < 0 ? 'var(--loss)' : 'inherit');

/* 자산 한 건이 어느 국가·포지션인지 — 직접 고른 값이 없으면 통화·분류로 짐작한다 */
function pfTagOf(a, pf) {
  const t = ((pf && pf.tags) || {})[a.id] || {};
  const L = pfLists(pf);
  const sym = String(a.symbol || '').toUpperCase();
  const country = t.country || (a.cat === '암호화폐' ? '기타'
    : (a.currency === '₩' || /^\d{6}/.test(sym) || /\.K[SQ]$/.test(sym)) ? '한국' : '미국');
  const pos = t.pos || ({ 현금_예금: '골키퍼', 채권: '수비수', 연금_보험: '수비수', 부동산: '수비수', 원자재: '수비수', 암호화폐: '공격수' }[a.cat] || '미드필더');
  // 목록에서 지운 이름이면 목록 마지막 항목(보통 '기타')으로 보낸다 — 어디에도 안 잡히는 돈이 생기지 않게
  const fit = (v, list) => (list.includes(v) ? v : list[list.length - 1]);
  return { country: fit(country, L.countries), pos: fit(pos, L.positions) };
}

const PF_DIMS = [
  { key: 'cls', label: '자산 클래스', list: (pf) => ASSET_CATS.map((c) => c.label), of: (a) => (ASSET_CATS.find((c) => c.key === a.cat) || ASSET_CATS[ASSET_CATS.length - 1]).label },
  { key: 'cur', label: '통화', list: (pf) => ['원화', '달러'], of: (a) => (a.currency === '₩' || a.currency === 'KRW' ? '원화' : '달러') },
  { key: 'country', label: '국가', list: (pf) => pfLists(pf).countries, of: (a, pf) => pfTagOf(a, pf).country },
  { key: 'pos', label: '포지션', list: (pf) => pfLists(pf).positions, of: (a, pf) => pfTagOf(a, pf).pos },
];
const pfColor = (dim, k, pf) => {
  if (dim.key === 'cls') { const c = ASSET_CATS.find((x) => x.label === k); if (c) return c.color; }
  const i = dim.list(pf).indexOf(k);
  return i >= 0 ? PF_PALETTE[i % PF_PALETTE.length] : 'var(--ink-4)';
};

/* 월말 기록 → 월별·누적(시간가중) 수익률. 입금 변화는 수익에서 뺀다. */
function pfRecordCalc(records) {
  const rs = (records || []).filter((r) => r.period).slice().sort((a, b) => a.period.localeCompare(b.period));
  let cumDiv = 0, chain = 1;
  const out = rs.map((r, i) => {
    const inv = pfNum(r.invested), val = pfNum(r.value), div = pfNum(r.dividend);
    cumDiv += div;
    let mret = 0;
    if (i > 0) { const p = rs[i - 1]; const pv = pfNum(p.value); mret = pv ? (val - pv - (inv - pfNum(p.invested)) + div) / pv : 0; }
    chain *= 1 + mret;
    return { ...r, inv, val, div, cumDiv, pl: val - inv, mret, cum: chain - 1 };
  });
  ['spx', 'ndx', 'kospi'].forEach((k) => {
    const base = out.find((o) => pfHas(o[k]));
    out.forEach((o) => { o[k + 'R'] = base && pfHas(o[k]) ? pfNum(o[k]) / pfNum(base[k]) - 1 : null; });
  });
  return out;
}
/* 차원별 금액 합계 — 구성 막대·리밸런싱·요약이 같은 값을 쓴다 */
function pfGroups(all, valueKrw, pf) {
  return PF_DIMS.map((dim) => {
    const map = {}; dim.list(pf).forEach((k) => { map[k] = 0; });
    all.forEach((a) => { const k = dim.of(a, pf); map[k] = (map[k] || 0) + valueKrw(a); });
    return { dim, map };
  });
}
const pfDivKrw = (d) => pfNum(d.amount) * (d.cur === '$' ? (pfHas(d.fx) ? pfNum(d.fx) : TJ.rateKRW()) : 1);

/* ─────────── 작은 차트 (선·막대 겸용, 포맷터를 받는다) ─────────── */
function PfChart({ labels, series, fmt = pfShort, height = 170 }) {
  const [hover, setHover] = React.useState(null);
  const vals0 = !labels.length || !series.some((s) => s.values.some((v) => v != null));
  // 실제 폭으로 그린다 — viewBox를 고정하면 좁은 카드에서 글씨가 5px로 쪼그라든다
  const boxRef = React.useRef(null);
  const [W, setW] = React.useState(560);
  React.useEffect(() => {
    const el = boxRef.current; if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setW(w); });
    ro.observe(el); return () => ro.disconnect();
  }, [vals0]);
  const H = height, padL = 46, padR = 8, padT = 10, padB = 22;
  const vals = series.flatMap((s) => s.values.filter((v) => v != null));
  if (!labels.length || !vals.length) return <div ref={boxRef} style={{ color: 'var(--ink-4)', fontSize: 12.5, textAlign: 'center', padding: '26px 0' }}>데이터가 없어요</div>;
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  if (min === max) max = min + 1;
  const pad = (max - min) * 0.08; max += pad; if (min < 0) min -= pad;
  const n = labels.length, iw = W - padL - padR, ih = H - padT - padB;
  const slot = iw / n;
  const x = (i) => padL + slot * (i + 0.5);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * ih;
  const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  const bars = series.filter((s) => s.type === 'bar');
  const bw = Math.min(26, (slot * 0.7) / Math.max(1, bars.length));
  const step = Math.ceil(n / 8);
  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; const i = Math.floor((px - padL) / slot); setHover(i >= 0 && i < n ? i : null); }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--ink-4)">{fmt(t, true)}</text>
          </g>
        ))}
        {min < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" />}
        {hover != null && <rect x={padL + slot * hover} y={padT} width={slot} height={ih} fill="var(--surface-2)" />}
        {bars.map((s, bi) => s.values.map((v, i) => {
          if (!v) return null;
          const x0 = x(i) - (bw * bars.length) / 2 + bw * bi;
          const top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
          return <rect key={s.name + i} x={x0} y={top} width={Math.max(1, bw - 2)} height={h} rx="3" fill={typeof s.color === 'function' ? s.color(v) : s.color} />;
        }))}
        {series.filter((s) => s.type !== 'bar').map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
          return (
            <g key={s.name}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash || ''} strokeLinejoin="round" />
              {pts.length <= 1 && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={s.color} />)}
            </g>
          );
        })}
        {labels.map((l, i) => (i % step === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--ink-4)">{l}</text>
        ))}
      </svg>
      {hover != null && (
        <div style={{ position: 'absolute', top: 4, [hover > n / 2 ? 'left' : 'right']: 8, background: 'var(--ink)', color: '#fff', borderRadius: 9, padding: '7px 10px', fontSize: 11.5, pointerEvents: 'none', lineHeight: 1.6 }}>
          <div style={{ opacity: .65, fontSize: 10.5 }}>{labels[hover]}</div>
          {series.map((s) => s.values[hover] != null && (
            <div key={s.name}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 5, background: typeof s.color === 'function' ? s.color(s.values[hover]) : s.color }} />{s.name} <b className="mono">{fmt(s.values[hover])}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
function PfLegend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 6px' }}>
      {items.map(([l, c, dash]) => <span key={l}><i style={{ display: 'inline-block', width: 10, height: dash ? 2 : 8, borderRadius: 2, marginRight: 5, verticalAlign: dash ? 3 : 0, background: c }} />{l}</span>)}
    </div>
  );
}

const pfCard = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px' };
const pfH = { fontSize: 14.5, fontWeight: 800, marginBottom: 10 };
const pfHelp = { fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.6 };
const pfTh = { padding: '6px 8px', fontSize: 12, color: 'var(--ink-4)', fontWeight: 600, whiteSpace: 'nowrap' };
const pfTd = { padding: '9px 8px', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' };
const pfN = { textAlign: 'right' };

function PfKpis({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
      {items.map(([l, v, note, tone]) => (
        <div key={l} style={{ ...pfCard, padding: '11px 13px' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{l}</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em', marginTop: 2, color: tone || 'inherit' }}>{v}</div>
          {note && <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 1 }}>{note}</div>}
        </div>
      ))}
    </div>
  );
}

/* ─────────── ① 구성 · 리밸런싱 ─────────── */
function PfCompCards({ all, valueKrw, portfolio, hint = true }) {
  const total = all.reduce((s, a) => s + valueKrw(a), 0);
  const groups = pfGroups(all, valueKrw, portfolio);
  const top = all.map((a) => ({ a, v: valueKrw(a) })).filter((x) => x.v > 0).sort((p, q) => q.v - p.v).slice(0, 10);
  if (!total) return <div style={{ ...pfCard, ...pfHelp, textAlign: 'center', padding: '28px 16px' }}>보유 탭에 자산을 넣으면 구성과 비중이 계산돼요.</div>;
  return (
      <div className="pf-two">
        <div style={pfCard}>
          <div style={pfH}>자산 구성 <small style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 12 }}>{pfKrw(total)}</small></div>
          {groups.map(({ dim, map }) => {
            const keys = Object.keys(map).filter((k) => map[k] > 0);
            return (
              <div key={dim.key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 5 }}>{dim.label}</div>
                <div style={{ display: 'flex', gap: 2, height: 13, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
                  {keys.map((k) => <span key={k} title={k} style={{ width: (map[k] / total) * 100 + '%', minWidth: 2, background: pfColor(dim, k, portfolio) }} />)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>
                  {keys.map((k) => <span key={k}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 4, background: pfColor(dim, k, portfolio) }} />{k} <b className="mono" style={{ color: 'var(--ink)' }}>{((map[k] / total) * 100).toFixed(1)}%</b></span>)}
                </div>
              </div>
            );
          })}
          {hint && <div style={pfHelp}>국가·포지션은 통화와 분류로 짐작한 값이에요. 비중 화면 아래 <b>자산별 국가·포지션</b>에서 바꿀 수 있어요.</div>}
        </div>
        <div style={pfCard}>
          <div style={pfH}>비중 TOP 10</div>
          {top.map(({ a, v }) => (
            <div key={a.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{a.name}</span>
                <span className="mono" style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{pfKrw(v)} · {((v / total) * 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-2)', marginTop: 4, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: (v / top[0].v) * 100 + '%', background: 'var(--violet)', borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}

function PfComposition({ all, valueKrw, portfolio, update }) {
  const total = all.reduce((s, a) => s + valueKrw(a), 0);
  const [tagOpen, setTagOpen] = React.useState(false);
  const groups = pfGroups(all, valueKrw, portfolio);
  const L = pfLists(portfolio);
  const setTarget = (dim, k, v) => update((p) => {
    const t = { ...(p.targets || {}) }; t[dim] = { ...(t[dim] || {}) };
    if (String(v).trim() === '') delete t[dim][k]; else t[dim][k] = pfNum(v);
    return { ...p, targets: t };
  });
  const setTag = (id, field, v) => update((p) => ({ ...p, tags: { ...(p.tags || {}), [id]: { ...((p.tags || {})[id] || {}), [field]: v } } }));
  const setList = (field, text) => {
    const arr = Array.from(new Set(String(text).split(',').map((x) => x.trim()).filter(Boolean)));
    update((p) => ({ ...p, lists: { ...(p.lists || {}), [field]: arr } }));
  };

  if (!total) return <PfCompCards all={all} valueKrw={valueKrw} portfolio={portfolio} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PfCompCards all={all} valueKrw={valueKrw} portfolio={portfolio} />

      <div style={pfHelp}>각 항목의 <b>목표 %</b>를 적으면(예: 20, 50, 30) 지금 비중과의 차이, 목표까지 사고팔 금액을 계산해요.</div>
      <div className="pf-two">
        {groups.map(({ dim, map }) => {
          const T = (portfolio.targets || {})[dim.key] || {};
          const keys = Array.from(new Set([...dim.list(portfolio), ...Object.keys(map).filter((k) => map[k] > 0)]));
          const tsum = keys.reduce((s, k) => s + pfNum(T[k]), 0);
          return (
            <div key={dim.key} style={{ ...pfCard, overflowX: 'auto' }}>
              <div style={pfH}>{dim.label}별 <small style={{ fontWeight: 500, fontSize: 12, color: tsum && Math.abs(tsum - 100) > 0.01 ? 'var(--gold)' : 'var(--ink-4)' }}>목표 합계 {tsum}%</small></div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr><th style={{ ...pfTh, textAlign: 'left' }}>{dim.label}</th><th style={{ ...pfTh, ...pfN }}>비율</th><th style={{ ...pfTh, ...pfN }}>목표 %</th><th style={{ ...pfTh, ...pfN }}>차이</th><th style={{ ...pfTh, ...pfN }}>조정 금액</th></tr></thead>
                <tbody>
                  {keys.map((k) => {
                    const v = map[k] || 0, r = v / total;
                    const t = pfHas(T[k]) ? pfNum(T[k]) / 100 : null;
                    const d = t == null ? null : r - t, need = t == null ? null : t * total - v;
                    return (
                      <tr key={k}>
                        <td style={pfTd}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 6, background: pfColor(dim, k, portfolio) }} />{k}</td>
                        <td className="mono" style={{ ...pfTd, ...pfN }}>{v ? (r * 100).toFixed(1) + '%' : '—'}</td>
                        <td style={{ ...pfTd, ...pfN }}><input inputMode="decimal" defaultValue={pfHas(T[k]) ? T[k] : ''} key={k + (T[k] ?? '')} onBlur={(e) => setTarget(dim.key, k, e.target.value)}
                          style={{ width: 58, padding: '4px 6px', textAlign: 'right', fontSize: 13 }} /></td>
                        <td className="mono" style={{ ...pfTd, ...pfN, color: d == null ? 'var(--ink-4)' : pfTone(d) }}>{d == null ? '—' : pfPct(d, 1)}</td>
                        <td className="mono" style={{ ...pfTd, ...pfN }}>{need == null ? '—' : (need > 0 ? '매수 ' : need < 0 ? '매도 ' : '') + pfKrw(Math.abs(need))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div style={pfCard}>
        <button onClick={() => setTagOpen(!tagOpen)} style={{ ...pfH, marginBottom: 0, display: 'flex', width: '100%', justifyContent: 'space-between' }}>
          <span>자산별 국가·포지션 · 목록 편집</span><span style={{ color: 'var(--ink-4)', fontWeight: 600 }}>{tagOpen ? '접기' : '펼치기'}</span>
        </button>
        {tagOpen && (
          <div style={{ marginTop: 10 }}>
            <div className="pf-two" style={{ marginBottom: 10 }}>
              <div><label className="fld" style={{ marginTop: 0 }}>국가 목록 <small style={{ fontWeight: 400 }}>쉼표로 구분</small></label>
                <input key={'c' + L.countries.join()} defaultValue={L.countries.join(', ')} onBlur={(e) => setList('countries', e.target.value)} /></div>
              <div><label className="fld" style={{ marginTop: 0 }}>포지션 목록 <small style={{ fontWeight: 400 }}>쉼표로 구분</small></label>
                <input key={'p' + L.positions.join()} defaultValue={L.positions.join(', ')} onBlur={(e) => setList('positions', e.target.value)} /></div>
            </div>
            <div style={{ ...pfHelp, marginBottom: 8 }}>포지션은 내 기준대로 나누면 돼요. 예) 예적금=골키퍼, 미국지수 ETF=미드필더, 기술주=공격수. 목록에서 지운 이름은 목록 맨 끝 항목으로 모여요.</div>
            {all.map((a) => {
              const tg = pfTagOf(a, portfolio);
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 140px', fontSize: 13, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <select value={tg.country} onChange={(e) => setTag(a.id, 'country', e.target.value)} style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}>
                    {L.countries.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <select value={tg.pos} onChange={(e) => setTag(a.id, 'pos', e.target.value)} style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}>
                    {L.positions.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── 공용 편집 시트 ─────────── */
function PfEditor({ title, fields, value, onSave, onDelete, onClose, calc }) {
  const [r, setR] = React.useState(value);
  const set = (k, v) => setR((p) => ({ ...p, [k]: v }));
  return (
    <Modal open onClose={onClose} title={title} sheet={window.innerWidth < 700} maxWidth={480}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        {fields.map(([k, l, type, opts, full]) => (
          <div key={k} style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
            <label className="fld">{l}</label>
            {type === 'opt'
              ? <div className="seg" style={{ width: '100%' }}>{opts.map((o) => <button key={o} className={r[k] === o ? 'on' : ''} onClick={() => set(k, o)}>{o}</button>)}</div>
              : <input type={type === 'num' ? 'text' : type} inputMode={type === 'num' ? 'decimal' : undefined} value={r[k] ?? ''} placeholder={type === 'num' ? '0' : ''}
                onChange={(e) => set(k, e.target.value)} />}
          </div>
        ))}
      </div>
      {calc && <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: 'var(--ink-3)', marginTop: 14 }}>{calc(r)}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        {onDelete && <button className="btn-ghost" style={{ color: 'var(--loss)' }} onClick={() => { if (confirm('이 기록을 지울까요?')) onDelete(); }}>삭제</button>}
        <span style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={onClose}>취소</button>
        <button className="btn" onClick={() => onSave(r)}>저장</button>
      </div>
    </Modal>
  );
}

/* 기록 한 건 저장/삭제 — 보유종목과 같은 규칙(id·updated_at·삭제 표시)이라 동기화에서 안 꼬인다 */
function pfUpsert(update, coll, row) {
  const now = new Date().toISOString();
  update((p) => {
    const list = p[coll] || [];
    const next = row.id ? list.map((x) => (x.id === row.id ? { ...x, ...row, updated_at: now } : x))
      : [...list, { ...row, id: 'pf-' + coll.slice(0, 3) + '-' + Math.random().toString(36).slice(2, 10), created_at: now, updated_at: now }];
    return { ...p, [coll]: next };
  });
}

/* 월말 기록 그래프 3개 — 월별 기록 화면과 요약 화면이 같이 쓴다 */
function PfRecordCharts({ rc }) {
  const labels = rc.map((r) => pfYm(r.period));
  const bench = [['spx', 'S&P 500', '#c2a05a'], ['ndx', '나스닥 100', '#7f8b6c'], ['kospi', '코스피', '#9c7f8b']].filter(([k]) => rc.some((r) => r[k + 'R'] != null));
  return (
    <>
      <div style={pfCard}><div style={pfH}>평가금 vs 투자금</div>
        <PfLegend items={[['평가금', 'var(--violet)'], ['총 투자금', 'var(--ink-4)', true]]} />
        <PfChart labels={labels} series={[{ name: '평가금', color: 'var(--violet)', values: rc.map((r) => r.val) }, { name: '총 투자금', color: 'var(--ink-4)', dash: '5 4', values: rc.map((r) => r.inv) }]} /></div>
      <div style={pfCard}><div style={pfH}>월별 총 손익</div>
        <PfLegend items={[['평가금 − 총 투자금', 'var(--violet)']]} />
        <PfChart labels={labels} series={[{ name: '총 손익', type: 'bar', color: (v) => (v >= 0 ? 'var(--violet)' : 'var(--loss)'), values: rc.map((r) => r.pl) }]} /></div>
      <div style={pfCard}><div style={pfH}>내 수익률 vs 지수</div>
        <PfLegend items={[['내 수익률', 'var(--violet)'], ...bench.map(([, l, c]) => [l, c])]} />
        <PfChart labels={labels} fmt={(v, ax) => (v * 100).toFixed(ax ? 0 : 2) + '%'}
          series={[{ name: '내 수익률', color: 'var(--violet)', values: rc.map((r) => r.cum) }, ...bench.map(([k, l, c]) => ({ name: l, color: c, values: rc.map((r) => r[k + 'R']) }))]} />
        {!bench.length && <div style={{ ...pfHelp, marginTop: 4 }}>월말 지수를 넣으면 S&P 500·나스닥·코스피와 같이 그려져요.</div>}</div>
    </>
  );
}

/* 전체 기간 월별 배당 — 빈 달은 0으로 채운다 */
function PfDivMonthly({ dividends }) {
  const byM = {};
  (dividends || []).forEach((d) => { if (!d.date) return; const m = d.date.slice(0, 7); byM[m] = (byM[m] || 0) + pfDivKrw(d); });
  const ms = Object.keys(byM).sort();
  const all = [];
  if (ms.length) {
    let [y, m] = ms[0].split('-').map(Number); const [ey, em] = ms[ms.length - 1].split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) { all.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  }
  let cum = 0; const cumD = all.map((k) => (cum += byM[k] || 0));
  return (
    <div style={pfCard}><div style={pfH}>월별 배당금</div>
      <PfLegend items={[['월 배당금', 'var(--violet)'], ['누적', 'var(--gold)']]} />
      <PfChart labels={all.map(pfYm)} series={[{ name: '월 배당금', type: 'bar', color: 'var(--violet)', values: all.map((k) => byM[k] || 0) }, { name: '누적', color: 'var(--gold)', values: cumD }]} /></div>
  );
}

/* ─────────── ② 월별 투자 기록 ─────────── */
const PF_REC_FIELDS = [['period', '기간(월)', 'month', null, true], ['invested', '총 투자금 (누적 입금 시드)', 'num'], ['value', '평가금 (월말)', 'num'], ['dividend', '배당금 (그 달)', 'num'],
  ['spx', 'S&P 500 월말 (선택)', 'num'], ['ndx', '나스닥 100 월말 (선택)', 'num'], ['kospi', '코스피 월말 (선택)', 'num']];

function PfRecords({ portfolio, update, remove, totalKrw }) {
  const [edit, setEdit] = React.useState(null);
  const rc = pfRecordCalc(portfolio.records);
  const last = rc[rc.length - 1];
  const seed = last ? last.inv : 0;
  const openNew = () => {
    let period = pfToday().slice(0, 7), invested = '';
    if (last) { let [y, m] = last.period.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } period = `${y}-${String(m).padStart(2, '0')}`; invested = last.invested; }
    setEdit({ period, invested, value: Math.round(totalKrw) || '', dividend: '', spx: '', ndx: '', kospi: '' });
  };
  const save = (r) => {
    if (!r.period) { alert('기간을 입력하세요'); return; }
    if ((portfolio.records || []).some((x) => x.period === r.period && x.id !== r.id)) { alert('같은 달 기록이 이미 있어요'); return; }
    const row = { ...r }; PF_REC_FIELDS.forEach(([k, , t]) => { if (t === 'num') row[k] = pfHas(row[k]) ? pfNum(row[k]) : ''; });
    pfUpsert(update, 'records', row); setEdit(null);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PfKpis items={[
        ['시드머니', pfKrw(seed), '최근 기록의 총 투자금'],
        ['현재 자산', pfKrw(totalKrw), '보유 자산 합계'],
        ['누적 손익', seed ? pfKrwS(totalKrw - seed) : '—', '현재 자산 − 시드', pfTone(totalKrw - seed)],
        ['누적 수익률(시간가중)', last ? pfPct(last.cum) : '—', last ? pfYm(last.period) + ' 기록 기준' : '기록을 추가하세요', last ? pfTone(last.cum) : null],
      ]} />
      <div style={pfHelp}>매월 말 <b>총 투자금</b>(지금까지 넣은 원금), <b>평가금</b>, <b>배당금</b>을 적으세요. 월별 수익률은 입금액 변화를 빼고 계산해요. 지수를 같이 적으면 시장과 비교돼요.</div>
      {rc.length > 0 && (
        <div className="pf-two">
          <PfRecordCharts rc={rc} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{rc.length}개월 기록</span>
        <button className="btn btn-sm" onClick={openNew}>＋ 이번 달 기록</button>
      </div>
      <div style={{ ...pfCard, overflowX: 'auto', padding: rc.length ? '6px 10px' : undefined }}>
        {rc.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['기간', '총 투자금', '평가금', '배당금', '누적 배당', '총 손익', '월 수익률', '누적 수익률'].map((h, i) => <th key={h} style={{ ...pfTh, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{rc.slice().reverse().map((r) => (
              <tr key={r.id} onClick={() => setEdit({ ...r })} style={{ cursor: 'pointer' }}>
                <td style={pfTd}>{pfYm(r.period)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN }}>{pfKrw(r.inv)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN }}>{pfKrw(r.val)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN }}>{pfKrw(r.div)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN }}>{pfKrw(r.cumDiv)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN, color: pfTone(r.pl) }}>{pfKrwS(r.pl)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN, color: pfTone(r.mret) }}>{pfPct(r.mret)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN, color: pfTone(r.cum), fontWeight: 700 }}>{pfPct(r.cum)}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div style={{ ...pfHelp, textAlign: 'center', padding: '14px 0' }}>월말 기록이 없어요. <b>＋ 이번 달 기록</b>을 누르면 지금 총자산이 평가금으로 미리 채워져요.</div>}
      </div>
      {edit && <PfEditor title={edit.id ? '월말 기록 수정' : '월말 기록 추가'} fields={PF_REC_FIELDS} value={edit} onClose={() => setEdit(null)} onSave={save}
        onDelete={edit.id ? () => { remove('records', edit.id); setEdit(null); } : null} />}
    </div>
  );
}

/* ─────────── ③ 배당금 + 배당 캘린더 ─────────── */
const PF_DIV_FIELDS = [['date', '입금일', 'date'], ['cur', '통화', 'opt', ['₩', '$']], ['ticker', '티커(종목코드)', 'text'], ['name', '종목명', 'text'], ['amount', '배당금 (세후)', 'num'], ['fx', '당시 환율 (달러일 때, 비우면 현재 환율)', 'num', null, true]];

function PfDividends({ portfolio, update, remove }) {
  const [edit, setEdit] = React.useState(null);
  const [year, setYear] = React.useState(null);
  const list = (portfolio.dividends || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const thisY = pfToday().slice(0, 4);
  const years = Array.from(new Set([thisY, ...list.map((d) => (d.date || '').slice(0, 4)).filter(Boolean)])).sort();
  const yr = year && years.includes(year) ? year : thisY;
  const total = list.reduce((s, d) => s + pfDivKrw(d), 0);
  const mt = Array(12).fill(0), rows = {};
  list.filter((d) => (d.date || '').startsWith(yr)).forEach((d) => {
    const k = (d.ticker || '') + '|' + (d.name || ''); rows[k] = rows[k] || { t: d.ticker, n: d.name, m: Array(12).fill(0) };
    const mi = parseInt(d.date.slice(5, 7), 10) - 1, v = pfDivKrw(d); rows[k].m[mi] += v; mt[mi] += v;
  });
  const R = Object.values(rows).sort((a, b) => b.m.reduce((s, x) => s + x, 0) - a.m.reduce((s, x) => s + x, 0));
  const ytot = mt.reduce((s, x) => s + x, 0);
  let cum = 0; const cumY = mt.map((v) => (cum += v));
  const save = (r) => {
    if (!r.date) { alert('입금일을 입력하세요'); return; }
    pfUpsert(update, 'dividends', { ...r, amount: pfNum(r.amount), fx: pfHas(r.fx) ? pfNum(r.fx) : '' }); setEdit(null);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PfKpis items={[
        ['누적 배당금', pfKrw(total), `${list.length}건`],
        [`${yr}년 배당금`, pfKrw(ytot), '월평균 ' + pfKrw(ytot / 12)],
      ]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="seg">{years.map((y) => <button key={y} className={y === yr ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>)}</div>
        <button className="btn btn-sm" onClick={() => setEdit({ date: pfToday(), cur: '₩', ticker: '', name: '', amount: '', fx: '' })}>＋ 배당금 기록</button>
      </div>
      <div style={pfCard}><div style={pfH}>{yr}년 월별 배당금</div>
        <PfLegend items={[['월 배당금', 'var(--violet)'], ['누적', 'var(--gold)']]} />
        <PfChart labels={mt.map((_, i) => i + 1 + '월')} series={[{ name: '월 배당금', type: 'bar', color: 'var(--violet)', values: mt }, { name: '누적', color: 'var(--gold)', values: cumY }]} /></div>
      <div style={{ ...pfCard, overflowX: 'auto', padding: R.length ? '6px 10px' : undefined }}>
        <div style={{ ...pfH, padding: R.length ? '8px 0 0' : 0 }}>배당 캘린더</div>
        {R.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr><th style={{ ...pfTh, textAlign: 'left' }}>종목</th>{mt.map((_, i) => <th key={i} style={{ ...pfTh, ...pfN }}>{i + 1}월</th>)}<th style={{ ...pfTh, ...pfN }}>합계</th></tr></thead>
            <tbody>
              {R.map((r) => (
                <tr key={r.t + r.n}>
                  <td style={pfTd}>{r.n || r.t}{r.t && r.n && r.t !== r.n ? <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.t}</div> : null}</td>
                  {r.m.map((v, i) => <td key={i} className="mono" style={{ ...pfTd, ...pfN, color: v ? 'inherit' : 'var(--ink-4)' }}>{v ? pfShort(v) : '·'}</td>)}
                  <td className="mono" style={{ ...pfTd, ...pfN, fontWeight: 800 }}>{pfKrw(r.m.reduce((s, x) => s + x, 0))}</td>
                </tr>
              ))}
              <tr><td style={{ ...pfTd, fontWeight: 800, borderTop: '2px solid var(--border)' }}>합계</td>{mt.map((v, i) => <td key={i} className="mono" style={{ ...pfTd, ...pfN, fontWeight: 700, borderTop: '2px solid var(--border)' }}>{v ? pfShort(v) : '·'}</td>)}<td className="mono" style={{ ...pfTd, ...pfN, fontWeight: 800, borderTop: '2px solid var(--border)' }}>{pfKrw(ytot)}</td></tr>
            </tbody>
          </table>
        ) : <div style={{ ...pfHelp, textAlign: 'center', padding: '14px 0' }}>{yr}년 배당 기록이 없어요.</div>}
      </div>
      {list.length > 0 && (
        <div style={{ ...pfCard, overflowX: 'auto', padding: '6px 10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['입금일', '종목', '배당금', '원화 환산'].map((h, i) => <th key={h} style={{ ...pfTh, textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{list.map((d) => (
              <tr key={d.id} onClick={() => setEdit({ ...d, amount: String(d.amount ?? ''), fx: String(d.fx ?? '') })} style={{ cursor: 'pointer' }}>
                <td className="mono" style={pfTd}>{d.date}</td>
                <td style={pfTd}>{d.name || d.ticker}{d.ticker && d.name && d.ticker !== d.name ? <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 5 }}>{d.ticker}</span> : null}</td>
                <td className="mono" style={{ ...pfTd, ...pfN }}>{d.cur === '$' ? '$' + pfNum(d.amount).toLocaleString('en-US', { maximumFractionDigits: 2 }) : pfKrw(d.amount)}</td>
                <td className="mono" style={{ ...pfTd, ...pfN, fontWeight: 700 }}>{pfKrw(pfDivKrw(d))}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <PfEditor title={edit.id ? '배당금 수정' : '배당금 기록'} fields={PF_DIV_FIELDS} value={edit} onClose={() => setEdit(null)} onSave={save}
        onDelete={edit.id ? () => { remove('dividends', edit.id); setEdit(null); } : null}
        calc={(r) => <>원화 환산 <b className="mono" style={{ color: 'var(--ink)' }}>{pfKrw(pfDivKrw(r))}</b></>} />}
    </div>
  );
}

/* ─────────── ⓪ 요약 — 주신 파일의 '대시보드' 한 화면 ─────────── */
function PfSummary({ all, valueKrw, totalKrw, portfolio }) {
  const rc = pfRecordCalc(portfolio.records);
  const last = rc[rc.length - 1];
  const seed = last ? last.inv : 0;
  const pl = totalKrw - seed, ret = seed ? pl / seed : 0;
  const divs = portfolio.dividends || [];
  const divTotal = divs.reduce((s, d) => s + pfDivKrw(d), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PfKpis items={[
        ['총자산', pfKrw(totalKrw), '보유 자산 합계 (원화 환산)'],
        ['누적 손익', seed ? pfKrwS(pl) : '—', seed ? '시드 ' + pfKrw(seed) + ' 대비' : '월별 기록에 시드를 적으세요', pfTone(pl)],
        ['누적 수익률', seed ? pfPct(ret) : '—', last ? pfYm(last.period) + ' 기록의 시드 기준' : '월별 기록을 추가하세요', pfTone(ret)],
        ['누적 배당금', pfKrw(divTotal), '배당 기록 ' + divs.length + '건'],
      ]} />
      <PfCompCards all={all} valueKrw={valueKrw} portfolio={portfolio} hint={false} />
      <div className="pf-two">
        {rc.length ? <PfRecordCharts rc={rc} /> : <div style={{ ...pfCard, ...pfHelp, textAlign: 'center', padding: '28px 16px' }}>월별 기록에 월말 값을 적으면 수익률 그래프가 여기 나타나요.</div>}
        {divs.length ? <PfDivMonthly dividends={divs} /> : <div style={{ ...pfCard, ...pfHelp, textAlign: 'center', padding: '28px 16px' }}>배당 기록이 없어요.</div>}
      </div>
    </div>
  );
}

/* 현재가 일괄 갱신 — 시세가 자동으로 안 붙는 자산(직접 적는 값)을 한 화면에서 고친다.
   실시간 시세가 붙는 종목은 뺀다(고쳐도 시세가 덮어쓰니까). */
function PfPrices({ assets, priceOf, saveAsset, onClose }) {
  const rows = (assets || []).filter((a) => !a.auto && !livePrice(a, priceOf).live);
  const isAmt = (a) => a.cat === '현금_예금' || !(Number(a.qty) > 0);
  const [vals, setVals] = React.useState(() => Object.fromEntries(rows.map((a) => [a.id, String((isAmt(a) ? a.amount : a.price) ?? '')])));
  const save = () => {
    rows.forEach((a) => {
      const v = vals[a.id];
      if (!pfHas(v)) return;
      const n = pfNum(v), k = isAmt(a) ? 'amount' : 'price';
      if (n !== Number(a[k])) saveAsset({ id: a.id, [k]: n });
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="현재가 일괄 갱신" sheet={window.innerWidth < 700} maxWidth={480}>
      {rows.length ? (
        <>
          <div style={{ ...pfHelp, marginBottom: 6 }}>실시간 시세가 없는 자산만 보여요. 월말 결산 때 한 번에 고치세요. 바뀐 값만 저장돼요.</div>
          {rows.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{isAmt(a) ? '평가금액' : a.qty + '주 · 현재가'} ({SYM(a.currency)}){a.updated_at ? ' · ' + String(a.updated_at).slice(0, 10) + ' 기준' : ''}</div>
              </div>
              <input inputMode="decimal" value={vals[a.id]} onChange={(e) => setVals((p) => ({ ...p, [a.id]: e.target.value }))}
                style={{ width: 130, textAlign: 'right', padding: '7px 9px' }} />
            </div>
          ))}
        </>
      ) : <div style={{ ...pfHelp, textAlign: 'center', padding: '18px 0' }}>직접 값을 적는 자산이 없어요. 모든 종목이 실시간 시세로 갱신되고 있어요.</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <span style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={onClose}>취소</button>
        {rows.length > 0 && <button className="btn" onClick={save}>저장</button>}
      </div>
    </Modal>
  );
}

/* ─────────── 자산 탭 = 요약 + 보유 자산 + 포트폴리오 3화면 ─────────── */
function AssetsHub(props) {
  const { portfolio = PF_EMPTY, setPortfolio, onPortfolioDelete } = props;
  const [view, setView] = React.useState(() => localStorage.getItem('tj_assets_view') || 'sum');
  const [prices, setPrices] = React.useState(false);
  React.useEffect(() => { localStorage.setItem('tj_assets_view', view); }, [view]);
  const priceOf = (s0) => { const s = String(s0 || '').toUpperCase(); return (props.quotes || {})[s] || (props.quotes || {})[s + '.KS'] || null; };
  const all = (props.autoAssets || []).concat(props.assets || []);
  const valueKrw = (a) => assetValueUSD(a, priceOf) * TJ.rateKRW();
  const totalKrw = all.reduce((s, a) => s + valueKrw(a), 0);
  const update = (fn) => setPortfolio((p) => ({ ...fn(p || PF_EMPTY), meta_at: new Date().toISOString() }));
  const remove = (coll, id) => { update((p) => ({ ...p, [coll]: (p[coll] || []).filter((x) => x.id !== id) })); onPortfolioDelete && onPortfolioDelete(id); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Segmented value={view} onChange={setView} style={{ width: '100%' }}
        options={[{ v: 'sum', label: '요약' }, { v: 'hold', label: '보유' }, { v: 'mix', label: '비중' }, { v: 'rec', label: '월별' }, { v: 'div', label: '배당' }]} />
      {view === 'sum' && <PfSummary all={all} valueKrw={valueKrw} totalKrw={totalKrw} portfolio={portfolio} />}
      {view === 'hold' && (props.assets || []).length > 0 && (
        <button className="btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => setPrices(true)}>현재가 일괄 갱신</button>
      )}
      {view === 'hold' && <AssetsTab {...props} />}
      {prices && <PfPrices assets={props.assets} priceOf={priceOf} saveAsset={props.saveAsset} onClose={() => setPrices(false)} />}
      {view === 'mix' && <PfComposition all={all} valueKrw={valueKrw} portfolio={portfolio} update={update} />}
      {view === 'rec' && <PfRecords portfolio={portfolio} update={update} remove={remove} totalKrw={totalKrw} />}
      {view === 'div' && <PfDividends portfolio={portfolio} update={update} remove={remove} />}
    </div>
  );
}

/* 동기화 병합 — 기록·배당은 id 합집합(최신 우선, 삭제 반영), 목표·태그·목록은 더 최근에 고친 쪽 */
function mergePortfolio(a, b, deleted) {
  a = a || PF_EMPTY; b = b || PF_EMPTY; deleted = deleted || {};
  const byId = (k) => {
    const m = new Map();
    for (const x of [...(a[k] || []), ...(b[k] || [])]) {
      if (!x || !x.id) continue;
      const prev = m.get(x.id);
      if (!prev || (x.updated_at || '') >= (prev.updated_at || '')) m.set(x.id, x);
    }
    return [...m.values()].filter((x) => !deleted[x.id]);
  };
  const newer = (b.meta_at || '') >= (a.meta_at || '') ? b : a;
  return { records: byId('records'), dividends: byId('dividends'), targets: newer.targets || {}, tags: newer.tags || {}, lists: newer.lists || {}, meta_at: newer.meta_at || '' };
}

Object.assign(window, { AssetsHub, mergePortfolio, PF_EMPTY });
