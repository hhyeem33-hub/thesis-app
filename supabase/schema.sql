-- 논문작업실 슈파베이스 표 (온라인/버셀에서 사용)
-- 실행: npm run db:setup  (.env.local 의 POSTGRES_URL_NON_POOLING 사용)
-- 여러 번 실행해도 안전하다: 이미 있는 표·데이터는 그대로 둔다.

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

create index if not exists ai_drafts_created_at_idx on public.ai_drafts (created_at desc);

-- 보안: RLS를 켜고 정책을 만들지 않는다.
-- → 브라우저용 공개 키(anon)로는 읽기·쓰기가 모두 막히고,
--   버셀 서버의 비밀 키(service role)만 접근할 수 있다.
alter table public.projects enable row level security;
alter table public.ai_drafts enable row level security;
