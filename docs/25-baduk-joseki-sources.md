# 25-1. 바둑 정석 수순 자료 (2026-11-03 조사)

바둑 「수 배우기」의 정석 수순 따라 두기(docs/23 2절 line 형식)에 넣을 수순을 **출처에서 그대로 옮겨 둔 것**이다. 아직 데이터 파일에 넣지 않았다. 수순 틀(`study/line.ts`, 체스 PR #2로 main에 들어옴)에 바둑 시작 판(판 크기·놓인 돌)과 정석 대칭 처리가 더해진 뒤에 넣는다(2026-11-03 헤드쿼터 결정).

## 받는 법

- 출처: [Sensei's Library](https://senseis.xmp.net/). 문서마다 그림이 SGF 파일(`diagrams/…/….sgf`)로 붙어 있다.
- WebFetch는 403으로 막힌다. 브라우저(Claude in Chrome)로 문서를 열고, 페이지 안에서 `fetch('/diagrams/….sgf')`로 SGF 글을 받아 `AB`(놓인 흑)·`AW`(놓인 백)·`;B[..]`/`;W[..]`(수)를 읽었다.
- SGF 좌표 `ab`는 가로 a부터, 세로 a가 판 위쪽이다. 우리 자리 이름으로는 가로 `ABCDEFGHJKLMNOPQRST`(I 없음), 세로 `19 - (글자 - a)`. 예: `dd` → D16, `cc` → C17.
- 모든 그림은 왼쪽 위 귀(D16 화점, C16 소목) 기준이다. 넣을 때 다른 귀로 돌리려면 대칭 처리가 필요하다.
- 넣기 전에 단위 시험이 엔진으로 처음 판부터 다시 둬 규칙에 맞는지 본다(체스 `openings.test.ts`와 같게). 그림에 따라 한쪽이 손을 빼 같은 색이 이어 두는 것(예: 아래 「Joseki 3」)도 있어 그대로 쓰지 않는다.
- 수순·이름은 사실이라 옮겨도 되고, 설명 글은 직접 쓴다(docs/23 1절).

## 1차 후보(처음 배우는 사람용)

| 이름(우리말) | 출처 문서 | 놓인 돌 | 수순 |
|---|---|---|---|
| 화점 삼삼 침입 기본 정석 | `?33PointInvasion` 「The Standard Joseki」 | 흑 D16 | 백 C17, 흑 D17, 백 C16, 흑 C15, 백 B15, 흑 C14, 백 B14, 흑 C13 |
| 삼삼 침입 — 예전 마무리 | 같은 문서 「The old continuation」 | 위 수순 뒤 | 백 D18, 흑 E18, 백 C18, 흑 F17 |
| 삼삼 침입 — 양 젖힘 | 같은 문서 「Double hane」 | 흑 D17·D16·C15, 백 C17·C16·B15 | 흑 B14, 백 C14, 흑 D15, 백 B13, 흑 B16, 백 A14, 흑 B17 |
| 삼삼 침입 — 선수 잡기(뻗기) | 같은 문서 「Variation to get sente」 | 흑 D16 | 백 C17, 흑 D17, 백 C16, 흑 C14 |
| 삼삼 침입 — 선수 잡기(날일자) | 같은 문서 「Variation 2 to get sente」 | 흑 D16 | 백 C17, 흑 D17, 백 C16, 흑 D15, 백 B14 |
| 화점 날일자 걸침 — 마늘모 붙임 | `?44PointDiagonalAttachmentJoseki` | 흑 D16·K16 | 백 F17, 흑 E17, 백 F16, 흑 D14 |
| 마늘모 붙임 — 낮은 귀 | 같은 문서 | 흑 D16·K16 | 백 F17, 흑 E17, 백 F16, 흑 C14 |
| 화점 날일자 걸침 — 붙여막기 | `?44PointLowApproachAttachBlockJoseki` 「Attach-block joseki」 | 흑 E17·D16·E16·F16, 백 F17·G16·F15 | 백 G15, 흑 G17, 백 H17, 흑 F18, 백 G18, 흑 D14 |
| 화점 날일자 걸침 — 날일자 받기 | `?44PointLowApproachLowKnightsMoveBlock` 「Joseki 1」 | 흑 D16 | 백 F17, 흑 E18, 백 F18, 흑 E17, 백 F16, 흑 D14, 백 K17 |
| 소목 날일자 걸침 — 날일자 받기 | `?34PointLowApproachKnightsMoveExtension` 「corner」 | 흑 C16 | 백 E17, 흑 D14, 백 C17, 흑 B17, 백 D16, 흑 C15, 백 C18, 흑 C10 |
| 소목 날일자 걸침 — 귀 지키기 | 같은 문서 「Defending the corner」 | 흑 C16 | 백 E17, 흑 D14, 백 C12, 흑 D17, 백 E16, 흑 C14 |
| 소목 날일자 걸침 — 마늘모 | `?34PointLowApproachDiagonal` 「Continuation」 | 흑 C16, 백 E17 | 흑 D15, 백 J17, 흑 G17, 백 E15, 흑 E14, 백 F15, 흑 D13, 백 H16, 흑 D17, 백 E18 |

- 2026-11-03 표의 12개 수순을 모두 엔진(`tryPlace`)으로 놓인 돌부터 다시 둬 규칙에 맞는 것을 확인했다(임시 시험, 저장소에는 넣지 않음). 넣을 때는 단위 시험으로 다시 확인한다.
- 위 표의 「놓인 돌」에 수 순서가 없는 것(예: 붙여막기의 흑 E17·E16·F16)은 그림이 중간 모양에서 시작한 것이다. 수순 따라 두기에는 놓인 돌을 시작 판으로 두거나, 앞 수순(마늘모 붙임 등)과 이어 하나의 갈래로 만든다.
- 다음에 볼 문서(이름만 확인): `44PointLowApproachOneSpaceLowPincer`, `44PointLowApproachTwoSpaceHighPincer`, `44PointHighApproach`, `34PointHighApproach`, `34PointLowApproachKeima`, `34PointLowApproachOneSpaceLowPincer`, `44PointLowApproachLowExtensionSlide33`.
