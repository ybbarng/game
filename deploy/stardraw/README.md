# 하늘의 별 따기 서버 배포 초안

아직 배포하지 않았다. 아래는 servers 저장소(`byb.kr/apps/stardraw/`)로 옮길 초안과 사용자가 정할 것이다(docs/36 11-5 4번, 11-6).
순서는 **시험 운영 → 잘 되면 시험 장부를 버리고 정식 시작**이다.

## 모양

- 주소: `https://game.byb.kr/stardraw-api/` (Traefik `PathPrefix`). API는 `/stardraw-api/api/...`, 공개 장부 파일은 `/stardraw-api/ledger/...`.
- 화면은 같은 출처 상대 주소로 부른다. 화면 빌드에 `NEXT_PUBLIC_STARDRAW_API=/stardraw-api`를 넣어야 서버를 쓰고, 비우면 지금처럼 기기 안 연습 장부로 돈다(아직 넣지 않았다).
- 서비스 워커는 `/stardraw-api/` 아래를 저장하지 않는다(`apps/web/public/sw.js`).
- 이미지: `ghcr.io/ybbarng/stardraw-server`(`apps/stardraw-server/Dockerfile`, 빌드 문맥은 저장소 맨 위). `.github/workflows/image.yml`의 `server-image` 일이 만든다. 저장소 변수 `STARDRAW_SERVER_IMAGE`를 `true`로 켜기 전에는 돌지 않고, 배포는 하지 않는다(이 폴더의 compose로 손으로 띄운다).
- 단계: 설정이 아니라 장부가 정한다. 새 장부는 시험 단계로 시작하고, `schedule-live` 명령으로 정식 단계를 예약한다(아래 2절).

## 서명 열쇠

영수증과 투명성 로그 항목에 서명하는 서버 열쇠(ECDSA P-256)다. 공개 열쇠는 `head.json`에 실려 누구나 영수증을 확인한다. 시험과 정식은 같은 열쇠를 써도 된다(장부가 갈려 영수증이 섞이지 않는다).

```sh
# 서버에서 한 번(파일은 저장소에 올리지 않는다)
cd ~/servers/byb.kr/apps/stardraw
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -outform DER | base64 > server-key.pkcs8
chmod 600 server-key.pkcs8
```

열쇠를 잃으면 이전 영수증은 그대로 확인되지만(공개 열쇠가 장부에 있다), 새 열쇠로 바꾼 사실을 공지해야 한다. 백업은 비밀번호 관리 앱에 둔다.

## 1. 시험 단계

장부는 하나다(docs/36 11-6). 새 장부는 시험 단계로 시작하고, 정식 시작은 장부 안의 일정 바꾸기 한 줄이라 시험 회차도 같은 사슬에 영원히 남는다. 화면은 시험 단계 회차를 "시험 n회", 정식 단계 첫 회차부터 "정식 1회"로 보이고, 시험 단계 동안 "시험 운영 중" 띠를 띄운다(서버가 알려 주는 지금 회차 단계로). 봉인 시각 인증은 단계와 상관없이 받고, GitHub 앵커는 처음 일정표를 main의 `genesis.txt`에, 시험 회차를 `trial` 브랜치에 남긴다(아래 "시각 인증과 앵커").

```sh
# .env
STARDRAW_ROUND_SECONDS=600       # 시험 단계 회차 길이(기본 10분, 10분보다 짧을 수 없다). 새 장부를 만들 때만 쓴다
# STARDRAW_EPOCH=                 # 비우면 띄운 뒤 첫 맞춘 마감(10분 회차면 다음 x:05·x:15…)이 1회차 마감
```

```sh
docker compose up -d
curl -s https://game.byb.kr/stardraw-api/api/state   # "mode":"trial", "liveFrom":null
```

- 장부(데이터 폴더 `data/`)는 다시 시작하지 않는다. 처음 띄울 때 앵커 저장소 main에 남긴 `genesis.txt`와 다른 장부로 띄우면 앵커가 거절하고(서버 기록에 `처음 일정표 앵커를 남기지 못해…`), 장부 검사도 "장부를 다시 시작했다"로 실패한다.

시험 중 확인할 것: 응모(패스키 만들기), 마감·봉인·시각 인증, drand 추첨, 결과 봉투, 내 응모, 다른 기기에서 내 응모권 찾기, 당첨자 확인(별 세 개), 장부 검사(검증하기 페이지), 앵커 커밋, 백업.

### 응모 앞단 작업 증명(docs/36 11-31)

서버는 응모·등록 요청의 앞단 답(`gate`)을 Argon2보다 먼저 확인한다. 기본으로 켜져 있고(평균 512번), 화면은 상태(`/api/state`의 `gateTarget`)를 보고 답을 붙인다. 이 판을 처음 띄울 때는 이미 열려 있던 옛 탭이 답 없이 보내도 받도록 유예를 하루 둔다.

```sh
# .env
STARDRAW_GATE_OPTIONAL_UNTIL=2026-11-03T00:00:00+09:00   # 배포 시각 + 하루. 지난 뒤에는 이 줄을 지운다
# STARDRAW_GATE_TRIES=512                                # 세기(평균 시도 수). 0이면 끈다
```

- 확인: `curl -s https://game.byb.kr/stardraw-api/api/state`에 `"gateTarget":8388608`(512번이면)이 보인다.
- 화면과 서버는 어느 쪽이 먼저 나가도 된다. 화면은 서버가 `gateTarget`을 알릴 때만 답을 붙이고, 옛 서버는 모르는 칸을 무시한다.
- Argon2 줄 기본값이 32에서 400으로 늘었다(`STARDRAW_ARGON_QUEUE`, docs/36 11-31 「줄과 다시 내기」). .env에 32를 적어 두었다면 지운다. 줄이 가득하면 서명 확인 전에 바로 503을 주고, 화면은 기기마다 흔든 간격으로 마감 5초 전까지 다시 낸다.

## 2. 일정 바꾸기: 회차 길이 바꾸기와 정식 시작(docs/36 11-6, 11-32)

기본 길은 국장 관리 화면 `/stardraw/admin`의 「일정 바꾸기」다(아래 3절, 국장 패스키 서명, 3회차 예고, 예고 중 취소 가능). 단계(시험 그대로·정식 시작)와 회차 길이(20분·30분·1시간·2시간)를 고르면 그 길이로 추첨이 배수 시각에 오는 시작 회차만 보인다. 아래 명령은 국장 열쇠가 없을 때의 예비다. 예고 중인 일정 바꾸기(국장이 했든 명령으로 했든)가 있으면 둘 다 거절한다.

서버를 멈추지 않고 예약 명령 하나를 돌린다. 새 일정 첫 회차는 **예약이 실리는 기록 회차 + 4회차** 이후이고(규칙의 3회차 예고), 추첨이 새 회차 길이의 배수 시각에 오게 시작해야 한다(1시간이면 x:55 시작·정각 추첨, 30분이면 x:25·x:55, 2시간이면 한국 시각 홀수 시 정각 추첨·짝수 시 55분 마감).

```sh
cd ~/servers/byb.kr/apps/stardraw
# 시험 단계 그대로 회차 길이만: 20분 → 1시간(예: 11월 3일 08:55 시작 → 마감 09:55, 추첨 10:00)
docker compose exec -T stardraw node server.mjs schedule-change --from 2026-11-03T08:55:00+09:00 --round-seconds 3600
# 정식 시작(1시간): schedule-live는 schedule-change --phase live와 같고, 이미 정식이면 거절한다
docker compose exec -T stardraw node server.mjs schedule-live --from 2026-11-04T08:55:00+09:00
# 정식 단계에서 길이만: 1시간 → 2시간
docker compose exec -T stardraw node server.mjs schedule-change --from <ISO> --round-seconds 7200
#   → "일정 바꾸기를 예약했다: 사슬 N회차(…)부터 시험 단계 60분 회차. M회차 기록에 실리고 …회차 동안 예고된다"
```

- 명령은 규칙을 먼저 확인하고(단계가 있는 장부인지, 예고·예약 중인 일정 바꾸기가 없는지, 바뀌는 것이 있는지, 새 길이에 맞는 시작 시각인지, 지금 회차가 열리는 시각인지, 3회차 예고) 맞지 않으면 아무것도 바꾸지 않는다. 정식 뒤로 시험은 둘 수 없다.
- 새 줄은 마지막 줄의 마감 여유(5초)·작업 증명 목표값을 그대로 잇는다.
- 예고 중(실린 기록 다음 회차부터 새 일정 첫 회차 전까지)에는 다른 일정 바꾸기를 받지 않는다. 바꾸려면 국장이 예고를 취소하거나(국장 운영 기록일 때) 효력이 생긴 뒤 다시 한다. 명령으로 실린 옛 칸은 취소할 수 없으니 시각을 잘 확인한다.
- 바꾸기 전에 아래 「정식 전환 리허설」을 같은 판 이미지로 한 번 돌려 본다.
- 서버는 다음 회차 기록을 닫을 때 예약을 싣는다(서버 기록 `M회차 기록에 일정 바꾸기를 실었다`). 그 뒤 `/api/state`의 `liveFrom`이 정식 첫 사슬 회차가 된다. 그사이 서버가 멈춰 기록이 늦게 닫혀 3회차 예고에 못 미치면 싣지 않고 지우므로 다시 예약한다.
- 정식 단계 회차부터 앵커 브랜치는 `main`이다. 시험 회차와 응모·패스키 등록은 그대로 이어진다(옮길 것이 없다).

## 3. 국장 열쇠와 관리 화면(docs/36 11-12)

운영 일(소속 추가·바꾸기·끝내기, 정식 시작 예약, 예고 취소, 국장 열쇠 더하기·빼기)은 서버 DB를 고치지 않고 **국장 패스키로 서명한 운영 기록**으로 한다. 서버가 확인해 다음 회차 기록에 싣고, 실린 회차 + 4회차부터 효력이 생긴다(3회차 예고). 관리 화면은 누구나 열 수 있지만, 거기서 패스키를 만든다고 국장이 되지 않는다. 국장 열쇠는 이 설정(처음)이나 이미 쓰는 국장의 서명으로만 지정된다.

1. 운영자 기기에서 `https://game.byb.kr/stardraw/admin` → 「국장 패스키 만들기」. 응모용 우주인 패스키와 다른 패스키가 하나 더 생긴다(이름 "카노푸스 우주국장"). 화면에 지문 `국장-XXXX-XXXX-XXXX`와 설정 값이 뜬다.
2. 서버의 `.env`에 그 값을 한 줄 넣는다(여럿이면 쉼표로). 공개 열쇠라 비밀값은 아니지만, 화면에서 직접 옮긴 값인지 지문으로 대조한다(바꿔치기 대비).

```sh
# .env
STARDRAW_DIRECTOR_KEYS=<패스키 번호 base64url>.<공개 열쇠 base64url>
```

3. 다시 띄운다: `docker compose up -d`. 시작 기록에 `국장 열쇠(설정) 국장-XXXX-XXXX-XXXX: 다음 기록에 지정을 싣는다`가 찍힌다. 이 지문이 1의 화면 지문과 같은지 본다.
4. 다음 회차 기록이 닫히면 `N회차 기록에 운영 기록을 실었다: 국장 열쇠 지정 국장-…(서명 관인, M회차부터)`. 검증 페이지의 "국장 열쇠 내력"에도 보인다. M회차(실린 회차 + 4)부터 관리 화면에서 서명할 수 있다.

- 설정에서 열쇠를 빼고 다시 띄우면, 아직 예고 중인 관인 지정은 다음 기록에 관인이 취소한다. 이미 효력이 생긴 열쇠는 관리 화면의 「빼기」(국장 서명)로 뺀다. 지정이 취소된 열쇠는 설정에 다시 넣어도 싣지 않는다(새 패스키를 만든다).
- 국장 열쇠는 여러 개 둘 수 있다(기기 분실 대비). 쓰는 중인 국장은 관리 화면에서 새 열쇠를 지정할 수 있다.
- 국장 패스키로는 우주인 등록(응모)을 할 수 없다. 응모는 다른 패스키로 한다.
- `STARDRAW_ORIGINS`에 localhost가 있으면 서버는 localhost에서 한 서명도 받지만, 공개 장부 검사(검증 페이지·터미널 검사기)는 `https://game.byb.kr`에서 한 서명만 받는다. 국장 서명은 꼭 `game.byb.kr`의 관리 화면에서 한다.
- 국장 요청 상한: IP 앞부분마다 하루 60번(`STARDRAW_DIRECTOR_REQUESTS_PER_PREFIX`), 받아 두고 아직 싣지 않은 요청 20개.

## 지금 장부를 한 번 새로 시작하기(2026-10-30, 장부 형식이 바뀐 때 한 번만)

이어지는 장부 형식(일정표 줄의 단계 바이트)과 시각 인증·앵커는 이 판부터 들어갔다. 그 전에 띄운 시험 장부(`data-trial/`, 20분 회차)는 형식이 달라 새 서버가 이어 쓸 수 없으므로, 이번 한 번만 새로 시작한다. 앵커 저장소에는 아직 `genesis.txt`가 없으니 새 장부가 첫 장부가 된다.

```sh
cd ~/servers/byb.kr/apps/stardraw
docker compose exec -T stardraw node server.mjs backup /data/backup/old-trial-final.sqlite   # 옛 장부 보관
docker compose down
# 이미지를 이 판으로 올리고(.env의 STARDRAW_MODE·STARDRAW_DATA 줄은 지운다), 새 폴더 data/로 띄운다
docker compose pull && docker compose up -d
docker compose logs stardraw | head   # 시각 인증·앵커 줄, 1회차 시작 시각 확인
```

- 옛 `data-trial/`은 서버 밖에 보관한다(공개 장부 파일도 함께). 화면은 새 장부를 처음부터 받는다. 옛 장부 기기에 남은 내 응모권은 결과가 나오지 않는다.

## 시각 인증과 앵커

- **봉인 시각 인증**(docs/36 11-7): 마감 직후 봉인 값의 시각 인증 토큰을 공개 기관에서 받는다. 운영은 `STARDRAW_TSA=digicert,sectigo`, `STARDRAW_TSA_MIN=2`(두 곳, 2026-10-31). 서버가 바깥(80·443)으로 나갈 수 있어야 한다. 시작 기록에 `시각 인증: digicert, sectigo 중 2곳 이상`이 찍힌다. 받은 토큰은 들고 모자란 기관에만 15초 간격으로 다시 묻고, 기한 30초 전까지 두 곳을 못 받으면 받은 한 곳으로 봉인한다(검사에서 「주의」, 보안 표 I8). 마감 3분 뒤까지 한 곳도 못 받으면 그 회차는 무효다. 개발용으로 끄려면 `STARDRAW_TSA=off`(서버 시계를 적는다, 시각 증명 없음).
- **GitHub 앵커**: 회차마다 `ybbarng/stardraw-ledger`에 `ledgers/<장부 id>/<회차>.txt`를 커밋한다. 브랜치는 시험 `trial`, 정식 `main`(`STARDRAW_ANCHOR_BRANCH`로 바꿀 수 있다). 시작 기록에 `앵커: ybbarng/stardraw-ledger(trial 브랜치)`가 찍힌다.
- 앵커 토큰은 저장소 밖 파일에만 둔다. 이 저장소 Contents 읽기·쓰기만 되는 fine-grained 토큰:

```sh
# 서버에서 한 번(값은 어디에도 붙여 넣거나 찍지 않는다)
install -m 600 /dev/null /home/ybbarng/secrets/stardraw-anchor.env
${EDITOR:-vi} /home/ybbarng/secrets/stardraw-anchor.env   # STARDRAW_ANCHOR_TOKEN=github_pat_...
```

- compose의 `env_file`이 이 파일을 `required: false`로 읽는다. 파일이 없으면 앵커만 꺼지고(`앵커 저장소 설정이 없어 …`) 서버는 뜬다. 앵커가 실패하면 1분 뒤 그 회차부터 다시 보내고, 회차 진행은 멈추지 않는다.
- Rekor는 꺼 둔 선택지다(`STARDRAW_TSA=off` + `STARDRAW_REKOR_URL`일 때만).

## 백업과 되살리기(docs/36 보안 표 I4)

- DB(`data/stardraw/ledger/stardraw.sqlite`, 운영 compose의 `STARDRAW_DATA_DIR=/data/ledger`)에만 있는 것: 마감 전 응모권·등록, 당첨자 확인 전달, **소속 도장 비밀 열쇠**(`qual_keys`), **발급 기록**(`qual_issued`), 계정 HMAC 열쇠. 공개 장부 파일(`ledger/`)은 앵커 저장소에도 사본이 있다. 서명 열쇠(관인, `server-key.pkcs8`)는 데이터 폴더에 있다.
- **매시 백업**: servers 저장소 `byb.kr/apps/stardraw/backup.sh`가 추첨 직후(x:02) `node server.mjs backup /data/backup/stardraw-<날짜-시각>.sqlite`로 떠 두고 48시간치만 남긴다. 등록: `ssh byb-ops cron-add stardraw 2 hourly`.
- **서버 밖 보관**: 집 서버가 `apps/stardraw/dump.sh`(forced-command)로 가장 최근 사본을 **gpg로 암호화해** 끌어간다(`home/scripts/pull-stardraw-backup.sh`, 30일치). 도장 비밀 열쇠가 들어 있어 평문으로 내보내지 않는다(VPS에 공개 열쇠 `~/secrets/stardraw-backup.pub.asc`가 없으면 dump.sh가 거절한다). 준비는 그 스크립트 머리 주석대로: 집 서버에서 키와 gpg 열쇠 만들기 → VPS `authorized_keys`에 forced-command 한 줄 → 집 서버 크론.
- **관인**: `server-key.pkcs8`를 비밀번호 관리 앱에 따로 1부 둔다(서버를 통째로 잃어도 같은 관인으로 이어 가야 앵커·검사기가 같은 장부로 본다).
- **되살리기**(연습해 둘 것):
  1. 집 서버에서 `gpg -d stardraw-<시각>.sqlite.gz.gpg | gunzip > stardraw.sqlite`
  2. VPS에 옮겨 `~/data/stardraw/ledger/stardraw.sqlite` 자리에 둔다(서버가 멈춘 상태에서, 원래 파일은 옆에 남겨 둔다). 관인은 `~/data/stardraw/server-key.pkcs8`에.
  3. `ssh byb-ops up stardraw`. 서버는 DB의 처음 일정표와 기록으로 이어 가고, 공개 장부 파일을 DB에서 다시 쓴다.
  4. 백업 뒤에 닫힌 회차가 있었다면 서버가 그 회차를 다시 닫으려다 앵커와 어긋난다. 그때는 백업 대신 6절 "앵커로 다시 세우기"를 쓴다(백업에만 있는 도장 비밀 열쇠·확인 요청은 잃는다). 백업을 매시 추첨 직후에 뜨는 까닭이다.
- 손으로 뜨기: `docker compose exec -T stardraw node server.mjs backup /data/backup/stardraw-$(date +%F-%H%M).sqlite`

## 4. 상품 자격(docs/36 11-13)

기관 계정(구글 로그인 + 도메인)으로 확인된 사람이 기간마다 한 번 블라인드 도장을 받는다. 기관 도메인은 이 설정에만 둔다(공개 저장소·장부에 쓰지 않는다).

```sh
# .env(비공개)
STARDRAW_QUAL_AFFILIATIONS=벌집 성단=google:<기관 도메인>
```

1. 관리 화면에서 소속 추가(이름 "벌집 성단", 배지 성단, 방법 "기관 계정"). 3회차 뒤 효력.
2. 「소속」에서 「자격 기간 열기(1년)」. 서버가 새 도장 열쇠를 만들고(비밀은 SQLite `qual_keys`), 그 공개 열쇠를 국장이 서명해 싣는다. 3회차 뒤부터 `/stardraw/qualify`에서 받는다.
3. 서버 시작 기록에 `상품 자격 발급: 벌집 성단(구글 로그인)`이 찍히는지 본다. 구글 로그인 클라이언트 ID는 core `GOOGLE_CLIENT_ID` 상수다(공개 값). 승인된 JavaScript 원본은 `https://game.byb.kr`(개발은 `http://localhost:3456`).
4. 기간마다 찍은 도장 수는 회차 기록을 닫을 때 관인이 발급 수(kind 9)로 싣는다. 검증 페이지 「소속과 상품 자격」에서 발급 수와 쓰인 자격 수를 본다.

- 도장 비밀 열쇠와 발급 장부는 SQLite에만 있다. 백업에 넣는다(`node server.mjs backup <파일>`). 잃으면 그 기간에는 더 발급할 수 없다(새 기간을 연다).

## 5. 관인 교체(docs/36 11-25)

관인(`server-key.pkcs8`)이 새 나갔거나 바꾸고 싶을 때. 국장이 "관인 교체" 운영 기록에 서명하면 3회차 예고 뒤 효력 회차부터 서버가 **다시 띄우지 않아도** 새 관인으로 영수증·관인 기록·`head.json`에 서명한다. 옛 관인만으로는 바꿀 수 없다(국장 서명이 꼭 있어야 한다). 비밀 열쇠 내용은 어디에도 찍거나 붙여 넣지 않는다.

1. **다음 관인 열쇠 만들기**(서버에서). 지금 열쇠 옆에 두려면 compose 환경에 `STARDRAW_NEXT_SERVER_KEY_FILE: /data/server-key.next.pkcs8`를 더한다(없으면 데이터 폴더 `server-key.next.pkcs8`).
   ```sh
   docker compose exec -T stardraw node server.mjs seal-next
   #   → "다음 관인 열쇠를 만들었다: …  지문 관인-XXXX-XXXX-XXXX  공개 열쇠 …"(비밀 열쇠는 찍지 않는다)
   ```
   이미 있으면 덮어쓰지 않고 멈춘다.
2. **백업 먼저**: 새 파일을 비밀번호 관리 앱에 1부 둔다(교체가 실린 뒤 이 파일을 잃으면 그 장부의 영수증 서명이 틀린다).
3. **다시 띄우기**(:13~:17, :33~:37, :53~:57은 피한다): `docker compose up -d --force-recreate stardraw`. 시작 기록에서 확인한다:
   - `관인 지문(지금 열쇠 파일) 관인-…`
   - `관인 지문(다음 열쇠 파일) 관인-…` ← 1번에서 본 지문과 같은지
4. **국장 서명**: `/stardraw/admin` 「관인」에서 "서버에 준비된 다음 관인"의 지문이 3번과 같은지 보고 「관인 교체」를 누른다(국장 패스키). 다음 기록에 실리고 3회차 뒤부터 효력. 예고 중에는 휴대폰 알림(gatus "별 따기 운영 예고")이 오고, 마음이 바뀌면 같은 화면 「운영 기록」에서 국장이 예고 취소한다.
5. **효력 확인**: 효력 회차가 열린 뒤 `/api/state`의 `serverKey`와 공개 장부 `head.json`의 `serverKey`가 새 관인이고, 검증 페이지·터미널 검사기 「관인 내력」에 `관인 교체 … 효력`, 장부 검사가 모두 통과인지 본다.
6. **파일 정리**(효력 뒤 아무 때나, 정리 전에도 서버는 맞는 열쇠로 서명한다): 서버를 멈추지 않은 채 옛 `server-key.pkcs8`를 `server-key.old-YYYYMMDD.pkcs8`로 옮기고 `server-key.next.pkcs8`를 `server-key.pkcs8`로 옮긴 뒤 다시 띄운다. 시작 기록에 `오류:` 줄이 없어야 한다(장부가 정한 관인의 열쇠 파일이 없으면 `오류: 장부가 정한 N회차 관인 …의 열쇠 파일이 없다`가 찍힌다). 비밀번호 관리 앱의 관인 항목도 새 열쇠로 바꾼다. 옛 열쇠는 새 나간 경우면 지운다.

- 효력 전에 서버를 다시 띄우면 다음 열쇠 파일이 그대로 있어야 한다(지우면 효력 회차부터 서명하지 못한다. 시작 기록이 "다음 열쇠 파일과 다르다"로 알린다).
- 2026-11-01에 절차·기능만 만들었다. 운영에서 실제 교체는 아직 하지 않았다(사용자가 정할 때).

## 6. 앵커로 다시 세우기(docs/36 11-26)

DB(`~/data/stardraw/ledger/stardraw.sqlite`)와 백업을 모두 잃었을 때의 마지막 길이다. 공개 장부 사본으로 DB를 다시 쓰고, 장부 검사를 통과하고 끝 해시가 원본과 같을 때만 성공한다. 백업이 있으면 위 "백업과 되살리기"가 먼저다(이 길은 소속 도장 비밀 열쇠·당첨자 확인 요청·마감 전 응모를 잃는다. 잃는 것과 사용자 영향은 docs/36 11-26 표).

1. **서버 멈추기**: `cd ~/servers/byb.kr/apps/stardraw && docker compose stop stardraw`. DB가 없는 채로 서버가 떴다면 새 장부를 만들려 했을 것이다(앵커 `genesis.txt`가 달라 앵커는 거절된다). 그때 생긴 `~/data/stardraw/ledger/stardraw.sqlite*`는 옆으로 옮긴다(이 명령은 DB 파일이 있으면 덮어쓰지 않는다).
2. **관인 제자리에**: 보안 노트의 관인을 `~/data/stardraw/server-key.pkcs8`로(권한 600). 관인 교체를 예고 중이었으면 다음 관인도 `server-key.next.pkcs8`로. 관인이 없으면 새 관인으로 띄운 뒤 국장이 관인 교체를 싣는다(그 사이 3회차는 영수증 확인이 틀린다).
3. **원본 고르기**(가장 앞선 것):
   - 공개 장부 폴더가 남아 있으면(DB만 잃음): `--from /data/ledger/ledger`
   - 아니면 앵커 저장소: `git clone --branch main https://github.com/ybbarng/stardraw-ledger ~/data/stardraw/anchor-copy`(정식 시작 전이면 `--branch trial`) 뒤 `--from /data/anchor-copy`. 받지 않고 바로 `--from github`도 된다(raw 주소라 몇 분 늦을 수 있다).
4. **다시 세우기**:
   ```sh
   docker compose run --rm stardraw node server.mjs restore --from /data/anchor-copy
   ```
   `[stardraw] N회차까지 되살렸다. 장부 끝 해시 …`가 나오면 성공이다. 거절되면 DB를 만들지 않고 멈춘다. 자주 나오는 거절:
   - `앵커 저장소 …에 N+1회차 앵커가 있는데`: 사본이 앵커보다 늦다. 몇 분 뒤 다시 받거나 다른 브랜치·공개 장부 폴더를 쓴다.
   - `원본 장부 검사가 통과하지 않는다`: 원본이 깨졌다. 다른 원본을 쓴다.
5. **띄우기**(:13~:17, :33~:37, :53~:57은 피한다): `ssh byb-ops up stardraw`. 시작 기록에서 `관인 지문`이 장부의 관인과 같고 `오류:` 줄이 없는지 본다. 서버는 1회차부터 앵커를 다시 확인하며 넘어간다(같은 내용이면 그대로).
6. **확인과 뒷일**: 터미널 검사기 `--source server --compare`가 통과하는지 본다. 그다음 잃은 것을 되돌린다: 국장 화면에서 소속 기간 새로 열기, 예고하려던 운영 기록 다시 서명, 정식 시작 예약을 다시(`schedule-live`), 당첨자에게 확인 링크 다시 보내기. 봉인했지만 추첨 전이던 회차는 무효로 닫히므로 공지한다.

## 7. 정식 전환 리허설(docs/36 11-32)

일정을 바꾸기 전에 운영 장부 사본으로 바꾸는 순간을 이 맥에서 지나 본다. 운영 서버에는 공개 장부 파일 GET만 보내고, drand·시각 인증·GitHub 앵커는 가짜, 관인은 새로 만든다(검사 항목 「관인 열쇠」 하나는 그래서 늘 실패한다). 이 프로세스의 시계를 빨리 감아 시험 20분 → 시험 1시간 → 정식 1시간(25회차 넘게, 100회차 묶음 경계) → 정식 30분 → 정식 2시간을 지나며 경계마다 응모·등록·확인 링크·회차 방·앞단 작업 증명·가벼운 기록·묶음·증명 API·앵커 브랜치를 보고, 끝에 장부 전체 검사(터미널 검사기와 같은 `checkPublicLedger`)를 서버와 앵커 main 사본 폴더 둘로 돌린다.

```sh
pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.bench.mjs
nice -n 15 node apps/stardraw-server/dist/bench/rehearsal.js --work <빈 폴더>
#   → 확인마다 「통과 · …」/「실패 · …」, 끝에 <빈 폴더>/rehearsal-report.json(회차 표·검사 항목·서버 기록). 실패가 있으면 종료 코드 1
```

- 이 맥에서 약 6분 걸린다(2026-11-01, 56회차·응모 91장·우주인 47명. 대부분 새 우주인 등록의 Argon2 600번). 포트 8855.
- 화면 확인: 서버 주소를 넣어 화면을 빌드하고(`NEXT_PUBLIC_STARDRAW_API=http://localhost:8855/stardraw-api pnpm --filter @mighty/web build`, 끝나면 보통 빌드로 다시), `apps/web`에서 `pnpm exec serve out -l 4855`, 리허설을 `--screens`로 띄운 뒤 `node apps/stardraw-server/bench/rehearsal-screens.mjs --out <폴더>`. 휴대폰 세로 화면으로 경계마다 첫 화면·영수증·「추첨 보러 가기」·마감 안내와 경계 전에 열어 둔 탭을 찍는다.
- `--screens` 서버는 실제 시간으로 흐르고 `POST /rehearsal/info · jump {to} · schedule {length, phase} · times {round} · bots {count} · check`로 조종한다.

## 사용자가 정할 것

1. 시험 운영을 언제 시작할지, 시험 회차 길이(기본 10분)
2. 정식 시작 시각(관리 화면 「일정 바꾸기」의 정식 시작, x:55, 하루 전까지. 예고 중에는 국장이 취소할 수 있다. 예비로 `schedule-live --from`)
7. 국장 열쇠(`STARDRAW_DIRECTOR_KEYS`, 관리 화면에서 만든 값)
3. 봉인 시각 인증: 공개 기관 DigiCert·Sectigo. 2026-10-31부터 두 곳(`STARDRAW_TSA_MIN=2`), 기한 직전엔 한 곳으로 봉인
4. 앵커 저장소: `ybbarng/stardraw-ledger`(공개)로 정함. 토큰은 `/home/ybbarng/secrets/stardraw-anchor.env`
5. 서명 열쇠 보관(서버의 파일 + 비밀번호 관리 앱 백업)
6. 저장소 변수 `STARDRAW_SERVER_IMAGE=true`로 이미지 빌드를 켤 때, 화면 빌드에 `NEXT_PUBLIC_STARDRAW_API`를 넣을 때
