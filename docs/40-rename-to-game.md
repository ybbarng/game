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

## 실행 계획: 2026-11-02 사용자가 돌아온 뒤(시각은 정하지 않는다)

servers 검토(브랜치 rename-game 8901ee8, servers PLAN 23단계)를 반영했다.

- 배포 키 forced-command는 칸 안에서 고치지 않는다. servers가 `apps/mighty/deploy.sh`를 `../game/deploy.sh` 링크로 남기고, deploy.sh가 `readlink -f`로 제 폴더를 찾게 고쳤다. 옛 forced-command로도 새 스크립트가 돈다. `authorized_keys`는 나중에 사용자가 고치고, 그 뒤 링크 폴더를 지운다.
- 신호 서버는 겹쳐 띄우지 않는다. 방 정보를 메모리에 두어서, 같은 규칙의 라우터가 둘이면 방이 갈린다. 옛 것을 내리고 바로 새 것을 띄운다(몇 초 끊김, 이미 이어진 대전은 그대로). 웹은 정적이라 잠깐 겹쳐도 된다.
- image.yml push와 servers 합치기는 붙여서 한다. 한쪽만 먼저 가면 배포가 실패한다(옛 컨테이너는 그대로라 안전하지만 다시 돌려야 한다).

사용자가 돌아왔다고 말하면 그때부터 사용자와 함께하는 단계를 시작한다. 정해진 끝 시각은 없다.

**칸**: 20분 회차라 마감·결과 결정 앞뒤(:13~:17, :33~:37, :53~:57)를 피한다. 컨테이너를 바꾸는 3단계는 한 칸(**:18~:32, :38~:52, :58~:12**, 각 15분) 안에서 끝낸다. 돌아온 뒤 처음 오는 칸의 시작(:18, :38, :58)을 S라 한다.

| 언제 | 누가 | 할 일 |
|---|---|---|
| 미리(점심 동안) | game | 1단계 패키지 이름 main 반영·배포(이미지 이름은 아직 mighty). 이 뒤로 3단계 push 전까지 game 쪽 배포를 새로 돌리지 않는다 |
| 돌아오면 바로 | 사용자 | 별 따기 서버 다시 띄우기 `! ssh byb-ops recreate stardraw`(낱말 바꾸기 서버 문구, 마감 앞뒤만 피해서) |
| 돌아오면 바로 | 사용자 확인 → game | 2단계 `gh repo rename`(ybbarng/mighty → ybbarng/game, mighty-archive → game-archive), 로컬 원격 주소 고침. 사이트의 저장소 주소 커밋은 3단계 push에 싣는다(옛 주소는 GitHub가 넘겨준다) |
| S 직전 | game → servers | 시작 신호(「1단계 배포 끝(✅ 시각)」과 칸 시작 시각) |
| S | servers | rename-game을 servers main에 합치고 서버 pull |
| S+1분 | 사용자(servers가 명령을 드림) | 옛 신호·진단 내리기 → servers가 game-signal·game-diag up |
| S+2분 | game | 사이트 주소 + image.yml(ghcr.io/ybbarng/game) 한 번에 push → CI(약 4분) → Image(빌드·배포) |
| S+10분 무렵 | game | 새 웹 컨테이너 healthz 확인(GHCR pull 403이면 새 패키지가 저장소에 이어졌는지 본다) → servers에 알림 |
| S+11분 | 사용자(servers가 명령을 드림) | `docker compose -p mighty down`(옛 웹) |
| S+12분 | servers·game | 확인: game.byb.kr 200, /signal/, /diag, /stardraw-api/, Gatus, 별 따기 관측지 |
| 그 뒤 | 사용자 | 새 GHCR 패키지 공개 범위를 옛 것과 같게. 며칠 뒤 옛 이미지 지우기, authorized_keys 고친 뒤 링크 폴더 지우기 |

CI나 빌드가 늦어 S+12분이 칸 끝(:32·:52·:12)을 넘을 것 같으면, 옛 웹을 내리는 일(S+11분)만 다음 칸으로 미룬다. 새 웹과 옛 웹은 정적이라 잠깐 함께 떠 있어도 된다.

**되돌리기**: 옛 웹 컨테이너를 내리기 전이면 그대로 두면 된다. 내린 뒤에 문제가 생기면 `docker compose -p mighty up -d`(옛 이미지가 서버에 남아 있다)로 다시 띄우고, image.yml을 되돌려 push한다. 신호 서버는 game-signal을 내리고 mighty-signal을 다시 띄운다.

4단계(이 맥 폴더 이름)는 이 칸에서 하지 않는다. 모든 세션을 닫을 수 있을 때 따로 한다.

## 진행 기록(2026-11-02)

- 1단계: 12:09 배포(7a91c93).
- 2단계: 12:10 GitHub 저장소 이름 변경(ybbarng/game, ybbarng/game-archive), 로컬 원격 주소 고침.
- 3단계(칸 13:38~13:52, 옛 웹만 13:58 칸):
  - 13:40 사용자가 옛 신호·진단을 내리고 servers가 game-signal·game-diag를 띄움(13:41).
  - 13:42 game push(bbdad5b: 사이트 저장소 주소, 이미지 `ghcr.io/ybbarng/game`). CI·Image 성공, 13:51 game-game-1 healthz 통과.
  - 13:58 사용자가 옛 웹을 내림(`docker compose -p mighty down`). /, /healthz, /stardraw, /stardraw-api/ 200, /diag 405(GET), /signal/은 신호 서버가 답함, Gatus 실패 0, 별 따기 서버는 그대로. servers PLAN 23단계 f1a38b7.
- 남은 일(사용자): 새 GHCR 패키지 공개 범위 맞추기, authorized_keys 경로 고친 뒤 링크 폴더 지우기, 며칠 뒤 옛 이미지와 `~/data/mighty-diag` 지우기.
- 4단계(이 맥 폴더)는 모든 세션을 닫을 때 따로 한다. 그 뒤 servers가 verify-stardraw.sh scp 경로를 고친다.

## 4단계 절차(2026-11-02 17:30 준비 끝)

이 폴더를 쓰던 세션은 game-ce 하나뿐이었다. 배포(de010f3, 조용히 새 화면으로)가 끝난 뒤 준비했다.

**맡는 사람**: 사용자는 game-ce 세션만 닫는다(`/exit`). 그 뒤는 **비서 세션**이 이어서 한다(2026-11-02 사용자). 비서는 game-ce가 세션 목록에서 사라진 것을 확인하고 시작한다.

**비서가 할 일**
1. 이 폴더를 쓰는 세션·백그라운드 작업이 없는지 확인한다(세션 목록, `lsof +D ~/personal/projects/game/mighty` 정도).
2. 두 폴더 이름을 바꾼다.
   ```
   mv ~/personal/projects/game/mighty ~/personal/projects/game/game
   mv ~/personal/projects/game/mighty-archive ~/personal/projects/game/game-archive
   ```
3. 아래 「마무리」를 한다(직접 하거나, `~/personal/projects/game`에서 game 세션을 새로 띄워 맡긴다). 기억 폴더(`-Users-ybbarng-personal-projects-game`)와 책상(`desk/game.json`)은 바깥 폴더 기준이라 그대로 이어진다.

**마무리**
- [ ] 바깥 `~/personal/projects/game/CLAUDE.md`의 폴더 표·명령 예시(`mighty/` → `game/`, `pnpm -C mighty` → `pnpm -C game`, mighty-archive → game-archive)
- [ ] `game/CLAUDE.md` 첫 줄 「저장소 이름은 아직 mighty」 고치기
- [ ] 옛 서브에이전트 작업 트리 22개(`game/.claude/worktrees/agent-*`, `.git` 파일에 옛 절대 경로): 쓸 일이 없으면 `git -C ~/personal/projects/game/game worktree prune` 뒤 폴더째 지우기(먼저 `git worktree list`와 각 트리의 `git status`로 남은 변경이 없는지 확인하고, 하나라도 있으면 지우지 말고 사용자에게 묻는다), 쓸 거면 `git worktree repair`
- [ ] git 훅: `git -C … commit`이 lefthook에서 깨지면 `pnpm -C game exec lefthook install`
- [ ] 새 경로에서 `pnpm -C game typecheck`, 바꾼 패키지 단위 시험 하나, `pnpm --filter @game/web build`가 도는지
- [ ] main에 남은 커밋 올리기(지도 메모·이 절차, 문서뿐). 마감 앞뒤(:13~:17, :33~:37, :53~:57) 피해서
- [ ] 비서 저장소의 세션 목록(`local/sessions.txt`)·알림(`reminders.md`) 경로를 `game/game`으로
- [ ] servers에게: `home/scripts/verify-stardraw.sh`의 scp 경로(`…/game/mighty/…` → `…/game/game/…`)
- [ ] 기억 `rename-to-game.md`에 4단계 끝 적기, 책상 「4단계」 항목 지우기
