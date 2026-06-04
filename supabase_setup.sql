-- ════════════════════════════════════════════════════════════
--  거래일지 웹앱 — Supabase 일회용 셋업
--  Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 RUN (한 번만)
--  (chacha 프로젝트에 free_journal 테이블 1개만 추가. 기존 차근차근 데이터 영향 없음)
-- ════════════════════════════════════════════════════════════

create table if not exists public.free_journal (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  market      text not null default '선물',           -- '선물' 또는 '현물'
  traded_at   date not null default current_date,
  body        text default '',
  photos      jsonb default '[]'::jsonb,               -- 압축된 사진(data URL) 배열
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 본인 것만 읽고/쓰게 (Row Level Security)
alter table public.free_journal enable row level security;

drop policy if exists "free_journal own rows" on public.free_journal;
create policy "free_journal own rows" on public.free_journal
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists free_journal_user_date
  on public.free_journal(user_id, traded_at desc);

-- 통계용 선택 컬럼 (전부 nullable — 자유형 유지, 채운 거래만 통계 집계)
alter table public.free_journal add column if not exists direction   text;            -- 'long'|'short'
alter table public.free_journal add column if not exists entry_price  numeric;
alter table public.free_journal add column if not exists exit_price   numeric;
alter table public.free_journal add column if not exists result       text;            -- 'win'|'loss'|'be'
alter table public.free_journal add column if not exists realized_r   numeric;         -- 실현 R배수(부호 포함)
alter table public.free_journal add column if not exists pnl          numeric;         -- 손익 금액(부호 포함, 단위는 본인 기준)
alter table public.free_journal add column if not exists errors       jsonb default '[]'::jsonb;
alter table public.free_journal add column if not exists setups       jsonb default '[]'::jsonb;     -- ICT 셋업 태그(FVG인버전/OB/SFP 등)

-- 매매 원칙 저장 (항상 보기 + 본인 수정용, 1인 1행)
create table if not exists public.journal_prefs (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  principles  text default '',
  updated_at  timestamptz default now()
);
alter table public.journal_prefs enable row level security;
drop policy if exists "journal_prefs own" on public.journal_prefs;
create policy "journal_prefs own" on public.journal_prefs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
