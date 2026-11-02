# 40. 이름 바꾸기: mighty → game (2026-11-02 계획)

마이티 하나에서 게임 센터(game.byb.kr)로 넓어졌는데 저장소·패키지·이미지·컨테이너 이름이 그대로 mighty다. 정식 출시 전에 바꾼다(2026-11-01 사용자). 마이티 게임 자체의 이름(`/mighty`, 마이티 엔진·컴퓨터)은 그대로 둔다.

## 안전한 까닭

- 별 따기 규칙·서명·해시·장부 형식에는 "mighty"가 없다(2026-11-01 확인). 이름을 바꿔도 지난 장부 검사와 서명이 깨지지 않는다.
- 별 따기 서버 컨테이너(`stardraw`), 이미지(`ghcr.io/ybbarng/stardraw-server`), 공개 장부 저장소(`stardraw-ledger`)는 이름이 따로라 건드리지 않는다. 회차 진행(마감·봉인·결과 결정·관측지)은 웹 컨테이너를 바꾸는 동안에도 그대로 돈다.
- 웹 컨테이너를 바꾸는 몇 초 동안은 페이지를 새로 열 수 없다. 이미 연 화면과 관측지 연결(별 따기 서버로 바로 간다)은 끊기지 않는다.

## 시간대

지금 시험 회차는 20분마다 돈다. 마감·결과 결정 앞뒤(**:13~:17, :33~:37, :53~:57**)는 피한다. 컨테이너를 바꾸는 단계는 **:20~:30, :40~:50, :00~:10** 가운데 한 칸에서 한 번에 끝낸다.

## 단계

### 1단계 · 패키지 이름(game 혼자, 바깥 영향 없음)

- 작업 공간 패키지 `@game/*` → `@game/*`. 마이티 게임 것은 이름에 마이티를 남긴다: `@game/mighty-engine` → `@game/mighty-engine`, `@game/mighty-ai` → `@game/mighty-ai`. 나머지는 `@game/web`, `@game/fair-play`, `@game/stardraw-core`, `@game/stardraw-cli` 처럼.
- 함께 고칠 곳: 모든 package.json·import, `Dockerfile` COPY 줄, `.github/workflows/ci.yml`·`image.yml`의 `pnpm --filter`, CLAUDE.md·docs·지도.
- 보통 배포(CI → Image → 자동 배포)로 올라간다. 이미지 이름은 아직 `ghcr.io/ybbarng/mighty`.

### 2단계 · GitHub 저장소 이름(game, 실행 전 사용자 확인)

- `ybbarng/mighty` → `ybbarng/game`, `ybbarng/mighty-archive` → `ybbarng/game-archive`.
- GitHub가 옛 주소(웹·git·raw·릴리스)를 새 주소로 넘겨준다. 그래도 고친다: 로컬 git 원격 주소, 사이트 바닥글 GitHub 링크, 문서의 저장소 주소.
- GHCR 이미지 패키지는 저장소에 묶여 있어 그대로 이어진다.

### 3단계 · 이미지·컨테이너(servers + game, 서버 명령은 사용자)

한 시간대 칸 안에서 순서대로 한다.

1. servers: `byb.kr/apps/game/`(옛 `apps/mighty/`)의 compose·deploy.sh를 새 이름으로 준비한다. 서비스·프로젝트·Traefik 라우터 이름 `mighty` → `game`, 시험 모드 `mighty-test` → `game-test`, 환경 변수 `MIGHTY_TRAEFIK` → `GAME_TRAEFIK`. `apps/mighty-signal` → `apps/game-signal`, `apps/mighty-diag` → `apps/game-diag`.
2. 사용자: 서버의 배포 키 forced-command 경로를 `apps/game/deploy.sh`로 고친다(`authorized_keys`). 한동안 옛 경로에 새 스크립트를 가리키는 링크를 둬서, 어느 쪽 배포가 와도 돈다.
3. game: `image.yml`의 이미지 이름을 `ghcr.io/ybbarng/game`으로, 빌드 캐시 범위 `mighty` → `game`으로 바꿔 push한다. 첫 배포가 새 컨테이너를 띄운다.
4. 사용자: 옛 컨테이너(mighty-*-1, mighty-signal, mighty-diag)를 내린다. 새 것과 옛 것이 같은 주소 규칙으로 함께 떠 있지 않게, 새 컨테이너가 healthz를 통과한 바로 뒤에 내린다.
5. servers: TURN 설정(`apps/turn/turnserver.conf`), 상태 감시(`apps/gatus/config.yaml`), `sites.md`·`dns.md`·`PLAN.md`·`HANDOFF.md`, 집 서버 스크립트(`home/scripts/verify-stardraw.sh`의 `@game/stardraw-cli`·경로, `pull-stardraw-backup.sh` 주석), 별 따기 compose 주석의 저장소 이름.
6. 옛 GHCR 이미지 `ghcr.io/ybbarng/mighty`는 되돌릴 때를 위해 며칠 둔 뒤 사용자가 지운다.

되돌리기: 옛 경로 링크와 옛 이미지가 남아 있는 동안은 `image.yml` 이미지 이름을 되돌리고 옛 compose로 다시 띄우면 된다.

### 4단계 · 이 맥의 폴더(다른 클로드 작업이 없을 때)

- `~/personal/projects/game/mighty` → `~/personal/projects/game/game`, `mighty-archive` → `game-archive`. 바깥 폴더(`game`)는 이미 바뀌어 클로드 기억 폴더는 옮기지 않아도 된다.
- 열린 세션의 작업 경로가 깨지므로 모든 세션을 닫은 뒤 바꾼다. 바깥 CLAUDE.md, 비서 저장소·책상·알림에 적힌 경로, verify-stardraw.sh의 scp 경로를 함께 고친다.

## 맡는 사람

| 단계 | game | servers | 사용자 |
|---|---|---|---|
| 1 패키지 | 모두 | — | — |
| 2 저장소 | 준비·원격 주소 | — | 실행 확인 |
| 3 이미지·컨테이너 | image.yml | compose·스크립트·문서 | forced-command, 옛 컨테이너 내리기, 옛 이미지 지우기 |
| 4 폴더 | 경로 고치기 | 스크립트 경로 | 세션 닫기 |

## 실행 계획: 2026-11-02 13:30~14:00

servers 검토(브랜치 rename-game 8901ee8, servers PLAN 23단계)를 반영했다.

- 배포 키 forced-command는 칸 안에서 고치지 않는다. servers가 `apps/mighty/deploy.sh`를 `../game/deploy.sh` 링크로 남기고, deploy.sh가 `readlink -f`로 제 폴더를 찾게 고쳤다. 옛 forced-command로도 새 스크립트가 돈다. `authorized_keys`는 나중에 사용자가 고치고, 그 뒤 링크 폴더를 지운다.
- 신호 서버는 겹쳐 띄우지 않는다. 방 정보를 메모리에 두어서, 같은 규칙의 라우터가 둘이면 방이 갈린다. 옛 것을 내리고 바로 새 것을 띄운다(몇 초 끊김, 이미 이어진 대전은 그대로). 웹은 정적이라 잠깐 겹쳐도 된다.
- image.yml push와 servers 합치기는 붙여서 한다. 한쪽만 먼저 가면 배포가 실패한다(옛 컨테이너는 그대로라 안전하지만 다시 돌려야 한다).

| 시각 | 누가 | 할 일 |
|---|---|---|
| 지금~13:10 | game | 1단계 패키지 이름 main 반영, CI·이미지·배포 확인(이미지 이름은 아직 mighty) |
| 13:20 | 사용자 확인 → game | 2단계: `gh repo rename game`(ybbarng/mighty → ybbarng/game), `mighty-archive` → `game-archive`, 로컬 원격 주소 고침. 사이트의 저장소 주소 커밋은 13:40 push에 함께 싣는다(13:38 전에 배포가 모두 끝나 있어야 하고, 그 사이 새 배포가 돌면 옛 deploy.sh가 git pull 중에 실패한다. 옛 주소는 GitHub가 넘겨준다) |
| 13:30 | game → servers | 시작 신호에 「1단계 배포 끝(✅ 시각)」을 적는다 |
| **13:33~13:37** | 모두 | 마감·결과 결정 시간대라 기다린다 |
| 13:38 | servers | rename-game을 servers main에 합치고 서버에서 pull |
| 13:39 | 사용자 → servers | `docker compose -p mighty-signal down`, `-p mighty-diag down` → servers가 game-signal·game-diag up |
| 13:40 | game | 사이트 저장소 주소 + image.yml(이미지 ghcr.io/ybbarng/game) 한 번에 push → CI(약 4분) → Image(빌드·배포) |
| 13:48 무렵 | game | 첫 배포가 새 컨테이너(game-game-1) healthz 통과 확인. GHCR pull이 403이면 새 패키지 ghcr.io/ybbarng/game이 저장소에 이어졌는지(Actions 접근) 본다 |
| 13:49 | 사용자 | `docker compose -p mighty down`(옛 웹) |
| 13:50 | servers·game | 확인: game.byb.kr 200, /signal/, /diag, /stardraw-api/, Gatus, 별 따기 관측지 |
| **13:53~13:57** | 모두 | 기다린다. 늦어지면 13:58 뒤에 이어 간다 |
| 그 뒤 | 사용자 | 새 GHCR 패키지 공개 범위를 옛 것과 같게(공개). 며칠 뒤 옛 이미지 지우기, authorized_keys 고친 뒤 링크 폴더 지우기 |

**되돌리기**: 옛 웹 컨테이너를 내리기 전이면 그대로 두면 된다. 내린 뒤에 문제가 생기면 `docker compose -p mighty up -d`(옛 이미지가 서버에 남아 있다)로 다시 띄우고, image.yml을 되돌려 push한다. 신호 서버는 game-signal을 내리고 mighty-signal을 다시 띄운다.

4단계(이 맥 폴더 이름)는 이 칸에서 하지 않는다. 모든 세션을 닫을 수 있을 때 따로 한다.
