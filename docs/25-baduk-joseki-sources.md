# 25-1. 바둑 정석 수순 자료 (2026-11-03 조사)

수순 확인: Sensei's Library(OPL), https://senseis.xmp.net/

바둑 「수 배우기」의 정석 수순 따라 두기(docs/23 2절 line 형식)에 넣을 수순을 **출처에서 그대로 옮겨 둔 것**이다. 2026-11-03 첫 7갈래, 2026-11-17 넷을 더해 지금 11갈래가 `apps/web/src/baduk/joseki.ts`에 있다(아래 「넣은 것」·「2차」).

## 받는 법

- 출처: [Sensei's Library](https://senseis.xmp.net/). 문서마다 그림이 SGF 파일(`diagrams/…/….sgf`)로 붙어 있다.
- WebFetch는 403으로 막힌다. 브라우저(Claude in Chrome)로 문서를 열고, 페이지 안에서 `fetch('/diagrams/….sgf')`로 SGF 글을 받아 `AB`(놓인 흑)·`AW`(놓인 백)·`;B[..]`/`;W[..]`(수)를 읽었다.
- SGF 좌표 `ab`는 가로 a부터, 세로 a가 판 위쪽이다. 우리 자리 이름으로는 가로 `ABCDEFGHJKLMNOPQRST`(I 없음), 세로 `19 - (글자 - a)`. 예: `dd` → D16, `cc` → C17.
- 모든 그림은 왼쪽 위 귀(D16 화점, C16 소목) 기준이다. 넣을 때 다른 귀로 돌리려면 대칭 처리가 필요하다.
- 그림 SGF의 이름(`GN`)이 본문과 다를 때가 있다(선수 잡기 두 갈래는 SGF 이름이 본문의 Variation 1·2와 뒤바뀌어 있었다). 이름은 본문을 따른다.
- 넣기 전에 단위 시험이 엔진으로 처음 판부터 다시 둬 규칙에 맞는지 본다(체스 `openings.test.ts`와 같게). 그림에 따라 한쪽이 손을 빼 같은 색이 이어 두는 것(예: 아래 「Joseki 3」)도 있어 그대로 쓰지 않는다.
- **사용 조건**: Sensei's Library는 사이트 전체가 OpenContent License 1.0이다(https://senseis.xmp.net/?SLCopyright). 같은 조건으로 배포하라는 요구가 있어, 이 MIT 저장소에는 해설 글과 SGF를 넣지 않는다. 수순과 이름(사실 정보)만 옮기고, 설명(note)은 우리말로 새로 쓴다. 데이터 파일 머리에 「수순 확인: Sensei's Library(OPL), 주소」를 적는다.

## 1차 후보(처음 배우는 사람용)

| 이름(우리말) | 출처 문서 | 놓인 돌 | 수순 |
|---|---|---|---|
| 화점 삼삼 침입 기본 정석 | `?33PointInvasion` 「Main sequence」 | 흑 D16 | 백 C17, 흑 D17, 백 C16, 흑 C15, 백 B15, 흑 C14, 백 B14, 흑 C13 |
| 삼삼 침입 — 예전 마무리 | 같은 문서 「The old continuation」 | 위 수순 뒤 | 백 D18, 흑 E18, 백 C18, 흑 F17 |
| 삼삼 침입 — 양 젖힘 | 같은 문서 「Double hane」 | 흑 D17·D16·C15, 백 C17·C16·B15 | 흑 B14, 백 C14, 흑 D15, 백 B13, 흑 B16, 백 A14, 흑 B17 |
| 삼삼 침입 — 선수 잡기(뻗기) | 같은 문서 「Variation 1 to get sente」 | 흑 D16 | 백 C17, 흑 D17, 백 C16, 흑 D15, 백 B14 |
| 삼삼 침입 — 선수 잡기(날일자) | 같은 문서 「Variation 2 to get sente」 | 흑 D16 | 백 C17, 흑 D17, 백 C16, 흑 C14 |
| 화점 날일자 걸침 — 마늘모 붙임 | `?44PointDiagonalAttachmentJoseki` | 흑 D16·K16 | 백 F17, 흑 E17, 백 F16, 흑 D14 |
| 마늘모 붙임 — 낮은 귀 | 같은 문서 | 흑 D16·K16 | 백 F17, 흑 E17, 백 F16, 흑 C14 |
| 화점 날일자 걸침 — 붙여막기 | `?44PointLowApproachAttachBlockJoseki` 「Attach-block joseki」 | 흑 E17·D16·E16·F16, 백 F17·G16·F15 | 백 G15, 흑 G17, 백 H17, 흑 F18, 백 G18, 흑 D14 |
| 화점 날일자 걸침 — 날일자 받기 | `?44PointLowApproachLowKnightsMoveBlock` 「Joseki 1」 | 흑 D16 | 백 F17, 흑 E18, 백 F18, 흑 E17, 백 F16, 흑 D14, 백 K17 |
| 소목 날일자 걸침 — 날일자 받기 | `?34PointLowApproachKnightsMoveExtension` 「corner」 | 흑 C16 | 백 E17, 흑 D14, 백 C17, 흑 B17, 백 D16, 흑 C15, 백 C18, 흑 C10 |
| 소목 날일자 걸침 — 귀 지키기 | 같은 문서 「Defending the corner」 | 흑 C16 | 백 E17, 흑 D14, 백 C12, 흑 D17, 백 E16, 흑 C14 |
| 소목 날일자 걸침 — 마늘모 | `?34PointLowApproachDiagonal` 「Continuation」 | 흑 C16, 백 E17 | 흑 D15, 백 J17, 흑 G17, 백 E15, 흑 E14, 백 F15, 흑 D13, 백 H16, 흑 D17, 백 E18 |

- 2026-11-03 표의 12개 수순을 모두 엔진(`tryPlace`)으로 놓인 돌부터 다시 둬 규칙에 맞는 것을 확인했다(임시 시험, 저장소에는 넣지 않음). 넣을 때는 단위 시험으로 다시 확인한다.
- 위 표의 「놓인 돌」에 수 순서가 없는 것(예: 붙여막기의 흑 E17·E16·F16)은 그림이 중간 모양에서 시작한 것이다. 수순 따라 두기에는 놓인 돌을 시작 판으로 두거나, 앞 수순(마늘모 붙임 등)과 이어 하나의 갈래로 만든다.
- 다음에 볼 문서(이름만 확인): `44PointLowApproachOneSpaceLowPincer`, `44PointLowApproachTwoSpaceHighPincer`, `44PointHighApproach`, `34PointHighApproach`, `34PointLowApproachKeima`, `34PointLowApproachOneSpaceLowPincer`, `44PointLowApproachLowExtensionSlide33`. → 2026-11-17 아래 「2차」에서 봤다.

## 넣은 것(2026-11-03 첫 7갈래, 2026-11-17 넷 더해 11갈래)

`apps/web/src/baduk/joseki.ts`. 위 표의 12개 가운데 「삼삼 침입 — 선수 잡기 두 갈래」, 「마늘모 붙임 — 낮은 귀」, 「소목 날일자 걸침 — 귀 지키기」는 다른 갈래 안의 `branches`로 들어갔다. 2026-11-17에 「예전 마무리」와 「양 젖힘」을 따로 갈래로 넣어 표의 12개를 모두 썼다.

## 2차(2026-11-17 조사): 다음 문서 일곱

받는 법은 위와 같다(Claude in Chrome으로 문서를 열고, 페이지 안 `fetch`로 SGF를 받아 `AB`·`AW`·수를 읽음). 문서 머리의 「Difficulty」(Beginner·Intermediate·Advanced)로 처음 배우는 사람용인지 골랐다. 넣은 것은 모두 `joseki.test.ts`가 놓인 돌부터 엔진으로 다시 둔다.

| 이름(우리말) | 출처 문서·그림 | 난이도 | 놓인 돌 | 수순 | 판단 |
|---|---|---|---|---|---|
| 삼삼 침입 — 예전 마무리 | `?33PointInvasion` 「The old continuation」 | (1차 표) | 흑 D17·D16·C15·C14·C13, 백 C17·C16·B15·B14 | 백 D18, 흑 E18, 백 C18, 흑 F17 | 넣음 `line-33-invasion-old-end` |
| 삼삼 침입 — 양 젖힘 | 같은 문서 「Double hane: another standard」 | (1차 표) | 흑 D17·D16·C15, 백 C17·C16·B15 | 흑 B14, 백 C14, 흑 D15, 백 B13, 흑 B16, 백 A14, 흑 B17 | 넣음 `line-33-invasion-double-hane` |
| 화점 날일자 걸침 — 변 쪽 날일자, 삼삼 막기 | `?44PointLowApproachLowExtensionSlide33` 「Two-Space Low Extension」 | Beginner | 흑 D16 | 백 F17, 흑 C14, 백 D18, 흑 C17, 백 J17 | 넣음 `line-44-slide-33` |
| 소목 한 칸 높은 걸침 — 붙이고 물러서기 | `?34PointHighApproachInsideContactSolidConnection` 「Joseki」(곧은 이음) | Beginner(`?34PointHighApproachAttachDrawbackJoseki`) | 흑 C16, 백 E16 | 흑 E17, 백 F17, 흑 D17, 백 F16, 흑 C14, 백 K17 | 넣음 `line-34-high-attach` 본줄기 |
| 위 갈래 — 한 칸 건너 잇기 | `?34PointHighApproachInsideContactHangingConnection` 「Joseki」 | 같음 | 위와 같음(그림의 오른쪽 귀 돌 Q17·R15는 이 귀와 상관없어 뺌) | 백 G16, 흑 C14, 백 L17 | 넣음, 백 넷째 수의 갈래 |
| 위 갈래 — 마늘모·날일자 | 곧은 이음 문서 「Diagonal」·「Knight's move」 | 같음 | 위 수순의 흑 C14 자리 | 흑 D15(또는 D14), 백 K17, 흑 C10 | 넣음, 흑 C14의 갈래 둘 |
| 화점 한 칸 높은 걸침 | `?44PointHighApproach` 「Joseki」 | 표시 없음 | 흑 D16 | 백 F16, 흑 D14, 백 D17, 흑 C17, 백 E17, 흑 C18 | 넣지 않음: 문서가 프로 대국에서 아주 드물고 판 전체 사정에 따라 두는 수라고 적었다 |
| 화점 걸침 한 칸 낮은 협공 — 삼삼 들어가기 | `?44PointOneSpaceLowPincerInvasionBlock` 「Traditional joseki」 | Advanced | 흑 D16·D10 | 백 F17, 흑 H17, 백 C17, 흑 C16, 백 D17, 흑 E16, 백 F18, 흑 G15 | 넣지 않음: 고급, 옛 수순이고 AI 뒤 바뀐 수순이 따로 있다. 놓인 돌 D10이 있어야 성립한다 |
| 화점 걸침 한 칸 낮은 협공(그 밖) | `?44PointLowApproachOneSpaceLowPincer` | Intermediate | — | 문서는 갈래 목록뿐(아래 문서로 나뉨) | 넣지 않음: 중급 |
| 화점 걸침 두 칸 높은 협공 | `?44PointLowApproachTwoSpaceHighPincer` | Intermediate | — | 「The setup」 등 판 전체 그림 | 넣지 않음: 중급, 수순이 귀 밖까지 길다 |
| 소목 날일자 걸침 한 칸 낮은 협공 | `?34PointLowApproachOneSpaceLowPincer` | Intermediate | — | — | 넣지 않음: 중급 |
| 소목 날일자 걸침 — 날일자 받기 | `?34PointLowApproachKeima` | — | — | 1차의 `34PointLowApproachKnightsMoveExtension`과 같은 정석 | 이미 있음(`line-34-knight-extension`) |

- 다음 후보(아직 안 봄): 소목 한 칸 높은 걸침의 다른 받기(`34PointHighApproachInsideContactHane` 아래 갈래, `34PointHighApproachOutsideContact`), 화점 날일자 걸침의 「Small Knight Extension」(`44PointLowApproachLowExtensionSlide33`의 b). 같은 방법으로 확인한 뒤 넣는다.

## 글과 낱말(2026-11-17)

- 정석 설명에 나오는 돌 모양 이름(정석·걸침·날일자·낮은/높은 걸침·한 칸 뛰기·붙이다·젖히다·양 젖힘·마늘모·끊다·서다·2선·기다·두텁다·침입)은 수 배우기 단원 「정석: 귀에서 주고받기」(`lesson-joseki`)가 그림과 함께 먼저 알린다. `joseki-terms.test.ts`가 규칙 배우기 → 단원 → 정석 글 차례로 이어 읽어 뜻을 알리기 전에 쓴 곳이 없는지 본다.
- 단원 그림의 자리(날일자 거리, 줄 수, 붙임·젖힘·마늘모 관계)와 새 갈래 설명의 활로 수·끊는 자리는 `joseki.test.ts`가 엔진으로 확인한다.
- 처음 보는 독자 검토(대화 맥락 없는 서브에이전트)에서 받은 지적을 고쳤다: 벽 그림의 대각선 틈 D15를 설명 없이 「튼튼하게 이어진 벽」이라 한 것(끊어도 백 돌 활로가 둘뿐이라고 밝히고 시험), 삼삼 C17을 「화점 아래」, 벽이 「위·왼쪽」을 본다고 한 것, 대각선 수를 「마늘모로 서요」, 3선 C16을 「기어」, 둘 다 넓은 판에서 「넓은 쪽에서 막아요」, 「백의 끊는 자리」가 끊는 쪽·끊기는 쪽 둘로 읽히던 것(「끊기는 자리」로), 「C15에 이어」가 잇다로 읽히던 것, 「침입」·「붙여막기」를 풀지 않은 것(단원에서 침입을 알리고, 붙여막기는 「붙이고 막기」로), 셋째 줄을 어느 끝에서 세는지 없던 것, 「(선수).」로 끝나던 문장. 포석 단원의 벌림 뜻은 「두세 칸」에서 「두 칸 이상」으로 넓혔다(정석의 벌림은 네 칸 건너기도 한다).
- 같은 날 첫 7갈래의 글도 고쳤다: 판 위 끝에서 둘째 줄(F18·G18·C18)을 「1선」이라 한 것을 「2선」으로, 판 가운데 쪽으로 선 수를 「위로」라 한 것을 「가운데 쪽으로」로, 한 칸 뛴 수를 「벌려」라 한 것(포석 단원의 벌림은 두세 칸 건너기)을 「한 칸 뛰어」로, 왼쪽 위 귀의 위쪽 변을 「오른쪽 변」이라 한 것을 「위쪽 변」으로.
