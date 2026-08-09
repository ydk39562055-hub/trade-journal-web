/* 거래일지 — 상수 + 샘플 데이터 (window 전역) */
(function () {
  const SETUP_TAGS = ['FVG', 'IFVG', 'OB', 'Breaker', 'Rejection Block', 'SFP', 'Liquidity sweep', 'MSS', 'Displacement', 'SMT', 'OTE'];
  const ERROR_TAGS = ['포모', '추격', '손절 밀기', '물타기', '복수매매', '오버사이즈', '조기청산', '근거없음'];
  const TIMEFRAMES = ['1M', '3M', '5M', '15M', '1H', '4H'];

  // 스윙·장기(현물성) 전용 — 진입근거 태그 / 보유유형
  const SPOT_REASON_TAGS = ['돌파', '눌림목', '바닥분할', '추세추종', '가치/펀더', '내러티브/테마', '수급/거래량', '매물대', '유동성 제거', '이벤트'];
  const HOLD_TYPES = ['단기', '스윙', '중기', '적립(DCA)'];

  // 시장 구분 — 선물(R·등급) / 스윙·장기(종목·비중·수익률). 스윙·장기는 현물성으로 입력 방식이 같음
  const MARKETS = ['선물', '스윙', '장기'];
  const SPOT_MARKETS = ['스윙', '장기'];       // '현물성' — 선물이 아닌 시장
  const isFutures = m => m === '선물';

  // 결과 라벨
  const RESULT = {
    win: { ko: '익절', cls: 'win' },
    loss: { ko: '손절', cls: 'loss' },
    be: { ko: '본전', cls: 'be' },
    holding: { ko: '보유중', cls: 'be' },
  };

  // 스윙·장기 시드는 비워둠 — 안 넣으면 보유 종목 매수금액을 원금으로 자동 사용(직접 넣으면 그 값 우선)
  const SEED = { futuresSeed: 10000, swingSeed: null, longSeed: null, futuresDeposit: 0, swingDeposit: 0, longDeposit: 0, currency: '$' };

  // ── 통화 (전역 토글: $ 달러 / ₩ 원화) ──
  // 저장값은 항상 달러(기준). ₩ 모드는 실시간 환율(USD→KRW)로 표시만 환산(비파괴).
  const CURRENCIES = [{ v: '$', label: '$ 달러' }, { v: '₩', label: '₩ 원화' }];
  let _CUR = '$';
  let _RATE = 1350;                                 // USD→KRW 폴백(실시간 로드 전/오프라인)
  const setCurrency = c => { _CUR = (c === '₩') ? '₩' : '$'; };
  const setRate = r => { const n = Number(r); if (n && n > 0) _RATE = n; };
  const rateKRW = () => _RATE;
  const curSym = () => _CUR;
  const conv = n => (_CUR === '₩') ? (Number(n) || 0) * _RATE : (Number(n) || 0); // 달러 기준 → 표시통화
  const _grp = n => Math.abs(Math.round(n)).toLocaleString('en-US');
  const money = n => { const v = conv(n); return (v < 0 ? '−' : '') + _CUR + _grp(v); };          // 부호 없는 표기 (음수만 −)
  const moneyS = n => { const v = conv(n); return (v > 0 ? '+' : v < 0 ? '−' : '') + _CUR + _grp(v); }; // 부호 있는 표기 (+/−)
  // 거래별 네이티브 통화 그대로 표기(환율 환산 없음). sym = 그 거래의 통화($/₩)
  const fmt = (n, sym, signed) => { const s = (sym === '₩') ? '₩' : '$'; const v = _grp(n); return signed ? ((n > 0 ? '+' : n < 0 ? '−' : '') + s + v) : ((n < 0 ? '−' : '') + s + v); };
  const toUSD = (n, sym) => (sym === '₩') ? (Number(n) || 0) / _RATE : (Number(n) || 0); // 합계용: 네이티브→달러 정규화
  /* ★ 2026-08-09 사용자 요청: "원화로 보이게 하고 옆에 달러도 표시".
     자산 화면은 큰 금액이라 원화가 기준이 맞다. 달러는 괄호로 같이 적어 감을 잃지 않게 한다.
     저장값은 늘 달러 기준이므로 여기서 표시만 환산한다(비파괴). */
  /* ⚠ 원화는 달러를 환율로 곱해 만든 값이라 끝자리가 의미 없다(₩421,743,287 의 287원).
     ★ 2026-08-09 사용자 요청 "천원단위 밑에는 보이지마" — 전부 천원 단위로 끊는다.
     같은 규칙을 모든 원화 표시에 쓰므로 합계와 항목이 크게 어긋나지 않는다. */
  const _tidyWon = v => Math.round(v / 1000) * 1000;   // 천원 단위 밑은 안 보인다(사용자 요청)
  const won = n => '₩' + _grp(_tidyWon((Number(n) || 0) * _RATE));
  const wonS = n => { const v = _tidyWon((Number(n) || 0) * _RATE); return (v > 0 ? '+' : v < 0 ? '−' : '') + '₩' + _grp(v); };
  const usdOnly = n => '$' + _grp(Number(n) || 0);
  const both = n => won(n) + ' (' + usdOnly(n) + ')';
  const bothS = n => wonS(n) + ' (' + ((Number(n) || 0) > 0 ? '+' : (Number(n) || 0) < 0 ? '−' : '') + usdOnly(n) + ')';

  // ── 샘플 거래 (시간순으로 작성; 앱이 최신순 정렬) ──
  const T = [
    // 4월
    ['2026-04-06', '선물', 'long', 'win', 2.3, 410, ['Liquidity sweep', 'MSS', 'IFVG'], [], 'NQ 런던 킬존. 아시아 로우 스윕 후 1분 MSS 확인, FVG 50% CE 지정가. 계획대로 전일 하이까지 보유. 깔끔.'],
    ['2026-04-07', '선물', 'short', 'loss', -1, -180, ['OB'], ['추격'], '스윕 안 기다리고 OB 보고 추격 진입. 무효화 닿아 손절. 시간도 매크로 윈도우 밖이었음.'],
    ['2026-04-09', '스윙', 'long', 'win', 1.6, 140, ['SFP', 'OTE'], [], 'BTC 디스카운트 OTE 구간 분할 매집. 주간 편향 상방 유지.'],
    ['2026-04-10', '선물', 'long', 'win', 1.8, 320, ['Displacement', 'IFVG'], [], 'NY AM 매크로. Displacement 강했고 FVG 0.7×ATR. 1:2서 50% 익절 후 본절.'],
    ['2026-04-13', '선물', 'short', 'win', 3.1, 560, ['Liquidity sweep', 'MSS', 'SMT'], [], 'ES/NQ SMT 괴리 확인. Equal high 스윕 → 숏. DOL까지 끌고 감. 이번 주 베스트.'],
    ['2026-04-14', '선물', 'long', 'be', 0, 0, ['OB'], ['조기청산'], '무서워서 본절 청산. 결국 타겟 도달함. 과정은 OK였는데 손이 빨랐다.'],
    ['2026-04-16', '스윙', 'long', 'loss', -1, -90, ['Breaker'], ['근거없음'], 'HTF 편향 애매한데 들어감. 관망했어야.'],
    ['2026-04-17', '선물', 'short', 'win', 2.0, 380, ['SFP', 'MSS'], [], '전일 하이 SFP, 꼬리로 찌르고 몸통 안쪽 마감. LTF MSS 후 진입.'],
    ['2026-04-20', '선물', 'long', 'win', 1.4, 250, ['IFVG'], [], 'BPR 인버전 자리. 살짝 일찍 청산했지만 규칙 내.'],
    ['2026-04-22', '선물', 'short', 'loss', -1, -200, ['OB', 'Displacement'], ['손절 밀기'], '손절 살짝 밀었다가 더 크게 맞음. 절대 하지 말 것.'],
    ['2026-04-24', '장기', 'long', 'win', 2.2, 210, ['OTE', 'SFP'], [], 'ETH OTE 0.705 되돌림 매수. 장기 코어 편입.'],
    ['2026-04-27', '선물', 'long', 'win', 1.9, 340, ['Liquidity sweep', 'MSS'], [], '월요일 조작 후 화요일 확장 노림. 아시아 로우 스윕 롱.'],
    ['2026-04-29', '선물', 'short', 'be', 0, 0, ['SFP'], [], '본절. SMT 부재로 사이즈 작게. 무난.'],
    // 5월
    ['2026-05-04', '선물', 'long', 'loss', -1, -190, ['OB'], ['포모'], 'FOMO. 매크로 윈도우 놓치고 뒤늦게 추격. 반성.'],
    ['2026-05-05', '선물', 'long', 'win', 2.6, 470, ['Displacement', 'IFVG', 'MSS'], [], 'NY 본장. 깔끔한 Displacement + FVG. 4개 컨플루언스 다 모임. 교과서.'],
    ['2026-05-07', '스윙', 'long', 'win', 1.5, 130, ['SFP'], [], 'BTC 전주 로우 SFP. 분할 매집.'],
    ['2026-05-08', '선물', 'short', 'win', 2.1, 390, ['Liquidity sweep', 'SMT', 'MSS'], [], 'SMT 강하게 떴음. Equal high 스윕 숏. 좋은 자리.'],
    ['2026-05-11', '선물', 'long', 'loss', -1, -210, ['Breaker'], ['오버사이즈'], '사이즈 과했다. 자리 좋아 보여서 무리. 손실 더 아팠음.'],
    ['2026-05-13', '선물', 'short', 'win', 1.7, 300, ['SFP', 'MSS'], [], 'NY PM. 전일 하이 SFP 후 진입. 1:1.7.'],
    ['2026-05-15', '스윙', 'long', 'be', 0, 0, [], ['조기청산'], '본전. 또 일찍 나옴. 패턴이 보인다.'],
    ['2026-05-18', '선물', 'long', 'win', 2.9, 520, ['Liquidity sweep', 'MSS', 'IFVG', 'SMT'], [], '이번 달 최고. 컨플루언스 4개 + SMT. DOL까지 풀홀딩.'],
    ['2026-05-20', '선물', 'short', 'loss', -1, -170, ['OB'], ['복수매매'], '직전 손실 복구하려 바로 재진입(복수매매). 금지 룰 어김.'],
    ['2026-05-22', '선물', 'long', 'win', 1.6, 290, ['OTE', 'IFVG'], [], '되돌림 OTE 자리. 무난하게 익절.'],
    ['2026-05-26', '장기', 'long', 'win', 2.4, 220, ['SFP', 'OTE'], [], 'ETH 디스카운트 매집. 장기 편향 정렬.'],
    ['2026-05-28', '선물', 'short', 'win', 2.0, 360, ['Liquidity sweep', 'MSS'], [], 'Equal high 스윕 후 MSS. 깔끔한 숏.'],
    // 6월
    ['2026-06-01', '선물', 'long', 'win', 1.8, 330, ['Displacement', 'IFVG'], [], '6월 시작 좋게. Displacement 강함.'],
    ['2026-06-02', '선물', 'short', 'loss', -1, -160, ['OB'], ['추격'], '또 추격. 스윕 없이 진입. 이 실수 반복 중.'],
    ['2026-06-03', '장기', 'long', 'win', 1.9, 180, ['SFP', 'MSS'], [], 'BTC 디스카운트 SFP. 코어 비중 확대.'],
  ];

  let _id = 0;
  // 진입 타임프레임 (인덱스별 — 통계용 다양성)
  const TF_SEQ = ['5M', '15M', '1M', '3M', '5M', '1H', '15M', '5M', '3M', '15M', '1H', '5M', '3M', '1M', '5M', '4H', '15M', '3M', '5M', '1H', '15M', '3M', '5M', '4H', '15M', '5M', '3M', '1H'];
  const ENTRIES = T.map(([traded_at, market, direction, result, realized_r, pnl, setups, errors, body], idx) => ({
    id: 'seed-' + (++_id),
    market, traded_at, direction, result, realized_r, pnl,
    timeframe: TF_SEQ[idx] || '5M',
    setups: setups.slice(), errors: errors.slice(), body,
    photos: [],
    created_at: traded_at + 'T12:00:00Z',
  })).reverse(); // 최신순

  const DEFAULT_PRINCIPLES = `오늘의 주문
· 넷이 하나로 모일 때 비로소 움직인다 — 확장·편향·스윕·OF전환. 그 외엔, 본다.
· 가격은 진실이고, 시간은 그 진실이 드러나는 순간이다. 기다림은 무능이 아니라 규율이다.
· 이기는 자는 많이 버는 자가 아니라, 규칙을 어기지 않는 자다. 오늘 비워도 진 것이 아니다.
· 한 번에 하나의 길만 걷는다. 조급함·복수심·미련은 들이지 않는다.

리스크 관리 — 절대 규칙 (어기면 그날 끝)
☐ 시드 0.5~1% 고정 — 손절 먼저 정하고 수량은 역산
☐ 손절은 진입과 동시에 — 멘탈 스탑 금지
☐ 물타기 금지 · 손절 불리하게 이동 금지
☐ 일일 −2R 도달 → 그날 종료
☐ 3연패 → 그날 종료
☐ 동시 포지션 1개 — 복수매매 금지`;

  // 실수 태그 — 기본 + 사용자 직접 추가(localStorage)
  function getErrorTags() {
    try { const a = JSON.parse(localStorage.getItem('tj_user_errtags') || 'null'); if (Array.isArray(a)) return [...new Set([...ERROR_TAGS, ...a])]; } catch {}
    return ERROR_TAGS.slice();
  }
  function addErrorTag(t) {
    t = (t || '').trim(); if (!t) return;
    let a = []; try { a = JSON.parse(localStorage.getItem('tj_user_errtags') || '[]'); } catch {}
    if (!ERROR_TAGS.includes(t) && !a.includes(t)) { a.push(t); localStorage.setItem('tj_user_errtags', JSON.stringify(a)); }
  }

  // ── 옛 '현물' → '스윙' 이관 (기록·시드 키 모두). 로컬/클라우드 로드 시 통과시킴 ──
  function migrateEntries(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.map(e => (e && e.market === '현물') ? { ...e, market: '스윙' } : e);
  }
  function migrateSettings(s) {
    if (!s || typeof s !== 'object') return s;
    const n = { ...s };
    if ('spotSeed' in n) { if (n.swingSeed == null) n.swingSeed = n.spotSeed; delete n.spotSeed; }
    if ('spotDeposit' in n) { if (n.swingDeposit == null) n.swingDeposit = n.spotDeposit; delete n.spotDeposit; }
    return n;
  }

  // 샘플 회고(실수 복기) — 처음 로드 시 '모아보기' 미리보기용. 언제든 삭제 가능.
  const MEMOS = [
    { id: 'memo-seed-1', at: '2026-07-28T22:14:00Z', text: '⚠ 실수 — 추격\n스윕 안 기다리고 OB 보고 바로 진입. 매크로 윈도우도 벗어났었다. 다음엔 킬존 + 스윕 확인까지 무조건 기다린다.' },
    { id: 'memo-seed-2', at: '2026-07-25T13:03:00Z', text: '⚠ 실수 — 손절 밀기\n손절을 살짝 옮겼다가 더 크게 맞음. 손절은 진입과 동시에 고정, 절대 불리하게 이동 금지.' },
    { id: 'memo-seed-3', at: '2026-07-21T09:40:00Z', text: '⚠ 실수 — 복수매매\n직전 손실 복구하려고 바로 재진입. 복수매매 금지 룰 어김. 진 날은 화면을 끈다.' },
    { id: 'memo-seed-4', at: '2026-07-18T12:20:00Z', text: '⚠ 실수 — 오버사이즈\n자리 좋아 보여서 사이즈를 키움. 결과는 손실이라 더 아팠다. 리스크 0.5~1% 고정으로 돌아간다.' },
    { id: 'memo-seed-5', at: '2026-07-14T08:55:00Z', text: '⚠ 실수 — 포모\n남들 다 먹는 것 같아 뒤늦게 추격. 계획에 없던 진입. 내 셋업 아니면 그냥 본다.' },
  ];

  window.TJ = {
    MEMOS,
    SETUP_TAGS, SPOT_REASON_TAGS, HOLD_TYPES, MARKETS, SPOT_MARKETS, isFutures,
    ERROR_TAGS, TIMEFRAMES, RESULT, SEED, ENTRIES, DEFAULT_PRINCIPLES,
    getErrorTags, addErrorTag, migrateEntries, migrateSettings,
    CURRENCIES, setCurrency, setRate, rateKRW, curSym, money, moneyS, fmt, toUSD,
    won, wonS, usdOnly, both, bothS,
  };
})();
