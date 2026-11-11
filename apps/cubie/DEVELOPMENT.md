# Cubie 개발

쓰는 사람을 위한 안내는 [README](README.md)에 있다. 이 문서는 빌드, 새 판 내기, README 그림 만들기를 다룬다. 설계와 결정은 [docs/47 15절](../../docs/47-cube-design.md)에 있다.

앱은 Swift + AppKit + WKWebView다. 화면은 사이트의 미니 모드(`https://game.byb.kr/cube/mini`)를 연다. 이 폴더는 이 맥에서만 빌드한다(CI·Dockerfile·pnpm 빌드에 넣지 않는다).

## 빌드·실행

```sh
apps/cubie/build.sh                       # apps/cubie/Cubie.app 을 만든다(이 맥 칩만, ad-hoc 서명)
apps/cubie/build.sh --universal           # Apple Silicon·Intel 둘 다(배포본)
open apps/cubie/Cubie.app                 # 띄우기(Dock 아이콘 없이 메뉴 막대에 큐브 아이콘)
apps/cubie/test.sh                        # 화면 없는 단위 시험(포커스 돌려주기 판단, 키 출처 판정)
```

판은 `apps/cubie/VERSION` 한 곳에 있다. 키체인에 코드 서명 신원이 있으면 `CUBIE_SIGN_IDENTITY="<이름>" apps/cubie/build.sh`로 그것으로 서명한다(없으면 ad-hoc).

직접 빌드한 앱을 쓰려면 `apps/cubie/build.sh --universal` 뒤 `apps/cubie/Cubie.app`을 `/Applications`로 복사한다. 이 맥에서 만든 앱은 첫 실행이 막히지 않는다.

로컬 빌드를 열려면 주소를 바꾼다(`open`은 환경 변수를 넘기지 않으니 실행 파일을 바로 띄운다):

```sh
CUBIE_URL=http://localhost:4392/cube/mini apps/cubie/Cubie.app/Contents/MacOS/Cubie
defaults write kr.byb.cubie url http://localhost:4392/cube/mini   # 늘 그 주소로(지우기: defaults delete kr.byb.cubie url)
```

`CUBIE_DEBUG=1`을 붙이면 포커스·다리 메시지·키 출처 칸을 표준 출력에 찍는다. 실행 파일을 바로 띄우면 자동 업데이트는 꺼진다(앱 묶음이 아니라서).

## 메모리 재기

`scripts/measure-memory.sh`가 앱을 측정 모드(`CUBIE_MEASURE=1`)로 띄워 상태마다 메모리를 잰다. 결과와 해석은 [docs/52 2절](../../docs/52-cubie-native.md).

```sh
apps/cubie/build.sh && pnpm --filter @game/web build
apps/cubie/scripts/measure-memory.sh                    # 로컬 빌드(apps/web/out)를 포트 4393으로 열어 잰다(약 4분)
apps/cubie/scripts/measure-memory.sh --url https://game.byb.kr/cube/mini   # 사이트를 잰다
apps/cubie/scripts/measure-memory.sh --quick --out /tmp/m.tsv --label 전   # 가만히 1분을 10초로, 결과를 TSV에 덧붙인다
```

- 사용자 화면·포커스를 건드리지 않는다. 측정 모드의 앱은 앞으로 나올 수 없고(활성화 정책 `.prohibited`), 큐브 창은 화면 밖 좌표에 투명하게 마우스를 받지 않게 떠 있다. 메뉴 막대 아이콘·전역 단축키·마우스 감시·자동 업데이트를 켜지 않고, 웹 저장소는 비영속이라 사용자 기록·설정을 읽지도 쓰지도 않는다. 이미 떠 있는 Cubie와 같이 돌아도 된다.
- 화면 밖 창은 WebKit이 「가려짐」으로 보고 그리기를 멈추므로, 측정 모드에서만 WebKit의 가려짐 감지를 끈다(비공개 설정). 그래야 보이는 창과 같이 그린다.
- 상태는 표준 입력 한 줄 명령으로 바꾼다(`Sources/Cubie/Measure.swift` 머리말의 목록: 포커스·섞기·거울·키로 돌리기·숨기기·단축키 표 불러오기 등). 스크립트만 쓰는 FIFO라 다른 프로세스가 끼어들 수 없다.
- 재는 값은 `footprint`의 `phys_footprint`(1초 간격 세 번 평균)이고, 프로세스는 `launchctl print pid/<Cubie>`가 보여 주는 그 앱 소속 WebKit 서비스(WebContent·GPU·Networking)만 센다.
- CPU도 함께 잰다(`CPU …` 줄과 끝의 요약): 가만히 1분, 돌리는 동안 약 20초, 포커스 있고 멈춤·포커스 없음 10초, 숨긴 뒤 30초부터 1분. 구간 처음과 끝의 누적 CPU 시간(`ps -o time`) 차이 ÷ 지난 시간이라 100%가 코어 하나다. `--out <파일>.tsv`를 주면 CPU 결과는 `<파일>-cpu.tsv`에 덧붙인다. 결과는 docs/52 2-4.
- 측정 모드의 Cubie 칸은 메뉴 막대·Sparkle·말풍선 창이 없어 실제 앱보다 20~30MB 작다. 웹 화면 쪽(WebContent·GPU·Networking)은 실제 앱과 같다.
- `--inject <js 파일>`은 문서 시작 때 실험 스크립트를 넣는다(빌드 없이 「테두리 끄기」·「화면 배율 1」 같은 안을 견줄 때). `--detail`은 WebContent·GPU의 메모리 갈래(`footprint` 범주)를 함께 찍는다.
- 끝나면(중간에 멈춰도) 띄운 앱과 로컬 서버를 끈다.

앱 아이콘(`Resources/AppIcon.icns`)은 사이트의 3D 큐브(`apps/web/src/cube/view/cube-view.ts`)로 그린다: `node apps/cubie/scripts/icon/make-art.mjs --icns d-pocket`. 하늘색 판에 살짝 기운 2×2 큐브이고, 32px 아래도 같은 2×2를 판에 더 크게 그린다. 시안은 `scripts/icon/render.ts`의 `OPTIONS`에 있다(0.1.2에서 다섯 가운데 `d-pocket`을 골랐다). `--out <폴더>`를 붙이면 시안마다 크기별 PNG와 지금 아이콘을 맨 위에 둔 비교판 `options.png`를 남긴다. 화면 시험과 같은 시스템 Chrome을 화면 없이 띄운다(`pnpm install` 뒤).

메뉴 막대 아이콘(`Resources/MenuIcon*.png`, 템플릿 그림 1x·2x)은 `swift apps/cubie/scripts/make-menu-icon.swift`가 그린다(앱 아이콘에 맞춘 2×2 큐브 실루엣, CoreGraphics만 쓴다). `--preview <폴더>`를 붙이면 밝은·어두운 메뉴 막대 흉내 PNG도 남긴다. 어느 쪽이든 그림을 고치면 다시 만들어 함께 커밋하고, 아래 「README 그림」도 다시 만든다.

단축키 조합은 `Sources/Cubie/Config.swift`의 `hotKey*`에서 바꾼다.

## 새 판 내기

```sh
apps/cubie/scripts/release.sh 0.2.0 --notes "바뀐 것 한두 문장." --dry-run   # 미리 보기: dist/0.2.0-dry-run/ 에만, 서명 안 함
apps/cubie/scripts/release.sh 0.2.0 --notes "바뀐 것 한두 문장."             # VERSION·appcast·노트를 고친다
/Users/ybbarng/.local/bin/cubie-release 0.2.0                                # GitHub Release만 만든다
```

스크립트는 시험 → 판 올리기 → universal 빌드·서명 → `dist/<판>/Cubie.zip` → EdDSA 서명 → `apps/web/public/cubie/appcast.xml` 맨 위에 새 판 → `release-notes/<판>.md`(appcast 설명과 같은 글, 커밋한다)까지 하고, 「GitHub Release 만들기」와 「PR」 명령을 찍는다. 작업 트리(`.claude/worktrees/*`)에서 돌렸으면 zip과 노트를 기본 저장소 폴더의 같은 자리에도 복사한다.

Release는 `~/.local/bin/cubie-release <판>`이 만든다. 판 번호 하나만 받고, 기본 저장소 폴더의 `apps/cubie/dist/<판>/Cubie.zip`과 `apps/cubie/release-notes/<판>.md`를 `cubie-v<판>` 태그로 올린다(`--latest=false`, zip 안 앱 판이 인자와 다르거나 같은 릴리스가 있으면 멈춘다). 허락은 game `.claude/settings.local.json`에 이 스크립트 경로만 둔다(사용자가 직접 넣는다). push·PR은 찍힌 명령을 보고 사람이 직접 돌린다. Release를 먼저 만들고, 그다음 appcast PR을 머지한다. appcast가 사이트에 올라가야 깔린 앱들이 새 판을 본다. zip을 다시 만들면 서명이 바뀌니 appcast와 함께 만든 그 zip을 올린다.

README의 내려받기 주소 `https://game.byb.kr/cubie/download`는 사이트가 빌드할 때 appcast 맨 위 판의 zip을 가리킨다(`apps/web/src/app/cubie/download`). 그래서 appcast PR이 머지되어 사이트가 다시 배포되면 README를 고치지 않아도 새 판을 내려받는다.

서명 열쇠를 읽을 때마다 로그인 암호 창이 뜬다. 그래서 실제 판은 `sign_update`를 한 번만 부르고, 확인은 `scripts/verify-ed.swift`가 `Info.plist`의 공개 열쇠로만 한다. `--dry-run`은 열쇠를 읽지 않는다(서명 자리에 가짜 값).

서명 열쇠는 이 맥 로그인 키체인에만 있다(계정 `kr.byb.cubie`, Sparkle `generate_keys`로 만듦). 이 열쇠를 잃으면 이미 깔린 앱이 새 판을 받지 못한다. 다른 맥에서 내려면 `apps/cubie/.build/artifacts/sparkle/Sparkle/bin/generate_keys --account kr.byb.cubie -x <파일>`로 꺼내 그 맥에서 `-f <파일>`로 넣고, 파일은 지운다.

## README 그림

`apps/cubie/docs/`의 그림(아이콘, 바탕화면 흉내 다섯 장, 기본 키 배치 그림 `keys.webp`, 홈 시연 움직이는 그림)은 `scripts/readme-shots.mjs`가 만든다. 앱을 띄우지 않고 웹 미니 모드를 헤드리스 Chrome에서 앱처럼(투명 바탕) 찍어, 스크립트가 그린 바탕화면에 얹는다. 메뉴 막대·문서 창·바탕화면은 그림이다. 메뉴 그림(`desktop-menu`)의 맨 위 프로필 칸은 앱의 `ProfileMenuView`를 `scripts/profile-menu-shot.swift`와 함께 임시 폴더에서 컴파일해 그린 것이고(엠블럼은 웹이 앱에 보낸 PNG 그대로), 메뉴 바탕과 아래 줄은 흉내다. `swiftc`가 있어야 한다. ffmpeg, ImageMagick(`magick`), libwebp(`cwebp`·`img2webp`)가 필요하다.

```sh
pnpm --filter @game/web build
pnpm --filter @game/web exec serve out -l 4391     # 다른 터미널
node apps/cubie/scripts/readme-shots.mjs           # --hero: 움직이는 그림만, --keys: 키 배치 그림만
```

## 공개할 때 남은 것

- ad-hoc 서명이고 공증이 없어서, 받은 사람은 README 「설치」의 첫 실행 풀기를 한 번 해야 한다. 이 과정을 없애려면 Apple Developer ID로 서명하고 공증(notarytool)을 받아야 한다.
- 같은 이름의 앱(iOS 큐브 앱 Cubie Solver, 옛 큐브 프로그램 Jaap's Cubie)이 있다.
- 웹 화면 바탕을 비우는 데 공개 속성이 없어 널리 쓰는 키(`drawsBackground`)를 쓴다. macOS 판이 바뀌어 동작이 달라지면 바탕이 보일 수 있다.
- 지원 판은 macOS 15 이상이다. 14로 낮추려면 `Package.swift`의 `platforms`와 `Resources/Info.plist`의 `LSMinimumSystemVersion`(release.sh가 appcast의 최소 판으로도 쓴다)만 바꾸면 컴파일된다. 13까지 낮추려면 macOS 14부터 있는 `NSApp.activate()` 세 곳(`AppDelegate.swift` 두 곳, `Updater.swift` 한 곳)을 `#available`로 나눠 13에서는 `activate(ignoringOtherApps:)`를 부른다. Sparkle 2.10.1은 macOS 12부터 돈다. 어느 쪽이든 그 판의 맥에서 투명 창·포커스 돌려주기·웹 화면이 도는지 확인한 뒤 낮춘다(2026-11-09, 복사본을 13으로 낮춰 컴파일해 본 결과).
