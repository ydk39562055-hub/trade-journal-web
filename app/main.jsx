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
const usd = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

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

function RedFolderCard({ items }) {
  if (!items || !items.length) return null;
  const today = todayStr();
  const list = items.map(e => ({ ...e, d: new Date(e.date) }))
    .filter(e => { if (isNaN(e.d)) return false; const x = e.d; const y = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; return y === today; })
    .sort((a, b) => a.d - b.d);
  return (
    <div className="card" style={{ padding: 'var(--card-pad)', marginBottom: 16, borderColor: 'var(--violet-100)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: list.length ? 10 : 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--violet)', flexShrink: 0 }} />
        <b style={{ fontSize: 14 }}>오늘 레드폴더 (고임팩트 뉴스)</b>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{list.length ? list.length + '건' : '없음 ✓'}</span>
      </div>
      {list.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13.5, borderTop: i ? '1px solid var(--border)' : 'none' }}>
          <span className="mono" style={{ fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{e.d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{e.country}</span>
          <span style={{ color: 'var(--ink-2)' }}>{e.title}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>발표 직전 신규 진입 자제 · 발표 후 스윕은 트리거로 (시간=내 기기 기준)</div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [redfolder, setRedfolder] = useState([]);
  const [entries, setEntries] = useState(() => {
    try { const raw = localStorage.getItem('tj_entries_v3'); if (raw !== null) { const c = JSON.parse(raw); if (Array.isArray(c)) return c; } } catch {}
    return TJ.ENTRIES;   // 첫 방문만 샘플. 비웠으면([]) 빈 채로 유지
  });
  const [settings, setSettings] = useState(() => {
    try { return { ...TJ.SEED, ...JSON.parse(localStorage.getItem('tj_settings_v2') || '{}') }; } catch { return { ...TJ.SEED }; }
  });
  const [principles, setPrinciples] = useState(() => localStorage.getItem('tj_principles_v2') || TJ.DEFAULT_PRINCIPLES);
  const [filter, setFilter] = useState('all');
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
    if (Array.isArray(b.entries)) setEntries(b.entries);
    if (b.settings) setSettings(b.settings);
    if (typeof b.principles === 'string' && b.principles.trim()) setPrinciples(b.principles);
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
          merged = mergeBlobs(local, cloud.data);
          needPush = JSON.stringify(merged) !== JSON.stringify({ v: 1, ...cloud.data });
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
  const clearAll = () => {
    if (!confirm('샘플 데이터(예시 28건)와 시드를 비우고 빈 일지로 시작할까요?\n되돌릴 수 없어요. (필요하면 먼저 더보기 → JSON 백업)')) return;
    const ts = new Date().toISOString();
    setDeleted(prev => { const n = { ...prev }; entries.forEach(e => { n[e.id] = ts; }); return n; }); // 동기화 시 다른 기기에서도 비워지도록
    setEntries([]); setSettings({ futuresSeed: null, spotSeed: null });
    setModal(null); doFlash('초기화됨 — 새로 시작 ✓');
  };

  // filtered list
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ym = todayStr().slice(0, 7);
    const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    let l = entries.filter(e => filter === 'all' || e.market === filter);
    if (q) l = l.filter(e => ((e.body || '') + ' ' + (e.setups || []).join(' ') + ' ' + (e.errors || []).join(' ')).toLowerCase().includes(q));
    if (period === 'month') l = l.filter(e => (e.traded_at || '').startsWith(ym));
    else if (period === '30d') l = l.filter(e => (e.traded_at || '') >= d30);
    return l;
  }, [entries, filter, search, period]);

  const balF = TJStats.balanceOf(entries, '선물', settings.futuresSeed);
  const balS = TJStats.balanceOf(entries, '현물', settings.spotSeed);
  const totalBal = (balF.seed || 0) + (balS.seed || 0) + balF.pnl + balS.pnl;
  const totalPnl = balF.pnl + balS.pnl;
  const totalSeed = (balF.seed || 0) + (balS.seed || 0);
  const totalRet = totalSeed ? totalPnl / totalSeed * 100 : null;

  const heroStats = useMemo(() => TJStats.computeStats(entries, filter === 'all' ? 'all' : filter), [entries, filter]);

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
          <div className="seg" style={{ display: isMobile ? 'none' : 'inline-flex' }}>
            {[['cockpit', '차트형'], ['ledger', '목록형'], ['focus', '원칙형']].map(([v, l]) => (
              <button key={v} className={t.homeLayout === v ? 'on' : ''} onClick={() => setTweak('homeLayout', v)} style={{ fontSize: 12.5, padding: '7px 12px' }}>{l}</button>
            ))}
          </div>
          <button className="btn-ghost btn-sm" onClick={() => setModal({ type: 'principles' })}>원칙</button>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '22px' }}>
        {/* 모바일용 레이아웃 스위처 */}
        {isMobile && (
          <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
            {[['cockpit', '차트형'], ['ledger', '목록형'], ['focus', '원칙형']].map(([v, l]) => (
              <button key={v} className={t.homeLayout === v ? 'on' : ''} onClick={() => setTweak('homeLayout', v)}>{l}</button>
            ))}
          </div>
        )}

        {/* ── 레드폴더 (오늘 고임팩트 뉴스) ── */}
        <RedFolderCard items={redfolder} />

        {/* ── HERO (레이아웃별) ── */}
        <Hero layout={t.homeLayout} stats={heroStats} balF={balF} balS={balS}
          totalBal={totalBal} totalPnl={totalPnl} totalRet={totalRet}
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

        {/* ── 필터 탭 ── */}
        <div className="seg" style={{ width: '100%', marginTop: 12 }}>
          {[['all', '전체'], ['선물', '선물'], ['현물', '현물']].map(([v, l]) => (
            <button key={v} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>{l}</button>
          ))}
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
      {modal?.type === 'editor' && <EditorModal entry={modal.entry} onSave={saveEntry} onClose={() => setModal(null)} />}
      {modal?.type === 'stats' && <DashboardModal entries={entries} market={filter} onClose={() => setModal(null)} />}
      {modal?.type === 'settings' && <SettingsModal settings={settings} onSave={s => { setSettings(p => ({ ...p, ...s })); setModal(null); doFlash('시드 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'principles' && <PrinciplesModal text={principles} onSave={txt => { setPrinciples(txt); doFlash('원칙 저장됨 ✓'); }} onClose={() => setModal(null)} />}
      {modal?.type === 'menu' && <MenuModal entries={entries} syncId={syncId} onImport={importEntries} onReset={clearAll} onSync={() => setModal({ type: 'sync' })} onClose={() => setModal(null)} />}
      {modal?.type === 'sync' && <SyncModal syncId={syncId} onEnable={enableSync} onJoin={joinSync} onDisable={disableSync} onClose={() => setModal(null)} />}

      {/* ── Tweaks ── */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="레이아웃" />
        <TweakRadio label="홈 화면" value={t.homeLayout} options={[{ value: 'cockpit', label: '차트형' }, { value: 'ledger', label: '목록형' }, { value: 'focus', label: '원칙형' }]} onChange={v => setTweak('homeLayout', v)} />
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
