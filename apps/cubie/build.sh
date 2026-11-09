#!/bin/sh
# Cubie.app을 이 폴더 안에 만든다(apps/cubie/Cubie.app). 시스템 자리(/Applications 등)에는 설치하지 않는다.
#   ./build.sh               이 맥 칩용만 빌드(빠르다, 확인용)
#   ./build.sh --universal   arm64 + x86_64 둘 다(배포본. release.sh가 쓴다)
# 판은 VERSION 파일 한 곳에 두고(새 판은 release.sh가 올린다) 여기서 Info.plist 두 칸(CFBundleShortVersionString·CFBundleVersion)에 넣는다.
# 서명: 환경 변수 CUBIE_SIGN_IDENTITY에 키체인의 코드 서명 신원 이름이 있으면 그것으로, 없으면 ad-hoc.
#   Sparkle 2는 업데이트 파일의 EdDSA 서명이 맞으면 ad-hoc 앱 사이 업데이트도 받아들인다(docs/47 15-12).
set -eu
cd "$(dirname "$0")"

UNIVERSAL=0
for a in "$@"; do
  case "$a" in
    --universal) UNIVERSAL=1 ;;
    *) echo "모르는 옵션: $a" >&2; exit 2 ;;
  esac
done

# CUBIE_VERSION은 release.sh --dry-run이 VERSION 파일을 고치지 않고 판을 줄 때 쓴다
VERSION="${CUBIE_VERSION:-$(tr -d ' \n' < VERSION)}"
if [ "$UNIVERSAL" = 1 ]; then ARCHS="arm64 x86_64"; else ARCHS="$(uname -m)"; fi

# 칩마다 따로 빌드해 lipo로 합친다(`--arch` 두 개를 한 번에 주면 xcbuild로 빌드해 결과 자리가 달라진다)
SLICES=""
for arch in $ARCHS; do
  nice -n 15 swift build -c release --arch "$arch"
  SLICES="$SLICES $(swift build -c release --arch "$arch" --show-bin-path)/Cubie"
done
BIN_DIR="$(swift build -c release --arch "$(echo "$ARCHS" | cut -d' ' -f1)" --show-bin-path)"

APP=Cubie.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Frameworks"
# shellcheck disable=SC2086
lipo -create $SLICES -output "$APP/Contents/MacOS/Cubie"
# shellcheck disable=SC2086
lipo "$APP/Contents/MacOS/Cubie" -verify_arch $ARCHS
strip -rSTx "$APP/Contents/MacOS/Cubie"

cp Resources/Info.plist "$APP/Contents/Info.plist"
# 앱 아이콘과 메뉴 막대 아이콘(scripts/make-icon.swift가 그린 것)
cp Resources/AppIcon.icns Resources/MenuIcon*.png "$APP/Contents/Resources/"
plutil -insert CFBundleShortVersionString -string "$VERSION" "$APP/Contents/Info.plist"
plutil -insert CFBundleVersion -string "$VERSION" "$APP/Contents/Info.plist"

# Sparkle.framework(배포본은 arm64·x86_64가 함께 든 판). 심볼 링크를 그대로 두려고 ditto로 옮긴다.
# 프레임워크는 Sparkle이 서명한 그대로 둔다(앱은 hardened runtime이 아니라 라이브러리 서명 확인을 하지 않는다).
ditto "$BIN_DIR/Sparkle.framework" "$APP/Contents/Frameworks/Sparkle.framework"

IDENTITY="${CUBIE_SIGN_IDENTITY:-}"
if [ -n "$IDENTITY" ] && security find-identity -v -p codesigning | grep -F "\"$IDENTITY\"" >/dev/null; then
  codesign --force --sign "$IDENTITY" "$APP"
  SIGNED="$IDENTITY"
else
  if [ -n "$IDENTITY" ]; then echo "코드 서명 신원 「$IDENTITY」를 키체인에서 못 찾아 ad-hoc으로 서명한다" >&2; fi
  codesign --force --sign - "$APP"
  SIGNED=ad-hoc
fi
codesign --verify --deep --strict "$APP"
echo "만듦: $(pwd)/$APP (판 $VERSION, $(lipo -archs "$APP/Contents/MacOS/Cubie"), 서명 $SIGNED)"
