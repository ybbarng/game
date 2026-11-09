#!/bin/sh
# Cubie.app을 이 폴더 안에 만든다(apps/cubie/Cubie.app). 시스템 자리(~/Applications 등)에는 설치하지 않는다.
#   ./build.sh          릴리스 빌드 → Cubie.app, ad-hoc 서명
set -eu
cd "$(dirname "$0")"

nice -n 15 swift build -c release
BIN="$(swift build -c release --show-bin-path)/Cubie"

APP=Cubie.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Cubie"
cp Resources/Info.plist "$APP/Contents/Info.plist"
# ad-hoc 서명(이 맥에서만 띄운다. 남에게 줄 때는 README 「공개할 때 필요한 것」)
codesign --force --sign - "$APP"
echo "만듦: $(pwd)/$APP"
