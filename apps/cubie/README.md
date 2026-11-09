# Cubie

화면 구석에 작게 늘 떠 있는 큐브 맥 앱. 단축키로 큐브에 키 입력을 주고, 맞추다가 Esc를 누르면 하던 앱으로 돌아간다. 화면은 사이트의 미니 모드(`https://game.byb.kr/cube/mini`)를 맥 기본 웹 부품(WKWebView)으로 연다. 설계는 [docs/47 15절](../../docs/47-cube-design.md).

이 폴더는 이 맥에서만 빌드한다(CI·Dockerfile·pnpm 빌드에 넣지 않는다).

## 빌드·실행

```sh
apps/cubie/build.sh                       # apps/cubie/Cubie.app 을 만든다(ad-hoc 서명)
open apps/cubie/Cubie.app                 # 띄우기(Dock 아이콘 없이 메뉴 막대에 큐브 아이콘)
apps/cubie/test.sh                        # 화면 없는 단위 시험(포커스 돌려주기 판단, 키 출처 판정)
```

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
- 메뉴 막대 큐브 아이콘(또는 큐브 위 오른쪽 누르기): 섞기, 거울, 크기(2×2~7×7), 기록 보기, 대결하기(친구와·컴퓨터와, 기본 브라우저로 사이트를 연다), 단축키 보기, 키·색 설정, 창 자리 처음으로, 다시 불러오기, 끝내기.
- 시간은 큐브에 키 입력이 있는 동안만, 섞은 뒤 첫 수부터 잰다. 화면에는 보이지 않고 「기록 보기」에서 본다.
- 가만히 떠 있으면 이따금 움직인다: 맞춘 큐브는 6분마다 첫 화면 연출 한 판, 섞인 큐브는 2분마다 몇 수 돌렸다 되돌리기(진행은 그대로).
- 키 배치·색은 앱 안 저장(브라우저와 따로)이라 메뉴 「키·색 설정」에서 정한다.
- 단축키를 다른 앱이 이미 쓰면 메뉴 막대 아이콘이 느낌표로 바뀌고 메뉴 첫 줄에 알린다. 바꾸려면 `Sources/Cubie/Config.swift`의 `hotKey*`.

## 끄기

메뉴 막대 큐브 아이콘 → 「Cubie 끝내기」. 또는 `pkill -x Cubie`. 창 자리 기억 지우기: `defaults delete kr.byb.cubie "NSWindow Frame CubieMain"`.

## 공개할 때 필요한 것

- 지금은 ad-hoc 서명이라 이 맥에서만 바로 열린다. 남에게 주려면 Apple Developer ID로 서명하고 공증(notarytool)을 받아야 Gatekeeper가 막지 않는다.
- 같은 이름의 앱(iOS 큐브 앱 Cubie Solver, 옛 큐브 프로그램 Jaap's Cubie)이 있어 공개할 때 이름을 다시 본다.
- 웹 화면 바탕을 비우는 데 공개 속성이 없어 널리 쓰는 키(`drawsBackground`)를 쓴다. macOS 판이 바뀌어 동작이 달라지면 바탕이 보일 수 있다.
