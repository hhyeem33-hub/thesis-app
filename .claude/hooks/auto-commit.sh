#!/usr/bin/env bash
# Claude Code가 한 번의 작업(응답)을 끝낼 때마다 실행된다 (.claude/settings.json의 Stop 훅).
# 바뀐 파일이 있으면 자동으로 커밋하고 깃허브에 푸시한다. 실패해도 작업은 막지 않는다.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

git add -A
git diff --cached --quiet && exit 0   # 바뀐 것이 없으면 끝

files=$(git diff --cached --name-only | head -3 | paste -sd ',' -)
count=$(git diff --cached --name-only | wc -l | tr -d ' ')
git commit -q -m "자동 저장: ${files} 등 ${count}개 파일 ($(date '+%Y-%m-%d %H:%M'))" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || exit 0

if ! git push -q origin HEAD 2>/dev/null; then
  echo "자동 커밋은 했지만 깃허브 푸시에 실패했어요 (인터넷 연결이나 gh 로그인 확인)." >&2
fi
exit 0
