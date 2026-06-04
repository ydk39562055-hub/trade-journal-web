-- 거래일지 클라우드 동기화 셋업 (로그인 없는 "동기화 코드" 방식)
-- Supabase → 프로젝트 chacha → SQL Editor 에 붙여넣고 RUN. 재실행해도 안전(IF NOT EXISTS / OR REPLACE).

-- 1) 동기화 저장 테이블: 코드 하나당 일지 전체를 jsonb 한 덩어리로 보관
create table if not exists journal_sync (
  sync_id    text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) RLS 켜고 '정책 없음' = anon 의 직접 select/insert/update/delete 전부 차단.
--    오직 아래 SECURITY DEFINER 함수로만 접근 → 코드를 모르면 남의 일지 조회/열거 불가.
alter table journal_sync enable row level security;

-- 3) 읽기: 정확한 코드일 때만 그 한 줄 반환
create or replace function sync_pull(p_sync_id text)
returns table(data jsonb, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.data, s.updated_at from journal_sync s where s.sync_id = p_sync_id;
$$;

-- 4) 쓰기: 업서트 후 서버시간 반환
create or replace function sync_push(p_sync_id text, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_now timestamptz;
begin
  insert into journal_sync(sync_id, data, updated_at)
  values (p_sync_id, p_data, now())
  on conflict (sync_id) do update set data = excluded.data, updated_at = now()
  returning updated_at into v_now;
  return v_now;
end;
$$;

-- 5) 함수 실행권한: anon(공개키)만 호출 가능하게
revoke all on function sync_pull(text)        from public;
revoke all on function sync_push(text, jsonb) from public;
grant execute on function sync_pull(text)        to anon, authenticated;
grant execute on function sync_push(text, jsonb) to anon, authenticated;

-- 6) PostgREST 스키마 캐시 새로고침(새 함수 즉시 인식)
notify pgrst, 'reload schema';
