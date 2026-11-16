import type { StudyLine } from "@/study/line";

/*
 * 바둑 정석 수순 따라 두기(docs/23 2절, docs/25-baduk-joseki-sources.md).
 * 수순 확인: Sensei's Library(OPL), https://senseis.xmp.net/ — 수순과 이름(사실 정보)만 옮겼다(갈래마다 `source`).
 * 그곳 글은 OpenContent License라 옮기지 않고, 설명(note)은 우리말로 새로 썼다.
 * 모든 정석은 19줄 판 왼쪽 위 귀(화점 D16, 소목 C16)에서 둔다. 네 귀로 돌리는 대칭은 놓인 돌도 함께 돌려야 해서 쓰지 않는다.
 * `start`는 바둑이 읽는 시작 판 글자: "19 B:D16,K16 W:F17 turn:W"(판 크기, 놓인 흑·백, 먼저 둘 편). joseki.test.ts가 모든 갈래를 엔진으로 다시 둔다.
 */

const SL = "https://senseis.xmp.net/?";

export const BADUK_JOSEKI: readonly StudyLine[] = [
  {
    id: "line-33-invasion-black",
    name: "화점 삼삼 침입 받기(흑)",
    summary:
      "화점에 백이 삼삼으로 들어오면 한쪽씩 막아 바깥 벽을 쌓아요. 귀는 내주고 두터움을 얻어요.",
    learner: 1,
    start: "19 B:D16 turn:W",
    source: `${SL}33PointInvasion`,
    moves: [
      { move: "C17", note: "백이 귀 안쪽 삼삼에 들어왔어요." },
      {
        move: "D17",
        note: "D17로 백 C17의 오른쪽을 막아요. 다른 귀에 내 돌이 있으면, 벽이 그 돌 쪽을 바라보게 막을 쪽을 골라요.",
      },
      { move: "C16", note: "백은 C17 아래에 이어 왼쪽 변 쪽으로 나가요." },
      {
        move: "C15",
        note: "왼쪽도 막아 백이 변으로 크게 나오지 못하게 해요.",
        branches: [
          [
            {
              move: "C14",
              note: "C15로 막지 않고 C14에 날일자로 둬요. 귀는 백에게 주고, 빨리 끝내 선수를 잡고 다른 곳에 먼저 둬요.",
            },
          ],
          [
            {
              move: "D15",
              note: "뻗어서 벽을 바깥으로 키워요. 백이 귀에서 살면 흑이 먼저 다른 곳에 둬요.",
            },
            { move: "B14", note: "백은 날일자로 왼쪽 변을 넓혀 살아요." },
          ],
        ],
      },
      { move: "B15", note: "백이 한 번 더 기어요." },
      {
        move: "C14",
        note: "다시 막아 벽을 이어요. 백이 가운데로 나오지 못해요.",
      },
      { move: "B14", note: "백은 2선을 기어 귀를 넓혀요." },
      {
        move: "C13",
        note: "한 번 더 막아 벽을 완성해요. 백은 귀에 살고, 흑은 위쪽 변과 왼쪽 변, 가운데를 바라보는 두터운 벽을 얻어요.",
      },
    ],
  },
  {
    id: "line-33-invasion-white",
    name: "화점 삼삼 침입(백)",
    summary:
      "상대 화점의 귀가 비었으면 삼삼에 들어가 살아요. 2선을 기어 귀 집을 지켜요.",
    learner: 0,
    start: "19 B:D16 turn:W",
    source: `${SL}33PointInvasion`,
    moves: [
      {
        move: "C17",
        note: "화점과 귀 모서리 사이, 대각선 안쪽의 삼삼에 들어가요. 귀 집을 빼앗고 살 자리예요.",
      },
      { move: "D17", note: "흑이 오른쪽을 막아요." },
      { move: "C16", note: "C17 아래에 이어 귀를 넓혀요." },
      { move: "C15", note: "흑이 왼쪽도 막아요." },
      { move: "B15", note: "2선을 한 번 더 기어 집을 늘려요." },
      { move: "C14", note: "흑이 벽을 이어요." },
      {
        move: "B14",
        note: "한 번 더 기어요. 흑이 여기를 먼저 막으면 백 귀가 좁아져요.",
      },
      { move: "C13", note: "흑이 벽을 마무리해요. 백은 귀에 살았어요." },
    ],
  },
  {
    id: "line-33-invasion-old-end",
    name: "화점 삼삼 침입 — 예전 마무리(흑)",
    summary:
      "삼삼 침입 정석이 끝난 판에서 시작해요. 백이 2선을 젖혀 귀를 넓히면 막고, 흑이 끊기는 자리를 지켜 벽을 두텁게 해요. 예전에는 백이 이 2선 젖힘까지 둬야 정석이 끝난다고 봤어요. 요즘은 젖히지 않고 다른 곳에 먼저 두기도 해요.",
    learner: 1,
    start: "19 B:D17,D16,C15,C14,C13 W:C17,C16,B15,B14 turn:W",
    source: `${SL}33PointInvasion`,
    moves: [
      {
        move: "D18",
        note: "백이 2선에서 흑 D17의 앞을 젖혀요. 귀 집을 한 줄 넓히려는 수예요.",
      },
      {
        move: "E18",
        note: "옆에서 막아요. 백이 2선을 따라 오른쪽으로 더 나오지 못해요.",
      },
      {
        move: "C18",
        note: "백이 C18에 이어요. 흑이 여기에 두면 백 D18이 단수가 돼요.",
      },
      {
        move: "F17",
        note: "흑 D17과 E18 사이의 E17이 흑이 끊기는 자리예요. F17에 두면 백이 E17에 끊어도 그 돌은 활로가 E16 하나뿐이라 흑이 바로 따내요. 백은 귀에 살고, 흑은 바깥에 두터운 벽을 얻었어요.",
      },
    ],
  },
  {
    id: "line-33-invasion-double-hane",
    name: "화점 삼삼 침입 — 양 젖힘(흑)",
    summary:
      "삼삼 침입 정석 가운데에서 흑이 2선을 한 번 더 젖혀 귀를 되찾는 갈래예요. 백은 흑 한 점을 따내 왼쪽 변에 자리를 얻고, 흑은 귀의 백 두 점을 가둬 귀를 얻어요.",
    learner: 0,
    start: "19 B:D17,D16,C15 W:C17,C16,B15 turn:B",
    source: `${SL}33PointInvasion`,
    moves: [
      {
        move: "B14",
        note: "C15로 젖힌 다음 B14로 한 번 더 젖혀요. 백이 왼쪽 변으로 기어 나오는 길을 막아 귀에 가두려는 수예요.",
      },
      {
        move: "C14",
        note: "백이 흑 C15와 B14 사이를 끊어요. 흑 C15는 활로가 D15 하나만 남아 단수예요.",
      },
      { move: "D15", note: "D15에 이어 C15를 살려요." },
      {
        move: "B13",
        note: "백이 흑 B14를 단수로 몰아요.",
      },
      {
        move: "B16",
        note: "B14를 살리지 않고 B16에 둬요. 백 B15가 단수가 되고, 귀의 백 두 점 C16·C17도 활로가 B17·C18 둘만 남아요.",
      },
      {
        move: "A14",
        note: "백이 흑 B14를 따내요. B15도 활로가 늘어 살아나고, 왼쪽 변에 백 돌이 자리를 잡아요.",
      },
      {
        move: "B17",
        note: "B17로 귀의 백 두 점을 단수로 몰아요. 백은 보통 이 두 점을 버리고 다른 곳에 먼저 둬요. 흑은 귀를 되찾았어요.",
      },
    ],
  },
  {
    id: "line-44-diagonal-attach",
    name: "화점 날일자 걸침 — 마늘모 붙임(흑)",
    summary:
      "백이 날일자로 걸쳐 오면 마늘모로 붙이고, 백이 서면 귀를 지켜요. 귀를 굳히는 단순한 정석이에요.",
    learner: 1,
    start: "19 B:D16,K16 turn:W",
    source: `${SL}44PointDiagonalAttachmentJoseki`,
    moves: [
      { move: "F17", note: "백이 화점에 날일자로 걸쳐 와요." },
      {
        move: "E17",
        note: "걸친 돌에 마늘모로 붙여요. 백이 귀로 들어오는 길을 막아요.",
      },
      { move: "F16", note: "백은 가운데 쪽으로 서서 자리를 잡아요." },
      {
        move: "D14",
        note: "왼쪽 변을 한 칸 뛰어 넓히며 귀를 굳혀요. 오른쪽 K16 돌이 백을 압박해요.",
        branches: [
          [
            {
              move: "C14",
              note: "낮게 지켜 귀 집을 확실히 해요. D14보다 집은 단단하지만 바깥 힘은 덜해요.",
            },
          ],
        ],
      },
    ],
  },
  {
    id: "line-44-knight-block",
    name: "화점 날일자 걸침 — 날일자 받기(흑)",
    summary:
      "백이 걸쳐 오면 귀 쪽 날일자로 받아 귀를 지켜요. 백은 변에 자리를 잡아요.",
    learner: 1,
    start: "19 B:D16 turn:W",
    source: `${SL}44PointLowApproachLowKnightsMoveBlock`,
    moves: [
      { move: "F17", note: "백이 날일자로 걸쳐 와요." },
      {
        move: "E18",
        note: "귀 쪽으로 날일자로 받아요. 백이 귀로 들어오지 못하게 막아요.",
      },
      { move: "F18", note: "백이 2선에서 막아요." },
      { move: "E17", note: "E17로 막아 백이 귀 쪽으로 오지 못하게 해요." },
      { move: "F16", note: "백은 가운데 쪽으로 서서 자리를 넓혀요." },
      {
        move: "D14",
        note: "왼쪽 변으로 한 칸 뛰어 귀와 변을 함께 차지해요.",
      },
      { move: "K17", note: "백은 위쪽 변으로 벌려 자리를 잡아요." },
    ],
  },
  {
    id: "line-44-slide-33",
    name: "화점 날일자 걸침 — 변 쪽 날일자, 삼삼 막기(흑)",
    summary:
      "백이 걸쳐 오면 왼쪽 변 쪽에 날일자로 받아요. 백이 귀 안쪽 2선으로 들어오면 삼삼에서 막아 귀를 지키고, 백은 위쪽 변에 자리를 잡아요.",
    learner: 1,
    start: "19 B:D16 turn:W",
    source: `${SL}44PointLowApproachLowExtensionSlide33`,
    moves: [
      { move: "F17", note: "백이 날일자로 걸쳐 와요." },
      {
        move: "C14",
        note: "왼쪽 변 쪽에 날일자로 받아요. 변을 넓히는 대신 귀 위쪽이 조금 비어요.",
      },
      {
        move: "D18",
        note: "백이 걸친 돌에서 날일자로 귀 안쪽 2선에 들어와요. 흑 귀 집을 줄이고 백이 살 자리를 넓혀요.",
      },
      {
        move: "C17",
        note: "삼삼에서 막아 백이 귀 안으로 더 들어오는 길을 막아요.",
      },
      {
        move: "J17",
        note: "백은 위쪽 변으로 두 칸 벌려 살 자리를 마련해요. 흑은 귀와 왼쪽 변, 백은 위쪽 변을 나눠 가졌어요.",
      },
    ],
  },
  {
    id: "line-44-attach-block",
    name: "화점 날일자 걸침 — 붙이고 막기, 가운데 쪽으로 잇기(흑)",
    summary:
      "붙이고 막는 정석의 뒷부분이에요. 백이 가운데 쪽으로 이어 바깥을 두텁게 하고, 흑은 백 한 점을 따내 귀를 차지해요. G17 둘레에 패가 남아요.",
    learner: 1,
    start: "19 B:E17,D16,E16,F16 W:F17,G16,F15 turn:W",
    source: `${SL}44PointLowApproachAttachBlockJoseki`,
    moves: [
      {
        move: "G15",
        note: "백이 끊기는 자리를 가운데 쪽으로 단단히 이어 바깥을 두텁게 해요.",
      },
      {
        move: "G17",
        note: "백 F17을 단수로 몰아요. 활로가 F18 하나만 남아요.",
      },
      { move: "H17", note: "백이 젖혀 거꾸로 흑 G17을 단수로 몰아요." },
      {
        move: "F18",
        note: "백 F17을 먼저 따내요. 흑 G17은 활로가 둘로 늘어 바로 잡히지 않아요.",
      },
      {
        move: "G18",
        note: "백이 2선을 막아 흑 G17을 다시 단수로 몰아요. 백이 F17에 두면 G17을 따내는 패가 돼요.",
      },
      {
        move: "D14",
        note: "왼쪽 변으로 한 칸 뛰어 귀 집을 넓혀요. 백은 바깥 두터움, 흑은 귀 집을 얻었고, G17 둘레는 나중에 패로 다툴 수 있는 곳으로 남아요.",
      },
    ],
  },
  {
    id: "line-34-knight-extension",
    name: "소목 날일자 걸침 — 날일자 받기(흑)",
    summary:
      "소목에 백이 걸쳐 오면 날일자로 받아요. 백이 귀에 붙으면 받아 주고 변으로 벌려요.",
    learner: 1,
    start: "19 B:C16 turn:W",
    source: `${SL}34PointLowApproachKnightsMoveExtension`,
    moves: [
      { move: "E17", note: "백이 소목에 날일자로 걸쳐 와요." },
      {
        move: "D14",
        note: "날일자로 받아 귀와 왼쪽 변을 지켜요.",
      },
      {
        move: "C17",
        note: "백이 귀에 붙어 와요.",
        branches: [
          [
            { move: "C12", note: "백이 왼쪽 변에 다가서 흑을 압박해요." },
            {
              move: "D17",
              note: "귀를 젖혀 백이 들어오지 못하게 해요.",
            },
            { move: "E16", note: "백이 서서 위쪽 자리를 잡아요." },
            {
              move: "C14",
              note: "왼쪽을 단단히 지켜 백 C12가 들어오지 못하게 해요.",
            },
          ],
        ],
      },
      {
        move: "B17",
        note: "젖혀서 귀를 지켜요. 백이 귀로 미끄러져 들어오지 못해요.",
      },
      { move: "D16", note: "백이 D16에 붙어 흑 C16을 압박해요." },
      { move: "C15", note: "아래로 이어 C16 돌의 활로를 늘려요." },
      {
        move: "C18",
        note: "백이 C17 위, 판 끝 쪽에 이어 C17 돌의 활로를 늘려요.",
      },
      {
        move: "C10",
        note: "왼쪽 변으로 크게 벌려 집 자리를 넓혀요.",
      },
    ],
  },
  {
    id: "line-34-diagonal",
    name: "소목 날일자 걸침 — 마늘모로 막기(흑)",
    summary:
      "백 걸침에 마늘모로 둬 귀를 지키고, 백이 벌리면 위로 다가가 압박해요.",
    learner: 0,
    start: "19 B:C16 W:E17 turn:B",
    source: `${SL}34PointLowApproachDiagonal`,
    moves: [
      {
        move: "D15",
        note: "마늘모로 둬요. 귀를 지키면서 백 E17을 위쪽에 묶어 둬요.",
      },
      { move: "J17", note: "백은 위쪽 변으로 벌려 자리를 잡아요." },
      {
        move: "G17",
        note: "백 사이에 다가가 압박해요. 백이 위쪽 변을 크게 차지하지 못하게 해요.",
      },
      { move: "E15", note: "백이 붙여 와요." },
      { move: "E14", note: "젖혀서 바깥으로 나오는 길을 막아요." },
      { move: "F15", note: "백이 뻗어요." },
      { move: "D13", note: "D13에 둬 왼쪽 변을 넓히고 E14를 아래에서 받쳐요." },
      { move: "H16", note: "백이 H16에 둬 위쪽 변의 오른쪽 자리를 넓혀요." },
      {
        move: "D17",
        note: "귀를 지켜 흑 귀가 확실해져요.",
      },
      { move: "E18", note: "백이 막아 위쪽을 정리해요." },
    ],
  },
  {
    id: "line-34-high-attach",
    name: "소목 한 칸 높은 걸침 — 붙이고 물러서기(흑)",
    summary:
      "소목에 백이 한 칸 높게 걸쳐 오면 판 끝 쪽에서 붙이고, 백이 젖히면 한 칸 물러서 이어요. 흑은 귀 집을 단단히 하고, 백은 끊기는 자리를 지켜 위쪽 변에 벌려요. 처음 배우는 소목 정석으로 자주 꼽혀요.",
    learner: 0,
    start: "19 B:C16 W:E16 turn:B",
    source: `${SL}34PointHighApproachInsideContactSolidConnection`,
    moves: [
      {
        move: "E17",
        note: "백 E16에 판 끝 쪽에서 붙여요. 백이 귀 쪽으로 들어오는 길을 막아요.",
      },
      { move: "F17", note: "백이 젖혀 흑 E17의 오른쪽을 막아요." },
      {
        move: "D17",
        note: "젖힘에 맞서지 않고 귀 쪽 D17로 한 칸 물러나 이어요. E17이 잡힐 걱정이 없고 귀 집이 단단해져요. 대신 백에게는 F16에 끊기는 자리가 남아요.",
      },
      {
        move: "F16",
        note: "백이 F16에 곧게 이어 끊는 자리를 없애요.",
        branches: [
          [
            {
              move: "G16",
              note: "백이 F16 대신 G16에 둬요. 흑이 F16에 끊어도 그 돌은 활로가 F15 하나뿐이라 백이 바로 따내요. 곧게 잇는 것보다 오른쪽으로 넓게 자리를 잡아요.",
            },
            {
              move: "C14",
              note: "왼쪽 변으로 한 칸 뛰어 귀와 변을 함께 지켜요.",
            },
            { move: "L17", note: "백은 위쪽 변으로 벌려 자리를 잡아요." },
          ],
        ],
      },
      {
        move: "C14",
        note: "왼쪽 변으로 한 칸 뛰어 귀와 변을 함께 지켜요.",
        branches: [
          [
            {
              move: "D15",
              note: "C14 대신 D15에 마늘모로 둬요. 변은 덜 지키지만 가운데로 나가기 쉬워요.",
            },
            { move: "K17", note: "백은 위쪽 변으로 벌려요." },
            {
              move: "C10",
              note: "왼쪽 변으로 크게 벌려 집 자리를 넓혀요.",
            },
          ],
          [
            {
              move: "D14",
              note: "C14 대신 D14에 날일자로 둬요. C14보다 한 줄 높아 가운데 쪽을 더 봐요.",
            },
            { move: "K17", note: "백은 위쪽 변으로 벌려요." },
            {
              move: "C10",
              note: "왼쪽 변으로 크게 벌려 집 자리를 넓혀요.",
            },
          ],
        ],
      },
      {
        move: "K17",
        note: "백은 위쪽 변으로 벌려 자리를 잡아요. 흑은 귀와 왼쪽 변, 백은 위쪽 변을 얻었어요.",
      },
    ],
  },
];

export const BADUK_JOSEKI_SET = {
  id: "joseki",
  title: "정석 따라 두기",
  summary:
    "19줄 귀에서 자주 나오는 정석을 처음부터 따라 둬요. 상대 수는 저절로 두고, 내 수가 다르면 다시 두게 해요.",
  lines: BADUK_JOSEKI,
};

/** 시작 판 글자 "19 B:D16,K16 W:F17 turn:W"를 읽는다. 맞지 않으면 null */
export function parseJosekiStart(
  text: string,
): { size: 19; black: string[]; white: string[]; toPlay: 1 | 2 } | null {
  const m = /^19 B:([A-T0-9,]*)(?: W:([A-T0-9,]*))? turn:([BW])$/.exec(text);
  if (!m) return null;
  const list = (s: string | undefined) => (s ? s.split(",") : []);
  const black = list(m[1]);
  const white = list(m[2]);
  // 자리 이름은 A~T(I 없음)와 1~19만, 한 자리에 돌 하나만
  const all = [...black, ...white];
  if (!all.every((name) => POINT_19.test(name))) return null;
  if (new Set(all).size !== all.length) return null;
  return { size: 19, black, white, toPlay: m[3] === "B" ? 1 : 2 };
}

/** 19줄 판 자리 이름: 가로 A~T(I 없음), 세로 1~19 */
const POINT_19 = /^[A-HJ-T](?:1[0-9]|[1-9])$/;
