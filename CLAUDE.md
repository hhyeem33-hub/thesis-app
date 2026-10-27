@AGENTS.md

# 논문작업실 (thesis-app)

대학 과제로 만드는 로컬 웹앱. 학위논문 작업을 프로젝트 단위로 관리하고, AI 글쓰기 결과를 한국외대 학위논문 양식으로 출력한다.

- 기술 스택: Next.js (App Router, TypeScript) + Tailwind CSS + shadcn/ui (base-nova 스타일, Base UI 기반 → `asChild` 대신 `render` prop 사용)
- 화면에 보이는 모든 글자는 한국어로 작성한다.
- 사용자는 코딩 초보이므로 설명은 쉽게 한다.

## ⚠️ 절대 규칙: 옵시디언 보관함 보호

내 옵시디언 보관함에는 자료 260개가 있다. **절대 기존 파일을 수정하거나 지우지 말고, 새 폴더 안에서만 작업할 것.**

- 보관함 안의 기존 파일·폴더는 읽기만 한다. 이름 변경, 이동, 덮어쓰기, 삭제 모두 금지.
- 앱이 만드는 파일은 오직 앱이 새로 만든 프로젝트 폴더 안에만 쓴다.
- 폴더를 만들기 전에 같은 이름이 이미 있는지 확인하고, 있으면 덮어쓰지 말고 사용자에게 알린다.
- 구글 드라이브도 같은 원칙을 따른다 (기존 파일은 건드리지 않음).

## 요구사항

1. 디자인, 인터페이스 품질 고려
2. 프로젝트 생성 기반 — 이미 만든 프로젝트를 보여주는 히스토리 테이블
3. 프로젝트 생성 시 옵시디언, 구글 드라이브에 같은 이름의 폴더 생성
4. AI가 쓴 글은 구글 드라이브의 별도 폴더에 저장
5. 사용자 친화성, 편리성
6. 다른 사람이 내 앱을 직접 조작하는 시연이 가능해야 함
7. 대문(홈) 페이지에 사용법과 동작 흐름도
8. AI 글쓰기 결과를 한국외대 학위논문 양식의 hwpx로 출력 (hwpx 스킬 제작)

## 개발 순서

1. ✅ 빈 껍데기: Next.js + Tailwind + shadcn/ui, 사이드바(홈·프로젝트·설정), 각 화면 "준비 중"
2. ✅ 프로젝트 관리: 생성 창(이름 검사) + 히스토리 테이블, `data/projects.json`에 저장
3. ✅ 설정 화면: 옵시디언 보관함 경로, 구글 드라이브 경로 (`data/settings.json`, 없으면 자동 감지)
4. ✅ 옵시디언 연동: `<보관함>\논문작업실\<이름>\00_프로젝트 개요.md` 생성 (위 절대 규칙 준수)
5. ✅ 구글 드라이브 연동: 데스크톱 앱 폴더 `<내 드라이브>\논문작업실\<이름>\AI 작성글` 생성
6. ✅ AI 글쓰기: 앱에 AI 키를 넣지 않고 Claude Code 스킬로 처리. 프로젝트 표에 "AI 작성글"(hwpx 개수) 칸 + "AI 글쓰기 방법" 안내(명령 복사 버튼)
7. ✅ hwpx 스킬: `.claude/skills/hufs-thesis-hwpx/` (SKILL.md, `scripts/make_hwpx.py`, `references/sample-manuscript.json`)
8. ✅ 대문 페이지: 소개 + 사용법 3단계 + Mermaid 흐름도
9. 다듬기: 디자인·사용성 개선, 시연 준비 (처음 쓰는 사람도 조작할 수 있게)

## 코드 구조 메모

- `lib/store.ts`: JSON 파일 읽기/쓰기, 경로 자동 감지 / `lib/folders.ts`: 폴더 생성 (보호 규칙 구현) / `lib/validate.ts`: 이름 검사 (화면·서버 공용)
- `app/actions.ts`: 서버 함수 (프로젝트 생성, 다시 시도, 폴더 열기, 설정 저장)
- 이 Next.js는 `cacheComponents`가 켜져 있다: `export const dynamic` 사용 불가. 파일을 읽는 화면은 `<Suspense>` 안의 컴포넌트에서 `await connection()` 후 읽는다.

## AI 논문 초안 (hufs-thesis-hwpx 스킬)

- "OO 프로젝트로 OO 주제 논문 초안 써줘" → 원고 JSON 작성 → `make_hwpx.py --project` → `<내 드라이브>\논문작업실\<프로젝트>\AI 작성글\YYYY-MM-DD_제목.hwpx`
- Python 3.12: `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` (`python`이 Windows 스토어 안내로 연결되면 이 경로 사용), 라이브러리 python-hwpx 6.8.0
- 서식 기준은 사용자가 준 양식 `논문양식.hwpx` → 스킬의 `assets/template.hwpx`(사본). 스크립트는 양식의 header.xml·쪽 설정을 그대로 쓰고 양식 문단을 복제해 내용만 바꾼다.
- 양식 구성: 제목 → 이름(＊각주) → 목차(표) → 본문 1. / 1.1. / 1.1.1 → 각주 → 예문 (1) a. b. → <표 N> → 참고문헌(『책』「논문」). 초록·표지 없음.
- 기존 hwpx는 절대 덮어쓰지 않음(`_2` 붙임).
- 없는 문헌·결과를 지어내지 않는다: `[확인 필요]`, `[예시 결과]` 자리 표시 사용.

## 실행 방법

- 개발 서버: `npm run dev` → http://localhost:3000
- 시연(빠른 실행): `npm run build` 후 `npm run start` → http://localhost:3000 (코드를 고치면 다시 build)
- 공용 UI: 툴팁 `components/hint.tsx`, 알림 `sonner`의 `toast`, 제목 `components/page-header.tsx`, 로딩 `components/page-skeletons.tsx`

## 깃허브 자동 커밋·푸시

- 저장소: https://github.com/hhyeem33-hub/thesis-app (공개), 기본 브랜치 `main`.
- **규칙: 코드를 고치는 작업을 마칠 때마다 커밋하고 푸시한다.** 커밋 메시지는 무엇을 바꿨는지 쉬운 한국어로 쓴다.
- 자동화: `.claude/settings.json`의 Stop 훅이 `.claude/hooks/auto-commit.sh`를 실행해, 응답이 끝날 때 남은 변경을 자동으로 커밋·푸시한다.
- 올리면 안 되는 것은 `.gitignore`로 막는다: `node_modules`, `.next`, `*.zip`, `data/*.json`(내 컴퓨터 경로), `연구계획서.txt.txt`(개인 자료), `.env*`·키 파일 등 비밀 정보. 새 비밀 정보나 개인 자료 파일이 생기면 커밋 전에 `.gitignore`에 먼저 추가한다.
