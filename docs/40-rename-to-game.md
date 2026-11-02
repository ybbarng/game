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

- 작업 공간 패키지 `@mighty/*` → `@game/*`. 마이티 게임 것은 이름에 마이티를 남긴다: `@mighty/engine` → `@game/mighty-engine`, `@mighty/ai` → `@game/mighty-ai`. 나머지는 `@game/web`, `@game/fair-play`, `@game/stardraw-core`, `@game/stardraw-cli` 처럼.
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
5. servers: TURN 설정(`apps/turn/turnserver.conf`), 상태 감시(`apps/gatus/config.yaml`), `sites.md`·`dns.md`·`PLAN.md`·`HANDOFF.md`, 집 서버 스크립트(`home/scripts/verify-stardraw.sh`의 `@mighty/stardraw-cli`·경로, `pull-stardraw-backup.sh` 주석), 별 따기 compose 주석의 저장소 이름.
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
