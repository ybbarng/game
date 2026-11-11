#!/bin/sh
# 네이티브 화면 정적 라이브러리(native/cubie-native, docs/52 5-2)를 만들어 apps/cubie/.native/libcubie_native.a에 둔다.
# Package.swift가 이 자리를 링크한다. build.sh·test.sh가 먼저 부른다.
#   scripts/build-native.sh                 이 맥 칩용만
#   scripts/build-native.sh --universal     arm64 + x86_64를 lipo로 합친다(배포본)
# Rust는 rustup의 cargo를 절대 경로로 쓴다(셸 설정을 고치지 않는다). 다른 자리면 CUBIE_CARGO로 준다.
# x86_64는 표준 라이브러리가 있어야 한다: rustup target add x86_64-apple-darwin
set -eu
cd "$(dirname "$0")/.."

UNIVERSAL=0
for a in "$@"; do
  case "$a" in
    --universal) UNIVERSAL=1 ;;
    *) echo "모르는 옵션: $a" >&2; exit 2 ;;
  esac
done

CARGO="${CUBIE_CARGO:-/opt/homebrew/opt/rustup/bin/cargo}"
[ -x "$CARGO" ] || { echo "cargo가 없다: $CARGO (CUBIE_CARGO로 자리를 준다)" >&2; exit 1; }
# rustup의 rustc·cargo 대리 실행 파일이 같은 폴더에 있다
PATH="$(dirname "$CARGO"):$PATH"
export PATH
# 앱 최소 macOS(Package.swift)와 맞춘다. 더 높으면 링크할 때 경고가 난다
export MACOSX_DEPLOYMENT_TARGET=15.0

CRATE="$(cd ../../native/cubie-native && pwd)"
OUT="$(pwd)/.native"
mkdir -p "$OUT"

if [ "$UNIVERSAL" = 1 ]; then
  TARGETS="aarch64-apple-darwin x86_64-apple-darwin"
else
  case "$(uname -m)" in
    arm64) TARGETS="aarch64-apple-darwin" ;;
    *) TARGETS="x86_64-apple-darwin" ;;
  esac
fi

LIBS=""
for t in $TARGETS; do
  "$CARGO" build --manifest-path "$CRATE/Cargo.toml" --release --locked --lib --target "$t"
  LIBS="$LIBS $CRATE/target/$t/release/libcubie_native.a"
done
# shellcheck disable=SC2086
lipo -create $LIBS -output "$OUT/libcubie_native.a"
echo "만듦: $OUT/libcubie_native.a ($(lipo -archs "$OUT/libcubie_native.a"))"
