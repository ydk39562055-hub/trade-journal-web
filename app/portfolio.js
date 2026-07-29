/* 거래일지 — 보유현황 백엔드 호출. Edge Function 'portfolio' 경유(Gemini 키 은닉).
   window.TJPortfolio = { extract(parts), quotes(symbols), yahooSym(h) } */
(function () {
  const SUPA_URL = 'https://oxogtsfxdjbctzehxvae.supabase.co';
  const SUPA_KEY = 'sb_publishable_3vXShFC5dKvMqzUy1KkyGQ_sF0SzUY2';
  const FN = SUPA_URL + '/functions/v1/portfolio';
  const HEAD = { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

  // 보유종목 → Yahoo 심볼. 한국주식(6자리/market=KR)은 .KS 붙임.
  function yahooSym(h) {
    const t = ((h && h.ticker) || '').trim().toUpperCase();
    if (!t) return null;
    if (/\.[A-Z]+$/.test(t)) return t;                          // 이미 접미사 있으면 그대로
    if (h.market === 'KR' || /^\d{6}$/.test(t)) return t + '.KS';
    return t;
  }

  async function call(payload) {
    const r = await fetch(FN, { method: 'POST', headers: HEAD, body: JSON.stringify(payload) });
    const txt = await r.text();
    if (!r.ok) { let m = txt; try { m = JSON.parse(txt).error || txt; } catch {} throw new Error(m || ('HTTP ' + r.status)); }
    try { return JSON.parse(txt); } catch { throw new Error('응답 파싱 실패'); }
  }

  // parts: [{mime, data(base64)}] → { holdings:[...] }
  async function extract(parts) { return await call({ action: 'extract', parts }); }
  // symbols: ['GOOGL','005930.KS'] → { quotes:{sym:{price,currency,prevClose}}, at }
  async function quotes(symbols) { return await call({ action: 'quotes', tickers: symbols }); }

  window.TJPortfolio = { extract, quotes, yahooSym };
})();
