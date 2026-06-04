# 거래일지 (웹)

선물/현물 자유 거래일지. 단일 HTML 웹앱 + Supabase 저장(클라우드).

## 쓰는 법
1. (최초 1회) Supabase 대시보드 → SQL Editor에 `supabase_setup.sql` 붙여넣고 RUN
2. 배포된 주소 열기 → 이메일로 6자리 코드 받아 로그인
3. + 버튼으로 일지 작성 (선물/현물 태그 · 날짜 · 자유 메모 · 사진)

## 저장
- 매번 저장 시 **Supabase(클라우드 DB)에 즉시 기록** → 기기·브라우저 바뀌어도 안 사라짐
- 동시에 브라우저 localStorage에도 캐시(즉시 로딩 + 오프라인 임시 보존)
- 본인 계정 것만 보임 (Row Level Security)

## 메모
- `sb_publishable_...` 키는 클라이언트 공개용 키라 노출돼도 안전(RLS가 데이터 보호)
- chacha(차근차근) Supabase에 `free_journal` 테이블 하나만 추가 — 기존 데이터 영향 없음
