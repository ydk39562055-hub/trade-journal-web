-- 거래일지 자동 백업(스냅샷) 셋업
-- Supabase → 프로젝트 chacha → SQL Editor 에 붙여넣고 RUN. 재실행해도 안전.
--
-- 왜 필요한가:
--   동기화(journal_sync)는 '거울'이라 여기서 지우면 서버에서도 지워진다.
--   실수로 지운 걸 되돌리려면 **지우기 전 상태**가 따로 남아 있어야 한다.
--   그래서 하루 한 번 그날의 상태를 통째로 쌓아두고, 최근 14개만 유지한다.

-- 1) 스냅샷 보관 테이블
create table if not exists journal_snapshot (
  id         bigserial primary key,
  sync_id    text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists journal_snapshot_idx on journal_snapshot (sync_id, created_at desc);

-- 2) RLS: 정책 없음 = 직접 접근 전면 차단. 아래 함수로만 오간다(동기화와 같은 방식).
alter table journal_snapshot enable row level security;

-- 3) 쌓기 — 같은 코드로 20시간 안에 이미 쌓았으면 건너뛴다(하루 한 번꼴).
--    쌓은 뒤 최근 14개만 남기고 오래된 건 지운다(용량 관리).
create or replace function snap_push(p_sync_id text, p_data jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_last timestamptz; v_now timestamptz;
begin
  if p_sync_id is null or length(p_sync_id) < 10 then
    raise exception 'bad sync id';
  end if;

  select max(created_at) into v_last from journal_snapshot where sync_id = p_sync_id;
  if v_last is not null and v_last > now() - interval '20 hours' then
    return v_last;                                   -- 오늘 것은 이미 있다
  end if;

  insert into journal_snapshot(sync_id, data) values (p_sync_id, p_data)
  returning created_at into v_now;

  delete from journal_snapshot
   where sync_id = p_sync_id
     and id not in (select id from journal_snapshot
                     where sync_id = p_sync_id
                     order by created_at desc limit 14);
  return v_now;
end;
$$;

-- 4) 목록 — 언제 것이 있는지(내용은 안 준다. 목록만 가볍게)
create or replace function snap_list(p_sync_id text)
returns table(id bigint, created_at timestamptz, bytes int)
language sql
security definer
set search_path = public
as $$
  select s.id, s.created_at, length(s.data::text) as bytes
    from journal_snapshot s
   where s.sync_id = p_sync_id
   order by s.created_at desc;
$$;

-- 5) 되돌리기 — 그 시점의 내용을 통째로 돌려준다
create or replace function snap_get(p_sync_id text, p_id bigint)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select s.data from journal_snapshot s
   where s.sync_id = p_sync_id and s.id = p_id;
$$;
