#!/bin/sh
# Cubie 새 판을 만든다(docs/47 15-12, README 「새 판 내기」).
#   scripts/release.sh <판> [--notes "바뀐 것"] [--dry-run]
#   예) scripts/release.sh 0.2.0 --notes "크기 바꾸기 손잡이를 키웠다."
#
# 하는 일: 시험 → 판 올리기(VERSION) → universal 빌드·서명 → zip → Sparkle EdDSA 서명 → appcast에 새 판 더하기
#   → 「GitHub Release 만들기」와 「appcast PR」 명령을 찍는다.
# 하지 않는 일: GitHub Release 만들기, 커밋, push, PR. 찍힌 명령을 사람이 확인하고 직접 돌린다.
# --dry-run: VERSION과 사이트의 appcast를 고치지 않는다. zip과 appcast를 dist/<판>/ 에만 만든다.
#
# 서명 열쇠: 이 맥 키체인의 Sparkle 비밀 열쇠(계정 kr.byb.cubie, generate_keys로 만든 것)로 서명한다.
#   다른 맥에서 내려면 그 열쇠를 옮겨야 한다(generate_keys --account kr.byb.cubie -x 파일 → 다른 맥에서 -f 파일).
set -eu
cd "$(dirname "$0")/.."

ACCOUNT=kr.byb.cubie
REPO=ybbarng/game
APPCAST=../web/public/cubie/appcast.xml
MARKER='<!-- release.sh: 새 판 -->'

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

if ! echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "판을 0.2.0처럼 주세요: scripts/release.sh <판> [--notes \"…\"] [--dry-run]" >&2
  exit 2
fi
TAG="cubie-v$VERSION"
if grep -q "<sparkle:version>$VERSION</sparkle:version>" "$APPCAST"; then
  echo "appcast에 이미 $VERSION 이 있다. 판을 올려 주세요." >&2
  exit 1
fi
grep -qF "$MARKER" "$APPCAST" || { echo "appcast에 새 판 자리 표시($MARKER)가 없다" >&2; exit 1; }

BIN=.build/artifacts/sparkle/Sparkle/bin
OUT="dist/$VERSION"
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

echo "==> EdDSA 서명(키체인 계정 $ACCOUNT)"
SIG="$("$BIN/sign_update" --account "$ACCOUNT" -p "$OUT/Cubie.zip")"
"$BIN/sign_update" --account "$ACCOUNT" --verify "$OUT/Cubie.zip" "$SIG" >/dev/null
echo "   서명 확인됨"

echo "==> appcast"
URL="https://github.com/$REPO/releases/download/$TAG/Cubie.zip"
PUBDATE="$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')"
MINOS="$(plutil -extract LSMinimumSystemVersion raw Resources/Info.plist)"
ITEM="$OUT/item.xml"
{
  echo "    <item>"
  echo "      <title>Cubie $VERSION</title>"
  echo "      <pubDate>$PUBDATE</pubDate>"
  echo "      <sparkle:version>$VERSION</sparkle:version>"
  echo "      <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>"
  echo "      <sparkle:minimumSystemVersion>$MINOS</sparkle:minimumSystemVersion>"
  if [ -n "$NOTES" ]; then
    ESC="$(printf '%s' "$NOTES" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')"
    echo "      <description>&lt;p&gt;$ESC&lt;/p&gt;</description>"
  fi
  echo "      <enclosure url=\"$URL\" length=\"$LENGTH\" type=\"application/octet-stream\" sparkle:edSignature=\"$SIG\"/>"
  echo "    </item>"
} > "$ITEM"
# 자리 표시 바로 아래(맨 위)에 새 판을 넣는다
awk -v item="$ITEM" -v marker="$MARKER" '
  { print }
  index($0, marker) { while ((getline line < item) > 0) print line; close(item) }
' "$APPCAST" > "$OUT/appcast.xml"
xmllint --noout "$OUT/appcast.xml"
if [ "$DRY" = 0 ]; then cp "$OUT/appcast.xml" "$APPCAST"; fi

ZIP="$(pwd)/$OUT/Cubie.zip"
TITLE="Cubie $VERSION"
RELNOTES="${NOTES:-맥 앱 Cubie $VERSION}"
echo
echo "만듦: $ZIP ($LENGTH 바이트)"
if [ "$DRY" = 1 ]; then
  echo "(--dry-run: VERSION과 apps/web/public/cubie/appcast.xml은 그대로다. 미리 본 appcast: $(pwd)/$OUT/appcast.xml)"
  exit 0
fi
cat <<EOF

다음은 사람이 확인하고 직접 돌린다(차례대로).
1) GitHub Release를 만든다. appcast가 사이트에 올라가기 전에 그것이 가리키는 zip이 먼저 있어야 한다.
   --latest=false: 저장소의 「최신 릴리스」 자리를 차지하지 않게. 이 zip을 다시 만들면 서명이 바뀌니 이 파일을 그대로 올린다.
   gh release create $TAG "$ZIP" -R $REPO --target main --title "$TITLE" --notes "$RELNOTES" --latest=false

2) VERSION·appcast를 PR로 올린다. main에 머지되어 사이트에 배포되면 앱들이 새 판을 본다.
   git switch -c $TAG
   git add apps/cubie/VERSION apps/web/public/cubie/appcast.xml
   git commit -m "Cubie $VERSION"
   git push -u origin $TAG
   gh pr create -R $REPO --title "chore(cubie): Cubie $VERSION 배포" --body "Cubie $VERSION 업데이트 목록"
EOF
