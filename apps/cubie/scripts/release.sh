#!/bin/sh
# Cubie 새 판을 만든다(docs/47 15-12, DEVELOPMENT.md 「새 판 내기」).
#   scripts/release.sh <판> --notes "바뀐 것" [--deltas <개수>] [--dry-run]
#   scripts/release.sh --deltas-only <판> [--deltas <개수>] [--dry-run]
#   예) scripts/release.sh 0.2.0 --notes "크기 바꾸기 손잡이를 키웠다."
#
# 하는 일: 시험 → 판 올리기(VERSION) → universal 빌드·서명 → zip → 차이 파일 → Sparkle EdDSA 서명 → appcast에 새 판 더하기
#   → 노트를 release-notes/<판>.md에 쓰기 → 작업 트리에서 돌렸으면 zip과 노트를 기본 저장소 폴더에도 복사
#   → 「GitHub Release 만들기」(cubie-release)와 「appcast PR」 명령을 찍는다.
# 하지 않는 일: GitHub Release 만들기, 커밋, push, PR. 찍힌 명령을 사람이 확인하고 직접 돌린다.
#
# 차이 업데이트(Sparkle 2 delta, docs/47 15-12 「차이 업데이트」): appcast에서 바로 아래 판 몇 개(기본 3, --deltas 0이면 안 만듦)에서
#   새 판으로 가는 차이 파일을 BinaryDelta create로 만들고, apply로 옛 판에 적용한 결과가 새 zip의 앱과 같은지(심볼 링크·권한까지,
#   코드 서명 확인 포함) 본 뒤 서명해 새 판 항목에 <sparkle:deltas>로 적는다. 차이 파일은 사이트 apps/web/public/cubie/deltas/
#   <옛 판>-<새 판>.delta(appcast PR에 함께 커밋, GitHub Release가 아님). 차이 목록은 맨 위 판에만 두므로 아래 판 항목의 차이
#   목록과 더는 가리키지 않는 차이 파일은 지운다. 옛 판 zip(dist/<옛 판>/Cubie.zip, 작업 트리에 없으면 기본 저장소 폴더)이
#   없으면 그 판은 건너뛴다(그 판의 앱은 전체 zip을 받는다).
# --deltas-only <판>: 이미 낸 맨 위 판에 차이 파일만 더한다. 빌드·시험·VERSION·노트는 건드리지 않고, dist/<판>/Cubie.zip이
#   appcast의 길이·서명과 같은지(공개 열쇠로) 먼저 본다. 차이 파일이 이미 있으면 다시 적용해 맞는 것만 그대로 쓴다.
#
# 파일 자리: ~/.local/bin/cubie-release는 기본 저장소 폴더(작업 트리가 아닌 곳)의 정해진 자리만 읽는다.
#   zip  : <기본 저장소>/apps/cubie/dist/<판>/Cubie.zip      (git 밖)
#   노트 : <기본 저장소>/apps/cubie/release-notes/<판>.md    (커밋하는 파일, appcast 설명과 같은 글)
#
# --dry-run: VERSION·appcast·release-notes·차이 파일 폴더를 고치지 않고, 기본 저장소 폴더에 복사하지 않는다.
#   결과는 dist/<판>-dry-run/(--deltas-only는 dist/<판>-deltas-dry-run/)에만 둔다(cubie-release가 읽는 dist/<판>/ 과 겹치지 않게).
#   키체인 열쇠도 읽지 않는다: 서명을 건너뛰고 appcast 서명 자리에 가짜 값을 둔다. 차이 파일은 만들고 적용 확인까지 한다.
#
# 서명 열쇠: 이 맥 키체인의 Sparkle 비밀 열쇠(계정 kr.byb.cubie, generate_keys로 만든 것)로 서명한다.
#   열쇠를 읽을 때마다 로그인 암호 창이 뜬다. zip과 차이 파일 여럿을 서명하므로 security로 열쇠를 한 번만 읽어 셸 변수에 두고
#   파일마다 sign_update --ed-key-file - 에 표준 입력으로 넘긴다(화면·파일·명령 줄에 남기지 않는다). 그 길이 안 되면
#   파일마다 sign_update --account로 돌아간다(파일 수만큼 창이 뜬다).
#   확인은 sign_update --verify(이것도 키체인을 연다) 대신 scripts/verify-ed.swift로 공개 열쇠(Info.plist)만 쓴다.
#   다른 맥에서 내려면 그 열쇠를 옮겨야 한다(generate_keys --account kr.byb.cubie -x 파일 → 다른 맥에서 -f 파일).
set -eu
cd "$(dirname "$0")/.."

ACCOUNT=kr.byb.cubie
KEY_SERVICE=https://sparkle-project.org
REPO=ybbarng/game
APPCAST=../web/public/cubie/appcast.xml
DELTA_REPO_DIR=../web/public/cubie/deltas
MARKER='<!-- release.sh: 새 판 -->'
CUBIE_RELEASE=/Users/ybbarng/.local/bin/cubie-release

VERSION=""
NOTES=""
DRY=0
DELTAS=3
DELTAS_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --notes) shift; NOTES="${1:-}" ;;
    --deltas) shift; DELTAS="${1:-}" ;;
    --deltas-only) DELTAS_ONLY=1 ;;
    -*) echo "모르는 옵션: $1" >&2; exit 2 ;;
    *) VERSION="$1" ;;
  esac
  shift
done

USAGE='scripts/release.sh <판> --notes "…" [--deltas <개수>] [--dry-run] | scripts/release.sh --deltas-only <판> [--deltas <개수>] [--dry-run]'
if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "판을 0.2.0처럼 주세요: $USAGE" >&2
  exit 2
fi
if ! echo "$DELTAS" | grep -Eq '^([0-9]|10)$'; then
  echo "--deltas는 0~10: $USAGE" >&2
  exit 2
fi
TAG="cubie-v$VERSION"
if [ "$DELTAS_ONLY" = 1 ]; then
  TOP="$(node scripts/appcast-deltas.mjs versions "$APPCAST" | head -n 1)"
  if [ "$TOP" != "$VERSION" ]; then
    echo "--deltas-only는 appcast 맨 위 판에만 쓴다(맨 위: $TOP)." >&2
    exit 1
  fi
else
  # 노트는 appcast 설명과 GitHub Release 본문에 함께 쓴다. cubie-release는 빈 노트를 받지 않는다.
  if [ -z "$NOTES" ]; then
    echo "바뀐 것을 --notes로 주세요: $USAGE" >&2
    exit 2
  fi
  if grep -q "<sparkle:version>$VERSION</sparkle:version>" "$APPCAST"; then
    echo "appcast에 이미 $VERSION 이 있다. 판을 올려 주세요." >&2
    exit 1
  fi
  grep -qF "$MARKER" "$APPCAST" || { echo "appcast에 새 판 자리 표시($MARKER)가 없다" >&2; exit 1; }
fi

# 기본 저장소 폴더: 작업 트리(.claude/worktrees/*)에서 돌려도 git이 아는 원래 폴더
HERE="$(pwd -P)"
MAIN_REPO="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
MAIN_CUBIE="$MAIN_REPO/apps/cubie"
IN_WORKTREE=1
if [ -d "$MAIN_CUBIE" ] && [ "$(cd "$MAIN_CUBIE" && pwd -P)" = "$HERE" ]; then IN_WORKTREE=0; fi

BIN=.build/artifacts/sparkle/Sparkle/bin
[ -x "$BIN/BinaryDelta" ] || BIN="$MAIN_CUBIE/.build/artifacts/sparkle/Sparkle/bin"
if [ "$DELTAS_ONLY" = 1 ]; then SUFFIX="-deltas"; else SUFFIX=""; fi
if [ "$DRY" = 1 ]; then OUT="dist/$VERSION$SUFFIX-dry-run"; else OUT="dist/$VERSION$SUFFIX"; fi
if [ "$DRY" = 1 ]; then DELTA_DIR="$OUT/deltas"; else DELTA_DIR="$DELTA_REPO_DIR"; fi
NOTES_FILE="release-notes/$VERSION.md"
PUBKEY="$(plutil -extract SUPublicEDKey raw Resources/Info.plist)"
rm -rf "$OUT"
mkdir -p "$OUT" "$DELTA_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 판의 zip 자리: 작업 트리 dist에 없으면 기본 저장소 폴더 dist(옛 판 zip은 그곳에 남는다)
zip_of() {
  for d in "$HERE/dist" "$MAIN_CUBIE/dist"; do
    if [ -f "$d/$1/Cubie.zip" ]; then echo "$d/$1/Cubie.zip"; return 0; fi
  done
  return 1
}

# zip을 풀어 그 안 앱 판이 맞는지 본다: unzip_app <zip> <판> <풀 폴더>
unzip_app() {
  mkdir -p "$3"
  ditto -x -k "$1" "$3"
  got="$(plutil -extract CFBundleVersion raw "$3/Cubie.app/Contents/Info.plist")"
  if [ "$got" != "$2" ]; then echo "$1 안 앱 판이 $got 이다($2 이어야 한다)" >&2; exit 1; fi
}

if [ "$DELTAS_ONLY" = 1 ]; then
  NEW_ZIP="$(zip_of "$VERSION")" || { echo "dist/$VERSION/Cubie.zip이 없다(작업 트리·기본 저장소 폴더 모두)" >&2; exit 1; }
  # appcast에 적힌 zip과 같은 파일인지(길이와 서명): 다른 zip에서 만든 차이는 깔린 앱에 맞지 않는다
  ENC="$(awk '/<item>/{n++} n==1 && /<enclosure /{print; exit}' "$APPCAST")"
  WANT_LEN="$(echo "$ENC" | sed -e 's/.* length="\([0-9]*\)".*/\1/')"
  WANT_SIG="$(echo "$ENC" | sed -e 's/.*sparkle:edSignature="\([^"]*\)".*/\1/')"
  LENGTH="$(stat -f%z "$NEW_ZIP")"
  if [ "$LENGTH" != "$WANT_LEN" ]; then echo "$NEW_ZIP 길이 $LENGTH 가 appcast($WANT_LEN)와 다르다" >&2; exit 1; fi
  swift scripts/verify-ed.swift "$NEW_ZIP" "$WANT_SIG" "$PUBKEY"
  echo "==> $NEW_ZIP 는 appcast의 $VERSION zip과 같다(길이·서명)"
else
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
  NEW_ZIP="$OUT/Cubie.zip"
  LENGTH="$(stat -f%z "$NEW_ZIP")"
fi

echo "==> 차이 파일(바로 아래 판 $DELTAS 개)"
# 사용자가 받는 앱과 같게 새 판도 zip을 푼 것으로 견준다
unzip_app "$NEW_ZIP" "$VERSION" "$WORK/new"
: > "$WORK/deltas.txt"
SKIPPED=""
COUNT=0
for FROM in $(node scripts/appcast-deltas.mjs versions "$APPCAST"); do
  [ "$FROM" = "$VERSION" ] && continue
  [ "$COUNT" -ge "$DELTAS" ] && break
  COUNT=$((COUNT + 1))
  if ! OLD_ZIP="$(zip_of "$FROM")"; then
    echo "   $FROM: dist/$FROM/Cubie.zip이 없어 건너뜀(이 판의 앱은 전체 zip을 받는다)"
    SKIPPED="$SKIPPED $FROM"
    continue
  fi
  unzip_app "$OLD_ZIP" "$FROM" "$WORK/$FROM"
  NAME="$FROM-$VERSION.delta"
  FILE="$DELTA_DIR/$NAME"
  if [ -f "$DELTA_REPO_DIR/$NAME" ]; then
    # 저장소에 이미 있는 차이 파일(--deltas-only로 준비해 둔 것)은 다시 적용해 맞으면 그대로 쓴다. --dry-run도 같은 길을 밟는다
    echo "   $FROM: 저장소에 있는 차이 파일을 다시 확인한다"
    [ "$DELTA_DIR" = "$DELTA_REPO_DIR" ] || cp "$DELTA_REPO_DIR/$NAME" "$FILE"
  else
    "$BIN/BinaryDelta" create "$WORK/$FROM/Cubie.app" "$WORK/new/Cubie.app" "$FILE"
  fi
  # 옛 판에 적용한 결과가 새 판과 같아야 한다(BinaryDelta도 결과를 견주지만, 따로 한 번 더: 파일·심볼 링크·권한, 코드 서명)
  mkdir -p "$WORK/applied-$FROM"
  "$BIN/BinaryDelta" apply "$WORK/$FROM/Cubie.app" "$WORK/applied-$FROM/Cubie.app" "$FILE"
  diff -rq --no-dereference "$WORK/applied-$FROM/Cubie.app" "$WORK/new/Cubie.app"
  codesign --verify --deep --strict "$WORK/applied-$FROM/Cubie.app"
  echo "   $FROM → $VERSION: $(stat -f%z "$FILE") 바이트, 적용 결과가 새 판과 같다"
  echo "$FROM $FILE" >> "$WORK/deltas.txt"
done

# 서명할 파일: 새 판이면 zip과 차이 파일, --deltas-only면 차이 파일만
SIGN_FILES=""
[ "$DELTAS_ONLY" = 1 ] || SIGN_FILES="$NEW_ZIP"
while read -r _from file; do SIGN_FILES="$SIGN_FILES $file"; done < "$WORK/deltas.txt"

# sig_path <파일>: 그 파일의 서명을 적어 둔 자리(작업 폴더 안)
sig_path() { echo "$WORK/sig-$(basename "$1")"; }

if [ "$DRY" = 1 ]; then
  # 키체인 열쇠를 읽으면 로그인 암호 창이 뜬다. 미리 보기에서는 서명하지 않고 가짜 값을 둔다.
  echo "==> EdDSA 서명: --dry-run이라 건너뜀(서명은 실제 판에서, appcast에는 가짜 값)"
  for f in $SIGN_FILES; do echo "DRY-RUN-NOT-SIGNED" > "$(sig_path "$f")"; done
elif [ -n "$SIGN_FILES" ]; then
  echo "==> EdDSA 서명(키체인 계정 $ACCOUNT, 열쇠는 한 번만 읽는다)"
  KEY=""
  if KEY="$(security find-generic-password -s "$KEY_SERVICE" -a "$ACCOUNT" -w)" && [ -n "$KEY" ]; then
    for f in $SIGN_FILES; do
      # printf는 셸 안 명령이라 열쇠가 프로세스 목록에 보이지 않는다
      if ! printf '%s' "$KEY" | "$BIN/sign_update" --ed-key-file - -p "$f" > "$(sig_path "$f")"; then
        echo "   표준 입력 서명이 안 돼 이 파일은 키체인으로 다시 서명한다: $f"
        "$BIN/sign_update" --account "$ACCOUNT" -p "$f" > "$(sig_path "$f")"
      fi
    done
  else
    echo "   키체인에서 열쇠를 한 번에 읽지 못해 파일마다 sign_update로 서명한다(파일 수만큼 암호 창이 뜬다)"
    for f in $SIGN_FILES; do "$BIN/sign_update" --account "$ACCOUNT" -p "$f" > "$(sig_path "$f")"; done
  fi
  KEY=""
  unset KEY
  # 확인은 Info.plist의 공개 열쇠로만 한다(키체인을 열지 않는다)
  for f in $SIGN_FILES; do swift scripts/verify-ed.swift "$f" "$(cat "$(sig_path "$f")")" "$PUBKEY"; done
  echo "   공개 열쇠로 서명 확인됨($(echo $SIGN_FILES | wc -w | tr -d ' ')개)"
fi

# appcast 차이 목록: 한 줄 = 「옛 판 길이 서명」
: > "$WORK/deltas.list"
while read -r from file; do
  echo "$from $(stat -f%z "$file") $(cat "$(sig_path "$file")")" >> "$WORK/deltas.list"
done < "$WORK/deltas.txt"

echo "==> appcast"
if [ "$DELTAS_ONLY" = 1 ]; then
  node scripts/appcast-deltas.mjs set "$APPCAST" "$VERSION" "$WORK/deltas.list" "$OUT/appcast.xml"
else
  SIG="$(cat "$(sig_path "$NEW_ZIP")")"
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
  ' "$APPCAST" > "$WORK/appcast.xml"
  # 새 판 항목에 차이 목록을 넣고 아래 판 항목의 차이 목록은 지운다
  node scripts/appcast-deltas.mjs set "$WORK/appcast.xml" "$VERSION" "$WORK/deltas.list" "$OUT/appcast.xml"
fi
xmllint --noout "$OUT/appcast.xml"

if [ "$DRY" = 1 ]; then
  if [ "$DELTAS_ONLY" = 0 ]; then
    printf '%s\n' "$NOTES" > "$OUT/notes.md"
    echo "   미리 본 노트: $HERE/$OUT/notes.md"
  fi
else
  cp "$OUT/appcast.xml" "$APPCAST"
  if [ "$DELTAS_ONLY" = 0 ]; then
    echo "==> 노트"
    printf '%s\n' "$NOTES" > "$NOTES_FILE"
    echo "   $HERE/$NOTES_FILE"
  fi
  # appcast가 더는 가리키지 않는 차이 파일을 지운다(맨 위 판의 것만 남는다)
  node scripts/appcast-deltas.mjs in-use "$APPCAST" > "$WORK/in-use.txt"
  for f in "$DELTA_REPO_DIR"/*.delta; do
    [ -e "$f" ] || continue
    if ! grep -qxF "$(basename "$f")" "$WORK/in-use.txt"; then
      rm "$f"
      echo "   지움(appcast가 가리키지 않음): $f"
    fi
  done
fi

FIXED_ZIP="$MAIN_CUBIE/dist/$VERSION/Cubie.zip"
FIXED_NOTES="$MAIN_CUBIE/$NOTES_FILE"
if [ "$IN_WORKTREE" = 1 ] && [ "$DELTAS_ONLY" = 0 ]; then
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
[ "$DELTAS_ONLY" = 1 ] || echo "만듦: $HERE/$OUT/Cubie.zip ($LENGTH 바이트)"
while read -r from file; do echo "차이: $from → $VERSION $(stat -f%z "$file") 바이트 ($file)"; done < "$WORK/deltas.txt"
[ -z "$SKIPPED" ] || echo "건너뛴 옛 판(zip 없음):$SKIPPED"
if [ "$DRY" = 1 ]; then
  echo "(--dry-run: VERSION·apps/web/public/cubie/appcast.xml·차이 파일 폴더·${NOTES_FILE}은 그대로다. 미리 본 appcast: $HERE/$OUT/appcast.xml)"
  [ "$DELTAS_ONLY" = 1 ] || echo "실제로 낼 때 찍을 Release 명령: $CUBIE_RELEASE $VERSION"
  exit 0
fi
# 차이 파일 폴더: 지금 파일이 있거나 git이 아는 파일이 있으면(모두 지운 것도 커밋해야 한다) add에 넣는다
ADD_DELTAS=""
if ls "$DELTA_REPO_DIR"/*.delta >/dev/null 2>&1 || [ -n "$(git ls-files -- "$DELTA_REPO_DIR")" ]; then
  ADD_DELTAS=" apps/web/public/cubie/deltas"
fi
if [ "$DELTAS_ONLY" = 1 ]; then
  cat <<EOF

다음은 사람이 확인하고 직접 돌린다. appcast와 차이 파일을 PR로 올린다. 머지되어 사이트에 배포되면 그 뒤로 받는 앱이 차이 파일을 쓴다.
   git switch -c $TAG-deltas
   git add apps/web/public/cubie/appcast.xml$ADD_DELTAS
   git commit -m "Cubie $VERSION 차이 업데이트"
   git push -u origin $TAG-deltas
   gh pr create -R $REPO --title "chore(cubie): Cubie $VERSION 차이 업데이트" --body "Cubie $VERSION 업데이트 목록에 차이 파일"
EOF
  exit 0
fi
cat <<EOF

다음은 사람이 확인하고 직접 돌린다(차례대로).
1) GitHub Release 만들기: $CUBIE_RELEASE $VERSION
   appcast가 사이트에 올라가기 전에 그것이 가리키는 zip이 먼저 있어야 한다.
   cubie-release는 $FIXED_ZIP 과 $FIXED_NOTES 를 그대로 올린다(--latest=false).
   zip을 다시 만들면 서명이 바뀌니 이 zip을 그대로 쓴다.

2) VERSION·appcast·노트·차이 파일을 PR로 올린다. main에 머지되어 사이트에 배포되면 앱들이 새 판을 본다.
   git switch -c $TAG
   git add apps/cubie/VERSION apps/web/public/cubie/appcast.xml apps/cubie/$NOTES_FILE$ADD_DELTAS
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
