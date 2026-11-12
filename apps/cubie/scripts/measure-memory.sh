#!/bin/bash
# Cubie 메모리 재기(docs/52 2절). 사용자 화면·포커스를 건드리지 않는다:
#   앱을 측정 모드(CUBIE_MEASURE=1)로 띄운다. 앱은 앞으로 나올 수 없고(.prohibited), 창은 화면 밖에 투명하게 떠 있으며,
#   메뉴 막대 아이콘·전역 단축키·업데이트를 켜지 않고, 웹 저장소는 비영속이다(사용자 기록에 손대지 않는다).
#   상태는 표준 입력(이 스크립트만 쓰는 FIFO)으로 바꾼다. 끝나면 띄운 앱과 로컬 서버를 끈다.
#
#   apps/cubie/build.sh && pnpm --filter @game/web build     # 먼저(재는 대상)
#   apps/cubie/scripts/measure-memory.sh                      # 로컬 빌드(apps/web/out)를 로컬 서버로 열어 잰다
#   apps/cubie/scripts/measure-memory.sh --url https://game.byb.kr/cube/mini   # 사이트를 잰다
#   apps/cubie/scripts/measure-memory.sh --native          # 네이티브 화면(앱 기본, Core Animation + Rust 코어, docs/52 5-6)을 같은 시나리오로 잰다
#   (--native가 없으면 웹 화면 CUBIE_WEB=1을 잰다: 0.1.10까지의 앱과 같은 화면)
#   apps/cubie/scripts/measure-memory.sh --native --onscreen   # 창을 화면 왼쪽 아래 구석에 거의 투명하게(알파 0.01) 두고 WindowServer도 잰다
#   apps/cubie/scripts/measure-memory.sh --query render=css   # 로컬 빌드의 미니 화면을 CSS 3D로 그려 잰다(docs/52 5-4)
#   옵션: --side <pt>(창 한 변, 기본 96) · --label <이름>(결과 줄 머리) · --out <파일>(결과 TSV를 덧붙인다) · --quick(가만히 1분을 10초로)
#         --query <a=b&…>(로컬 빌드 주소 /cube/mini 뒤에 붙일 쿼리) ·
#         --web <폴더>(apps/web/out 대신 다른 정적 빌드, 예: 바꾸기 전 빌드를 복사해 둔 곳) ·
#         --inject <js 파일>(문서 시작 때 넣는 실험 스크립트. 예: 테두리 끄기·화면 배율 1) · --detail(돌리는 중 WebContent·GPU의 메모리 갈래)
#         --native(웹 화면 대신 네이티브 화면. 웹 서버를 띄우지 않는다. 기록 창·티어표·설정 창도 네이티브 창이다) ·
#         --web-windows(--native와 함께: 기록 창·티어표·설정 창만 예전 사이트 창 CUBIE_WEB_WINDOWS=1로 열어 견준다. --url이
#           없으면 사이트 game.byb.kr를 연다) ·
#         --onscreen(재는 창을 화면 밖 대신 주 화면 왼쪽 아래 구석에 알파 0.01로. 화면 밖 창은 WindowServer가 합성하지 않을 수
#           있어서다. 마우스는 지나가고 앱은 앞으로 나오지 않는다. 메모리 줄에 WindowServer MEM(`top`, footprint는 관리자 권한이
#           필요하다)을, CPU 줄에 WindowServer 몫을 더한다. 다른 앱 화면 변화도 WindowServer에 섞이므로 흔들림을 감안한다)
#
# 결과: 상태마다 Cubie·WebContent(개수)·GPU·Networking·합계(MB, footprint의 phys_footprint, 1초 간격 세 번 평균).
# CPU: 상태 구간(가만히 1분, 돌리는 동안 약 20초, 숨긴 뒤 1분 등)의 처음과 끝에 프로세스마다 누적 CPU 시간(`ps -o time`)을
#   읽어, 늘어난 CPU 시간 ÷ 지난 시간으로 평균 %를 낸다(100% = 코어 하나를 다 씀). 표본을 뽑지 않아 짧은 반짝임도 빠지지 않는다.
#   --out을 주면 CPU 결과는 같은 이름에 -cpu를 붙인 TSV에 덧붙인다.
# 프로세스는 `launchctl print pid/<Cubie>`가 보여 주는 그 앱 소속 WebKit XPC 서비스만 센다(다른 앱의 WebKit은 섞이지 않는다).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
APP="$HERE/Cubie.app/Contents/MacOS/Cubie"
URL=""
SIDE=96
LABEL="measure"
OUT=""
IDLE=60
WEB=""
INJECT=""
DETAIL=0
NATIVE=0
WEB_WINDOWS=0
ONSCREEN=0
QUERY=""
PORT=4393

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --side) SIDE="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --quick) IDLE=10; shift ;;
    --web) WEB="$(cd "$2" && pwd)"; shift 2 ;;
    --inject) INJECT="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift 2 ;;
    --detail) DETAIL=1; shift ;;
    --native) NATIVE=1; shift ;;
    --web-windows) WEB_WINDOWS=1; shift ;;
    --onscreen) ONSCREEN=1; shift ;;
    --query) QUERY="$2"; shift 2 ;;
    *) echo "모르는 옵션: $1" >&2; exit 2 ;;
  esac
done

[ -x "$APP" ] || { echo "앱이 없다: apps/cubie/build.sh 먼저" >&2; exit 1; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/cubie-measure.XXXXXX")"
SERVER_PID=""
APP_PID=""
cleanup() {
  exec 3>&- 2>/dev/null || true
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$APP_PID" 2>/dev/null || true
  fi
  if [ -n "$SERVER_PID" ]; then
    # serve는 pnpm 아래 자식으로 돈다. 프로세스 묶음째 끈다
    pkill -P "$SERVER_PID" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

if [ "$NATIVE" = 1 ] && [ -z "$URL" ]; then
  URL="https://game.byb.kr/cube/mini"
fi
if [ -z "$URL" ]; then
  WEB="${WEB:-$ROOT/apps/web/out}"
  [ -f "$WEB/cube/mini.html" ] || { echo "apps/web/out이 없다: pnpm --filter @game/web build 먼저" >&2; exit 1; }
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "포트 $PORT를 이미 누가 쓴다" >&2; exit 1
  fi
  "$ROOT/apps/web/node_modules/.bin/serve" "$WEB" -l "$PORT" -n >"$TMP/serve.log" 2>&1 &
  SERVER_PID=$!
  URL="http://localhost:$PORT/cube/mini${QUERY:+?$QUERY}"
  for _ in $(seq 1 50); do
    curl -fsS -o /dev/null "$URL" 2>/dev/null && break
    sleep 0.2
  done
fi

mkfifo "$TMP/in"
WS_PID=""
if [ "$ONSCREEN" = 1 ]; then WS_PID="$(pgrep -x WindowServer | head -1)"; fi
CUBIE_MEASURE_ONSCREEN="$ONSCREEN" CUBIE_WEB="$((1 - NATIVE))" CUBIE_WEB_WINDOWS="$WEB_WINDOWS" CUBIE_MEASURE_INJECT="$INJECT" CUBIE_MEASURE=1 CUBIE_MEASURE_SIZE="$SIDE" CUBIE_URL="$URL" "$APP" <"$TMP/in" >"$TMP/app.log" 2>&1 &
APP_PID=$!
exec 3>"$TMP/in"
cmd() { echo "$*" >&3; }

wait_for() {
  local pattern="$1" limit="${2:-60}"
  for _ in $(seq 1 $((limit * 5))); do
    grep -q "$pattern" "$TMP/app.log" 2>/dev/null && return 0
    sleep 0.2
  done
  echo "기다리다 멈춤: $pattern" >&2
  cat "$TMP/app.log" >&2
  exit 1
}

wait_for "\[measure\] ready" 60
grep "\[measure\]" "$TMP/app.log" | sed 's/^/# /'

# 이 앱 소속 WebKit 프로세스: "<pid> <종류>"
children() {
  launchctl print "pid/$APP_PID" 2>/dev/null |
    awk '$3 ~ /^com\.apple\.WebKit\.(WebContent|GPU|Networking)\./ && $1 > 0 { split($3, a, "."); print $1, a[4] }' |
    sort -u
}

# 한 번 재기: "cubie web webCount gpu net" (바이트)
sample() {
  local args=(-p "$APP_PID")
  children >"$TMP/kinds"
  while read -r pid kind; do
    [ -n "$pid" ] && args+=(-p "$pid")
  done <"$TMP/kinds"
  footprint -f bytes --noCategories "${args[@]}" 2>/dev/null |
    awk -v kinds="$TMP/kinds" -v app="$APP_PID" '
      BEGIN { while ((getline line < kinds) > 0) { split(line, p, " "); kind[p[1]] = p[2] } }
      /\[[0-9]+\]: / { match($0, /\[[0-9]+\]/); pid = substr($0, RSTART + 1, RLENGTH - 2) }
      /phys_footprint:/ {
        b = $2
        if (pid == app) cubie += b
        else if (kind[pid] == "WebContent") { web += b; wc++ }
        else if (kind[pid] == "GPU") gpu += b
        else if (kind[pid] == "Networking") net += b
      }
      END { printf "%d %d %d %d %d\n", cubie, web, wc, gpu, net }'
}

if [ -n "$OUT" ] && [ ! -s "$OUT" ]; then
  printf "label\tstate\tcubie\twebcontent\twc\tgpu\tnet\ttotal\n" >"$OUT"
fi
printf "%-28s %7s %12s %7s %7s %7s%s\n" "상태" "Cubie" "WebContent" "GPU" "Net" "합계" "${WS_PID:+   WindowServer}"

# WindowServer MEM(MB, top. --onscreen일 때만)
ws_mem() {
  [ -n "$WS_PID" ] || { echo 0; return; }
  top -l 1 -pid "$WS_PID" -stats mem 2>/dev/null | tail -1 |
    awk '{ v = $1; u = substr(v, length(v)); n = v + 0; if (u == "G") n *= 1024; else if (u == "K") n /= 1024; else if (u == "B") n /= 1048576; printf "%.1f\n", n }'
}

# 상태 하나: 1초 간격 세 번 평균(MB)
measure() {
  local state="$1" s1 s2 s3 w1 w2 w3
  s1="$(sample)"; w1="$(ws_mem)"; sleep 1; s2="$(sample)"; w2="$(ws_mem)"; sleep 1; s3="$(sample)"; w3="$(ws_mem)"
  echo "$s1 $s2 $s3 $w1 $w2 $w3" | awk -v state="$state" -v label="$LABEL" -v out="$OUT" -v ws="$WS_PID" '{
    m = 1048576
    c = ($1 + $6 + $11) / 3 / m; w = ($2 + $7 + $12) / 3 / m; wc = $13
    g = ($4 + $9 + $14) / 3 / m; n = ($5 + $10 + $15) / 3 / m; t = c + w + g + n
    if (ws != "") printf "%-28s %7.1f %8.1f(%d) %7.1f %7.1f %7.1f   %7.1f\n", state, c, w, wc, g, n, t, ($16 + $17 + $18) / 3
    else printf "%-28s %7.1f %8.1f(%d) %7.1f %7.1f %7.1f\n", state, c, w, wc, g, n, t
    if (out != "") printf "%s\t%s\t%.1f\t%.1f\t%d\t%.1f\t%.1f\t%.1f\n", label, state, c, w, wc, g, n, t >> out
  }'
}

# --detail: Cubie·WebContent·GPU의 메모리 갈래(footprint 위 열 줄)
detail() {
  [ "$DETAIL" = 1 ] || return 0
  for pid in "$APP_PID" $(children | awk '$2 != "Networking" { print $1 }'); do
    footprint -p "$pid" 2>/dev/null | awk '/: 64-bit/ { print; n = 0 } /^ *[0-9.]+ [KMG]?B / && n++ < 10' | sed 's/^/# /'
  done
}

# ---- CPU ----
CPU_OUT=""
if [ -n "$OUT" ]; then
  CPU_OUT="${OUT%.tsv}-cpu.tsv"
  [ -s "$CPU_OUT" ] || printf "label\tstate\tseconds\ttotal\tcubie\twebcontent\tgpu\tnet\n" >"$CPU_OUT"
fi
: >"$TMP/cpu.txt"

now() { perl -MTime::HiRes=time -e 'printf "%.3f\n", time'; }

# 누적 CPU 시간: "<pid> <종류> <센티초>"(앱 자신은 종류 Cubie). ps 시간은 [[시:]분:]초.센티초
cpu_snapshot() {
  { echo "$APP_PID Cubie"; children; if [ -n "$WS_PID" ]; then echo "$WS_PID WindowServer"; fi; } | while read -r pid kind; do
    [ -n "$pid" ] || continue
    t="$(ps -o time= -p "$pid" 2>/dev/null | tr -d ' ')"
    [ -n "$t" ] && echo "$pid $kind $t"
  done | awk '{ n = split($3, p, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + p[i]; printf "%s %s %d\n", $1, $2, s * 100 + 0.5 }'
}

cpu_begin() {
  cpu_snapshot >"$TMP/cpu0"
  CPU_T0="$(now)"
}

# 구간 끝: 프로세스마다 늘어난 CPU 시간(구간 안에 새로 뜬 프로세스는 전부)을 종류별로 더해 %로
cpu_end() {
  local state="$1" t1
  cpu_snapshot >"$TMP/cpu1"
  t1="$(now)"
  awk -v t0="$CPU_T0" -v t1="$t1" -v state="$state" -v label="$LABEL" -v out="$CPU_OUT" '
    FNR == NR { start[$1] = $3; next }
    { d = $3 - (($1 in start) ? start[$1] : 0); if (d < 0) d = 0; by[$2] += d; if ($2 != "WindowServer") total += d }
    END {
      wall = (t1 - t0) * 100
      c = by["Cubie"] / wall * 100; w = by["WebContent"] / wall * 100
      g = by["GPU"] / wall * 100; n = by["Networking"] / wall * 100; t = total / wall * 100
      ws = by["WindowServer"] / wall * 100
      printf "%-28s %6.1f%%  (Cubie %.1f · WebContent %.1f · GPU %.1f · Net %.1f, %d초)%s\n", state, t, c, w, g, n, wall / 100, (ws > 0 ? sprintf("  WindowServer %.1f%%", ws) : "")
      if (out != "") printf "%s\t%s\t%.0f\t%.1f\t%.1f\t%.1f\t%.1f\t%.1f\n", label, state, wall / 100, t, c, w, g, n >> out
    }' "$TMP/cpu0" "$TMP/cpu1" | tee -a "$TMP/cpu.txt" | sed 's/^/CPU /'
}

sleep 5
measure "켠 직후"
detail
cpu_begin
sleep "$IDLE"
cpu_end "가만히 ${IDLE}초"
measure "가만히 ${IDLE}초"

# 직접 맞추는 중: 포커스를 주고 섞은 뒤 키로 돌린다(거울은 포커스가 있고 섞인 큐브에서 보인다).
# 200수 × 0.12초 = 24초 동안 돈다. CPU는 그 안쪽 약 20초를 본다
cmd focus 1
cmd scramble
sleep 3
cmd turns 200
cpu_begin
sleep 10
measure "섞고 돌리는 중(거울 보임)"
detail
sleep 7
cpu_end "섞고 돌리는 중(거울 보임)"
sleep 7
cmd mirror 0
sleep 2
cmd turns 60
cpu_begin
sleep 3
measure "돌리는 중(거울 숨김)"
cpu_end "돌리는 중(거울 숨김)"
sleep 6
cmd mirror 1
sleep 2
# 포커스는 있고 손을 멈춘 때(섞인 큐브, 거울 보임)
cpu_begin
sleep 10
cpu_end "포커스 있고 멈춤 10초"

# 다른 앱으로(포커스 없음) → 메뉴 「숨기기」
cmd focus 0
cpu_begin
sleep 10
cpu_end "포커스 없음 10초"
measure "포커스 없음 10초"
cmd hide
sleep 30
measure "숨긴 뒤 30초"
cpu_begin
sleep "$IDLE"
cpu_end "숨긴 뒤 30초부터 ${IDLE}초"
cmd show
sleep 5

# 단축키 표(F1)를 한 번 띄운 뒤와 버린 뒤
cmd keys load
sleep 6
measure "단축키 표 불러옴"
cmd keys drop
sleep 10
measure "단축키 표 버린 뒤 10초"

# 공식 연습(메뉴 첫 단계, 따라 치기)을 열고 키로 쳐 본 뒤 끝내기
cmd focus 1
cmd practice start
sleep 3
cmd turns 40
cpu_begin
sleep 5
cpu_end "공식 연습 중"
measure "공식 연습 중"
cmd practice stop
cmd focus 0
sleep 3

# 기록 창(화면 밖)을 연 동안과 닫은 뒤. 네이티브 화면은 네이티브 창(--web-windows면 사이트 창), 웹 화면은 사이트 창
cmd records open
sleep 8
measure "기록 창 열었을 때"
cmd records close
sleep 12
measure "기록 창 닫은 뒤 12초"

# 세 창(기록 창·티어표·설정 창)을 함께 연 동안과 닫은 뒤(docs/52 5-8)
if [ "$NATIVE" = 1 ]; then
  cmd records open
  cmd tiers open
  cmd settings open
  sleep 10
  measure "세 창 열었을 때"
  # 기록 창에서 한 판 다시 보기(네이티브 창만. --web-windows면 사이트 창은 기록이 없어 다시 볼 판이 없다)
  cmd replay open
  sleep 3
  measure "세 창 + 다시 보기 중"
  cmd records close
  cmd tiers close
  cmd settings close
  sleep 12
  measure "세 창 닫은 뒤 12초"
fi

cmd state
sleep 1
grep "\[measure\] state" "$TMP/app.log" | sed 's/^/# /'

# 최고치(켠 뒤 지금까지)
peak="$(launchctl print "pid/$APP_PID" 2>/dev/null | awk '$3 ~ /^com\.apple\.WebKit\./ && $1 > 0 { print $1 }' | sort -u)"
args=(-p "$APP_PID")
for p in $peak; do args+=(-p "$p"); done
footprint -f bytes --noCategories "${args[@]}" 2>/dev/null |
  awk '/\]: / { name = $1 } /phys_footprint_peak:/ { printf "# 최고 %s %.1f MB\n", name, $2 / 1048576 }'

echo "# CPU(구간 평균, 100% = 코어 하나)"
sed 's/^/# /' "$TMP/cpu.txt"

cmd quit
sleep 1
