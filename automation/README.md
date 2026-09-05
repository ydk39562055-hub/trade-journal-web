# 거래일지 PC 자동 수집

2026-09-06 현재 구현과 검증 결과:

- 사용자 선택: 유료 서버 없이 Windows 로그인 후 PC에서 토스를 5분마다 수집.
- 실제 API 조회: 주문 1,232건 중 체결이 있는 주문 1,020건을 확인.
- 사용자 지정 일지 범위: **2026-01-01 00:00 한국 시간 이후 체결만**. 현재 자동 기록 178건.
- 수집 원본은 공개 저장소 밖에 저장. 앱에는 올해 체결 사실만 별도 클라우드 기록으로 동기화.
- 기존 수동 일지와 별도 ID이므로 수집기가 일지·메모 전체를 덮어쓰지 않음.
- 실제 클라우드 쓰기 후 재조회 검증, 브라우저의 178건 표시와 종목 검색 확인.
- Windows 예약 작업 `TradeJournal-Toss-Collector` 등록 및 실행 확인.
- 설치형 웹앱(PWA), 휴대폰 화면, 이전에 열어본 앱 자원 캐시 추가.
- FP Markets는 cTrader 앱 승인 및 실제 계좌 동의가 남음. 거래 API는 호출하지 않음.
- 메리츠는 국내/미국 체결 알림과 화면 캡처 지원 요청을 받았으며 별도 작업 중.

## PC 설정과 유지 관리

Node.js 24 이상. 아래 설정은 처음 한 번만 한다.

```text
node automation/setup-local.mjs <공개저장소밖_비공개폴더_절대경로> <ap.txt_절대경로>
node --env-file=<비공개폴더>/collector.env automation/toss/collect.mjs
```

PowerShell에서 `automation/install-windows.ps1 -PrivateDirectory <비공개폴더> -NodePath <node.exe 경로>`로
현재 사용자 로그인 시 실행을 등록한다. 다른 이름의 기존 예약 작업은 수정하지 않는다.
작업 등록/시작에는 해당 컴퓨터에서 허용된 Windows 작업 스케줄러 권한이 필요하다.
설정 파일에는 API 값 대신 원본 키 파일 경로가 들어가므로 ap.txt를 이동하면 경로를 갱신한다.

- 시작: `Start-ScheduledTask -TaskName TradeJournal-Toss-Collector`
- 중지: `Stop-ScheduledTask -TaskName TradeJournal-Toss-Collector`
- 상태: 비공개 폴더의 `toss-status.json`, `collector.log`, `collector-error.log`
- 마지막 동기화 시각은 앱의 자동 기록 화면에도 표시된다.
- PC 종료/절전 중에는 새 수집이 멈추고, 재개 시 이용 가능한 이력을 다시 조회한다.
- 코드 변경 후에는 해당 수집기를 재시작해야 새 코드가 적용된다.

현재 자동화의 API 인증 키는 조회·기록 코드에서만 읽는다. 토스 클라이언트는 인증과 조회
경로만 허용하고 주문, 변경, 취소 기능이 없다. API 자체의 키 권한 범위와는 별개다.

## 화면과 휴대폰 연결

자동 기록 탭에서 비공개 폴더의 `자동기록_연결.json`을 한 번 선택한다.
연결 파일에는 거래일지 자동 기록을 공유하는 비밀 코드가 들어가며 브로커 API 키는 없다.
이 코드를 아는 사람은 동일 기록에 접근할 수 있으므로 공개 저장소에 넣지 않는다.
현재 cloud RPC의 보호 방식은 기존 앱과 같은 공유 비밀 방식이며 서버가 읽기/쓰기를 별도로
제한하는 권한 체계는 아니다. UI는 수집 데이터에 읽기만 수행한다.

기존 일지 동기화가 켜져 있으면 연결 설정과 매매 메모도 다른 기기에 동기화된다.
켜져 있지 않은 기기는 자동 기록의 연결코드를 한 번 입력한다.
모바일 Chrome에서 사이트 메뉴 → 앱 설치/홈 화면에 추가로 설치할 수 있다.
폰 자체에 실제 설치하는 단계와 FP 계좌 로그인 동의는 사용자가 해야 한다.

## 검증과 데이터 해석

```text
node --test automation/toss/client.test.mjs automation/toss/history.test.mjs automation/private-store.test.mjs automation/ctrader/collector.test.mjs automation/feed.test.mjs automation/browser-feed.test.mjs
node automation/audit-private.mjs <ap.txt> <자동기록_연결.json>
```

한 행은 개별 틱 체결이 아니라 **한 주문의 누적 체결**이다. 시간은 마지막 체결시각이다.
실현손익은 현재 null이며 매입 원가·분할·입출고 등을 대조하기 전 통계에 합산하지 않는다.
진입 이유/복기 메모는 사용자 입력이며 수집 데이터와 분리하여 기존 메모 동기화를 사용한다.
연도 제한은 주문 접수일이 아닌 마지막 체결 시각에 적용한다. 연도에 걸친 분할 체결 주문은
API가 누적 수량만 제공하므로 연도별 개별 체결량으로 분해하지 않는다.

PWA 서비스 워커는 명시된 공개 코드·아이콘·런타임만 캐시한다. API 응답을 가로채지 않는다.
브라우저의 거래내역 캐시는 연결코드별 IndexedDB에 따로 저장되어 마지막 기록을 보여준다.
오프라인 상태에서는 최신 여부와 수집 대기를 표시한다.
