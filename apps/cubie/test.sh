#!/bin/sh
# 화면 없이 도는 단위 시험(포커스 돌려주기 판단, 키 출처 판정). 창을 띄우거나 포커스를 바꾸지 않는다.
set -eu
cd "$(dirname "$0")"
# 실행 파일 타깃도 함께 빌드되므로 네이티브 화면 정적 라이브러리를 먼저 만든다(docs/52 5-2)
scripts/build-native.sh
# 손으로 쓴 C 머리 파일(Sources/CubieNativeC/include/cubie_native.h)이 Rust C ABI와 같은지(함수·구조체·상수, docs/52 5-20)
CARGO="${CUBIE_CARGO:-/opt/homebrew/opt/rustup/bin/cargo}"
PATH="$(dirname "$CARGO"):$PATH" "$CARGO" test --quiet --locked --manifest-path ../../native/cubie-native/Cargo.toml --test header_abi
# Command Line Tools만 깔린 맥에서는 swift test가 시험 매크로(TestingMacros)를 스스로 찾지 못할 때가 있다
# (2026-11-18 도구 모음 갱신 뒤). 도구 모음 안 testing 플러그인 폴더가 있으면 그 자리를 알려 준다.
PLUGINS="$(dirname "$(dirname "$(xcrun --find swift)")")/lib/swift/host/plugins/testing"
if [ -d "$PLUGINS" ]; then
  exec nice -n 15 swift test -Xswiftc -plugin-path -Xswiftc "$PLUGINS"
fi
exec nice -n 15 swift test
