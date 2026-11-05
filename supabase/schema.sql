-- 논문작업실 슈파베이스 표 (온라인/버셀에서 사용)
-- 실행: npm run db:setup  (.env.local 의 POSTGRES_URL_NON_POOLING 사용)
-- 여러 번 실행해도 안전하다: 이미 있는 표·데이터는 그대로 둔다.
--
-- 보안: 표마다 바로 아래에서 RLS(행 수준 보안)를 켜고 정책은 만들지 않는다.
-- → 브라우저용 공개 키(anon)로는 읽기·쓰기가 모두 막히고, 버셀 서버의 비밀 키(service role)만 접근할 수 있다.
-- (RLS 문장이 이미 있으므로 SQL Editor에서는 그냥 'Run'을 누르면 된다. 'Run and enable RLS'는 누르지 않아도 됨)

-- 프로젝트 기록 (히스토리 표)
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null default '',
  created_at  timestamptz not null default now(),
  -- 폴더 상태 { ok, path?, error?, localOnly? } — 온라인에서는 폴더를 만들지 않으므로 localOnly
  obsidian    jsonb not null default '{"ok": false, "localOnly": true}',
  drive       jsonb not null default '{"ok": false, "localOnly": true}'
);
alter table public.projects enable row level security;

-- AI 초안 기록
create table if not exists public.ai_drafts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id) on delete set null,
  topic       text not null,
  purpose     text not null default '',
  method      text not null default '',
  title       text not null,
  manuscript  jsonb not null,
  saved_path  text,
  created_at  timestamptz not null default now()
);
alter table public.ai_drafts enable row level security;

create index if not exists ai_drafts_created_at_idx on public.ai_drafts (created_at desc);

-- 자료 (자료 수집 · 자료 관리 · AI 분류)  ※ 2026-11 추가
create table if not exists public.sources (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references public.projects (id) on delete set null,
  title           text not null,
  type            text not null check (type in ('pdf', 'markdown', 'web', 'youtube')),
  origin          text not null default '',
  content         text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- AI 분류 결과 { para, relevance(1~5), summary, classifiedAt } — 아직 안 했으면 null
  classification  jsonb
);
alter table public.sources enable row level security;

create index if not exists sources_updated_at_idx on public.sources (updated_at desc);

-- 연구 설정 (내 연구 주제·키워드) — 한 줄(id = 1)만 쓴다
create table if not exists public.research_settings (
  id          int primary key default 1 check (id = 1),
  topic       text not null default '',
  keywords    text[] not null default '{}',
  updated_at  timestamptz not null default now()
);
alter table public.research_settings enable row level security;

-- 자료 서지 정보 (참고문헌·각주용) { kind, authors, year, journal, volume, issue, pages, publisher, place, doi, kciId, category }  ※ 2026-11 추가
alter table public.sources add column if not exists bib jsonb;

-- 논문 원고 (프로젝트마다 하나)  ※ 2026-11 추가
create table if not exists public.documents (
  project_id  uuid primary key references public.projects (id) on delete cascade,
  doc         jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.documents enable row level security;

-- 원고 히스토리 (저장할 때마다 한 줄)
create table if not exists public.document_versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  saved_at    timestamptz not null default now(),
  chars       int not null default 0,
  memo        text not null default '',
  doc         jsonb not null
);
alter table public.document_versions enable row level security;

create index if not exists document_versions_project_idx on public.document_versions (project_id, saved_at desc);
