# 게임 센터

**[game.byb.kr](https://game.byb.kr)** — 대학 시절 하던 카드 게임 마이티를 웹으로 되살리는 데서 시작해, 친구들과 바로 할 수 있는 게임 모음이 되었다.

- **설치·가입 없이** 주소만 열면 된다. PC와 휴대폰 모두.
- **친구와 온라인 대전**: 서버를 거치지 않고 기기끼리 바로 잇는다(WebRTC). 방장 기기가 판을 돌리고, 링크로 들어온다.
- **혼자 하기**: 빈자리는 여러 단계 컴퓨터가 채운다.
- **방장도 속이지 못하게**: 카드 게임은 멘탈 포커로 섞어서 방장도 남의 패를 모르고, 판이 끝나면 모두의 기기가 처음부터 다시 계산해 확인한다.
- **배우기**: 게임마다 처음 하는 사람을 위한 단원이 있다.

## 게임

| 묶음 | 게임 |
|---|---|
| 판 게임 | [오목](https://game.byb.kr/omok) · [장기](https://game.byb.kr/janggi) · [바둑](https://game.byb.kr/baduk) · [체스](https://game.byb.kr/chess) |
| 카드 게임 | [마이티](https://game.byb.kr/mighty) · [하트](https://game.byb.kr/hearts) · [원카드](https://game.byb.kr/onecard) |
| 화투 | [고스톱](https://game.byb.kr/gostop) · [민화투](https://game.byb.kr/minhwatu) · [나이롱뽕](https://game.byb.kr/nyrongppong) |
| 놀이 | [숫자야구](https://game.byb.kr/baseball) · [윷놀이](https://game.byb.kr/yut) · [은하 한 바퀴](https://game.byb.kr/galaxy) · [큐브 맞추기](https://game.byb.kr/cube) |
| 정시 관측 | [하늘의 별 따기](https://game.byb.kr/stardraw) — 매 회차 공개 난수(drand)로 별을 관측하는 예측 놀이. 상품 없음 |

## 공정성

공정성 장치는 판정마다 두 결로 나눈다([docs/50](docs/50-fairness-two-tracks.md)).

- **증명한다(1결)**: 누가 다시 계산해도 같은 결과가 나와야 하는 판정. 멘탈 포커와 섞기 증명([docs/13](docs/13-mental-poker.md), [15](docs/15-shuffle-proof.md)), 약속 후 공개, 해시 사슬, 공개 난수(drand)와 공개 장부([36](docs/36-hourly-lotto-design.md)). 느려도 된다.
- **고르게 한다(2결)**: 빠른 실시간 판정과 시간 제한. 서버를 거의 쓰지 않고, 정직한 사람끼리는 망이 느려도 손해 보지 않게 한다. 속였을 때 얻는 이득에는 상한을 둔다([43](docs/43-fair-simultaneity.md)).

사이트의 [보안 설명](https://game.byb.kr/security)과 [보안 배우기](https://game.byb.kr/learn)에서 쉬운 말로 볼 수 있다.

## 구조

pnpm 모노레포. 게임 규칙은 화면과 떨어진 순수 함수 패키지로 두고, 온라인 방·기록·복기·화면 조각은 모든 게임이 함께 쓴다.

```
apps/web                Next.js 정적 웹앱(out/). 화면, 온라인 방(src/net), 내 기록, 복기, 보안 설명
apps/stardraw-server    하늘의 별 따기 회차 서버(예측 받기, 마감·봉인, drand 관측, 공개 장부)
packages/<게임>-engine  게임마다 규칙 엔진(순수 함수)
packages/<게임>-ai      게임마다 컴퓨터 플레이어(여러 단계)
packages/fair-play      멘탈 포커: SRA 섞기, 열쇠 증명, 섞기 증명, 판 끝 다시 계산
packages/hwatu          화투 48장과 고스톱·민화투·나이롱뽕이 함께 쓰는 도구
packages/puzzle-core, cube-*   큐브 엔진·섞기·해법
packages/stardraw-core, stardraw-cli   별 따기 장부와 누구나 돌려 보는 검증 도구
```

마이티 엔진·컴퓨터는 `packages/engine`·`packages/ai`(옛 이름 그대로)다.

## 개발

Node 24, pnpm(버전은 `package.json`의 `packageManager`).

```sh
pnpm install
pnpm dev          # 개발 서버(포트 3456)
pnpm check        # lint + typecheck + 단위 시험
pnpm build        # 정적 빌드(apps/web/out)
pnpm e2e          # 화면 시험(먼저 build). 패치된 시스템 Chrome으로 돈다
```

- 커밋 전에는 biome, push 전에는 lint·typecheck·단위 시험이 lefthook으로 돈다.
- main에 올리면 CI(단위 시험 + 화면 시험 두 조각)가 돌고, 성공해야 이미지를 만들어 배포한다.
- 처음 보는 사람은 [docs/00-handoff.md](docs/00-handoff.md)(지금 상태와 남은 일)와 [docs/map.json](docs/map.json)(프로젝트 지도)부터 본다. 새 게임은 [docs/21-new-game-checklist.md](docs/21-new-game-checklist.md)를 따른다.

## 문서

`docs/`에 번호순으로 둔다. 자주 보는 것만 적는다.

- [00. 인계](docs/00-handoff.md) · [06. 남은 일](docs/06-backlog.md) · [21. 새 게임 체크리스트](docs/21-new-game-checklist.md) · [38. 시험에서 배운 것](docs/38-test-lessons.md)
- 공정성: [07. 공정성과 보안](docs/07-security.md) · [13. 멘탈 포커](docs/13-mental-poker.md) · [15. 섞기 증명](docs/15-shuffle-proof.md) · [43. 공정한 동시 판정](docs/43-fair-simultaneity.md) · [50. 공정성의 두 결](docs/50-fairness-two-tracks.md)
- 마이티: [02. 원작 조사](docs/02-research.md) · [04. 원작 진행](docs/04-original-game-flow.md) · [08. 학교 규칙](docs/08-school-rules.md) · [09. 컴퓨터 전략](docs/09-ai-strategy.md)
- 게임별: [20 오목](docs/20-omok.md) · [22 장기](docs/22-janggi.md) · [25 바둑](docs/25-baduk.md) · [26 체스](docs/26-chess.md) · [27 화투](docs/27-hwatu.md) · [34 숫자야구](docs/34-number-baseball.md) · [37 윷놀이](docs/37-yut.md) · [42 원카드](docs/42-onecard-realtime.md) · [47 큐브](docs/47-cube-design.md) · [48 은하 한 바퀴](docs/48-galaxy-loop.md)
- 하늘의 별 따기: [36. 설계](docs/36-hourly-lotto-design.md) · [41. 세계관과 낱말](docs/41-stardraw-setting.md)

2019년 코드와 원작 효과음(라이선스가 없어 공개하지 않음)은 비공개 저장소에 따로 둔다.

## 고마운 분들

- [마이티 네트워크(Mighty Network) 4.0](https://github.com/skyser2003/mighty40) — 마이티 규칙과 진행 방식의 기준. 1999 장문성, 2006–2011 UPnL, 2006 puzzlet, 2011 Yoshi-TS4. 코드와 그림·소리는 새로 만들었다.
- 전통 그림 카드(J·Q·K) 인물: [Dmitry Fomin, English pattern playing cards](https://commons.wikimedia.org/wiki/File:English_pattern_playing_cards_deck.svg), 위키미디어 공용, CC0
- 장기 초 기물 글자: [Kadagaden, chess-pieces](https://github.com/Kadagaden/chess-pieces)의 janggi_kakao_janggi_style_white 세트(pychess-variants), CC BY 4.0. 글자 윤곽만 옮겼고 馬는 180도 돌렸다(`apps/web/src/janggi/cho-glyphs-kadagaden.ts`)
- 별 이름: IAU 별 이름 실무단(WGSN) [IAU Catalog of Star Names](https://www.iau.org/public/themes/naming_stars/), CC BY 4.0
- 별자리 선·별 자료: [d3-celestial](https://github.com/ofrohn/d3-celestial)(Olaf Frohn), BSD 3조항([전문](apps/web/public/licenses/d3-celestial.txt))
- 공개 난수: [drand](https://drand.love)(League of Entropy)

## 라이선스

[MIT](LICENSE). 위 바깥 자료는 각자의 라이선스를 따른다.
