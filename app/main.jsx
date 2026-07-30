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
  const diary = [...dd.values()];
  // 보유종목: id 합집합, 같은 id면 updated_at 최신, 삭제된 건 제외
  const hm = new Map();
  for (const h of [...(a.holdings || []), ...(b.holdings || [])]) {
    if (!h || !h.id) continue;
    const prev = hm.get(h.id);
    if (!prev || (h.updated_at || '') >= (prev.updated_at || '')) hm.set(h.id, h);
  }
  const holdings = [...hm.values()].filter(h => !deleted[h.id]);
  const settings = { ...(a.settings || {}), ...(b.settings || {}) };
  const principles = (b.principles && b.principles.trim()) ? b.principles : (a.principles || '');
  return { v: 1, entries, settings, principles, memos, diary, holdings, deleted };
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
  const soonKeys = [today, tomorrow].filter(k => byDay[k]);            // 오늘+내일(있는 날만)
  const soonCount = soonKeys.reduce((n, k) => n + byDay[k].length, 0);
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

  const dayBlock = (k, di) => (
    <div key={k} style={{ marginTop: di ? 10 : 0 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: k === today ? 'var(--violet-600)' : 'var(--ink-3)', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
        {dayLabel(k)}
        {(k === today || k === tomorrow) && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: k === today ? 'var(--violet)' : 'var(--ink-4)', padding: '1px 6px', borderRadius: 5 }}>{k === today ? '오늘' : '내일'}</span>}
        <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>{byDay[k].length}건</span>
      </div>
      {byDay[k].map((e, i) => row(e, i))}
    </div>
  );
  const empty = txt => <div style={{ fontSize: 12, color: 'var(--ink-4)', textAlign: 'center', padding: '10px 0' }}>{txt}</div>;

  return (
    <div className="card" style={{ padding: '11px 13px', marginBottom: 12, borderColor: 'var(--violet-100)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--violet)', flexShrink: 0 }} />
        <b style={{ fontSize: 12.5 }}>레드폴더</b>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{soonCount ? '오늘·내일 ' + soonCount + '건' : '오늘·내일 없음 ✓'}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600 }}>{open ? '접기' : '펼치기'}</span>
        <span style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="seg" style={{ width: '100%', marginBottom: 8 }}>
            <button className={!week ? 'on' : ''} onClick={() => setWeek(false)}>오늘·내일</button>
            <button className={week ? 'on' : ''} onClick={() => setWeek(true)}>이번 주</button>
          </div>
          {!week
            ? (soonCount > 0 ? soonKeys.map((k, di) => dayBlock(k, di)) : empty('오늘·내일 고임팩트 없음 ✓'))
            : (days.length > 0 ? days.map((k, di) => dayBlock(k, di)) : empty('이번 주 고임팩트 없음'))}
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>발표 직전 신규 진입 자제 · 시간=내 기기 기준</div>
        </div>
      )}
    </div>
  );
}

function App() {
  const t = { accent: '코코아', density: 'regular', showRoutine: true };   // 고정 테마(꾸미기 패널 제거)
  const [redfolder, setRedfolder] = useState([]);
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
    return ['home', 'journal', 'diary', 'stats'].includes(t) ? t : 'home';
  });
  useEffect(() => { localStorage.setItem('tj_tab', tab); window.scrollTo(0, 0); }, [tab]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');     // 일지 탭 구획 — 전체 / 보유중 / 청산
  const [period, setPeriod] = useState('month');   // 기본=이번 달 (화면이 너무 길어지지 않게)
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
  const [diary, setDiary] = useState(() => { try { return JSON.parse(localStorage.getItem('tj_diary_v1') || '[]'); } catch { return []; } });
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

  // persist — 저장 실패(용량 초과 등)는 조용히 삼키지 않고 경고
  useEffect(() => {
    try { localStorage.setItem('tj_entries_v3', JSON.stringify(entries)); }
    catch (e) { doFlash('⚠ 저장 공간 부족 — 사진을 줄이거나 오래된 일지를 정리하세요'); }
  }, [entries]);
  useEffect(() => { localStorage.setItem('tj_settings_v2', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('tj_principles_v2', principles); }, [principles]);
  useEffect(() => { localStorage.setItem('tj_checks_v2', JSON.stringify({ d: todayStr(), s: [...checks] })); }, [checks]);
  useEffect(() => { localStorage.setItem('tj_memos_v2', JSON.stringify(memos)); }, [memos]);
  useEffect(() => { localStorage.setItem('tj_diary_v1', JSON.stringify(diary)); }, [diary]);
  useEffect(() => { localStorage.setItem('tj_holdings_v1', JSON.stringify(holdings)); }, [holdings]);
  useEffect(() => { localStorage.setItem('tj_deleted_v1', JSON.stringify(deleted)); }, [deleted]);

  const gatherBlob = () => ({ v: 1, entries, settings, principles, memos, diary, holdings, deleted });
  const applyBlob = (b) => {
    if (Array.isArray(b.entries)) setEntries(TJ.migrateEntries(b.entries));
    if (b.settings) setSettings(TJ.migrateSettings(b.settings));
    if (typeof b.principles === 'string' && b.principles.trim() && localStorage.getItem('tj_principles_custom') === '1') setPrinciples(b.principles); // 직접 편집본만 동기화 반영, 기본문구는 항상 최신 유지
    if (Array.isArray(b.memos)) setMemos(b.memos);
    if (Array.isArray(b.diary)) setDiary(b.diary);
    if (Array.isArray(b.holdings)) setHoldings(b.holdings);
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
  }, [entries, settings, principles, memos, diary, holdings, deleted, syncId, syncReady]);

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
  const [quotes, setQuotes] = useState({});
  const holdTickers = useMemo(() => {
    const s = new Set();
    entries.forEach(e => { if (e.result === 'holding' && e.ticker) s.add(e.ticker.toUpperCase()); });
    holdings.forEach(h => { if (h.ticker) s.add(h.ticker.toUpperCase()); });
    return [...s].sort().join(',');
  }, [entries, holdings]);
  useEffect(() => {
    if (!holdTickers || !window.TJPortfolio) return;
    let alive = true;
    const syms = holdTickers.split(',').map(t => TJPortfolio.yahooSym({ ticker: t, market: /^\d{6}$/.test(t) ? 'KR' : 'US' })).filter(Boolean);
    const load = () => {
      if (document.hidden) return;                                  // 탭 안 보면 굳이 조회 안 함
      TJPortfolio.quotes(syms).then(j => { if (alive && j && j.quotes) setQuotes(q => ({ ...q, ...j.quotes })); }).catch(() => {});
    };
    load();
    const id = setInterval(load, 60 * 1000);                        // 장중이면 1분마다 갱신
    document.addEventListener('visibilitychange', load);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', load); };
  }, [holdTickers]);
  // 티커 → {price, currency} (카드가 쓰기 쉬운 형태)
  const quoteOf = (ticker) => {
    const t = (ticker || '').toUpperCase(); if (!t) return null;
    return quotes[t] || quotes[t + '.KS'] || null;
  };
  // "이 시세가 언제 값인지" 한 줄 — 장중인지 마감가인지 사용자에게 알려줌
  const quoteAgeLabel = useMemo(() => {
    const qs = Object.values(quotes).filter(Boolean);
    if (!qs.length || !window.TJPortfolio || !TJPortfolio.quoteAge) return '';
    const live = qs.find(q => q.state === 'REGULAR');
    return TJPortfolio.quoteAge(live || qs[0]);
  }, [quotes]);

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
  const upsertDiary = (date, patch) => {
    setDiary(prev => {
      const now = new Date().toISOString();
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
  const addHoldings = (account, list) => {
    const now = new Date().toISOString();
    const add = (list || []).map(h => ({
      id: 'h-' + Math.random().toString(36).slice(2, 10),
      account, name: h.name || h.ticker || '종목', ticker: (h.ticker || '').toUpperCase(),
      qty: Number(h.qty) || 0, avgPrice: avgFrom(h),
      amount: (h.amount != null && h.amount !== '') ? Number(h.amount) : null,      // 화면에 보인 총 금액(1주당 아님)
      amountKind: h.amountKind === 'buy' ? 'buy' : (h.amount != null ? 'eval' : null),
      currency: h.currency === 'KRW' ? 'KRW' : 'USD', market: h.market || 'US', updated_at: now,
    }));
    setHoldings(prev => [...prev, ...add]);
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
        currency: isKR && wonShown ? '₩' : '$',
        setups: [], errors: [], photos: [],
        body: (nm && nm.toUpperCase() !== sym) ? nm : '',      // 티커는 카드 머리에 이미 나옴 — 이름만(같으면 비움)
        created_at: now, updated_at: now,
      };
    });
    if (rows.length) setEntries(prev => [...rows, ...prev]);
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
    const merged = mergeBlobs(gatherBlob(), { entries: obj.entries, memos: obj.memos, diary: obj.diary, holdings: obj.holdings, settings: obj.settings, principles: obj.principles, deleted: obj.deleted });
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
  // 보유중 / 청산 구획 (일지 탭)
  const held = list.filter(e => e.result === 'holding');
  const closed = list.filter(e => e.result !== 'holding');
  const shownList = status === 'held' ? held : status === 'closed' ? closed : list;
  // 보유중 평가손익 합계 — 시세 있는 것만
  const heldPnl = held.reduce((a, e) => {
    const q = quoteOf(e.ticker); if (!q || e.entry_price == null || !e.shares) return a;
    const cur = TJ.toUSD(q.price, q.currency === 'KRW' ? '₩' : '$');
    return a + (cur - TJ.toUSD(e.entry_price, e.currency)) * e.shares;
  }, 0);

  TJ.setCurrency(settings.currency); TJ.setRate(fx.rate);   // 전역 통화($/₩)+실시간환율 — 렌더 전 동기 반영(자식 포매터가 읽음)
  const balF = TJStats.balanceOf(entries, '선물', settings.futuresSeed, settings.futuresDeposit);
  const balW = TJStats.balanceOf(entries, '스윙', settings.swingSeed, settings.swingDeposit);
  const balL = TJStats.balanceOf(entries, '장기', settings.longSeed, settings.longDeposit);
  // 선물/스윙/장기 완전 분리 — 활성 시장만 표시(합산 없음)
  const bal = filter === '스윙' ? balW : filter === '장기' ? balL : balF;

  const heroStats = useMemo(() => TJStats.computeStats(entries, filter), [entries, filter, fx.rate]);   // 환율 바뀌면 ₩거래 환산 재계산

  // routine checklist render
  const toggleCheck = (i) => setChecks(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const checklist = useMemo(() => principles.split('\n').map((line, i) => ({ i, line })), [principles]);
  const checkItems = checklist.filter(x => x.line.trim().startsWith('☐'));
  const doneCount = checkItems.filter(x => checks.has(x.i)).length;

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width:680px)').matches;
  const wide = typeof window !== 'undefined' && window.matchMedia('(min-width:1000px)').matches;
  const routineProps = { items: checkItems, checks, done: doneCount, total: checkItems.length, toggle: toggleCheck, principles, onEdit: () => setModal({ type: 'principles' }) };

  const TABS = [['home', '◧', '홈'], ['journal', '☰', '일지'], ['diary', '✎', '일기'], ['stats', '◍', '통계']];
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
      {arr.map((e, idx) => <EntryCard key={e.id} e={e} index={idx + 1} quote={quoteOf(e.ticker)} onEdit={editorFor} onDelete={deleteEntry} />)}
    </div>
  );

  /* ── 탭별 본문 ── */
  const recentBlock = list.length > 0 && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 2px 0' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>최근 일지</span>
        <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-4)' }}>{list.length}건</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setTab('journal')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--violet-600)' }}>전체 보기 ›</button>
      </div>
      {cardsOf(list.slice(0, wide ? 4 : 3))}
    </>
  );

  const homeView = wide ? (
    /* 넓은 화면 — 중앙: 성과·일지 / 우: 일기·루틴·회고 (팝업 없이 한 화면) */
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--gap)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', minWidth: 0 }}>
        <BalanceBand market={filter} bal={bal} onSeed={() => setModal({ type: 'settings' })} />
        <RedFolderCard items={redfolder} />
        <PerfCard stats={heroStats} onStats={() => setTab('stats')} height={150} />
        {recentBlock}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', position: 'sticky', top: 76 }}>
        <DiaryHome diary={diary} upsert={upsertDiary} />
        <RoutineCard routine={{ ...routineProps, open: routineOpen, setOpen: setRoutineOpen }} />
        <CalendarMemoCard memo={{ items: memos, addOn: addMemoOn, remove: removeMemo }} />
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      <DiaryHome diary={diary} upsert={upsertDiary} />
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
        <div style={{ textAlign: 'center', padding: '52px 20px', color: 'var(--ink-3)' }}>
          <div style={{ fontSize: 15 }}>{(search || period !== 'all' || status !== 'all') ? '조건에 맞는 일지가 없어요.' : '아직 일지가 없어요.'}</div>
          {!(search || period !== 'all' || status !== 'all') && <div style={{ fontSize: 13.5, marginTop: 4 }}>오른쪽 아래 <b style={{ color: 'var(--violet)' }}>＋</b> 로 첫 기록을 남겨보세요.</div>}
        </div>
      ) : status !== 'all' ? cardsOf(shownList) : (
        <>
          {held.length > 0 && (
            <>
              <div className="seclabel" style={{ paddingLeft: 2 }}>
                보유중 {heldPnl !== 0 && <span className="mono">· 평가손익 {TJ.moneyS(heldPnl)}</span>}
                {quoteAgeLabel && <span style={{ fontWeight: 600, color: 'var(--ink-4)' }}> · 시세 {quoteAgeLabel}</span>}
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
      : tab === 'diary' ? <DiaryTab diary={diary} upsert={upsertDiary} memo={{ items: memos, addOn: addMemoOn, remove: removeMemo }} routine={{ ...routineProps, open: true, setOpen: () => { } }} />
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
      {modal?.type === 'settings' && <SettingsModal settings={settings} onSave={s => { setSettings(p => ({ ...p, ...s })); setModal(null); doFlash('시드 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'principles' && <PrinciplesModal text={principles} onSave={txt => { setPrinciples(txt); localStorage.setItem('tj_principles_custom', '1'); doFlash('원칙 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'holdings' && <HoldingsModal holdings={holdings} entries={entries} addHoldings={addHoldings} removeHolding={removeHolding} clearHoldings={clearHoldings} addPositions={addPositions} defaultAccount={filter === '장기' ? '장기' : '스윙'} onClose={() => setModal(null)} />}
      {modal?.type === 'menu' && <MenuModal entries={entries} blob={gatherBlob()} syncId={syncId} onImport={importBlob} onReset={() => setModal({ type: 'reset' })} onSync={() => setModal({ type: 'sync' })} onClose={() => setModal(null)} />}
      {modal?.type === 'reset' && <ResetModal market={filter} entries={entries} onResetMarket={resetMarket} onResetAll={clearAll} onRestore={restoreSamples} onClose={() => setModal(null)} />}
      {modal?.type === 'sync' && <SyncModal syncId={syncId} onEnable={enableSync} onJoin={joinSync} onDisable={disableSync} onClose={() => setModal(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
