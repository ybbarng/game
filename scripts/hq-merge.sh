#!/usr/bin/env bash
# 헤드쿼터(game 세션)가 PR 하나를 머지하는 차례: PR 검사가 끝나길 기다려 통과하면 머지(머지 커밋),
# 그 머지 커밋의 main CI와 배포(Image)가 끝나길 기다린다. 2026-11-10 임시 폴더에 두었던 스크립트가 지워져 저장소로 옮김.
#
#   scripts/hq-merge.sh <PR 번호> <PR head sha>
#
# head sha를 받는 까닭: 검토한 커밋과 다른 커밋이 머지되지 않게(--match-head-commit).
# PR이 main과 겹치면(CONFLICTING) GitHub가 PR 검사를 돌리지 않으니, 브랜치에 main을 합쳐 다시 올린 뒤 부른다.
# main CI가 CI 서버 문제(예: Chrome 설치 실패)로 실패하면 `gh run rerun <id> --failed`로 실패한 것만 다시 돌린다.
set -euo pipefail

pr="${1:?PR 번호}"
sha="${2:?PR head sha}"
repo="ybbarng/game"

echo "== #$pr ($sha)"
state=""
for _ in $(seq 1 90); do
  state=$(gh pr checks "$pr" -R "$repo" --json state -q '[.[].state]|join(",")' 2>/dev/null || true)
  case "$state" in
    *PENDING* | *QUEUED* | *IN_PROGRESS* | "") sleep 20 ;;
    *) break ;;
  esac
done
echo "  PR 검사: $state"
if echo "$state" | grep -q FAIL; then
  echo "  PR 검사 실패 — 멈춤"
  exit 1
fi

title=$(gh pr view "$pr" -R "$repo" --json title -q .title)
gh pr merge "$pr" -R "$repo" --merge --match-head-commit "$sha" --subject "Merge PR #$pr: $title"
merge=$(gh pr view "$pr" -R "$repo" --json mergeCommit -q .mergeCommit.oid)
echo "  머지: $merge"

runs=""
for _ in $(seq 1 60); do
  runs=$(gh run list -R "$repo" --commit "$merge" --json name,status,conclusion \
    -q '[.[]|.name+":"+.status+":"+(.conclusion//"")]|join(" ")')
  if echo "$runs" | grep -q 'CI:completed:failure'; then
    echo "  main CI 실패 — $runs"
    exit 1
  fi
  if echo "$runs" | grep -q 'Image:completed'; then break; fi
  sleep 30
done
echo "  main: $runs"
