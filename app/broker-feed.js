/* Automatic broker facts use independent records in the existing cloud project. */
(function () {
  function clean(raw) {
    const value = String(raw || '').replace(/[\s-]/g, '');
    if (!/^TJBF[0-9a-f]{64}$/i.test(value)) throw new Error('자동 기록 연결코드를 확인해 주세요.');
    return 'TJBF' + value.slice(4).toLowerCase();
  }
  async function hash(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const recordId = (code, type) => hash('trade-journal-broker-v1:' + type + ':' + clean(code));
  async function pull(code, type) {
    const row = await TJSync.pull(await recordId(code, type));
    const data = row?.data;
    const kind = type === 'data' ? 'broker-feed' : type === 'meritz-notifications' ? 'broker-notifications' : 'broker-status';
    if (!data || data.version !== 1 || data.kind !== kind) {
      throw new Error('수집된 내역을 아직 찾지 못했어요. PC 수집 상태와 연결코드를 확인해 주세요.');
    }
    if (type !== 'status' && (!Array.isArray(data.rows) || data.rows.some(r => !r || typeof r.id !== 'string'))) {
      throw new Error('기록을 읽을 수 없어요. 잠시 후 다시 확인해 주세요.');
    }
    return data;
  }
  async function cache(code, value, remove = false) {
    const key = await recordId(code, 'data');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('tj-broker-cache-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('feeds');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('feeds', value !== undefined || remove ? 'readwrite' : 'readonly');
        const store = tx.objectStore('feeds');
        const op = remove ? store.delete(key) : value !== undefined ? store.put(value, key) : store.get(key);
        let result;
        op.onsuccess = () => { result = op.result; };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }
  const decimal = value => {
    if (value == null) return '미확정';
    const text = String(value);
    if (!/^-?\d+(\.\d+)?$/.test(text)) return '확인 필요';
    const [whole, fraction = ''] = text.split('.');
    const tail = fraction.replace(/0+$/, '');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (tail ? '.' + tail : '');
  };
  window.TJBroker = { clean, pull, cache, recordId, decimal };
})();
