#!/bin/sh
# 화면 없이 도는 단위 시험(포커스 돌려주기 판단, 키 출처 판정). 창을 띄우거나 포커스를 바꾸지 않는다.
set -eu
cd "$(dirname "$0")"
# 실행 파일 타깃도 함께 빌드되므로 네이티브 화면 정적 라이브러리를 먼저 만든다(docs/52 5-2)
scripts/build-native.sh
exec nice -n 15 swift test
