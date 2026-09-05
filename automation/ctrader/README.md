# FP Markets 거래일지 자동 수집 준비

2026-09-05: cTrader 신청 목록에서 **Yun Personal Trade Journal / Submitted** 확인.
신청 페이지: https://openapi.ctrader.com/apps (앱 경로 ID 38812).
이는 접수 상태이며 승인 또는 계좌 연결 완료가 아니다. Credentials는 열지 않았다.

## 현재 구현된 범위

- Node.js 24 이상에서 동작하는 서버용 cTrader JSON WebSocket 조회 클라이언트.
- 허용 목록에 있는 인증·조회 메시지만 전송. 주문/수정/청산 요청은 로컬에서 거부.
- 토큰 권한이 명확하게 SCOPE_VIEW일 때만 지정 계좌를 조회. 실계좌/데모 구분.
- 일 단위 조회, 반환 한도에 걸리면 시간 구간을 다시 분할. 같은 밀리초에 한도를
  넘으면 누락을 숨기지 않고 수집 전체를 실패시킨다.
- 체결번호별 최신 상태 보존, 이전 수집 기간과 7일 겹쳐 조회하여 지연 갱신 수용.
- 64비트 체결번호·계좌번호 및 통화 소수 자릿수 보존.
- 포지션별 체결 묶음, 부분 청산 후 남은 수량 대조, 한국 날짜와 UTC 시각 분리.
- 수수료·스왑·총손익·환전 수수료는 별도 항목으로 보관. 실제 계좌와 대조 전에는
  순손익 공식이나 일지의 win/loss 값을 확정하지 않는다.
- 실패 시 기존 파일/체크포인트를 유지. 완전한 응답을 받은 다음 원본과 검토용
  데이터를 파일 하나로 함께 교체한다. 실제 파일은 공개 저장소 밖에만 쓸 수 있다.

**아직 작동 중인 자동화는 아니다.** 아래 준비가 남았으며 운영 사이트는 수정하지 않았다.
이 코드는 승인 후 계좌 조회를 검증하는 수집 코어다. OAuth 화면, 토큰 자동 갱신,
상시 실행, 클라우드 저장, 기존 일지 반영 UI는 아직 구현되지 않았다.

## 승인 후 연결 순서

1. 사용자에게 승인 메일/Applications 상태를 확인받는다. 승인 소요 시간은 단정하지 않는다.
2. 단일 개인용 백엔드를 배포할 호스트와 비밀 저장소를 정한다. 공개 Pages는 화면만 제공한다.
   PC를 꺼도 수집하려면 서버 실행이 필요하다. 기존 Supabase 접근 권한과 요금제를 확인하고
   비용이 생기는 호스팅은 실제 조건을 제시한 뒤 결정한다.
3. 세션에 묶인 OAuth 시작·콜백과 토큰 암호화 저장/갱신을 구현한 뒤 **실제 배포된 콜백 URL**을
   cTrader Redirect URL에 등록한다. 지금은 배포된 콜백 URL이 없다. 임의 URL을 안내하지 않는다.
4. 사용자가 공식 cTrader 동의 화면에서 `accounts` 조회 권한으로 FP Markets 계좌를 선택한다.
   Client Secret, Access Token, Refresh Token을 채팅·GitHub·웹페이지 소스에 넣지 않는다.
5. 동의로 반환된 계좌 목록에서 FP Markets와 실계좌/데모를 사용자가 확인한다.
   `ctidTraderAccountId`는 트레이딩뷰의 로그인 계좌번호와 구별한다.
6. 기존 거래 일부를 조회하여 수수료 부호, 진입/청산 수수료 포함 범위, 스왑, 환전 비용,
   브로커 추가 비용, 부분 청산과 진입 이력 완전성을 계좌 보고서에 대조한다.
   검증용 새 주문은 필요 없다. 검증 전에는 기존 일지에 쓰지 않는다.
7. 서버에서 계좌별 수집을 겹치지 않게 실행하고 오류·재인증·마지막 수집 시각을 표시한다.
   7일보다 오래된 정정도 반영하도록 정기 전체 재조회가 필요하다.
8. 검증된 일지 변환기를 연결한 다음 자동 반영을 켠다. 휴대폰 화면은 같은 서버 데이터를 읽는다.

## 기존 거래일지와 연결할 때 지킬 데이터 구조

기존 `sync_push`는 일지 전체 JSON을 덮어쓴다. 수집 서버가 이 함수를 함께 사용하면
앱에서 작성한 메모와 경합하여 데이터가 사라질 수 있다. 수집 서버는 이 함수를 쓰지 않는다.

- 서버 전용 계좌 연결/토큰 저장소를 둔다. 브라우저에는 토큰을 반환하지 않는다.
- 별도 체결 원장: `(source, environment, account, dealId)`를 고유키로 사용.
- 별도 자동 일지: `(source, environment, account, positionId)`를 고유키로 사용.
- 수동 일지와 연결할 때 매매 사실과 사용자 메모/태그/사진을 별도 필드로 관리.
- 재조회는 매매 사실만 갱신. 삭제 표시와 사용자 메모는 보존.
- 이미 손으로 쓴 같은 거래는 날짜·가격만으로 자동 삭제/병합하지 않는다. 처음 연결할 때
  가져올 시작일을 정하고 기존 기록과의 중복 후보를 검토한다.
- 계좌 통화는 브로커 메타데이터에서 얻는다. 달러로 가정하거나 실시간 환율로 과거 손익을
  덮어쓰지 않는다. 현재 일지에 없는 통화는 별도 대응 전 자동 반영에서 제외한다.
- 승인/연결/수집 중/오류/연결 해제를 구분한다. 브라우저를 닫아도 서버의 수집 상태가 유지된다.

## 개발 검증

저장소 루트에서:

```text
node --test automation/ctrader/collector.test.mjs
```

테스트는 가상 응답만 사용하고 브로커/기존 일지에는 접속하지 않는다.
조회 클라이언트 테스트도 가상 WebSocket이다. 공식 서버와의 호환성, 실제 계좌에 대한
이력 보존 범위와 금액 일치는 승인·동의 후 별도로 검증해야 한다.

승인 및 OAuth 구현 후, 서버에 외부 비밀 설정 파일을 준비한 상태에서 한 번 조회하는 명령:

```text
node --env-file=<공개_저장소_밖의_비밀설정파일> automation/ctrader/collect.mjs
```

토큰 자동 갱신과 스케줄러가 아직 없으므로 이 명령만으로 상시 자동화가 되지는 않는다.
동일 계좌에 여러 프로세스를 동시에 실행하면 안 된다. 미래 호스트의 스케줄러는 단일 실행을
보장해야 한다. 저장된 체결 파일은 금융정보이므로 공개 정적 호스팅으로 제공하지 않는다.

## 공식 자료

- FP Markets–TradingView는 cTrader 계좌 연동: https://www.tradingview.com/support/solutions/43000765711-i-receive-the-error-trader-not-found-for-login-on-fp-markets/
- 앱 등록/승인: https://help.ctrader.com/open-api/api-application/
- OAuth 및 조회 권한: https://help.ctrader.com/open-api/account-authentication/
- JSON 메시지: https://help.ctrader.com/open-api/sending-receiving-json/
- 접속 주소: https://help.ctrader.com/open-api/proxies-endpoints/
- 메시지와 금융 단위: https://help.ctrader.com/open-api/messages/ 및 https://help.ctrader.com/open-api/model-messages/
- 메시지 번호 원본: https://github.com/spotware/openapi-proto-messages
