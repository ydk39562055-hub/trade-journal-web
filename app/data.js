/* 거래일지 — 상수 + 샘플 데이터 (window 전역) */
(function () {
  const SETUP_TAGS = ['IFVG', 'OB', 'Breaker', 'SFP', 'Liquidity sweep', 'MSS', 'Displacement', 'SMT', 'OTE'];
  const ERROR_TAGS = ['포모', '추격', '손절 밀기', '물타기', '복수매매', '오버사이즈', '조기청산', '근거없음'];
  const TIMEFRAMES = ['1M', '3M', '5M', '15M', '1H', '4H'];

  // 결과 라벨
  const RESULT = {
    win: { ko: '익절', cls: 'win' },
    loss: { ko: '손절', cls: 'loss' },
    be: { ko: '본전', cls: 'be' },
  };

  const SEED = { futuresSeed: 10000, spotSeed: 5000 };

  // ── 샘플 거래 (시간순으로 작성; 앱이 최신순 정렬) ──
  const T = [
    // 4월
    ['2026-04-06', '선물', 'long', 'win', 2.3, 410, ['Liquidity sweep', 'MSS', 'IFVG'], [], 'NQ 런던 킬존. 아시아 로우 스윕 후 1분 MSS 확인, FVG 50% CE 지정가. 계획대로 전일 하이까지 보유. 깔끔.'],
    ['2026-04-07', '선물', 'short', 'loss', -1, -180, ['OB'], ['추격'], '스윕 안 기다리고 OB 보고 추격 진입. 무효화 닿아 손절. 시간도 매크로 윈도우 밖이었음.'],
    ['2026-04-09', '현물', 'long', 'win', 1.6, 140, ['SFP', 'OTE'], [], 'BTC 디스카운트 OTE 구간 분할 매집. 주간 편향 상방 유지.'],
    ['2026-04-10', '선물', 'long', 'win', 1.8, 320, ['Displacement', 'IFVG'], [], 'NY AM 매크로. Displacement 강했고 FVG 0.7×ATR. 1:2서 50% 익절 후 본절.'],
    ['2026-04-13', '선물', 'short', 'win', 3.1, 560, ['Liquidity sweep', 'MSS', 'SMT'], [], 'ES/NQ SMT 괴리 확인. Equal high 스윕 → 숏. DOL까지 끌고 감. 이번 주 베스트.'],
    ['2026-04-14', '선물', 'long', 'be', 0, 0, ['OB'], ['조기청산'], '무서워서 본절 청산. 결국 타겟 도달함. 과정은 OK였는데 손이 빨랐다.'],
    ['2026-04-16', '현물', 'long', 'loss', -1, -90, ['Breaker'], ['근거없음'], 'HTF 편향 애매한데 들어감. 관망했어야.'],
    ['2026-04-17', '선물', 'short', 'win', 2.0, 380, ['SFP', 'MSS'], [], '전일 하이 SFP, 꼬리로 찌르고 몸통 안쪽 마감. LTF MSS 후 진입.'],
    ['2026-04-20', '선물', 'long', 'win', 1.4, 250, ['IFVG'], [], 'BPR 인버전 자리. 살짝 일찍 청산했지만 규칙 내.'],
    ['2026-04-22', '선물', 'short', 'loss', -1, -200, ['OB', 'Displacement'], ['손절 밀기'], '손절 살짝 밀었다가 더 크게 맞음. 절대 하지 말 것.'],
    ['2026-04-24', '현물', 'long', 'win', 2.2, 210, ['OTE', 'SFP'], [], 'ETH OTE 0.705 되돌림 매수. 주간 목표 도달.'],
    ['2026-04-27', '선물', 'long', 'win', 1.9, 340, ['Liquidity sweep', 'MSS'], [], '월요일 조작 후 화요일 확장 노림. 아시아 로우 스윕 롱.'],
    ['2026-04-29', '선물', 'short', 'be', 0, 0, ['SFP'], [], '본절. SMT 부재로 사이즈 작게. 무난.'],
    // 5월
    ['2026-05-04', '선물', 'long', 'loss', -1, -190, ['OB'], ['포모'], 'FOMO. 매크로 윈도우 놓치고 뒤늦게 추격. 반성.'],
    ['2026-05-05', '선물', 'long', 'win', 2.6, 470, ['Displacement', 'IFVG', 'MSS'], [], 'NY 본장. 깔끔한 Displacement + FVG. 4개 컨플루언스 다 모임. 교과서.'],
    ['2026-05-07', '현물', 'long', 'win', 1.5, 130, ['SFP'], [], 'BTC 전주 로우 SFP. 분할 매집.'],
    ['2026-05-08', '선물', 'short', 'win', 2.1, 390, ['Liquidity sweep', 'SMT', 'MSS'], [], 'SMT 강하게 떴음. Equal high 스윕 숏. 좋은 자리.'],
    ['2026-05-11', '선물', 'long', 'loss', -1, -210, ['Breaker'], ['오버사이즈'], '사이즈 과했다. 자리 좋아 보여서 무리. 손실 더 아팠음.'],
    ['2026-05-13', '선물', 'short', 'win', 1.7, 300, ['SFP', 'MSS'], [], 'NY PM. 전일 하이 SFP 후 진입. 1:1.7.'],
    ['2026-05-15', '현물', 'long', 'be', 0, 0, [], ['조기청산'], '본전. 또 일찍 나옴. 패턴이 보인다.'],
    ['2026-05-18', '선물', 'long', 'win', 2.9, 520, ['Liquidity sweep', 'MSS', 'IFVG', 'SMT'], [], '이번 달 최고. 컨플루언스 4개 + SMT. DOL까지 풀홀딩.'],
    ['2026-05-20', '선물', 'short', 'loss', -1, -170, ['OB'], ['복수매매'], '직전 손실 복구하려 바로 재진입(복수매매). 금지 룰 어김.'],
    ['2026-05-22', '선물', 'long', 'win', 1.6, 290, ['OTE', 'IFVG'], [], '되돌림 OTE 자리. 무난하게 익절.'],
    ['2026-05-26', '현물', 'long', 'win', 2.4, 220, ['SFP', 'OTE'], [], 'ETH 디스카운트 매집. 주간 편향 정렬.'],
    ['2026-05-28', '선물', 'short', 'win', 2.0, 360, ['Liquidity sweep', 'MSS'], [], 'Equal high 스윕 후 MSS. 깔끔한 숏.'],
    // 6월
    ['2026-06-01', '선물', 'long', 'win', 1.8, 330, ['Displacement', 'IFVG'], [], '6월 시작 좋게. Displacement 강함.'],
    ['2026-06-02', '선물', 'short', 'loss', -1, -160, ['OB'], ['추격'], '또 추격. 스윕 없이 진입. 이 실수 반복 중.'],
    ['2026-06-03', '현물', 'long', 'win', 1.9, 180, ['SFP', 'MSS'], [], 'BTC 디스카운트 SFP. 분할 익절.'],
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

  const DEFAULT_PRINCIPLES = `ICT 거래 시스템 — 데일리 루틴 & 원칙

오늘의 주문
· 확장 + 편향 + 스윕 + OF전환 — 4개 모일 때만 진입. 나머지 관망.
· PRICE를 읽고, 맞는 TIME을 기다린다. 관망도 포지션.
· 오늘 못 먹어도 된다. 규칙 지키는 게 이기는 것.
· 한 번에 한 셋업. FOMO·복수·물타기 금지.

━━━━━ 0. 데일리 루틴 (매일 읽고 시작) ━━━━━

① 장전 분석 — HTF 컨텍스트
☐ 일봉·4H 오더플로우 방향? (상승/하락)
☐ 50% EQ 기준 지금 프리미엄? 디스카운트?
☐ HTF FVG/OB 거부 중 vs 미청산 유동성으로 달리는 중?
☐ True Daily Open(00:00 NY) 표시 → 롱은 시가 아래, 숏은 위에서만
☐ 오늘의 DOL 한 곳 적기 — 없으면 거래 안 함

② 레벨 마킹 & 시간 세팅
☐ 유동성 풀 표시: 아시아 H/L · 전일/전주 H/L · Equal H/L
☐ 차트 NY 시간 세팅 확인
☐ 고임팩트 뉴스 시간 표시 (발표 직전 신규 진입 자제)
☐ 시간 왜곡일? (월요일·월말/분기말 등)

③ 시간대에서 대기 (시간 필터)
· 런던 킬존·뉴욕 본장 밖이면 패턴 이뻐도 PASS.
· 매크로 윈도우(:50–:10, AM 10–11)에 집중.

④ 셋업 포착 — 컨펌 순서대로 (빠지면 PASS)
1. 스윕 — 키풀(아시아·전일 H/L·Equal) 건드렸나
2. SFP — 꼬리로 찌르고 몸통은 라인 안쪽 마감
3. OF 전환(MSS/CISD) — LTF 반대 스윙 돌파·마감
4. Displacement + FVG ≥ 0.5×ATR
5. SMT — 상관자산 괴리 (있으면 버프)

⑤ 진입 집행 (기계적으로)
☐ 진입: FVG 상단 또는 50% CE에 지정가
☐ 손절: SFP 꼬리 아래 or OB 시가 아래
☐ delivery sentence 한 줄 적기

리스크 관리 — 절대 규칙 (어기면 그날 끝)
▸ 시드 0.5~1% 고정 — 손절 정하고 수량은 역산
▸ 손절은 진입과 동시에. 멘탈 스탑 금지
▸ 물타기 금지 · 손절 불리하게 이동 금지
▸ 일일 한도 −2R → 그날 종료
▸ 3연패 → 그날 종료
▸ 동시 포지션 1개. 복수매매 금지

⑥ 청산
· 1차 내부 유동성서 50% 분할 + 본절 이동
· 2차 외부 유동성: 내러티브 안 깨졌으면 DOL까지

장 마감 후 — 복기
☐ 규칙 다 지켰나? (결과 말고 과정)
☐ 한 줄 교훈 — 어제보다 나아지기`;

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

  window.TJ = {
    SETUP_TAGS, ERROR_TAGS, TIMEFRAMES, RESULT, SEED, ENTRIES, DEFAULT_PRINCIPLES, getErrorTags, addErrorTag,
  };
})();
