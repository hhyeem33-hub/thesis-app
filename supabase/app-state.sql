-- 논문작업실: 공유 링크 · 논문 진행 칸반 등 작은 설정을 저장하는 표 (사람마다 따로)
-- 슈파베이스 대시보드 → SQL Editor → 이 파일 전체를 붙여 넣고 "Run" (한 번만, 여러 번 눌러도 안전, 기존 자료는 건드리지 않음)

create table if not exists public.app_state (
  user_id     uuid not null references auth.users (id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);
-- 공유 링크(share:토큰)는 링크를 연 사람이 누구든 토큰으로 찾는다 (찾는 일은 서버만 함)
create index if not exists app_state_key_idx on public.app_state (key);

-- RLS: 로그인한 사람은 자기 것만 보기/쓰기 (공유 화면은 서버가 비밀 키로 토큰 한 줄만 읽음)
alter table public.app_state enable row level security;
drop policy if exists "own rows" on public.app_state;
create policy "own rows" on public.app_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 확인용: 아래에 app_state 가 보이면 성공
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'app_state';
