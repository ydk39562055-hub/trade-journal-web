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

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "homeLayout": "cockpit",
  "accent": "코코아",
  "density": "regular",
  "showRoutine": true
}/*EDITMODE-END*/;

const todayStr = () => new Date().toISOString().slice(0, 10);
const usd = n => TJ.money(n);   // 통화 기호는 전역 토글($/₩)을 따름

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
  const settings = { ...(a.settings || {}), ...(b.settings || {}) };
  const principles = (b.principles && b.principles.trim()) ? b.principles : (a.principles || '');
  return { v: 1, entries, settings, principles, memos, deleted };
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
  const [open, setOpen] = useState(false);   // 접힘=오늘만 / 펼침=이번 주 전체
  if (!items || !items.length) return null;
  const today = todayStr();
  const pad = n => String(n).padStart(2, '0');
  const ymd = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const withD = items.map(e => ({ ...e, d: new Date(e.date) })).filter(e => !isNaN(e.d));
  const todays = withD.filter(e => ymd(e.d) === today).sort((a, b) => a.d - b.d);
  // 이번 주 전체 — 날짜별 그룹
  const byDay = {};
  withD.forEach(e => { const k = ymd(e.d); (byDay[k] = byDay[k] || []).push(e); });
  const days = Object.keys(byDay).sort();
  days.forEach(k => byDay[k].sort((a, b) => a.d - b.d));
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

  return (
    <div className="card" style={{ padding: '11px 13px', marginBottom: 12, borderColor: 'var(--violet-100)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--violet)', flexShrink: 0 }} />
        <b style={{ fontSize: 12.5 }}>{open ? '이번 주 레드폴더' : '오늘 레드폴더'}</b>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{open ? withD.length + '건' : (todays.length ? todays.length + '건' : '없음 ✓')}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600 }}>{open ? '접기' : '주간 보기'}</span>
        <span style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>▾</span>
      </button>

      {!open && todays.length > 0 && (
        <div style={{ marginTop: 6 }}>{todays.map((e, i) => row(e, i))}</div>
      )}

      {open && (
        <div style={{ marginTop: 4 }}>
          {days.map(k => (
            <div key={k} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: k === today ? 'var(--violet-600)' : 'var(--ink-3)', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                {dayLabel(k)}
                {k === today && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--violet)', padding: '1px 6px', borderRadius: 5 }}>오늘</span>}
                <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>{byDay[k].length}건</span>
              </div>
              {byDay[k].map((e, i) => row(e, i))}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 6 }}>발표 직전 신규 진입 자제 · 시간=내 기기 기준</div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
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
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('all');
  const [modal, setModal] = useState(null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memos, setMemos] = useState(() => { try { return JSON.parse(localStorage.getItem('tj_memos_v2') || '[]'); } catch { return []; } });
  const [checks, setChecks] = useState(() => {
    try { const o = JSON.parse(localStorage.getItem('tj_checks_v2') || '{}'); if (o.d === todayStr()) return new Set(o.s || []); } catch {}
    return new Set();
  });
  const [flash, setFlash] = useState('');
  const flashTimer = useRef();
  // ── 클라우드 동기화 ──
  const [syncId, setSyncId] = useState(() => localStorage.getItem('tj_sync_id') || null);
  const [deleted, setDeleted] = useState(() => { try { return JSON.parse(localStorage.getItem('tj_deleted_v1') || '{}'); } catch { return {}; } });
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(''); // '' | syncing | saved | err
  const lastSentRef = useRef('');
  const debRef = useRef();

  // persist
  useEffect(() => { localStorage.setItem('tj_entries_v3', JSON.stringify(entries)); }, [entries]);
  useEffect(() => { localStorage.setItem('tj_settings_v2', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('tj_principles_v2', principles); }, [principles]);
  useEffect(() => { localStorage.setItem('tj_checks_v2', JSON.stringify({ d: todayStr(), s: [...checks] })); }, [checks]);
  useEffect(() => { localStorage.setItem('tj_memos_v2', JSON.stringify(memos)); }, [memos]);
  useEffect(() => { localStorage.setItem('tj_deleted_v1', JSON.stringify(deleted)); }, [deleted]);

  const gatherBlob = () => ({ v: 1, entries, settings, principles, memos, deleted });
  const applyBlob = (b) => {
    if (Array.isArray(b.entries)) setEntries(TJ.migrateEntries(b.entries));
    if (b.settings) setSettings(TJ.migrateSettings(b.settings));
    if (typeof b.principles === 'string' && b.principles.trim() && localStorage.getItem('tj_principles_custom') === '1') setPrinciples(b.principles); // 직접 편집본만 동기화 반영, 기본문구는 항상 최신 유지
    if (Array.isArray(b.memos)) setMemos(b.memos);
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
  }, [entries, settings, principles, memos, deleted, syncId, syncReady]);

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
    setEntries(prev => {
      const map = new Map(prev.map(x => [x.id, x]));
      for (const e of arr) { if (!e.id) e.id = 'imp-' + Math.random().toString(36).slice(2); if (!Array.isArray(e.photos)) e.photos = []; map.set(e.id, e); }
      return [...map.values()].sort((a, b) => (b.traded_at || '').localeCompare(a.traded_at || ''));
    });
    setModal(null); doFlash('복원 완료 ✓');
  };
  // 과거 선물 R 대략 채우기 — 1R = (선물 시드+입금, 없으면 현재 잔고) × 등급 리스크%(기본 0.5%)
  const backfillR = () => {
    const base = ((Number(settings.futuresSeed) || 0) + (Number(settings.futuresDeposit) || 0)) || balF.bal;
    if (!base || base <= 0) { alert('선물 시드를 먼저 설정해주세요.\n대략적 R 계산에 기준 잔고가 필요해요.'); return; }
    const RP = { 'A+': 1, 'B': 0.5, 'C': 0.25 };
    const target = entries.filter(e => e.market === '선물' && typeof e.pnl === 'number' && (e.realized_r == null || e.realized_r === ''));
    if (!target.length) { setModal(null); doFlash('채울 거래가 없어요'); return; }
    if (!confirm(`R배수가 비어 있는 과거 선물 거래 ${target.length}건을 손익금액으로 대략 채웁니다.\n기준 1R = 선물 잔고 ${usd(base)} × 등급 리스크%.\n계속할까요?`)) return;
    const ts = new Date().toISOString();
    let n = 0;
    setEntries(prev => prev.map(e => {
      if (e.market !== '선물' || typeof e.pnl !== 'number' || (e.realized_r != null && e.realized_r !== '')) return e;
      const oneR = base * ((RP[e.grade] || 0.5) / 100);
      if (!oneR) return e;
      n++;
      return { ...e, realized_r: Math.round(e.pnl / oneR * 100) / 100, r_estimated: true, updated_at: ts };
    }));
    setModal(null); doFlash(`과거 ${n}건에 대략 R 채움 ✓`);
  };
  const clearAll = () => {
    if (!confirm('샘플 데이터(예시 28건)와 시드를 비우고 빈 일지로 시작할까요?\n되돌릴 수 없어요. (필요하면 먼저 더보기 → JSON 백업)')) return;
    const ts = new Date().toISOString();
    setDeleted(prev => { const n = { ...prev }; entries.forEach(e => { n[e.id] = ts; }); return n; }); // 동기화 시 다른 기기에서도 비워지도록
    setEntries([]); setSettings({ futuresSeed: null, swingSeed: null, longSeed: null, futuresDeposit: 0, swingDeposit: 0, longDeposit: 0 });
    setModal(null); doFlash('초기화됨 — 새로 시작 ✓');
  };

  // filtered list
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ym = todayStr().slice(0, 7);
    const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    let l = entries.filter(e => e.market === filter);
    if (q) l = l.filter(e => ((e.body || '') + ' ' + (e.setups || []).join(' ') + ' ' + (e.errors || []).join(' ')).toLowerCase().includes(q));
    if (period === 'month') l = l.filter(e => (e.traded_at || '').startsWith(ym));
    else if (period === '30d') l = l.filter(e => (e.traded_at || '') >= d30);
    return l;
  }, [entries, filter, search, period]);

  TJ.setCurrency(settings.currency); TJ.setRate(fx.rate);   // 전역 통화($/₩)+실시간환율 — 렌더 전 동기 반영(자식 포매터가 읽음)
  const balF = TJStats.balanceOf(entries, '선물', settings.futuresSeed, settings.futuresDeposit);
  const balW = TJStats.balanceOf(entries, '스윙', settings.swingSeed, settings.swingDeposit);
  const balL = TJStats.balanceOf(entries, '장기', settings.longSeed, settings.longDeposit);
  // 선물/스윙/장기 완전 분리 — 활성 시장만 표시(합산 없음)
  const bal = filter === '스윙' ? balW : filter === '장기' ? balL : balF;

  const heroStats = useMemo(() => TJStats.computeStats(entries, filter), [entries, filter]);

  // routine checklist render
  const toggleCheck = (i) => setChecks(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const checklist = useMemo(() => principles.split('\n').map((line, i) => ({ i, line })), [principles]);
  const checkItems = checklist.filter(x => x.line.trim().startsWith('☐'));
  const doneCount = checkItems.filter(x => checks.has(x.i)).length;

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width:680px)').matches;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 96 }}>
      {/* ── 헤더 ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'rgba(244,243,246,.82)',
        backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '13px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--violet)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-5 4 4 8-9" /><path d="M21 7v5" /><path d="M16 7h5" /></svg>
            </div>
            <h1 style={{ fontSize: 18, letterSpacing: '-.02em' }}>거래일지</h1>
            {flash && <span style={{ fontSize: 12.5, color: 'var(--win)', fontWeight: 600, animation: 'fade-in .2s' }}>{flash}</span>}
            {!flash && syncId && (
              <span title="클라우드 동기화 켜짐" style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, color: syncStatus === 'err' ? 'var(--loss)' : 'var(--ink-3)' }}>
                ☁ {syncStatus === 'syncing' ? '동기화 중…' : syncStatus === 'err' ? '오프라인' : '동기화됨'}
              </span>
            )}
          </div>
          {settings.currency === '₩' && (
            <span title={fx.at ? '실시간 환율 · ' + new Date(fx.at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 기준' : '기본 환율(실시간 로딩 전)'}
              style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-tint)', padding: '4px 9px', borderRadius: 8, whiteSpace: 'nowrap' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: fx.at ? 'var(--win)' : 'var(--ink-4)' }} />
              $1=₩{Math.round(fx.rate).toLocaleString('en-US')}
            </span>
          )}
          <button className="btn-ghost btn-sm" onClick={() => setModal({ type: 'principles' })}>원칙</button>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '22px' }}>
        {/* ── 시장 모드 (선물 · 스윙 · 장기 완전 분리) ── */}
        <div style={{ display: 'flex', gap: 8, width: '100%', marginBottom: 16 }}>
          {[['선물', 'var(--futures)'], ['스윙', 'var(--swing)'], ['장기', 'var(--long)']].map(([m, c]) => {
            const on = filter === m;
            return (
              <button key={m} onClick={() => setFilter(m)} style={{
                flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 15.5, fontWeight: 800,
                border: '1.5px solid ' + (on ? c : 'var(--border)'),
                background: on ? c : 'var(--surface)', color: on ? '#fff' : 'var(--ink-3)',
                boxShadow: on ? 'var(--shadow-sm)' : 'none', transition: 'all .15s',
              }}>{m}</button>
            );
          })}
        </div>

        {/* ── 레드폴더 (오늘 고임팩트 뉴스) ── */}
        <RedFolderCard items={redfolder} />

        {/* ── HERO (선택한 시장만) ── */}
        <Hero layout={t.homeLayout} stats={heroStats} market={filter} bal={bal}
          onSeed={() => setModal({ type: 'settings' })} onStats={() => setModal({ type: 'stats' })}
          routine={{ items: checkItems, checks, done: doneCount, total: checkItems.length, toggle: toggleCheck, principles, open: routineOpen, setOpen: setRoutineOpen, onEdit: () => setModal({ type: 'principles' }) }}
          memo={{ items: memos, addOn: addMemoOn, remove: removeMemo }}
          showRoutine={t.showRoutine} />

        {/* ── 툴바 ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="메모 · 셋업 · 태그 검색" />
          </div>
          <select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto', minWidth: 120 }}>
            <option value="all">전체 기간</option>
            <option value="month">이번 달</option>
            <option value="30d">최근 30일</option>
          </select>
          <button className="btn-ghost" onClick={() => setModal({ type: 'stats' })}>통계</button>
          <button className="btn-ghost" onClick={() => setModal({ type: 'menu' })}>더보기</button>
        </div>

        {/* ── 일지 리스트 ── */}
        <div style={{ marginTop: 18 }}>
          {list.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--ink-3)' }}>
              <div style={{ color: 'var(--ink-4)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" /></svg>
              </div>
              <div style={{ fontSize: 15 }}>{(search || period !== 'all') ? '조건에 맞는 일지가 없어요.' : '아직 일지가 없어요.'}</div>
              {!(search || period !== 'all') && <div style={{ fontSize: 13.5, marginTop: 4 }}>오른쪽 아래 <b style={{ color: 'var(--violet)' }}>＋</b> 로 첫 기록을 남겨보세요.</div>}
            </div>
          ) : (
            <div style={{ columnGap: 'var(--gap)', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (t.homeLayout === 'ledger' ? '1fr' : 'repeat(auto-fill, minmax(330px, 1fr))'), gap: 'var(--gap)', alignItems: 'start' }}>
              {list.map((e, idx) => <EntryCard key={e.id} e={e} index={idx + 1} onEdit={id => setModal({ type: 'editor', entry: entries.find(x => x.id === id) })} onDelete={deleteEntry} />)}
            </div>
          )}
        </div>
      </main>

      {/* ── FAB ── */}
      <button onClick={() => setModal({ type: 'editor', entry: null })} aria-label="새 일지" title="새 일지" style={{
        position: 'fixed', right: 24, bottom: 24, width: 58, height: 58, borderRadius: '50%',
        background: 'var(--violet)', color: '#fff',
        boxShadow: '0 8px 24px rgba(74,52,30,.32)', zIndex: 40, display: 'grid', placeItems: 'center',
        transition: 'transform .15s var(--ease), box-shadow .15s',
      }} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {/* ── 모달 ── */}
      {modal?.type === 'editor' && <EditorModal entry={modal.entry} accts={{ '선물': balF.bal, '스윙': balW.bal, '장기': balL.bal }} defaultMarket={filter} onAddMemo={addMemoOn} onSave={saveEntry} onClose={() => setModal(null)} />}
      {modal?.type === 'stats' && <DashboardModal entries={entries} market={filter} onClose={() => setModal(null)} />}
      {modal?.type === 'settings' && <SettingsModal settings={settings} onSave={s => { setSettings(p => ({ ...p, ...s })); setModal(null); doFlash('시드 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'principles' && <PrinciplesModal text={principles} onSave={txt => { setPrinciples(txt); localStorage.setItem('tj_principles_custom', '1'); doFlash('원칙 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'menu' && <MenuModal entries={entries} syncId={syncId} onImport={importEntries} onReset={clearAll} onSync={() => setModal({ type: 'sync' })} onBackfillR={backfillR} onClose={() => setModal(null)} />}
      {modal?.type === 'sync' && <SyncModal syncId={syncId} onEnable={enableSync} onJoin={joinSync} onDisable={disableSync} onClose={() => setModal(null)} />}

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="레이아웃" />
        <TweakRadio label="밀도" value={t.density} options={['compact', 'regular', 'comfy']} onChange={v => setTweak('density', v)} />
        <TweakToggle label="루틴 카드 표시" value={t.showRoutine} onChange={v => setTweak('showRoutine', v)} />
        <TweakSection label="색상" />
        <TweakColor label="액센트" value={(ACCENTS[t.accent] || ACCENTS['코코아']).v}
          options={Object.values(ACCENTS).map(a => a.v)}
          onChange={v => { const name = Object.keys(ACCENTS).find(k => ACCENTS[k].v === v) || '코코아'; setTweak('accent', name); }} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
