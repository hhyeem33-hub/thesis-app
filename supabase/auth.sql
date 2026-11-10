-- 논문작업실: 여러 사람이 각자 계정으로 쓰기 (로그인 + 계정마다 자료 따로)
-- 슈파베이스 대시보드 → SQL Editor → 이 파일 전체를 붙여 넣고 "Run" (한 번만, 여러 번 눌러도 안전)
-- ⚠️ 기존 자료는 지우지 않는다. user_id 칸만 더하고, 지금 자료는 주인(내 계정)이 처음 로그인할 때 앱이 내 계정으로 옮긴다.

-- 1) 표마다 "누구 것인지" 칸 (로그인한 사람의 id)
alter table public.projects          add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.sources           add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.ai_drafts         add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.documents         add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.document_versions add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists projects_user_idx          on public.projects (user_id);
create index if not exists sources_user_idx           on public.sources (user_id, updated_at desc);
create index if not exists ai_drafts_user_idx         on public.ai_drafts (user_id, created_at desc);
create index if not exists documents_user_idx         on public.documents (user_id);
create index if not exists document_versions_user_idx on public.document_versions (user_id);

-- 2) 프로젝트 이름은 "사람마다" 겹치지 않게 (다른 사람도 '새 프로젝트 1'을 가질 수 있게)
alter table public.projects drop constraint if exists projects_name_key;
create unique index if not exists projects_user_name_idx on public.projects (user_id, name);

-- 3) 사람마다 설정 (공통 연구 설정, 자기 Claude API 키)
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  research    jsonb,
  ai_key      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.user_settings enable row level security;

-- 4) RLS: 로그인한 사람은 자기 것만 보기/쓰기
drop policy if exists "own rows" on public.projects;
create policy "own rows" on public.projects for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own rows" on public.sources;
create policy "own rows" on public.sources for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own rows" on public.ai_drafts;
create policy "own rows" on public.ai_drafts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own rows" on public.documents;
create policy "own rows" on public.documents for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own rows" on public.document_versions;
create policy "own rows" on public.document_versions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own rows" on public.user_settings;
create policy "own rows" on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 확인용: 아래 결과에 user_id 칸이 5개 표 모두 보이면 성공
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name = 'user_id' order by table_name;
