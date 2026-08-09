/* 거래일지 — 메인 앱 */
const { useState, useEffect, useMemo, useRef } = React;

/* 액센트 팔레트 (브라운 계열) */
const ACCENTS = {
  '코코아': { v: '#97633b', d: '#82522e', s50: '#f4ece3', s100: '#ecdfd1' },
  '테라코타': { v: '#b06a40', d: '#9a5a34', s50: '#f7ece4', s100: '#f0ddcd' },
  '카멜': { v: '#a07c3e', d: '#8a6932', s50: '#f5efe1', s100: '#ece1c9' },
  '월넛': { v: '#6f4a32', d: '#5d3c28', s50: '#efe8e2', s100: '#e2d6cc' },
};
const DENSITY = {
  compact: { gap: '10px', pad: '14px', fs: '14px' },
  regular: { gap: '14px', pad: '18px', fs: '15px' },
  comfy: { gap: '18px', pad: '22px', fs: '15.5px' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/* 실시간 USD→KRW 환율 — 무료·키없음·CORS허용 소스 폴백. 실패 시 null(캐시/폴백 유지) */
async function fetchKrwRate() {
  const sources = [
    ['https://open.er-api.com/v6/latest/USD', j => j && j.rates && j.rates.KRW],
    ['https://api.exchangerate-api.com/v4/latest/USD', j => j && j.rates && j.rates.KRW],
  ];
  for (const [u, pick] of sources) {
    try { const r = await fetch(u); if (!r.ok) continue; const v = pick(await r.json()); if (v && v > 0) return Math.round(v * 100) / 100; } catch (e) {}
  }
  return null;
}

/* 동기화용 블롭 병합 — 두 기기 기록을 합치되 삭제(tombstone)는 반영.
   a=로컬, b=클라우드. 스칼라(설정/원칙)는 클라우드(b)가 있으면 우선. */
const _mtime = e => e.updated_at || e.created_at || '';
function mergeBlobs(a, b) {
  a = a || {}; b = b || {};
  const deleted = {};
  for (const src of [a.deleted || {}, b.deleted || {}])
    for (const k in src) if (!deleted[k] || src[k] > deleted[k]) deleted[k] = src[k];
  const buried = (id, t) => deleted[id] && deleted[id] >= (t || ''); // 삭제시각이 항목시각 이상이면 묻음
  // 일지: id 합집합, 같은 id면 최신(mtime) 유지, 삭제된 건 제외
  const em = new Map();
  for (const e of [...(a.entries || []), ...(b.entries || [])]) {
    if (!e || !e.id) continue;
    const prev = em.get(e.id);
    if (!prev || _mtime(e) >= _mtime(prev)) em.set(e.id, e);
  }
  const entries = [...em.values()].filter(e => !buried(e.id, _mtime(e)))
    .sort((x, y) => (y.traded_at || '').localeCompare(x.traded_at || '') || (y.created_at || '').localeCompare(x.created_at || ''));
  // 메모: id 합집합, 삭제된 건 제외
  const mm = new Map();
  for (const m of [...(a.memos || []), ...(b.memos || [])]) if (m && m.id && !mm.has(m.id)) mm.set(m.id, m);
  const memos = [...mm.values()].filter(m => !deleted[m.id]);
  // 일기: 날짜별 1개, updated_at 최신 우선
  const dd = new Map();
  for (const x of [...(a.diary || []), ...(b.diary || [])]) {
    if (!x || !x.date) continue;
    const prev = dd.get(x.date);
    if (!prev || (x.updated_at || '') >= (prev.updated_at || '')) dd.set(x.date, x);
  }
  // 빈 일기(글도 기분도 없음)와 지운 일기는 버림 — 동기화로 되살아나지 않게
  const diary = [...dd.values()]
    .filter(x => (x.text && x.text.trim()) || x.mood)
    .filter(x => !buried('diary:' + x.date, x.updated_at || ''));
  // 보유종목: id 합집합, 같은 id면 updated_at 최신, 삭제된 건 제외
  const hm = new Map();
  for (const h of [...(a.holdings || []), ...(b.holdings || [])]) {
    if (!h || !h.id) continue;
    const prev = hm.get(h.id);
    if (!prev || (h.updated_at || '') >= (prev.updated_at || '')) hm.set(h.id, h);
  }
  const holdings = [...hm.values()].filter(h => !deleted[h.id]);
  // 전체 재산(현금·부동산 등 직접 적는 자산) — 보유종목과 같은 방식으로 합친다
  const am = new Map();
  for (const x of [...(a.assets || []), ...(b.assets || [])]) {
    if (!x || !x.id) continue;
    const prev = am.get(x.id);
    if (!prev || (x.updated_at || '') >= (prev.updated_at || '')) am.set(x.id, x);
  }
  const assets = [...am.values()].filter(x => !deleted[x.id]);
  const settings = { ...(a.settings || {}), ...(b.settings || {}) };
  const principles = (b.principles && b.principles.trim()) ? b.principles : (a.principles || '');
  return { v: 1, entries, settings, principles, memos, diary, holdings, assets, deleted };
}

/* 레드폴더(ForexFactory 경제지표) 한글 표기 */
const FF_CTY_KO = { USD: '🇺🇸 미국', EUR: '🇪🇺 유로존', JPY: '🇯🇵 일본', GBP: '🇬🇧 영국', AUD: '🇦🇺 호주', CAD: '🇨🇦 캐나다', NZD: '🇳🇿 뉴질랜드', CHF: '🇨🇭 스위스', CNY: '🇨🇳 중국' };
const koCountry = c => FF_CTY_KO[c] || c;
const FF_EVT_KO = {
  'Non-Farm Employment Change': '비농업 고용지표', 'ADP Non-Farm Employment Change': 'ADP 민간고용',
  'Unemployment Rate': '실업률', 'Unemployment Claims': '신규 실업수당청구', 'Employment Change': '고용 변화',
  'Average Hourly Earnings m/m': '시간당 평균임금(전월대비)',
  'ISM Manufacturing PMI': 'ISM 제조업 PMI', 'ISM Services PMI': 'ISM 서비스업 PMI',
  'Flash Manufacturing PMI': '제조업 PMI 속보', 'Flash Services PMI': '서비스업 PMI 속보',
  'GDP q/q': 'GDP(전분기대비)', 'GDP m/m': 'GDP(전월대비)', 'Prelim GDP q/q': 'GDP 잠정치(전분기대비)', 'Advance GDP q/q': 'GDP 속보치(전분기대비)',
  'CPI m/m': '소비자물가 CPI(전월대비)', 'CPI y/y': '소비자물가 CPI(전년대비)', 'Core CPI m/m': '근원 소비자물가(전월대비)',
  'PPI m/m': '생산자물가 PPI(전월대비)', 'Core PCE Price Index m/m': '근원 PCE 물가(전월대비)',
  'Retail Sales m/m': '소매판매(전월대비)', 'Core Retail Sales m/m': '근원 소매판매(전월대비)',
  'Federal Funds Rate': '미국 기준금리 결정', 'FOMC Statement': 'FOMC 성명', 'FOMC Press Conference': 'FOMC 기자회견', 'FOMC Meeting Minutes': 'FOMC 의사록', 'FOMC Economic Projections': 'FOMC 경제전망',
  'Main Refinancing Rate': 'ECB 기준금리 결정', 'Official Bank Rate': '영란은행 기준금리 결정', 'Cash Rate': '호주 기준금리 결정', 'Overnight Rate': '캐나다 기준금리 결정',
  'JOLTS Job Openings': 'JOLTS 구인건수', 'Consumer Confidence': '소비자신뢰지수', 'Prelim UoM Consumer Sentiment': '미시간대 소비자심리(잠정)',
  'Building Permits': '건축 허가', 'Trade Balance': '무역수지',
};
const BANK_KO = { BOE: '영란은행', BOJ: '일본은행', RBA: '호주중앙은행', RBNZ: '뉴질랜드중앙은행', BOC: '캐나다중앙은행', SNB: '스위스중앙은행', ECB: '유럽중앙은행', Fed: '연준', PBOC: '중국인민은행' };
const NAME_KO = { Bailey: '베일리', Ueda: '우에다', Bullock: '불록', Powell: '파월', Lagarde: '라가르드', Macklem: '매클럼' };
function koEvent(t) {
  if (!t) return '';
  if (FF_EVT_KO[t]) return FF_EVT_KO[t];
  if (/Speaks$/.test(t)) {
    const p = t.replace(/\s+Speaks$/, '').split(/\s+/);
    const bank = BANK_KO[p[0]] || p[0];
    const nm = p[p.length - 1]; const name = NAME_KO[nm] || nm;
    return `${bank} ${name} 연설`;
  }
  let s = t.replace(/\bm\/m\b/, '(전월대비)').replace(/\bq\/q\b/, '(전분기대비)').replace(/\by\/y\b/, '(전년대비)')
    .replace(/\bCPI\b/, '소비자물가').replace(/\bRetail Sales\b/, '소매판매').replace(/\bUnemployment\b/, '실업').replace(/\bEmployment\b/, '고용');
  return s === t ? '' : s;
}

function RedFolderCard({ items }) {
  const [open, setOpen] = useState(false);   // 카드 펼침 (기본 접힘 = 헤더만)
  const [week, setWeek] = useState(false);   // 펼친 뒤: 오늘·내일 / 이번 주
  const [pastOpen, setPastOpen] = useState(false);  // 오늘 이미 지난 지표 펼침
  if (!items || !items.length) return null;
  const pad = n => String(n).padStart(2, '0');
  const ymd = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const _t = new Date();
  const today = ymd(_t);                                              // ★ 로컬(내 기기=한국시간) 기준 — UTC 어긋남 방지
  const tomorrow = ymd(new Date(_t.getFullYear(), _t.getMonth(), _t.getDate() + 1));
  const CCY = new Set(['USD', 'EUR', 'GBP']);   // 달러·유로·파운드만 (나스닥·S&P500=USD). 호주·일본 등 제외
  const withD = items.map(e => ({ ...e, d: new Date(e.date) })).filter(e => !isNaN(e.d) && CCY.has(e.country));
  const byDay = {};
  withD.forEach(e => { const k = ymd(e.d); (byDay[k] = byDay[k] || []).push(e); });
  const days = Object.keys(byDay).sort();
  days.forEach(k => byDay[k].sort((a, b) => a.d - b.d));
  // ★ 이미 발표된 지표는 세지도 보여주지도 않음 — 이 카드는 "앞으로 조심할 것" 용도
  const isPast = e => e.d < _t;
  const upcoming = withD.filter(e => !isPast(e));
  const byDayUp = {};
  upcoming.forEach(e => { const k = ymd(e.d); (byDayUp[k] = byDayUp[k] || []).push(e); });
  Object.keys(byDayUp).forEach(k => byDayUp[k].sort((a, b) => a.d - b.d));
  const soonKeys = [today, tomorrow].filter(k => byDayUp[k]);          // 오늘 남은 것 + 내일
  const soonCount = soonKeys.reduce((n, k) => n + byDayUp[k].length, 0);
  const nextEv = upcoming.slice().sort((a, b) => a.d - b.d)[0] || null; // 가장 가까운 지표
  const todayPast = (byDay[today] || []).filter(isPast);                // 오늘 이미 지난 것(접어서 따로)
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const dayLabel = k => { const [Y, M, D] = k.split('-').map(Number); return `${M}/${D} (${WD[new Date(Y, M - 1, D).getDay()]})`; };

  const row = (e, i) => (
    <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 12, borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'baseline' }}>
      <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{e.d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
      <span style={{ color: 'var(--ink-3)', flexShrink: 0, minWidth: 54, fontSize: 11.5 }}>{koCountry(e.country)}</span>
      <span style={{ color: 'var(--ink-2)' }}>
        {koEvent(e.title) || e.title}
        {koEvent(e.title) && <span style={{ color: 'var(--ink-4)' }}> · {e.title}</span>}
      </span>
    </div>
  );

  const dayBlock = (k, di, src) => {
    const rows = (src || byDayUp)[k] || [];
    if (!rows.length) return null;
    return (
      <div key={k} style={{ marginTop: di ? 10 : 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: k === today ? 'var(--violet-600)' : 'var(--ink-3)', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
          {dayLabel(k)}
          {(k === today || k === tomorrow) && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: k === today ? 'var(--violet)' : 'var(--ink-4)', padding: '1px 6px', borderRadius: 5 }}>{k === today ? '오늘' : '내일'}</span>}
          <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>{rows.length}건</span>
        </div>
        {rows.map((e, i) => row(e, i))}
      </div>
    );
  };
  const empty = txt => <div style={{ fontSize: 12, color: 'var(--ink-4)', textAlign: 'center', padding: '10px 0' }}>{txt}</div>;

  return (
    <div className="card" style={{ padding: '11px 13px', marginBottom: 12, borderColor: 'var(--violet-100)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--violet)', flexShrink: 0 }} />
        <b style={{ fontSize: 12.5 }}>레드폴더</b>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
          {nextEv
            ? <>다음 <b style={{ color: 'var(--ink-2)' }}>{nextEv.d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b> {koEvent(nextEv.title) || nextEv.title}</>
            : '남은 고임팩트 없음 ✓'}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600 }}>{open ? '접기' : '펼치기'}</span>
        <span style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="seg" style={{ width: '100%', marginBottom: 8 }}>
            <button className={!week ? 'on' : ''} onClick={() => setWeek(false)}>오늘·내일</button>
            <button className={week ? 'on' : ''} onClick={() => setWeek(true)}>이번 주 남은 것</button>
          </div>
          {!week
            ? (soonCount > 0 ? soonKeys.map((k, di) => dayBlock(k, di)) : empty('오늘·내일 남은 고임팩트 없음 ✓'))
            : (upcoming.length > 0 ? Object.keys(byDayUp).sort().map((k, di) => dayBlock(k, di)) : empty('이번 주 남은 고임팩트 없음'))}

          {/* 오늘 이미 발표된 것 — 기본은 접어둠 */}
          {todayPast.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setPastOpen(o => !o)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)' }}>
                오늘 지난 지표 {todayPast.length}건 {pastOpen ? '▴' : '▾'}
              </button>
              {pastOpen && <div style={{ opacity: .55, marginTop: 4 }}>{todayPast.map((e, i) => row(e, i))}</div>}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>발표 직전 신규 진입 자제 · 시간=내 기기 기준</div>
        </div>
      )}
    </div>
  );
}

function App() {
  const t = { accent: '코코아', density: 'regular', showRoutine: true };   // 고정 테마(꾸미기 패널 제거)
  const [redfolder, setRedfolder] = useState([]);
  // 창 폭 — 크기를 바꾸거나 회전해도 바로 따라오게
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
  useEffect(() => {
    let raf;
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setVw(window.innerWidth)); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    onResize();
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); cancelAnimationFrame(raf); };
  }, []);
  // 실시간 USD→KRW 환율 (캐시 우선 → 마운트/주기적 갱신). {rate, at}
  const [fx, setFx] = useState(() => { try { const c = JSON.parse(localStorage.getItem('tj_fx_krw') || 'null'); if (c && c.rate > 0) return c; } catch {} return { rate: 1350, at: null }; });
  const [entries, setEntries] = useState(() => {
    try { const raw = localStorage.getItem('tj_entries_v3'); if (raw !== null) { const c = JSON.parse(raw); if (Array.isArray(c)) return TJ.migrateEntries(c); } } catch {}
    return TJ.ENTRIES;   // 첫 방문만 샘플. 비웠으면([]) 빈 채로 유지
  });
  const [settings, setSettings] = useState(() => {
    try { return { ...TJ.SEED, ...TJ.migrateSettings(JSON.parse(localStorage.getItem('tj_settings_v2') || '{}')) }; } catch { return { ...TJ.SEED }; }
  });
  const [principles, setPrinciples] = useState(() => {
    const stored = localStorage.getItem('tj_principles_v2');
    const custom = localStorage.getItem('tj_principles_custom') === '1';
    return (stored && custom) ? stored : TJ.DEFAULT_PRINCIPLES;   // 직접 편집·저장한 경우만 유지, 아니면 최신 기본 문구
  });
  // 시장 모드 — 선물/스윙/장기 완전 분리(합산 '전체' 없음). 마지막 선택 기억.
  const [filter, setFilter] = useState(() => { let m = localStorage.getItem('tj_market'); if (m === '현물') m = '스윙'; return TJ.MARKETS.includes(m) ? m : '선물'; });
  useEffect(() => { localStorage.setItem('tj_market', filter); }, [filter]);
  // 화면 탭 — 홈 / 일지 / 일기 / 통계 (모바일 하단 탭바 · 넓은 화면 좌측 내비)
  const [tab, setTab] = useState(() => {
    const t = localStorage.getItem('tj_tab');
    return ['home', 'journal', 'diary', 'stats', 'assets'].includes(t) ? t : 'home';
  });
  useEffect(() => { localStorage.setItem('tj_tab', tab); window.scrollTo(0, 0); }, [tab]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');     // 일지 탭 구획 — 전체 / 보유중 / 청산
  const [period, setPeriod] = useState('all');     // 기본=전체 기간 (달이 바뀌면 텅 비어 보이던 문제)
  const [modal, setModal] = useState(null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [memos, setMemos] = useState(() => {
    try {
      const raw = localStorage.getItem('tj_memos_v2');
      const cur = raw ? JSON.parse(raw) : [];
      // 회고가 비어있고 아직 한 번도 시드 안 했으면 샘플 실수 주입(1회). 지우면 다시 안 생김.
      if ((!Array.isArray(cur) || cur.length === 0) && localStorage.getItem('tj_memos_seeded') !== '1') {
        localStorage.setItem('tj_memos_seeded', '1');
        return ((window.TJ && TJ.MEMOS) || []).slice();
      }
      return Array.isArray(cur) ? cur : [];
    } catch { return []; }
  });
  const [diary, setDiary] = useState(() => {
    // 예전 버전이 만든 빈 일기(칸만 눌러도 생기던 것) 한 번 청소
    try { const a = JSON.parse(localStorage.getItem('tj_diary_v1') || '[]'); return Array.isArray(a) ? a.filter(x => x && ((x.text && x.text.trim()) || x.mood)) : []; } catch { return []; }
  });
  /* ★ 전체 재산 포트폴리오(2026-08-09) — 시세가 없는 자산(현금·예금·부동산 등)은 금액을 직접 적는다.
     주식·코인은 위 '보유 현황'이 티커로 실시간 평가하므로 여기 또 적지 않는다. */
  const [assets, setAssets] = useState(() => { try { return JSON.parse(localStorage.getItem('tj_assets_v1') || '[]'); } catch { return []; } });
  const [holdings, setHoldings] = useState(() => { try { return JSON.parse(localStorage.getItem('tj_holdings_v1') || '[]'); } catch { return []; } });
  const [checks, setChecks] = useState(() => {
    try { const o = JSON.parse(localStorage.getItem('tj_checks_v2') || '{}'); if (o.d === todayStr()) return new Set(o.s || []); } catch {}
    return new Set();
  });
  const [flash, setFlash] = useState('');
  const flashTimer = useRef();
  // ── 클라우드 동기화 ──
  const [syncId, setSyncId] = useState(() => localStorage.getItem('tj_sync_id') || null);
  const [deleted, setDeleted] = useState(() => {   // 180일 지난 삭제기록(무덤)은 정리 — 무한 증식 방지
    try {
      const raw = JSON.parse(localStorage.getItem('tj_deleted_v1') || '{}');
      const cutoff = new Date(Date.now() - 180 * 864e5).toISOString();
      const n = {}; for (const k in raw) if (raw[k] >= cutoff) n[k] = raw[k]; return n;
    } catch { return {}; }
  });
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(''); // '' | syncing | saved | err
  const lastSentRef = useRef('');
  const debRef = useRef();

  // persist — 저장 실패(용량 초과 등)를 전부 잡아냄.
  // ★ 예전엔 일지에만 try/catch가 있어서, 공간이 차면 일기·설정·보유 저장이 예외로 멈춰버렸음
  const [saveErr, setSaveErr] = useState(false);
  const safeSet = (k, v) => {
    try { localStorage.setItem(k, v); setSaveErr(prev => (prev ? false : prev)); return true; }
    catch (e) { setSaveErr(true); return false; }
  };
  useEffect(() => { safeSet('tj_entries_v3', JSON.stringify(entries)); }, [entries]);
  useEffect(() => { safeSet('tj_settings_v2', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { safeSet('tj_principles_v2', principles); }, [principles]);
  useEffect(() => { safeSet('tj_checks_v2', JSON.stringify({ d: todayStr(), s: [...checks] })); }, [checks]);
  useEffect(() => { safeSet('tj_memos_v2', JSON.stringify(memos)); }, [memos]);
  useEffect(() => { safeSet('tj_diary_v1', JSON.stringify(diary)); }, [diary]);
  useEffect(() => { safeSet('tj_holdings_v1', JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { safeSet('tj_assets_v1', JSON.stringify(assets)); }, [assets]);
  useEffect(() => { safeSet('tj_deleted_v1', JSON.stringify(deleted)); }, [deleted]);

  // 사진 비우기 — 공간이 찼을 때 글은 남기고 사진만 지워 즉시 확보
  const purgePhotos = (days) => {
    const cut = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : null;
    const now = new Date().toISOString();
    let n = 0;
    setEntries(prev => prev.map(e => {
      const has = (e.photos || []).length;
      if (!has) return e;
      if (cut && (e.traded_at || '') >= cut) return e;
      n += has; return { ...e, photos: [], updated_at: now };
    }));
    setModal(null); doFlash(n ? `사진 ${n}장 정리됨 ✓` : '지울 사진이 없어요');
  };

  const gatherBlob = () => ({ v: 1, entries, settings, principles, memos, diary, holdings, assets, deleted });
  const applyBlob = (b) => {
    if (Array.isArray(b.entries)) setEntries(TJ.migrateEntries(b.entries));
    if (b.settings) setSettings(TJ.migrateSettings(b.settings));
    if (typeof b.principles === 'string' && b.principles.trim() && localStorage.getItem('tj_principles_custom') === '1') setPrinciples(b.principles); // 직접 편집본만 동기화 반영, 기본문구는 항상 최신 유지
    if (Array.isArray(b.memos)) setMemos(b.memos);
    if (Array.isArray(b.diary)) setDiary(b.diary.filter(x => x && ((x.text && x.text.trim()) || x.mood)));   // 빈 껍데기는 어떤 경로로도 안 들어오게
    if (Array.isArray(b.holdings)) setHoldings(b.holdings);
    if (Array.isArray(b.assets)) setAssets(b.assets);
    if (b.deleted) setDeleted(b.deleted);
  };

  // 동기화 코드가 잡히면(첫 로드/연결) → 클라우드와 병합 후 정착
  useEffect(() => {
    if (!syncId || !window.TJSync) { lastSentRef.current = ''; setSyncReady(true); return; }
    let cancelled = false; setSyncReady(false); setSyncStatus('syncing');
    (async () => {
      try {
        const cloud = await TJSync.pull(syncId);
        if (cancelled) return;
        const local = gatherBlob();
        let merged, needPush;
        if (cloud && cloud.data && Object.keys(cloud.data).length) {
          const cd = { ...cloud.data, entries: TJ.migrateEntries(cloud.data.entries), settings: TJ.migrateSettings(cloud.data.settings) }; // 옛 '현물' 이관
          merged = mergeBlobs(local, cd);
          needPush = JSON.stringify(merged) !== JSON.stringify({ v: 1, ...cd });
        } else { merged = mergeBlobs(local, {}); needPush = true; }
        applyBlob(merged);
        lastSentRef.current = JSON.stringify(merged);
        if (needPush) await TJSync.push(syncId, merged);
        if (!cancelled) setSyncStatus('saved');
      } catch (e) { if (!cancelled) setSyncStatus('err'); }
      finally { if (!cancelled) setSyncReady(true); }
    })();
    return () => { cancelled = true; };
  }, [syncId]);

  // 변경 시 클라우드로 밀어올리기(디바운스). 첫 병합 직후엔 내용 동일 → 건너뜀
  useEffect(() => {
    if (!syncId || !syncReady || !window.TJSync) return;
    const json = JSON.stringify(gatherBlob());
    if (json === lastSentRef.current) return;
    setSyncStatus('syncing');
    clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      try { await TJSync.push(syncId, JSON.parse(json)); lastSentRef.current = json; setSyncStatus('saved'); }
      catch (e) { setSyncStatus('err'); }
    }, 1400);
    return () => clearTimeout(debRef.current);
  }, [entries, settings, principles, memos, diary, holdings, assets, deleted, syncId, syncReady]);

  const enableSync = () => { const c = TJSync.genCode(); localStorage.setItem('tj_sync_id', c); setSyncId(c); doFlash('동기화 켜짐 ☁'); return c; };
  const joinSync = (raw) => { const c = TJSync.clean(raw); if (c.length < 12) { alert('코드가 너무 짧아요. 다시 확인해주세요.'); return false; } localStorage.setItem('tj_sync_id', c); setSyncId(c); doFlash('연결 중… ☁'); return true; };
  const disableSync = () => { localStorage.removeItem('tj_sync_id'); setSyncId(null); lastSentRef.current = ''; setSyncStatus(''); doFlash('이 기기 동기화 꺼짐'); };
  // 레드폴더(ForexFactory 고임팩트) — 같은 주소 redfolder.json (GH Action이 갱신)
  useEffect(() => { fetch('redfolder.json?t=' + Date.now()).then(r => r.ok ? r.json() : []).then(j => { if (Array.isArray(j)) setRedfolder(j); }).catch(() => {}); }, []);

  // 실시간 환율 — 마운트 즉시 + 10분마다 갱신. 성공 시 localStorage 캐시(오프라인 대비)
  useEffect(() => {
    let alive = true;
    const load = async () => { const r = await fetchKrwRate(); if (alive && r) { const next = { rate: r, at: new Date().toISOString() }; setFx(next); localStorage.setItem('tj_fx_krw', JSON.stringify(next)); } };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // 보유중 일지에 현재가·평가손익을 보여주려면 시세가 필요 — 앱 차원에서 한 번 받아 카드에 전달
  const holdTickers = useMemo(() => {
    const s = new Set();
    entries.forEach(e => { if (e.result === 'holding' && e.ticker) s.add(e.ticker.toUpperCase()); });
    holdings.forEach(h => { if (h.ticker) s.add(h.ticker.toUpperCase()); });
    return [...s].sort().join(',');
  }, [entries, holdings]);
  /* ★ 2026-08-09 사용자 결정(2차): 실시간 시세는 **장기 계좌에서만** 쓴다.
     · 스윙 = 자주 사고파는 계좌. 1분마다 시세가 바뀌면 평가손익·잔고가 볼 때마다 달라져
       '기록'이라는 성질과 안 맞았다 → 내가 적은 값만 쓴다.
     · 장기 = 오래 들고 가는 계좌. 지금 얼마인지가 실제로 궁금한 곳이라 실시간을 되살렸다.
     · 선물 = 종목 개념이 없어 해당 없음. */
  const [quotes, setQuotes] = useState({});
  const [assetAsOf, setAssetAsOf] = useState('');
  // 시세를 물어볼 심볼 = 장기 계좌 종목 + 자산 탭에 심볼을 적어둔 자산
  const liveSyms = useMemo(() => {
    const s = new Set();
    entries.forEach(e => { if (e.market === '장기' && e.result === 'holding' && e.ticker) s.add(e.ticker.toUpperCase()); });
    holdings.forEach(h => { if (h.account === '장기' && h.ticker) s.add(h.ticker.toUpperCase()); });
    assets.forEach(a => { if (a.symbol) s.add(String(a.symbol).toUpperCase()); });
    return [...s].sort().join(',');
  }, [entries, holdings, assets]);
  const refreshAssetQuotes = React.useCallback(() => {
    if (!liveSyms || !window.TJPortfolio) return;
    const syms = liveSyms.split(',').map(t => TJPortfolio.yahooSym({ ticker: t, market: /^\d{6}$/.test(t) ? 'KR' : 'US' })).filter(Boolean);
    TJPortfolio.quotes(syms).then(j => {
      if (j && j.quotes) {
        // 야후 심볼(005930.KS)로 온 값을 원래 심볼(005930)로도 찾을 수 있게 같이 넣는다
        const add = {};
        Object.keys(j.quotes).forEach(k => { add[k] = j.quotes[k]; add[k.replace(/\.[A-Z]+$/, '')] = j.quotes[k]; });
        setQuotes(q => ({ ...q, ...add }));
        setAssetAsOf(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
      }
    }).catch(() => {});
  }, [liveSyms]);
  useEffect(() => {
    if (!liveSyms) return;
    const load = () => { if (!document.hidden) refreshAssetQuotes(); };
    load();
    const id = setInterval(load, 60 * 1000);
    document.addEventListener('visibilitychange', load);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', load); };
  }, [liveSyms, refreshAssetQuotes]);

  // 티커 → 시세. **장기 계좌일 때만** 준다(스윙·선물은 늘 null).
  const quoteOf = (ticker, market) => {
    if (market !== '장기') return null;
    const k = (ticker || '').toUpperCase(); if (!k) return null;
    return quotes[k] || quotes[k + '.KS'] || null;
  };
  // 계좌별 보유 평가금액은 더 이상 내지 않는다 — 실시간 시세를 안 쓰기로 했다(2026-08-09).
  // 시드 추천에 쓰던 자리는 빈 값을 준다.
  const holdValue = {};



  // 원화로 들어간 미국주식 '보유중' 기록을 달러로 정리 — 실시간 환율 잡히면 1회만
  useEffect(() => {
    if (!fx.at || localStorage.getItem('tj_usd_fix_v1') === '1') return;
    const rate = fx.rate; let n = 0;
    setEntries(prev => prev.map(e => {
      const t = (e.ticker || '').toUpperCase();
      const isUS = /^[A-Z][A-Z.\-]*$/.test(t);                     // 영문 티커 = 미국주식 (숫자 6자리는 국내)
      if (e.result !== 'holding' || e.currency !== '₩' || !isUS) return e;
      n++;
      return { ...e, currency: '$', entry_price: e.entry_price != null ? e.entry_price / rate : null, updated_at: new Date().toISOString() };
    }));
    localStorage.setItem('tj_usd_fix_v1', '1');
    if (n) doFlash(n + '개 종목을 달러로 바꿨어요 ✓');
  }, [fx.at]);

  // 일기 — 날짜별 한 편, upsert(있으면 수정 / 없으면 생성)
  // 일기 삭제 — 날짜가 열쇠라 무덤도 날짜로 남김(동기화로 되살아나지 않게)
  const removeDiary = (date) => {
    setDiary(prev => prev.filter(x => x.date !== date));
    setDeleted(p => ({ ...p, ['diary:' + date]: new Date().toISOString() }));
  };
  const upsertDiary = (date, patch) => {
    setDiary(prev => {
      const now = new Date().toISOString();
      if (patch === null) return prev.filter(x => x.date !== date);   // 빈 일기는 남기지 않음(지웠을 때도 정리)
      const i = prev.findIndex(x => x.date === date);
      if (i >= 0) { const n = prev.slice(); n[i] = { ...n[i], ...patch, date, updated_at: now }; return n; }
      return [...prev, { date, mood: null, text: '', ...patch, updated_at: now }];
    });
  };

  // 평단 = 화면의 평단, 없으면 "매수금액 ÷ 수량"으로 역산 (스크린샷이 준 금액을 버리지 않음)
  const avgFrom = (h) => {
    if (h.avgPrice != null && h.avgPrice !== '') return Number(h.avgPrice);
    const amt = Number(h.amount), q = Number(h.qty);
    if (h.amountKind === 'buy' && amt > 0 && q > 0) return amt / q;
    return null;
  };
  // 보유종목 — 스크린샷 추출 결과를 계좌(스윙/장기)에 추가 / 개별 삭제 / 계좌 비우기
  // 스크린샷을 다시 올려도 중복이 안 생기게 — 같은 계좌·같은 티커면 갱신(추가매수·수량변경), 없으면 추가
  const addHoldings = (account, list) => {
    const now = new Date().toISOString();
    const rows = (list || []).map(h => ({
      account, name: h.name || h.ticker || '종목', ticker: (h.ticker || '').toUpperCase(),
      qty: Number(h.qty) || 0, avgPrice: avgFrom(h),
      amount: (h.amount != null && h.amount !== '') ? Number(h.amount) : null,      // 화면에 보인 총 금액(1주당 아님)
      amountKind: h.amountKind === 'buy' ? 'buy' : (h.amount != null ? 'eval' : null),
      currency: h.currency === 'KRW' ? 'KRW' : 'USD', market: h.market || 'US', updated_at: now,
    }));
    let upd = 0, add = 0;
    setHoldings(prev => {
      const next = prev.slice();
      rows.forEach(r => {
        const i = next.findIndex(h => h.account === account && (h.ticker || '').toUpperCase() === r.ticker);
        if (i >= 0) {
          // 새 스크린샷에 평단이 없으면(토스 평가금 화면 등) 기존 평단을 지우지 않고 살림
          next[i] = { ...next[i], ...r, id: next[i].id, avgPrice: r.avgPrice != null ? r.avgPrice : next[i].avgPrice };
          upd++;
        } else { next.push({ ...r, id: 'h-' + Math.random().toString(36).slice(2, 10) }); add++; }
      });
      return next;
    });
    if (upd || add) doFlash(`보유 ${add ? add + '개 추가' : ''}${upd && add ? ' · ' : ''}${upd ? upd + '개 갱신' : ''} ✓`);
  };
  const removeHolding = (id) => { setHoldings(prev => prev.filter(h => h.id !== id)); setDeleted(p => ({ ...p, [id]: new Date().toISOString() })); };
  // 스크린샷 보유종목 → 일지에도 '보유중' 항목으로 추가 (수동 새 일지처럼: 종목·수량·진입가만)
  const addPositions = (account, list) => {
    const now = new Date().toISOString(); const today = todayStr();
    const rows = (list || []).map(h => {
      const sym = (h.ticker || '').toUpperCase(); const nm = (h.name || '').trim();
      // 미국주식인데 계좌가 원화로 보여준 경우(나무 등) → 달러로 환산해 저장. 진짜 국내주식만 ₩ 유지.
      const isKR = h.market === 'KR' || /^\d{6}$/.test(sym);
      const wonShown = h.currency === 'KRW';
      const px0 = (h.avgPrice != null && h.avgPrice !== '') ? Number(h.avgPrice) : null;
      const px = (px0 != null && wonShown && !isKR) ? px0 / TJ.rateKRW() : px0;
      return {
        id: 'pos-' + Math.random().toString(36).slice(2, 10),
        market: account, traded_at: today, direction: 'long', result: 'holding',
        ticker: sym || nm || '종목',
        shares: Number(h.qty) || 0,
        entry_price: px,
        avg_est: h.avgEst === true ? true : undefined,   // 평단을 시세로 자동채움 = 추정치(카드에 ? 표시)
        currency: isKR && wonShown ? '₩' : '$',
        setups: [], errors: [], photos: [],
        body: (nm && nm.toUpperCase() !== sym) ? nm : '',      // 티커는 카드 머리에 이미 나옴 — 이름만(같으면 비움)
        created_at: now, updated_at: now,
      };
    });
    // 같은 계좌에 그 종목의 '보유중' 일지가 이미 있으면 새로 만들지 않고 수량·평단만 갱신
    if (!rows.length) return;
    setEntries(prev => {
      const next = prev.slice(); const fresh = [];
      rows.forEach(r => {
        const i = next.findIndex(e => e.result === 'holding' && e.market === r.market && (e.ticker || '').toUpperCase() === r.ticker);
        if (i >= 0) next[i] = { ...next[i], shares: r.shares, entry_price: r.entry_price != null ? r.entry_price : next[i].entry_price, currency: r.currency, updated_at: now };
        else fresh.push(r);
      });
      return [...fresh, ...next];
    });
  };
  // ── 매도(청산) — 수량과 판 가격만 넣으면 손익·수익률 자동. 일부만 팔면 나머지는 보유중으로 남음 ──
  const sellPosition = (id, { qty, price, date, note }) => {
    const now = new Date().toISOString();
    let soldTicker = null, soldMarket = null, soldQty = 0;
    setEntries(prev => {
      const i = prev.findIndex(e => e.id === id); if (i < 0) return prev;
      const e = prev[i];
      const total = Number(e.shares) || 0;
      const sold = Math.min(Number(qty) || 0, total || Number(qty) || 0);
      const px = Number(price);
      if (!(sold > 0) || isNaN(px)) return prev;
      soldTicker = (e.ticker || '').toUpperCase(); soldMarket = e.market; soldQty = sold;
      const buy = e.entry_price != null ? Number(e.entry_price) : null;
      const cost = buy != null ? buy * sold : null;
      const pnl = buy != null ? (px - buy) * sold * (e.direction === 'short' ? -1 : 1) : null;
      const retPct = (cost && cost !== 0 && pnl != null) ? Math.round((pnl / Math.abs(cost)) * 1000) / 10 : null;
      const result = pnl == null ? 'be' : (pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'be');
      const closed = {
        ...e, id: 'sell-' + Math.random().toString(36).slice(2, 10),
        shares: sold, exit_price: px, traded_at: date || todayStr(),
        result, pnl, return_pct: retPct,
        body: (note && note.trim()) ? note.trim() : (e.body || ''),
        created_at: now, updated_at: now,
      };
      const next = prev.slice();
      if (sold >= total) next[i] = closed;                                   // 전량 → 그 기록을 청산으로 전환
      else { next[i] = { ...e, shares: total - sold, updated_at: now }; next.unshift(closed); }  // 일부 → 남은 건 보유중
      return next;
    });
    // 보유현황 수량도 같이 줄임 (0이 되면 제거)
    if (soldTicker) {
      const cur = holdings.find(h => h.account === soldMarket && (h.ticker || '').toUpperCase() === soldTicker);
      if (cur) {
        const left = (Number(cur.qty) || 0) - soldQty;
        if (left > 0) setHoldings(prev => prev.map(h => (h.id === cur.id ? { ...h, qty: left, updated_at: now } : h)));
        else {
          setHoldings(prev => prev.filter(h => h.id !== cur.id));
          setDeleted(p => ({ ...p, [cur.id]: now }));          // 다 팔았으면 보유목록에서 제거(동기화에도 반영)
        }
      }
    }
    setModal(null); doFlash('청산 기록됨 ✓');
  };

  /* 추가 매수(분할매수) — 매도와 짝. 수량을 더하고 평단을 가중평균으로 다시 낸다.
     ★ 사용자 요청 2026-08-09: "분할매도는 가능한데 분할매수는 또 안 되네".
     lots 에 산 기록을 쌓아 둔다 — 언제 얼마에 얼마나 담았는지가 나중에 판단 근거가 된다. */
  const buyMore = (id, { qty, price, date, note }) => {
    const now = new Date().toISOString();
    let tk = null, mk = null, addQty = 0;
    setEntries(prev => {
      const i = prev.findIndex(e => e.id === id); if (i < 0) return prev;
      const e = prev[i];
      const add = Number(qty) || 0, px = Number(price);
      if (!(add > 0) || isNaN(px)) return prev;
      const have = Number(e.shares) || 0;
      const buy0 = e.entry_price != null ? Number(e.entry_price) : null;
      const totalQty = have + add;
      const avg = buy0 != null && totalQty > 0 ? (buy0 * have + px * add) / totalQty : px;
      tk = (e.ticker || '').toUpperCase(); mk = e.market; addQty = add;
      // 첫 추가매수면 기존 보유분도 한 칸(lot)으로 남겨 둔다 — 안 그러면 최초 매수 기록이 사라진다
      const lots = e.lots && e.lots.length ? e.lots.slice()
        : (have > 0 ? [{ qty: have, price: buy0, date: e.traded_at || '', note: '최초 매수' }] : []);
      lots.push({ qty: add, price: px, date: date || todayStr(), note: (note || '').trim() });
      const next = prev.slice();
      next[i] = {
        ...e, shares: Math.round(totalQty * 100000) / 100000,
        entry_price: Math.round(avg * 100000) / 100000,
        lots, updated_at: now,
        body: (note && note.trim())
          ? ((e.body || '') + (e.body ? String.fromCharCode(10) : '') + date + ' 추가매수 ' + add + '주 @' + px + ' — ' + note.trim())
          : (e.body || ''),
      };
      return next;
    });
    // 보유현황 수량도 같이 늘림(없으면 새로 만들지 않는다 — 보유현황은 사용자가 따로 관리)
    if (tk) {
      const cur = holdings.find(h => h.account === mk && (h.ticker || '').toUpperCase() === tk);
      if (cur) setHoldings(prev => prev.map(h => (h.id === cur.id ? { ...h, qty: (Number(h.qty) || 0) + addQty, updated_at: now } : h)));
    }
    setModal(null); doFlash('추가 매수 기록됨 ✓');
  };

  /* 전체 재산 자산 한 건 저장/삭제 — 보유종목과 같은 규칙(id·updated_at·deleted)으로 동기화된다 */
  const saveAsset = (a) => {
    const now = new Date().toISOString();
    if (a.id) setAssets(prev => prev.map(x => (x.id === a.id ? { ...x, ...a, updated_at: now } : x)));
    else setAssets(prev => [{ ...a, id: 'as-' + Math.random().toString(36).slice(2, 10), created_at: now, updated_at: now }, ...prev]);
  };
  const removeAsset = (id) => {
    const now = new Date().toISOString();
    setAssets(prev => prev.filter(x => x.id !== id));
    setDeleted(p => ({ ...p, [id]: now }));
  };

  const clearHoldings = (account) => {
    const rm = holdings.filter(h => h.account === account).map(h => h.id);
    if (!rm.length) return;
    const now = new Date().toISOString();
    setHoldings(prev => prev.filter(h => h.account !== account));
    setDeleted(p => { const n = { ...p }; rm.forEach(id => n[id] = now); return n; });
  };

  const addMemo = (text) => {
    const now = new Date();
    const at = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMemos(prev => [{ id: 'm-' + Date.now(), at, text }, ...prev]);
    doFlash('메모 저장됨 ✓');
  };
  const addMemoOn = (dateStr, text) => {
    const now = new Date();
    const at = `${dateStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMemos(prev => [{ id: 'm-' + Date.now(), at, text }, ...prev]);
    doFlash('메모 저장됨 ✓');
  };
  const removeMemo = (id) => { setMemos(prev => prev.filter(m => m.id !== id)); setDeleted(p => ({ ...p, [id]: new Date().toISOString() })); };

  // apply tweaks → CSS vars
  useEffect(() => {
    const a = ACCENTS[t.accent] || ACCENTS['코코아'];
    const r = document.documentElement.style;
    r.setProperty('--violet', a.v); r.setProperty('--violet-600', a.d);
    r.setProperty('--violet-50', a.s50); r.setProperty('--violet-100', a.s100);
    r.setProperty('--futures', a.v); r.setProperty('--futures-soft', a.s50);
    const den = DENSITY[t.density] || DENSITY.regular;
    r.setProperty('--gap', den.gap); r.setProperty('--card-pad', den.pad);
    document.body.style.fontSize = den.fs;
  }, [t.accent, t.density]);

  const doFlash = (msg) => { setFlash(msg); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(''), 2200); };

  // entry ops
  const saveEntry = (e) => {
    e = { ...e, updated_at: new Date().toISOString() }; // 동기화 병합 시 최신 편집 우선용
    setEntries(prev => {
      const i = prev.findIndex(x => x.id === e.id);
      const next = i >= 0 ? prev.map(x => x.id === e.id ? e : x) : [e, ...prev];
      next.sort((a, b) => (b.traded_at || '').localeCompare(a.traded_at || '') || (b.created_at || '').localeCompare(a.created_at || ''));
      return next;
    });
    setModal(null); doFlash('저장됨 ✓');
  };
  const deleteEntry = (id) => { if (confirm('이 일지를 삭제할까요?')) { setEntries(prev => prev.filter(x => x.id !== id)); setDeleted(p => ({ ...p, [id]: new Date().toISOString() })); doFlash('삭제됨'); } };
  const importEntries = (arr) => {
    if (!Array.isArray(arr) || !arr.length) { alert('가져올 일지가 없어요.'); return; }
    if (!confirm(`${arr.length}건을 가져옵니다. 같은 ID는 덮어써요. 계속할까요?`)) return;
    const ts = new Date().toISOString();
    const ids = [];
    setEntries(prev => {
      const map = new Map(prev.map(x => [x.id, x]));
      for (const e of arr) { if (!e.id) e.id = 'imp-' + Math.random().toString(36).slice(2); if (!Array.isArray(e.photos)) e.photos = []; e.updated_at = ts; ids.push(e.id); map.set(e.id, e); }
      return [...map.values()].sort((a, b) => (b.traded_at || '').localeCompare(a.traded_at || ''));
    });
    setDeleted(prev => { const n = { ...prev }; ids.forEach(id => { delete n[id]; }); return n; }); // 복원 항목은 무덤에서 해제 — 동기화로 다시 사라지지 않도록
    setModal(null); doFlash('복원 완료 ✓');
  };
  // 전체 백업(일지+회고+일기+설정) 복원 — 병합(최신 우선). 옛 형식(배열)은 일지만 복원.
  const importBlob = (obj) => {
    if (Array.isArray(obj)) { importEntries(obj); return; }
    if (!obj || typeof obj !== 'object') { alert('가져올 데이터가 없어요.'); return; }
    const ec = Array.isArray(obj.entries) ? obj.entries.length : 0;
    if (!confirm(`백업을 복원합니다.\n일지 ${ec}건 + 회고·일기·설정을 현재 데이터에 병합해요 (같은 건 최신 우선). 계속할까요?`)) return;
    const merged = mergeBlobs(gatherBlob(), { entries: obj.entries, memos: obj.memos, diary: obj.diary, holdings: obj.holdings, assets: obj.assets, settings: obj.settings, principles: obj.principles, deleted: obj.deleted });
    applyBlob(merged);
    setModal(null); doFlash('백업 복원됨 ✓');
  };
  // 초기화 전 안전용 — 현재 일지를 JSON 파일로 자동 저장
  const downloadBackup = () => {
    if (!entries.length) return;
    try {
      const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...gatherBlob() }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `거래일지_백업_${todayStr()}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {}
  };
  // 시장 → 시드/입금 키 매핑 (계좌별 초기화용)
  const SEED_KEYS = { '선물': ['futuresSeed', 'futuresDeposit'], '스윙': ['swingSeed', 'swingDeposit'], '장기': ['longSeed', 'longDeposit'] };
  // ① 현재 계좌만 초기화 — 그 시장 일지·시드만 비우고 나머지 두 계좌는 유지
  const resetMarket = (m) => {
    const cnt = entries.filter(e => e.market === m).length;
    if (!confirm(`${m} 계좌만 초기화합니다.\n${m} 일지 ${cnt}건과 ${m} 시드를 비웁니다. 다른 두 계좌는 그대로예요.\n안전을 위해 전체 백업 파일이 자동 저장됩니다. 계속할까요?`)) return;
    downloadBackup();
    const ts = new Date().toISOString();
    setDeleted(prev => { const n = { ...prev }; entries.forEach(e => { if (e.market === m) n[e.id] = ts; }); return n; }); // 다른 기기에서도 그 계좌만 비워지도록
    setEntries(prev => prev.filter(e => e.market !== m));
    const [seedK, depK] = SEED_KEYS[m] || [];
    if (seedK) setSettings(prev => ({ ...prev, [seedK]: null, [depK]: 0 }));
    setModal(null); doFlash(`${m} 계좌 초기화됨 ✓`);
  };
  // ② 전체 비우기 — 3계좌 전부 빈 일지로
  const clearAll = () => {
    if (!confirm('선물·스윙·장기 3계좌 전부와 모든 시드를 비우고 빈 일지로 시작할까요?\n안전을 위해 백업 파일이 자동 저장됩니다. 계속할까요?')) return;
    downloadBackup();
    const ts = new Date().toISOString();
    setDeleted(prev => { const n = { ...prev }; entries.forEach(e => { n[e.id] = ts; }); return n; }); // 동기화 시 다른 기기에서도 비워지도록
    setEntries([]); setSettings({ futuresSeed: null, swingSeed: null, longSeed: null, futuresDeposit: 0, swingDeposit: 0, longDeposit: 0 });
    setModal(null); doFlash('전체 초기화됨 — 새로 시작 ✓');
  };
  // ③ 예시로 되돌리기 — 앱 첫 상태(예시 28건 + 기본 시드)로 복원
  const restoreSamples = () => {
    if (!confirm('지금 일지를 모두 지우고 앱 처음 상태(예시 거래 28건 + 기본 시드)로 되돌립니다.\n안전을 위해 백업 파일이 자동 저장됩니다. 계속할까요?')) return;
    downloadBackup();
    const ts = new Date().toISOString();
    const sampleIds = new Set(TJ.ENTRIES.map(e => e.id));
    setDeleted(prev => {
      const n = { ...prev };
      entries.forEach(e => { if (!sampleIds.has(e.id)) n[e.id] = ts; }); // 지금 실제 일지 → 무덤(다른 기기도 제거)
      sampleIds.forEach(id => { delete n[id]; });                         // 예시 → 무덤 해제(다시 살아나도록)
      return n;
    });
    setEntries(TJ.ENTRIES.map(e => ({ ...e, updated_at: ts })));          // 무덤보다 최신으로 스탬프
    setSettings({ ...TJ.SEED });
    setModal(null); doFlash('예시로 되돌림 ✓');
  };

  // filtered list
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ym = todayStr().slice(0, 7);
    const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    let l = entries.filter(e => e.market === filter);
    if (q) l = l.filter(e => ((e.body || '') + ' ' + (e.ticker || '') + ' ' + (e.setups || []).join(' ') + ' ' + (e.errors || []).join(' ')).toLowerCase().includes(q));
    if (period === 'month') l = l.filter(e => (e.traded_at || '').startsWith(ym));
    else if (period === '30d') l = l.filter(e => (e.traded_at || '') >= d30);
    return l;
  }, [entries, filter, search, period]);
  const allOfMarket = useMemo(() => entries.filter(e => e.market === filter), [entries, filter]);
  // 보유중 / 청산 구획 (일지 탭)
  const held = list.filter(e => e.result === 'holding');
  const closed = list.filter(e => e.result !== 'holding');
  const shownList = status === 'held' ? held : status === 'closed' ? closed : list;
  // 보유중 평가손익 합계 — 시세 있는 것만

  TJ.setCurrency(settings.currency); TJ.setRate(fx.rate);   // 전역 통화($/₩)+실시간환율 — 렌더 전 동기 반영(자식 포매터가 읽음)
  const balF = TJStats.balanceOf(entries, '선물', settings.futuresSeed, settings.futuresDeposit);
  // 스윙·장기는 자금이 보유중에 묶여 있어 미실현 평가손익까지 잔고에 반영 (시드는 사용자가 직접 입력)
  const balW = TJStats.balanceOf(entries, '스윙', settings.swingSeed, settings.swingDeposit);
  const balL = TJStats.balanceOf(entries, '장기', settings.longSeed, settings.longDeposit, { quoteOf: (tk) => quoteOf(tk, '장기') });

  /* ★ 일지 ↔ 자산을 유기적으로 잇는다(2026-08-09 사용자 결정).
       · 장기 = 오래 들고 갈 종목이라 **그 자체가 재산**이다 → 보유종목을 자산 목록에 자동으로 얹는다.
       · 스윙 = 사고파는 계좌라 종목은 곧 사라진다 → 종목이 아니라 **번 돈(실현손익)** 만 얹는다.
     한 벌만 적는다 — 자산 탭에 베껴 넣지 않고 일지·보유현황을 그대로 비춰 보여준다.
     그래서 일지에서 고치면 자산도 곧바로 따라 움직이고, 두 곳이 어긋날 일이 없다. */
  const autoAssets = useMemo(() => {
    const out = [];
    const seen = new Set();
    const isCoin = (s) => /BTC|ETH|XRP|SOL|DOGE|-USD$|USDT/.test(String(s || '').toUpperCase());
    // ① 장기 보유종목 — 보유현황이 1순위, 거기 없는 건 일지(보유중)로 채운다
    holdings.filter(h => h.account === '장기' && h.ticker).forEach(h => {
      const k = String(h.ticker).toUpperCase(); if (seen.has(k)) return; seen.add(k);
      out.push({ id: 'auto-h-' + h.id, auto: '장기', name: h.name || k, symbol: k,
                 cat: isCoin(k) ? '암호화폐' : '주식_ETF', qty: Number(h.qty) || 0,
                 buyPrice: Number(h.avgPrice) || 0, currency: h.currency === 'USD' ? '$' : (h.currency || '₩') });
    });
    entries.filter(e => e.market === '장기' && e.result === 'holding' && e.ticker).forEach(e => {
      const k = String(e.ticker).toUpperCase(); if (seen.has(k)) return; seen.add(k);
      out.push({ id: 'auto-e-' + e.id, auto: '장기', name: e.ticker, symbol: k,
                 cat: isCoin(k) ? '암호화폐' : '주식_ETF', qty: Number(e.shares) || 0,
                 buyPrice: Number(e.entry_price) || 0, currency: e.currency || '₩' });
    });
    // ② 스윙 — 번 돈만(기본). 계좌째 넣고 싶으면 설정에서 바꾼다.
    const swingWhole = settings.swingInAssets === 'account';
    const amt = swingWhole ? balW.bal : balW.realized;
    if (amt) {
      out.push({ id: 'auto-swing', auto: '스윙', name: swingWhole ? '스윙 계좌' : '스윙에서 번 돈',
                 cat: '현금_예금', qty: 0, buyPrice: 0, amount: amt, currency: '$',
                 note: swingWhole ? '시드 + 실현손익' : '실현손익 누계 (시드는 뺀 값)' });
    }
    return out;
  }, [holdings, entries, balW.bal, balW.realized, settings.swingInAssets]);

  // 홈과 자산 탭이 **같은 총자산**을 보여야 한다 — 계산은 한 군데(assetsTotal)에서만 한다.
  const netWorth = useMemo(() => (window.assetsTotal
    ? assetsTotal(autoAssets.concat(assets), quotes)
    : { total: 0, cost: 0, pl: 0, count: 0 }), [autoAssets, assets, quotes]);
  const netWorthCard = (
    <NetWorthCard total={netWorth.total} pl={netWorth.pl} cost={netWorth.cost}
      count={netWorth.count} autoCount={autoAssets.length}
      onOpen={() => setTab('assets')} onQuickAdd={saveAsset} />
  );
  // 선물/스윙/장기 완전 분리 — 활성 시장만 표시(합산 없음)
  const bal = filter === '스윙' ? balW : filter === '장기' ? balL : balF;

  const heroStats = useMemo(() => TJStats.computeStats(entries, filter), [entries, filter, fx.rate]);   // 환율 바뀌면 ₩거래 환산 재계산

  // routine checklist render
  const toggleCheck = (i) => setChecks(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const checklist = useMemo(() => principles.split('\n').map((line, i) => ({ i, line })), [principles]);
  const checkItems = checklist.filter(x => x.line.trim().startsWith('☐'));
  const doneCount = checkItems.filter(x => checks.has(x.i)).length;

  // 창 크기를 계속 지켜봄 — 예전엔 첫 렌더 때 한 번만 재서, 창을 키워도 모바일 화면에 머물렀음
  const isMobile = vw <= 680;
  const wide = vw >= 900;        // 좌측 내비 + 넓은 배치 (윈도우 배율 125%면 1366화면이 ~1090px라 1000은 너무 높았음)
  const threeCol = vw >= 1180;   // 홈 오른쪽 열(일기·루틴·회고)까지 세 칸
  const routineProps = { items: checkItems, checks, done: doneCount, total: checkItems.length, toggle: toggleCheck, principles, onEdit: () => setModal({ type: 'principles' }) };

  // ── 리스크 규칙 감시 — 원칙에 적힌 "일일 −2R 종료 / 3연패 종료"를 앱이 실제로 지켜봄 ──
  const riskAlert = useMemo(() => {
    const stopR = settings.dailyStopR != null ? Number(settings.dailyStopR) : -2;
    const streakN = settings.lossStreakStop != null ? Number(settings.lossStreakStop) : 3;
    const mine = entries.filter(e => e.market === filter && e.result && e.result !== 'holding');
    const today = todayStr();
    const todayList = mine.filter(e => e.traded_at === today);
    const dayR = todayList.reduce((a, e) => a + (TJStats.num(e.realized_r) || 0), 0);
    const dayPnl = todayList.reduce((a, e) => a + (TJStats.num(e.pnl) || 0), 0);
    // 연패 — 최근 거래부터 거슬러 손절이 몇 번 연속인지
    const recent = mine.slice().sort((a, b) => (b.traded_at || '').localeCompare(a.traded_at || '') || (b.created_at || '').localeCompare(a.created_at || ''));
    let streak = 0;
    for (const e of recent) { if (e.result === 'loss') streak++; else break; }
    const hitR = todayList.some(e => TJStats.num(e.realized_r) != null) && dayR <= stopR;
    const hitStreak = streak >= streakN;
    if (!hitR && !hitStreak) return null;
    return {
      hitR, hitStreak, dayR: Math.round(dayR * 100) / 100, dayPnl, streak, stopR, streakN,
      msg: hitR && hitStreak ? `오늘 ${Math.round(dayR * 100) / 100}R · ${streak}연패` : hitR ? `오늘 ${Math.round(dayR * 100) / 100}R (한도 ${stopR}R)` : `${streak}연패`,
    };
  }, [entries, filter, settings.dailyStopR, settings.lossStreakStop]);
  const [riskHid, setRiskHid] = useState(() => localStorage.getItem('tj_risk_hidden') === todayStr());
  const hideRisk = () => { localStorage.setItem('tj_risk_hidden', todayStr()); setRiskHid(true); };

  // 저장이 막혔을 때 — 조용히 지나가면 기록이 통째로 사라진 줄 모름
  const saveBanner = saveErr && (
    <div style={{ background: 'var(--loss)', color: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>저장이 안 되고 있어요 — 저장 공간이 찼습니다</div>
        <div style={{ fontSize: 11.5, opacity: .85, marginTop: 2 }}>사진이 공간을 거의 다 씁니다. 사진을 정리하면 바로 다시 저장됩니다.</div>
      </div>
      <button onClick={() => setModal({ type: 'menu' })} style={{ fontSize: 12, fontWeight: 800, color: 'var(--loss)', background: '#fff', borderRadius: 8, padding: '7px 11px', flexShrink: 0 }}>정리하기</button>
    </div>
  );

  const riskBanner = riskAlert && !riskHid && (
    <div style={{ background: 'var(--ink)', color: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⛔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>오늘은 여기까지 — {riskAlert.msg}</div>
        <div style={{ fontSize: 11.5, opacity: .75, marginTop: 2 }}>
          {riskAlert.hitR ? `일일 ${riskAlert.stopR}R 한도에 닿았습니다. ` : ''}{riskAlert.hitStreak ? `${riskAlert.streakN}연패 규칙. ` : ''}화면을 끄는 것도 매매입니다.
        </div>
      </div>
      <button onClick={hideRisk} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', opacity: .7, flexShrink: 0 }}>닫기</button>
    </div>
  );

  const TABS = [['home', '◧', '홈'], ['journal', '☰', '일지'], ['assets', '◈', '자산'], ['diary', '✎', '일기'], ['stats', '◍', '통계']];
  const MKT_C = { '선물': 'var(--futures)', '스윙': 'var(--swing)', '장기': 'var(--long)' };
  const balOf = m => (m === '스윙' ? balW : m === '장기' ? balL : balF);

  /* 계좌 세그먼트 — 모든 숫자의 전제라 항상 맨 위 */
  const acctSeg = (
    <div style={{ display: 'flex', background: 'var(--bg-tint)', borderRadius: 12, padding: 3, gap: 2, width: '100%' }}>
      {TJ.MARKETS.map(m => {
        const on = filter === m;
        return (
          <button key={m} onClick={() => setFilter(m)} style={{
            flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 9,
            background: on ? MKT_C[m] : 'transparent', color: on ? '#fff' : 'var(--ink-3)',
            fontSize: 13.5, fontWeight: on ? 700 : 600, transition: 'all .14s',
          }}>{m}</button>
        );
      })}
    </div>
  );

  const editorFor = id => setModal({ type: 'editor', entry: entries.find(x => x.id === id) });
  const cardsOf = (arr) => (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(330px, 1fr))', gap: 'var(--gap)', alignItems: 'start' }}>
      {arr.map((e, idx) => <EntryCard key={e.id} e={e} index={idx + 1} quote={quoteOf(e.ticker, e.market)} onEdit={editorFor} onDelete={deleteEntry} onSell={id => setModal({ type: 'sell', entry: entries.find(x => x.id === id) })} onBuyMore={id => setModal({ type: 'buymore', entry: entries.find(x => x.id === id) })} />)}
    </div>
  );

  /* ── 탭별 본문 ── */
  const recent = useMemo(() => allOfMarket.slice().sort((a, b) => (b.traded_at || '').localeCompare(a.traded_at || '')), [allOfMarket]);
  const recentBlock = recent.length > 0 && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 2px 0' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>최근 일지</span>
        <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-4)' }}>{recent.length}건</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setTab('journal')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--violet-600)' }}>전체 보기 ›</button>
      </div>
      {cardsOf(recent.slice(0, threeCol ? 4 : 3))}
    </>
  );

  const homeView = threeCol ? (
    /* 넓은 화면 — 중앙: 성과·일지 / 우: 일기·루틴·회고 (팝업 없이 한 화면) */
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--gap)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', minWidth: 0 }}>
        {saveBanner}
        {riskBanner}
        {netWorthCard}
        <BalanceBand market={filter} bal={bal} onSeed={() => setModal({ type: 'settings' })} />
        <RedFolderCard items={redfolder} />
        <PerfCard stats={heroStats} onStats={() => setTab('stats')} height={150} />
        {recentBlock}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', position: 'sticky', top: 76 }}>
        <DiaryHome diary={diary} upsert={upsertDiary} remove={removeDiary} />
        <RoutineCard routine={{ ...routineProps, open: routineOpen, setOpen: setRoutineOpen }} />
        <CalendarMemoCard memo={{ items: memos, addOn: addMemoOn, remove: removeMemo }} />
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {saveBanner}
      {riskBanner}
      {netWorthCard}
      <DiaryHome diary={diary} upsert={upsertDiary} remove={removeDiary} />
      <BalanceBand market={filter} bal={bal} onSeed={() => setModal({ type: 'settings' })} />
      <RedFolderCard items={redfolder} />
      <PerfCard stats={heroStats} onStats={() => setTab('stats')} height={96} />
      <RoutineCard routine={{ ...routineProps, open: routineOpen, setOpen: setRoutineOpen }} />
      {recentBlock}
    </div>
  );

  const journalView = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="메모 · 종목 · 셋업 · 태그 검색" style={{ flex: 1 }} />
        <select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto', minWidth: 110 }}>
          <option value="all">전체 기간</option>
          <option value="month">이번 달</option>
          <option value="30d">최근 30일</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['all', '전체', list.length], ['held', '보유중', held.length], ['closed', '청산', closed.length]].map(([v, l, n]) => (
          <button key={v} onClick={() => setStatus(v)} className={status === v ? '' : 'chip'} style={status === v
            ? { fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--violet)', borderRadius: 99, padding: '6px 12px' }
            : { fontSize: 11.5, fontWeight: 600, padding: '6px 12px' }}>{l} {n}</button>
        ))}
      </div>
      {shownList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '44px 20px', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 15 }}>{(search || period !== 'all' || status !== 'all') ? '조건에 맞는 일지가 없어요.' : '아직 일지가 없어요.'}</div>
          {/* 달이 바뀌면 '이번 달'에 걸리는 게 없어 텅 비어 보임 — 기록은 그대로 있음 */}
          {period !== 'all' && allOfMarket.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, marginBottom: 9 }}>{filter} 기록 <b className="mono" style={{ color: 'var(--ink)' }}>{allOfMarket.length}건</b>이 다른 기간에 있어요.</div>
              <button className="btn" onClick={() => setPeriod('all')} style={{ padding: '10px 18px' }}>전체 기간 보기</button>
            </div>
          )}
          {!(search || period !== 'all' || status !== 'all') && <div style={{ fontSize: 13.5, marginTop: 4 }}>오른쪽 아래 <b style={{ color: 'var(--violet)' }}>＋</b> 로 첫 기록을 남겨보세요.</div>}
        </div>
      ) : status !== 'all' ? cardsOf(shownList) : (
        <>
          {held.length > 0 && (
            <>
              <div className="seclabel" style={{ paddingLeft: 2 }}>
                보유중
                {/* ★ 2026-08-09: 평가금액·평가손익을 뺐다. 실시간 시세를 안 쓰기로 했으니
                    낼 수 없는 값이다. 이익/손해는 팔 때 내가 적는다. */}
                <span className="mono" style={{ fontWeight: 600, color: 'var(--ink-4)' }}> · {held.length}건</span>

              </div>
              {cardsOf(held)}
            </>
          )}
          {closed.length > 0 && (
            <>
              <div className="seclabel" style={{ paddingLeft: 2, marginTop: held.length ? 6 : 0 }}>청산</div>
              {cardsOf(closed)}
            </>
          )}
        </>
      )}
    </div>
  );

  const body = tab === 'home' ? homeView
    : tab === 'journal' ? journalView
      : tab === 'assets' ? <AssetsTab assets={assets} autoAssets={autoAssets} saveAsset={saveAsset} removeAsset={removeAsset} quotes={quotes} asOf={assetAsOf} onRefresh={refreshAssetQuotes} swingMode={settings.swingInAssets || 'profit'} onSwingMode={m => setSettings(p => ({ ...p, swingInAssets: m }))} />
      : tab === 'diary' ? <DiaryTab diary={diary} upsert={upsertDiary} remove={removeDiary} memo={{ items: memos, addOn: addMemoOn, remove: removeMemo }} routine={{ ...routineProps, open: true, setOpen: () => { } }} />
        : <DashboardModal entries={entries} market={filter} asPage onClose={() => setTab('home')} />;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: wide ? 24 : 96, display: wide ? 'flex' : 'block' }}>
      {/* ── 좌측 내비 (넓은 화면) ── */}
      {wide && (
        <aside style={{ width: 208, flexShrink: 0, background: 'var(--surface-2)', borderRight: '1px solid var(--border)', padding: '16px 13px', display: 'flex', flexDirection: 'column', gap: 18, height: '100vh', position: 'sticky', top: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--violet)', display: 'grid', placeItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 4 8-9" /><path d="M21 7v5" /><path d="M16 7h5" /></svg>
            </span>
            <b style={{ fontSize: 16, letterSpacing: '-.02em' }}>거래일지</b>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="seclabel" style={{ paddingLeft: 2 }}>계좌</div>
            {TJ.MARKETS.map(m => {
              const on = filter === m, b = balOf(m);
              return (
                <button key={m} onClick={() => setFilter(m)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 11,
                  background: on ? MKT_C[m] : 'var(--surface)', color: on ? '#fff' : 'var(--ink-2)',
                  border: on ? 'none' : '1px solid var(--border)', width: '100%', textAlign: 'left',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? '#fff' : MKT_C[m] }} />
                  <span style={{ fontSize: 13, fontWeight: on ? 700 : 600 }}>{m}</span><span style={{ flex: 1 }} />
                  <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>{TJ.moneyS(b.pnl)}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="seclabel" style={{ paddingLeft: 2, marginBottom: 6 }}>화면</div>
            {TABS.map(([v, ic, l]) => (
              <button key={v} className={'navitem' + (tab === v ? ' on' : '')} onClick={() => setTab(v)}><span>{ic}</span>{l}</button>
            ))}
            <button className="navitem" onClick={() => setModal({ type: 'holdings' })}><span>◈</span>보유 현황</button>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button className="navitem" onClick={() => setModal({ type: 'sync' })} style={{ fontSize: 12.5, color: 'var(--ink-3)' }}><span>◷</span>{syncId ? (syncStatus === 'err' ? '동기화 오프라인' : '동기화됨') : '동기화'}</button>
            <button className="navitem" onClick={() => setModal({ type: 'principles' })} style={{ fontSize: 12.5, color: 'var(--ink-3)' }}><span>◎</span>원칙</button>
            <button className="navitem" onClick={() => setModal({ type: 'menu' })} style={{ fontSize: 12.5, color: 'var(--ink-3)' }}><span>⚙</span>설정 · 백업</button>
          </div>
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
      {/* ── 헤더 ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'rgba(250,246,240,.92)',
        backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: wide ? '11px 20px' : '10px 14px 9px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!wide && (
              <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--violet)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 4 8-9" /><path d="M21 7v5" /><path d="M16 7h5" /></svg>
              </div>
            )}
            <b style={{ fontSize: 15.5, letterSpacing: '-.02em' }}>{wide ? filter : (tab === 'home' ? '거래일지' : TABS.find(t => t[0] === tab)[2])}</b>
            {tab === 'journal' && <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-4)' }}>{list.length}건</span>}
            {tab === 'diary' && <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-4)' }}>{(diary || []).filter(d => d.text || d.mood).length}편</span>}
            {flash && <span style={{ fontSize: 12.5, color: 'var(--win)', fontWeight: 600, animation: 'fade-in .2s' }}>{flash}</span>}
            <span style={{ flex: 1 }} />
            {settings.currency === '₩' && (
              <span title={fx.at ? '실시간 환율 · ' + new Date(fx.at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 기준' : '기본 환율(실시간 로딩 전)'}
                style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-tint)', padding: '4px 9px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: fx.at ? 'var(--win)' : 'var(--ink-4)' }} />
                $1=₩{Math.round(fx.rate).toLocaleString('en-US')}
              </span>
            )}
            {!wide && <button className="btn-ghost btn-sm" onClick={() => setModal({ type: 'holdings' })} style={{ padding: '6px 10px', fontSize: 12 }}>보유</button>}
            {!wide && <button className="btn-ghost btn-sm" onClick={() => setModal({ type: 'menu' })} style={{ padding: '6px 10px', fontSize: 12 }}>더보기</button>}
            {wide && <button className="btn" onClick={() => setModal({ type: 'editor', entry: null })} style={{ padding: '8px 14px', fontSize: 12.5 }}>＋ 새 일지</button>}
          </div>
          {/* 계좌 탭 — 모든 숫자의 전제라 최상단 고정 (일기는 계좌와 무관 · 넓은 화면은 좌측 내비가 대신함) */}
          {!wide && tab !== 'diary' && acctSeg}
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: wide ? '18px 20px' : '14px 14px 10px' }}>
        {body}
      </main>
      </div>

      {/* ── FAB (모바일: 탭바 위 · 넓은 화면: 헤더 버튼으로 대체) ── */}
      {!wide && (tab === 'home' || tab === 'journal') && (
        <button onClick={() => setModal({ type: 'editor', entry: null })} aria-label="새 일지" title="새 일지" style={{
          position: 'fixed', right: 16, bottom: 78, width: 54, height: 54, borderRadius: '50%',
          background: 'var(--violet)', color: '#fff',
          boxShadow: '0 8px 20px rgba(42,36,30,.28)', zIndex: 45, display: 'grid', placeItems: 'center',
        }}>
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}

      {/* ── 하단 탭바 (모바일) ── */}
      {!wide && (
        <nav className="tabbar">
          {TABS.map(([v, ic, l]) => (
            <button key={v} className={tab === v ? 'on' : ''} onClick={() => setTab(v)}>
              <span className="ic">{ic}</span>{l}
            </button>
          ))}
        </nav>
      )}

      {/* ── 모달 ── */}
      {modal?.type === 'editor' && <EditorModal entry={modal.entry} accts={{ '선물': balF.bal, '스윙': balW.bal, '장기': balL.bal }} defaultRisk={{ mode: settings.futuresRiskMode || '$', val: settings.futuresRiskVal ?? null }} defaultMarket={filter} onAddMemo={addMemoOn} onSave={saveEntry} onClose={() => setModal(null)} />}
      {modal?.type === 'stats' && <DashboardModal entries={entries} market={filter} onClose={() => setModal(null)} />}
      {modal?.type === 'settings' && <SettingsModal settings={settings} seedSuggest={holdValue} onSave={s => { setSettings(p => ({ ...p, ...s })); setModal(null); doFlash('시드 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'principles' && <PrinciplesModal text={principles} onSave={txt => { setPrinciples(txt); localStorage.setItem('tj_principles_custom', '1'); doFlash('원칙 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'holdings' && <HoldingsModal holdings={holdings} entries={entries} addHoldings={addHoldings} removeHolding={removeHolding} clearHoldings={clearHoldings} addPositions={addPositions} defaultAccount={filter === '장기' ? '장기' : '스윙'} onClose={() => setModal(null)} />}
      {modal?.type === 'buymore' && modal.entry && <BuyMoreModal entry={modal.entry} onBuy={buyMore} onClose={() => setModal(null)} />}
      {modal?.type === 'sell' && modal.entry && <SellModal entry={modal.entry} quote={quoteOf(modal.entry.ticker, modal.entry.market)} onSell={sellPosition} onClose={() => setModal(null)} />}
      {modal?.type === 'menu' && <MenuModal entries={entries} blob={gatherBlob()} syncId={syncId} onImport={importBlob} onPurgePhotos={purgePhotos} onReset={() => setModal({ type: 'reset' })} onSync={() => setModal({ type: 'sync' })} onClose={() => setModal(null)} />}
      {modal?.type === 'reset' && <ResetModal market={filter} entries={entries} onResetMarket={resetMarket} onResetAll={clearAll} onRestore={restoreSamples} onClose={() => setModal(null)} />}
      {modal?.type === 'sync' && <SyncModal syncId={syncId} onEnable={enableSync} onJoin={joinSync} onDisable={disableSync} onClose={() => setModal(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
