# FP Markets PC 자동 기록

2026-09-09: cTrader 앱 Active 확인, 실사용 OAuth 조회 전용 연결 완료. Windows 사용자 암호화로 인증정보를 저장하고 실제 올해 체결을 수집·클라우드 재조회 검증했다. Sandbox 토큰은 운영에 사용하지 않는다.

## 실행과 저장

Node.js 24 이상, Windows 로그인 세션에서 실행한다. 비공개 폴더는 공개 저장소 밖에 둔다.

1. `node automation/ctrader/connect-local.mjs <비공개폴더>`를 실행한다.
2. `http://127.0.0.1:8767/` 화면의 생성된 Redirect URI를 cTrader 앱에 추가한다. Save의 이용약관 동의는 사용자가 확인한다.
3. 실제 Client ID와 Secret을 로컬 화면에 입력한다. DPAPI CurrentUser 암호화로 저장한다.
4. 조회 전용 계좌 연결을 눌러 공식 cTrader 페이지에서 본인의 계좌 하나를 선택한다. `accounts` / SCOPE_VIEW만 허용한다.
5. 연결 완료 후 연결 서버를 종료한다. 같은 비공개 폴더의 SQLite 잠금이 수집기와 동시 실행을 막는다.
6. 아래 환경 파일을 비공개 폴더에 만든다. 인증값 대신 경로만 넣는다.

```text
TJ_PRIVATE_DATA_DIR="<FP 비공개폴더 절대경로>"
TJ_FEED_CODE_PATH="<기존 자동기록_연결.json 절대경로>"
```

```text
node --env-file=<FP비공개폴더>/collector.env automation/ctrader/watch.mjs
```

클라우드 전송은 사용자가 체결 데이터와 대상 저장소를 승인한 다음 실행한다. 토스와 같은 연결코드에서 별도 `fp-data`, `fp-status` 레코드만 갱신하고 저장 결과를 다시 읽어 검증한다. 기존 토스·수동 일지·메모를 덮어쓰지 않는다. 계좌번호·주문번호·체결번호는 공개 피드에 넣지 않고 내부 중복 식별자는 해시로 변환한다. 인증키와 원본은 GitHub Pages로 보내지 않는다.

Windows 자동 시작:

```powershell
./automation/install-windows.ps1 -PrivateDirectory <FP비공개폴더> -NodePath <node.exe경로> -Broker FPMarkets
```

예약 작업 이름은 `TradeJournal-FPMarkets-Collector`. PC 로그인 후 5분 간격이며 실패하면 최대 한 시간까지 재시도 간격을 늘린다. 종료·절전 중에는 수집을 멈추고 휴대폰은 마지막 클라우드 기록을 보여준다. 토큰 만료 하루 전 갱신하며 회전된 토큰을 암호화 저장한 뒤 조회한다. 앱 권한 취소 등으로 갱신이 실패하면 재연결이 필요하다.

상태 파일은 `fp-status.json`, 원본/체크포인트는 `fp-snapshot.json`, 게시 상태는 `fp-publication.json`이다. 인증정보는 `connection.dpapi`에만 저장한다. 이 파일은 다른 Windows 사용자로 복사해 사용할 수 없다. 수집기 변경 후에는 해당 예약 작업을 재시작한다.

## 범위와 금액

- 한국 시간 2026-01-01 이후 체결만 기록한다. 이전 연도까지 확대하지 않는다.
- 일별 조회, 반환 한도에 걸리면 구간 분할. 완전성을 확인하지 못하면 체크포인트를 진행하지 않는다.
- 체결번호로 중복 제거하고 최근 7일을 겹쳐 수집한다. 일주일마다 올해 전체를 재조회해 오래된 정정도 반영한다.
- 체결별 진입/청산과 실제 매수/매도를 보여준다. 수량은 cTrader volume을 100으로 나눈 단위이며 랏으로 가정하지 않는다.
- 체결가의 호가 통화와 수수료·손익의 계좌 통화를 구분한다. 통화가 없으면 추측하지 않는다.
- 총손익, 수수료, 청산 수수료, 스왑, 환전 비용은 브로커 원본의 자릿수와 부호를 보존한다. 순손익 공식은 계좌 보고서와 대조 전 확정하지 않는다.
- 자동 기록은 기존 실현손익·승률 통계에 아직 합산하지 않는다. 매매 메모는 별도 동기화된다.
- 조회 클라이언트는 주문·수정·취소 요청을 로컬 허용 목록에서 거부한다.

## 검증

```text
node --test automation/ctrader/collector.test.mjs automation/ctrader/feed.test.mjs automation/ctrader/vault.test.mjs automation/browser-feed.test.mjs automation/feed.test.mjs
node automation/audit-private.mjs <ap.txt> <자동기록_연결.json> <FP비공개폴더>
```

테스트에는 가상 계좌와 체결만 사용한다. 실제 수집·저장 성공은 별도 운영 검증이며 테스트가 실계좌 금액의 독립적인 정확성 대조를 대신하지 않는다.

## 공식 자료

- [OAuth 및 조회 권한](https://help.ctrader.com/open-api/account-authentication/)
- [메시지](https://help.ctrader.com/open-api/messages/)
- [금융 단위](https://help.ctrader.com/open-api/model-messages/)
- [메시지 원본](https://github.com/spotware/openapi-proto-messages)
