// Supabase Edge Function: portfolio
// 거래일지(프로젝트7)용 — 두 가지 일을 한다.
//   action:"extract" → 증권사 앱 보유목록 스크린샷(이미지 parts)을 Gemini로 읽어 보유종목 JSON 반환
//   action:"quotes"  → 티커 리스트를 Yahoo Finance로 조회해 현재가 반환 (미국+한국+ETF 커버)
// GEMINI_KEY 시크릿은 서버에만 있고 브라우저/번들엔 절대 노출 안 됨 (gemini-extract와 같은 프로젝트라 키 재사용).
// 배포:  npx supabase functions deploy portfolio --no-verify-jwt
// (GEMINI_KEY는 gemini-extract 배포 때 이미 set 돼 있음 — 새로 안 해도 됨)

const KEY = Deno.env.get("GEMINI_KEY") ?? "";
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];
const ALLOW = [
  /^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.github\.io$/, /\.netlify\.app$/, /\.vercel\.app$/,
];

const EXTRACT_PROMPT = `너는 증권사 앱의 "보유 종목(잔고)" 스크린샷을 읽는 도우미다. 첨부 이미지에서 보유 중인 종목을 모두 찾아라. 토스증권·메리츠·NH나무 등 앱마다 화면 구조가 다르니 유연하게 읽어라.

각 종목마다 아래 값을 채워라:
- name: 화면에 보이는 종목명(한글이면 한글 그대로)
- ticker: 영문 심볼(대문자). 화면에 티커가 보이면 그대로 옮겨라(예: CRCL·BAR·SIVR·MAGS·BITO·SOXX·NASA·GOOGL). 한글명만 있고 잘 아는 종목이면 미국 상장 티커를 추론(예: "알파벳 A"→GOOGL, "라운드힐 매그니피센트 7 ETF"→MAGS, "프로셰어즈 비트코인 ETF"→BITO). 모르면 null.
- qty: 보유수량(주). 콤마 빼고 정수/실수.
- avgPrice: 평단가(평균단가·매입가, 1주당). 보이면 숫자, 안 보이면 null.
- curPrice: 현재가(1주당). 보이면 숫자, 안 보이면 null.
- amount: 그 종목의 **총 금액**(1주당이 아니라 합계). 화면에 보이면 반드시 숫자로 담아라. 예: 토스 "평가금" 모드의 종목별 금액, "매수금액"·"매입금액"·"평가금액" 칸.
- amountKind: amount가 무슨 금액인지 — 매수·매입 금액이면 "buy", 평가·현재 금액이면 "eval", 애매하면 "eval".
- currency: "USD" 또는 "KRW" (그 종목 값이 어떤 통화로 표시됐는지)
- market: "US"(미국주식/ETF) · "KR"(한국주식, 6자리 코드) · "CRYPTO"(코인)

규칙:
- 한국 종목(예: 삼성전자)은 ticker에 6자리 코드(예: 005930), market="KR", currency="KRW".
- **총 금액은 절대 버리지 마라.** 1주당 가격이 안 보여도 종목 옆 금액이 보이면 amount에 담고 amountKind를 표시하라. 단 총 금액을 1주당 값(avgPrice·curPrice)에 그대로 넣지는 마라 — 나눗셈은 앱이 한다.
- 예수금·현금·총자산·합계 줄은 종목이 아니다 → 제외.
- 숫자는 콤마·통화기호 빼고 순수 숫자. 확신 없으면 null. 화면에 없는 값을 지어내지 마라(환각 금지).

아래 JSON만 출력하라(다른 텍스트 금지):
{ "holdings": [ { "name": "...", "ticker": "...", "qty": 0, "avgPrice": null, "curPrice": null, "amount": null, "amountKind": null, "currency": "USD", "market": "US" } ] }`;

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = !!origin && ALLOW.some((re) => re.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "null",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

// ── Gemini 추출 ──
async function extract(parts: { mime: string; data: string }[]): Promise<Response> {
  const body = {
    contents: [{ parts: [{ text: EXTRACT_PROMPT }, ...parts.map((p) => ({ inline_data: { mime_type: p.mime, data: p.data } }))] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  };
  let lastErr = "";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) {
        const j = await r.json();
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) { lastErr = `${model} 빈 응답`; break; }
        return new Response(text, { status: 200 }); // 순수 추출 JSON
      }
      let reason = "";
      try { reason = (await r.json())?.error?.message ?? ""; } catch { /* 본문 없음 */ }
      lastErr = `${model} ${r.status}${reason ? " · " + reason : ""}`;
      if (r.status === 400 || r.status === 403) return new Response(JSON.stringify({ error: "Gemini 키 문제(서버): " + (reason || "invalid") }), { status: 400 });
      if (r.status === 503 || r.status === 429) { await new Promise((res) => setTimeout(res, 1500 * (attempt + 1))); continue; }
      break;
    }
  }
  return new Response(JSON.stringify({ error: "Gemini 호출 실패: " + lastErr }), { status: 502 });
}

// ── Yahoo Finance 시세 (미국·한국·ETF 커버) ──
// 한국 종목은 "005930.KS" 형태여야 함(프론트에서 .KS 붙여 보냄).
async function oneQuote(sym: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j?.chart?.result?.[0]?.meta;
    if (!m || typeof m.regularMarketPrice !== "number") return null;
    return {
      price: m.regularMarketPrice,
      currency: m.currency ?? null,
      prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
      // 이 시세가 "언제 만들어진 값"인지 + 장이 열려있는지 (앱이 마감가/실시간을 구분해 표시)
      at: typeof m.regularMarketTime === "number" ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      state: m.marketState ?? null,
      exch: m.exchangeName ?? null,
    };
  } catch { return null; }
}

async function quotes(tickers: string[]): Promise<Response> {
  const uniq = [...new Set(tickers.filter((t) => typeof t === "string" && t.trim()))].slice(0, 60);
  const out: Record<string, unknown> = {};
  // 동시 8개씩
  for (let i = 0; i < uniq.length; i += 8) {
    const batch = uniq.slice(i, i + 8);
    const res = await Promise.all(batch.map((s) => oneQuote(s)));
    batch.forEach((s, k) => { if (res[k]) out[s] = res[k]; });
  }
  return new Response(JSON.stringify({ quotes: out, at: new Date().toISOString() }), { status: 200 });
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });

  let payload: { action?: string; parts?: { mime: string; data: string }[]; tickers?: string[] };
  try { payload = await req.json(); } catch { return new Response(JSON.stringify({ error: "요청 JSON 오류" }), { status: 400, headers }); }

  let resp: Response;
  if (payload.action === "quotes") {
    if (!Array.isArray(payload.tickers) || !payload.tickers.length) resp = new Response(JSON.stringify({ error: "조회할 티커가 없습니다" }), { status: 400 });
    else resp = await quotes(payload.tickers);
  } else if (payload.action === "extract") {
    if (!KEY) resp = new Response(JSON.stringify({ error: "서버에 GEMINI_KEY 시크릿 미설정" }), { status: 500 });
    else if (!Array.isArray(payload.parts) || !payload.parts.length) resp = new Response(JSON.stringify({ error: "분석할 이미지가 없습니다" }), { status: 400 });
    else resp = await extract(payload.parts);
  } else {
    resp = new Response(JSON.stringify({ error: "action은 'extract' 또는 'quotes'" }), { status: 400 });
  }
  // CORS 헤더를 응답에 얹어 반환
  return new Response(resp.body, { status: resp.status, headers });
});
