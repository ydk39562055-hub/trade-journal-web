/* 내 PC에 자동 백업 — 파일 하나를 정해두면 앱이 알아서 덮어쓴다.

   ★ 2026-08-09 사용자 요청: "그냥 내 로컬에 저장하는 방식은 안돼?"
     서버(스냅샷)나 손으로 내려받기 말고, 내 컴퓨터 파일에 그대로 쌓이길 원하셨다.

   어떻게 되나:
     · 처음 한 번만 "저장할 파일"을 고른다(예: OneDrive\문서\거래일지백업.json).
     · 그 파일 손잡이(handle)를 브라우저에 보관해 두고, 다음부터는 하루 한 번 조용히 덮어쓴다.
     · OneDrive 폴더에 두면 PC가 고장나도 클라우드에 남는다 — 서버 없이도 이중 보관이 된다.

   ⚠ 크롬·엣지에서만 된다(File System Access API). 사파리·파이어폭스는 안 된다.
   ⚠ 브라우저를 껐다 켜면 권한을 다시 물어볼 수 있다. 그때는 버튼 한 번 누르면 이어진다 —
     그래서 '조용히 실패'하지 않고 홈에 다시 눌러달라고 띄운다. */
(function () {
  const DB = 'tj-backup', STORE = 'handles', KEY = 'file';
  const ok = () => typeof window.showSaveFilePicker === 'function';

  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function put(h) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(h, KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function get() {
    const db = await idb();
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const q = tx.objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  }
  async function clear() {
    const db = await idb();
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = res; tx.onerror = res;
    });
  }

  /** 저장할 파일을 고른다(사용자 클릭에서만 부를 수 있다). → 파일 이름 */
  async function choose() {
    if (!ok()) throw new Error('이 브라우저에서는 안 됩니다 — 크롬이나 엣지로 열어주세요');
    const h = await window.showSaveFilePicker({
      suggestedName: '거래일지_백업.json',
      types: [{ description: '거래일지 백업', accept: { 'application/json': ['.json'] } }],
    });
    await put(h);
    return h.name;
  }

  /** 권한 상태 — 'none'(미설정) | 'granted'(바로 저장 가능) | 'prompt'(한 번 눌러야 함) */
  async function status() {
    if (!ok()) return { state: 'unsupported', name: '' };
    const h = await get();
    if (!h) return { state: 'none', name: '' };
    const p = await h.queryPermission({ mode: 'readwrite' });
    return { state: p === 'granted' ? 'granted' : 'prompt', name: h.name };
  }

  /** 권한 다시 받기(클릭에서만) */
  async function regrant() {
    const h = await get();
    if (!h) return false;
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  /** 실제 저장 — 권한이 있으면 조용히 덮어쓴다. 없으면 false. */
  async function save(obj) {
    const h = await get();
    if (!h) return false;
    if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    const w = await h.createWritable();
    await w.write(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...obj }, null, 1));
    await w.close();
    return true;
  }

  window.TJLocalBackup = { supported: ok, choose, status, regrant, save, forget: clear };
})();
