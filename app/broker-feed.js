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
    const kind = ['data', 'fp-data'].includes(type) ? 'broker-feed' : type === 'meritz-notifications' ? 'broker-notifications' : 'broker-status';
    if (!data || data.version !== 1 || data.kind !== kind) {
      throw new Error('수집된 내역을 아직 찾지 못했어요. PC 수집 상태와 연결코드를 확인해 주세요.');
    }
    if (kind !== 'broker-status' && (!Array.isArray(data.rows) || data.rows.some(r => !r || typeof r.id !== 'string'))) {
      throw new Error('기록을 읽을 수 없어요. 잠시 후 다시 확인해 주세요.');
    }
    return data;
  }
  async function cache(code, value, remove = false, type = 'data') {
    const key = await recordId(code, type);
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
  // Journal grouping is a view over immutable broker records; IDs keep memos attached.
  const marketOf = row => row.source === 'fpmarkets' ? '선물' : row.source === 'toss' ? '스윙' : null;
  function journalRows(rows, market) {
    const seen = new Set();
    return rows.filter(row => {
      if (!row || typeof row.id !== 'string' || !row.tradedAtKorea || row.tradedAtKorea < '2026-01-01' || row.tradedAtKorea >= '2027-01-01') return false;
      if (market && marketOf(row) !== market) return false;
      const key = row.source + ':' + row.id;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b) => (b.executedAt || '').localeCompare(a.executedAt || ''));
  }
  function detailEntry(row, review, existing) {
    if (existing) return JSON.parse(JSON.stringify(existing));
    const num = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
    const fp = row.source === 'fpmarkets';
    return {id: 'broker-detail:' + row.source + ':' + row.id,
      brokerTradeId: row.id, brokerSource: row.source,
      market: marketOf(row) || '스윙', traded_at: row.tradedAtKorea,
      ticker: row.symbol || row.name || '', currency: row.currency === 'KRW' ? '₩' : '$',
      entry_price: fp ? num(review?.entryPrice ?? (row.action === 'open' ? row.averagePrice : null)) : (row.side === 'BUY' ? num(row.averagePrice) : null),
      exit_price: (fp ? row.action === 'close' : row.side === 'SELL') ? num(row.averagePrice) : null,
      direction: fp ? review?.direction || (row.action === 'open' ? (row.side === 'BUY' ? 'long' : 'short') : null) : null,
      stop_price: num(review?.initialStop), target_price: num(review?.initialTarget),
      shares: !fp && row.side === 'BUY' ? num(row.quantity) : null,
      body: '', photos: [], setups: [], errors: [], created_at: new Date().toISOString()};
  }
  window.TJBroker = { clean, pull, cache, recordId, decimal, marketOf, journalRows, detailEntry };
})();
