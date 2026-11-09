# Cubie

화면 구석에 작게 늘 떠 있는 큐브 맥 앱. 단축키로 큐브에 키 입력을 주고, 맞추다가 Esc를 누르면 하던 앱으로 돌아간다. 화면은 사이트의 미니 모드(`https://game.byb.kr/cube/mini`)를 맥 기본 웹 부품(WKWebView)으로 연다. 설계는 [docs/47 15절](../../docs/47-cube-design.md).

이 폴더는 이 맥에서만 빌드한다(CI·Dockerfile·pnpm 빌드에 넣지 않는다).

## 설치

1. [GitHub Release](https://github.com/ybbarng/game/releases)에서 `cubie-v<판>`의 `Cubie.zip`을 받아 푼다(Apple Silicon·Intel 맥 모두, macOS 15 이상).
2. `Cubie.app`을 `/Applications`로 옮긴다.
3. 처음 띄우기: 애플 공증을 받지 않은 앱이라 받은 그대로는 맥이 막는다. macOS 15부터는 오른쪽 누르기 → 열기로도 넘길 수 없다. 둘 가운데 하나를 한다.
   - 한 번 띄워 막히게 한 뒤 「시스템 설정 → 개인정보 보호 및 보안」 아래쪽의 Cubie 줄에서 「그래도 열기」.
   - 터미널에서 받은 표시를 지운다: `xattr -dr com.apple.quarantine /Applications/Cubie.app`
4. 메뉴 막대에 큐브 아이콘이 생긴다(Dock 아이콘은 없다). 로그인할 때 띄우려면 「시스템 설정 → 일반 → 로그인 항목」에 더한다.

직접 빌드한 것을 설치하려면 `apps/cubie/build.sh --universal` 뒤 `apps/cubie/Cubie.app`을 `/Applications`로 복사한다(이 맥에서 만든 앱은 막히지 않는다).

## 업데이트

- 하루 한 번 새 판이 있는지 본다(`https://game.byb.kr/cubie/appcast.xml`). 하던 앱의 포커스를 빼앗지 않으려고 창을 띄우지 않고, 메뉴 첫 줄에 「새 판 … 설치…」가 생긴다. 누르면 바뀐 것을 보고 설치한다.
- 바로 보려면 메뉴 「업데이트 확인…」. 그 창에서 「자동으로 받아 설치」를 고르면 다음부터는 묻지 않고 받아 두었다가 끝낼 때 바꾼다.
- 받은 파일은 서명(Sparkle EdDSA)이 맞을 때만 설치한다. 업데이트로 받은 앱은 다시 막히지 않는다.
- 실행 파일을 바로 띄울 때(아래 `CUBIE_URL`)는 업데이트를 끈다.

## 빌드·실행

```sh
apps/cubie/build.sh                       # apps/cubie/Cubie.app 을 만든다(이 맥 칩만, ad-hoc 서명)
apps/cubie/build.sh --universal           # Apple Silicon·Intel 둘 다(배포본)
open apps/cubie/Cubie.app                 # 띄우기(Dock 아이콘 없이 메뉴 막대에 큐브 아이콘)
apps/cubie/test.sh                        # 화면 없는 단위 시험(포커스 돌려주기 판단, 키 출처 판정)
```

판은 `apps/cubie/VERSION` 한 곳에 있다. 키체인에 코드 서명 신원이 있으면 `CUBIE_SIGN_IDENTITY="<이름>" apps/cubie/build.sh`로 그것으로 서명한다(없으면 ad-hoc).

로컬 빌드를 열려면 주소를 바꾼다(`open`은 환경 변수를 넘기지 않으니 실행 파일을 바로 띄운다):

```sh
CUBIE_URL=http://localhost:4392/cube/mini apps/cubie/Cubie.app/Contents/MacOS/Cubie
defaults write kr.byb.cubie url http://localhost:4392/cube/mini   # 늘 그 주소로(지우기: defaults delete kr.byb.cubie url)
```

`CUBIE_DEBUG=1`을 붙이면 포커스·다리 메시지·키 출처 칸을 표준 출력에 찍는다.

## 쓰는 법

| 키·동작 | 하는 일 |
|---|---|
| ⌃⌥⌘C | 큐브로 가기(그때 앞에 있던 앱을 기억). 큐브에 있을 때 다시 누르면 돌아가기 |
| Esc | 기억한 앱으로 돌아가기. 큐브 창은 그대로 떠 있다 |
| Enter | 섞기(사이트 키 배치의 「다시 섞기」) |
| ⌫ | 되돌리기 |
| ⌘ + 끌기, 위 가운데 손잡이 끌기 | 창 옮기기(그냥 끌기는 큐브 둘러보기) |
| 오른쪽 아래 손잡이 끌기 | 크기 바꾸기(48×48까지) |

- 창은 테두리·바탕이 없다. 큐브와 거울 둘레의 빈 곳을 누르면 아래 앱이 받는다. 마우스를 올리거나 큐브에 키 입력이 있을 때만 옅은 테두리와 손잡이가 보인다.
- 메뉴 막대 큐브 아이콘(또는 큐브 위 오른쪽 누르기): 섞기, 거울, 크기(2×2~7×7), 기록 보기(크기별 최고 Ao5·티어, Cubie 기록 기준), 티어표, 대결하기(친구와·컴퓨터와, 기본 브라우저로 사이트를 연다), 단축키 보기, 키·색 설정, 창 자리 처음으로, 다시 불러오기, 업데이트 확인, 끝내기.
- 시간은 큐브에 키 입력이 있는 동안만, 섞은 뒤 첫 수부터 잰다. 화면에는 보이지 않고 「기록 보기」에서 본다.
- 가만히 떠 있으면 이따금 움직인다: 맞춘 큐브는 6분마다 첫 화면 연출 한 판, 섞인 큐브는 2분마다 몇 수 돌렸다 되돌리기(진행은 그대로).
- 키 배치·색은 앱 안 저장(브라우저와 따로)이라 메뉴 「키·색 설정」에서 정한다.
- 단축키를 다른 앱이 이미 쓰면 메뉴 막대 아이콘이 느낌표로 바뀌고 메뉴 첫 줄에 알린다. 바꾸려면 `Sources/Cubie/Config.swift`의 `hotKey*`.

## 끄기

메뉴 막대 큐브 아이콘 → 「Cubie 끝내기」. 또는 `pkill -x Cubie`. 창 자리 기억 지우기: `defaults delete kr.byb.cubie "NSWindow Frame CubieMain"`.

## 새 판 내기

```sh
apps/cubie/scripts/release.sh 0.2.0 --notes "바뀐 것 한두 문장." --dry-run   # 미리 보기: dist/0.2.0/ 에만 만든다
apps/cubie/scripts/release.sh 0.2.0 --notes "바뀐 것 한두 문장."             # VERSION과 appcast를 고친다
```

스크립트는 시험 → 판 올리기 → universal 빌드·서명 → `dist/<판>/Cubie.zip` → EdDSA 서명 → `apps/web/public/cubie/appcast.xml` 맨 위에 새 판까지 하고, 「GitHub Release 만들기」와 「PR」 명령을 찍는다. Release·push·PR은 찍힌 명령을 보고 사람이 직접 돌린다. Release를 먼저 만들고(`--latest=false`), 그다음 appcast PR을 머지한다. appcast가 사이트에 올라가야 깔린 앱들이 새 판을 본다. zip을 다시 만들면 서명이 바뀌니 appcast와 함께 만든 그 zip을 올린다.

서명 열쇠는 이 맥 로그인 키체인에만 있다(계정 `kr.byb.cubie`, Sparkle `generate_keys`로 만듦). 이 열쇠를 잃으면 이미 깔린 앱이 새 판을 받지 못한다. 다른 맥에서 내려면 `apps/cubie/.build/artifacts/sparkle/Sparkle/bin/generate_keys --account kr.byb.cubie -x <파일>`로 꺼내 그 맥에서 `-f <파일>`로 넣고, 파일은 지운다.

## 공개할 때 필요한 것

- ad-hoc 서명이고 공증이 없어서, 받은 사람은 위 「설치」 3번을 한 번 해야 한다. 이 과정을 없애려면 Apple Developer ID로 서명하고 공증(notarytool)을 받아야 한다.
- 같은 이름의 앱(iOS 큐브 앱 Cubie Solver, 옛 큐브 프로그램 Jaap's Cubie)이 있어 공개할 때 이름을 다시 본다.
- 웹 화면 바탕을 비우는 데 공개 속성이 없어 널리 쓰는 키(`drawsBackground`)를 쓴다. macOS 판이 바뀌어 동작이 달라지면 바탕이 보일 수 있다.
