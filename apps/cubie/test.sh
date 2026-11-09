#!/bin/sh
# 화면 없이 도는 단위 시험(포커스 돌려주기 판단, 키 출처 판정). 창을 띄우거나 포커스를 바꾸지 않는다.
set -eu
cd "$(dirname "$0")"
exec nice -n 15 swift test
