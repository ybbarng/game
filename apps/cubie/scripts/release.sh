#!/bin/sh
# Cubie 새 판을 만든다(docs/47 15-12, DEVELOPMENT.md 「새 판 내기」).
#   scripts/release.sh <판> --notes "바뀐 것" [--dry-run]
#   예) scripts/release.sh 0.2.0 --notes "크기 바꾸기 손잡이를 키웠다."
#
# 하는 일: 시험 → 판 올리기(VERSION) → universal 빌드·서명 → zip → Sparkle EdDSA 서명 → appcast에 새 판 더하기
#   → 노트를 release-notes/<판>.md에 쓰기 → 작업 트리에서 돌렸으면 zip과 노트를 기본 저장소 폴더에도 복사
#   → 「GitHub Release 만들기」(cubie-release)와 「appcast PR」 명령을 찍는다.
# 하지 않는 일: GitHub Release 만들기, 커밋, push, PR. 찍힌 명령을 사람이 확인하고 직접 돌린다.
#
# 파일 자리: ~/.local/bin/cubie-release는 기본 저장소 폴더(작업 트리가 아닌 곳)의 정해진 자리만 읽는다.
#   zip  : <기본 저장소>/apps/cubie/dist/<판>/Cubie.zip      (git 밖)
#   노트 : <기본 저장소>/apps/cubie/release-notes/<판>.md    (커밋하는 파일, appcast 설명과 같은 글)
#
# --dry-run: VERSION·appcast·release-notes를 고치지 않고, 기본 저장소 폴더에 복사하지 않는다.
#   결과는 dist/<판>-dry-run/ 에만 둔다(cubie-release가 읽는 dist/<판>/ 과 겹치지 않게).
#   키체인 열쇠도 읽지 않는다: 서명을 건너뛰고 appcast 서명 자리에 가짜 값을 둔다.
#
# 서명 열쇠: 이 맥 키체인의 Sparkle 비밀 열쇠(계정 kr.byb.cubie, generate_keys로 만든 것)로 서명한다.
#   열쇠를 읽을 때마다 로그인 암호 창이 뜨므로 실제 판에서 sign_update 한 번만 부른다.
#   확인은 sign_update --verify(이것도 키체인을 연다) 대신 scripts/verify-ed.swift로 공개 열쇠(Info.plist)만 쓴다.
#   다른 맥에서 내려면 그 열쇠를 옮겨야 한다(generate_keys --account kr.byb.cubie -x 파일 → 다른 맥에서 -f 파일).
set -eu
cd "$(dirname "$0")/.."

ACCOUNT=kr.byb.cubie
REPO=ybbarng/game
APPCAST=../web/public/cubie/appcast.xml
MARKER='<!-- release.sh: 새 판 -->'
CUBIE_RELEASE=/Users/ybbarng/.local/bin/cubie-release

VERSION=""
NOTES=""
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --notes) shift; NOTES="${1:-}" ;;
    -*) echo "모르는 옵션: $1" >&2; exit 2 ;;
    *) VERSION="$1" ;;
  esac
  shift
done

USAGE='scripts/release.sh <판> --notes "…" [--dry-run]'
if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "판을 0.2.0처럼 주세요: $USAGE" >&2
  exit 2
fi
# 노트는 appcast 설명과 GitHub Release 본문에 함께 쓴다. cubie-release는 빈 노트를 받지 않는다.
if [ -z "$NOTES" ]; then
  echo "바뀐 것을 --notes로 주세요: $USAGE" >&2
  exit 2
fi
TAG="cubie-v$VERSION"
if grep -q "<sparkle:version>$VERSION</sparkle:version>" "$APPCAST"; then
  echo "appcast에 이미 $VERSION 이 있다. 판을 올려 주세요." >&2
  exit 1
fi
grep -qF "$MARKER" "$APPCAST" || { echo "appcast에 새 판 자리 표시($MARKER)가 없다" >&2; exit 1; }

# 기본 저장소 폴더: 작업 트리(.claude/worktrees/*)에서 돌려도 git이 아는 원래 폴더
HERE="$(pwd -P)"
MAIN_REPO="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
MAIN_CUBIE="$MAIN_REPO/apps/cubie"
IN_WORKTREE=1
if [ -d "$MAIN_CUBIE" ] && [ "$(cd "$MAIN_CUBIE" && pwd -P)" = "$HERE" ]; then IN_WORKTREE=0; fi

BIN=.build/artifacts/sparkle/Sparkle/bin
if [ "$DRY" = 1 ]; then OUT="dist/$VERSION-dry-run"; else OUT="dist/$VERSION"; fi
NOTES_FILE="release-notes/$VERSION.md"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> 시험"
./test.sh

echo "==> 빌드(universal) 판 $VERSION"
if [ "$DRY" = 1 ]; then
  CUBIE_VERSION="$VERSION" ./build.sh --universal
else
  echo "$VERSION" > VERSION
  ./build.sh --universal
fi

echo "==> zip"
# ditto: 프레임워크 심볼 링크와 확장 속성을 그대로 담는다(zip 명령은 심볼 링크를 풀어 서명이 깨진다)
ditto -c -k --sequesterRsrc --keepParent Cubie.app "$OUT/Cubie.zip"
LENGTH="$(stat -f%z "$OUT/Cubie.zip")"

if [ "$DRY" = 1 ]; then
  # 키체인 열쇠를 읽으면 로그인 암호 창이 뜬다. 미리 보기에서는 서명하지 않고 가짜 값을 둔다.
  echo "==> EdDSA 서명: --dry-run이라 건너뜀(서명은 실제 판에서, appcast에는 가짜 값)"
  SIG="DRY-RUN-NOT-SIGNED"
else
  # 키체인 열쇠는 여기서 한 번만 읽는다. 확인은 Info.plist의 공개 열쇠로만 한다(키체인을 열지 않는다).
  echo "==> EdDSA 서명(키체인 계정 $ACCOUNT)"
  SIG="$("$BIN/sign_update" --account "$ACCOUNT" -p "$OUT/Cubie.zip")"
  PUBKEY="$(plutil -extract SUPublicEDKey raw Resources/Info.plist)"
  swift scripts/verify-ed.swift "$OUT/Cubie.zip" "$SIG" "$PUBKEY"
  echo "   공개 열쇠로 서명 확인됨"
fi

echo "==> appcast"
URL="https://github.com/$REPO/releases/download/$TAG/Cubie.zip"
PUBDATE="$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')"
MINOS="$(plutil -extract LSMinimumSystemVersion raw Resources/Info.plist)"
ESC="$(printf '%s' "$NOTES" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')"
ITEM="$OUT/item.xml"
{
  echo "    <item>"
  echo "      <title>Cubie $VERSION</title>"
  echo "      <pubDate>$PUBDATE</pubDate>"
  echo "      <sparkle:version>$VERSION</sparkle:version>"
  echo "      <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>"
  echo "      <sparkle:minimumSystemVersion>$MINOS</sparkle:minimumSystemVersion>"
  echo "      <description>&lt;p&gt;$ESC&lt;/p&gt;</description>"
  echo "      <enclosure url=\"$URL\" length=\"$LENGTH\" type=\"application/octet-stream\" sparkle:edSignature=\"$SIG\"/>"
  echo "    </item>"
} > "$ITEM"
# 자리 표시 바로 아래(맨 위)에 새 판을 넣는다
awk -v item="$ITEM" -v marker="$MARKER" '
  { print }
  index($0, marker) { while ((getline line < item) > 0) print line; close(item) }
' "$APPCAST" > "$OUT/appcast.xml"
xmllint --noout "$OUT/appcast.xml"

echo "==> 노트"
if [ "$DRY" = 1 ]; then
  printf '%s\n' "$NOTES" > "$OUT/notes.md"
  echo "   미리 본 노트: $HERE/$OUT/notes.md"
else
  cp "$OUT/appcast.xml" "$APPCAST"
  printf '%s\n' "$NOTES" > "$NOTES_FILE"
  echo "   $HERE/$NOTES_FILE"
fi

FIXED_ZIP="$MAIN_CUBIE/dist/$VERSION/Cubie.zip"
FIXED_NOTES="$MAIN_CUBIE/$NOTES_FILE"
if [ "$IN_WORKTREE" = 1 ]; then
  echo "==> 기본 저장소 폴더로 복사(cubie-release가 그 자리를 읽는다)"
  if [ "$DRY" = 1 ]; then
    echo "   (--dry-run: 복사하지 않는다)"
    echo "   $HERE/dist/$VERSION/Cubie.zip → $FIXED_ZIP"
    echo "   $HERE/$NOTES_FILE → $FIXED_NOTES"
  else
    mkdir -p "$(dirname "$FIXED_ZIP")" "$(dirname "$FIXED_NOTES")"
    cp "$OUT/Cubie.zip" "$FIXED_ZIP"
    cp "$NOTES_FILE" "$FIXED_NOTES"
    echo "   $FIXED_ZIP"
    echo "   $FIXED_NOTES"
  fi
fi

echo
echo "만듦: $HERE/$OUT/Cubie.zip ($LENGTH 바이트)"
if [ "$DRY" = 1 ]; then
  echo "(--dry-run: VERSION·apps/web/public/cubie/appcast.xml·${NOTES_FILE}은 그대로다. 미리 본 appcast: $HERE/$OUT/appcast.xml)"
  echo "실제로 낼 때 찍을 Release 명령: $CUBIE_RELEASE $VERSION"
  exit 0
fi
cat <<EOF

다음은 사람이 확인하고 직접 돌린다(차례대로).
1) GitHub Release 만들기: $CUBIE_RELEASE $VERSION
   appcast가 사이트에 올라가기 전에 그것이 가리키는 zip이 먼저 있어야 한다.
   cubie-release는 $FIXED_ZIP 과 $FIXED_NOTES 를 그대로 올린다(--latest=false).
   zip을 다시 만들면 서명이 바뀌니 이 zip을 그대로 쓴다.

2) VERSION·appcast·노트를 PR로 올린다. main에 머지되어 사이트에 배포되면 앱들이 새 판을 본다.
   git switch -c $TAG
   git add apps/cubie/VERSION apps/web/public/cubie/appcast.xml apps/cubie/$NOTES_FILE
   git commit -m "Cubie $VERSION"
   git push -u origin $TAG
   gh pr create -R $REPO --title "chore(cubie): Cubie $VERSION 배포" --body "Cubie $VERSION 업데이트 목록"
EOF
if [ "$IN_WORKTREE" = 1 ]; then
  cat <<EOF

3) PR이 머지된 뒤 기본 저장소 폴더에서 main을 받기 전에, 복사해 둔 노트($FIXED_NOTES)를 지운다.
   git에 없는 같은 이름 파일이 있으면 받기가 멈출 수 있다.
EOF
fi
