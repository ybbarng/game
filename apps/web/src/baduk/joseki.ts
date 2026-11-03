import type { StudyLine } from "@/study/line";

/*
 * 바둑 정석 수순 따라 두기(docs/23 2절, docs/25-baduk-joseki-sources.md).
 * 수순은 Sensei's Library 문서의 그림 SGF에서 그대로 옮겼다(출처는 `source`). 설명 글은 직접 썼다.
 * 모든 정석은 19줄 판 왼쪽 위 귀(화점 D16, 소목 C16)에서 둔다. 네 귀로 돌리는 대칭은 놓인 돌도 함께 돌려야 해서 쓰지 않는다.
 * `start`는 바둑이 읽는 시작 판 글자: "19 B:D16,K16 W:F17 turn:W"(판 크기, 놓인 흑·백, 먼저 둘 편). joseki.test.ts가 모든 갈래를 엔진으로 다시 둔다.
 */

const SL = "https://senseis.xmp.net/?";

export const BADUK_JOSEKI: readonly StudyLine[] = [
  {
    id: "line-33-invasion-black",
    name: "화점 삼삼 침입 받기(흑)",
    summary:
      "화점에 백이 삼삼으로 들어오면 넓은 쪽에서 막아 바깥 벽을 쌓는다. 귀는 내주고 두터움을 얻는다",
    learner: 1,
    start: "19 B:D16 turn:W",
    source: `${SL}33PointInvasion`,
    moves: [
      { move: "C17", note: "백이 귀 안쪽 삼삼에 들어왔어요" },
      {
        move: "D17",
        note: "위쪽에서 막아요. 막는 쪽은 넓은 변으로, 바깥 벽이 넓은 곳을 바라보게 해요",
      },
      { move: "C16", note: "백은 왼쪽 변으로 기어 나가요" },
      {
        move: "C15",
        note: "왼쪽도 막아 백이 변으로 크게 나오지 못하게 해요",
        branches: [
          [
            {
              move: "C14",
              note: "한 칸 띄워 막는 수. 귀를 조금 더 내주는 대신 빨리 끝내고 다른 곳에 먼저 둘 수 있어요(선수)",
            },
          ],
          [
            {
              move: "D15",
              note: "뻗어서 벽을 바깥으로 키워요. 백이 귀에서 살면 흑이 먼저 다른 곳에 둬요",
            },
            { move: "B14", note: "백은 날일자로 왼쪽 변을 넓혀 살아요" },
          ],
        ],
      },
      { move: "B15", note: "백이 한 번 더 기어요" },
      {
        move: "C14",
        note: "다시 막아 벽을 이어요. 백이 가운데로 나오지 못해요",
      },
      { move: "B14", note: "백은 2선을 기어 귀를 넓혀요" },
      {
        move: "C13",
        note: "한 번 더 막아 벽을 완성해요. 백은 귀에 살고, 흑은 위·왼쪽을 바라보는 두터운 벽을 얻어요",
      },
    ],
  },
  {
    id: "line-33-invasion-white",
    name: "화점 삼삼 침입(백)",
    summary:
      "상대 화점의 귀가 비었으면 삼삼에 들어가 산다. 2선을 기어 귀 집을 지킨다",
    learner: 0,
    start: "19 B:D16 turn:W",
    source: `${SL}33PointInvasion`,
    moves: [
      {
        move: "C17",
        note: "화점 아래 귀 안쪽(삼삼)에 들어가요. 귀 집을 빼앗고 살 자리예요",
      },
      { move: "D17", note: "흑은 넓은 쪽에서 막아요" },
      { move: "C16", note: "왼쪽으로 기어 귀를 넓혀요" },
      { move: "C15", note: "흑이 왼쪽도 막아요" },
      { move: "B15", note: "2선을 한 번 더 기어 집을 늘려요" },
      { move: "C14", note: "흑이 벽을 이어요" },
      {
        move: "B14",
        note: "한 번 더 기어요. 흑이 여기를 먼저 막으면 백 귀가 좁아져요",
      },
      { move: "C13", note: "흑이 벽을 마무리해요. 백은 귀에 살았어요" },
    ],
  },
  {
    id: "line-44-diagonal-attach",
    name: "화점 날일자 걸침 — 마늘모 붙임(흑)",
    summary:
      "백이 날일자로 걸쳐 오면 마늘모로 붙이고, 백이 서면 귀를 지킨다. 귀를 굳히는 단순한 정석",
    learner: 1,
    start: "19 B:D16,K16 turn:W",
    source: `${SL}44PointDiagonalAttachmentJoseki`,
    moves: [
      { move: "F17", note: "백이 화점에 날일자로 걸쳐 와요" },
      {
        move: "E17",
        note: "걸친 돌에 마늘모로 붙여요. 백이 귀로 들어오는 길을 막아요",
      },
      { move: "F16", note: "백은 위로 서서 자리를 잡아요" },
      {
        move: "D14",
        note: "왼쪽 변을 한 칸 뛰어 넓히며 귀를 굳혀요. 오른쪽 K16 돌이 백을 압박해요",
        branches: [
          [
            {
              move: "C14",
              note: "낮게 지켜 귀 집을 확실히 해요. D14보다 집은 단단하지만 바깥 힘은 덜해요",
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
      "백이 걸쳐 오면 귀 쪽 날일자로 받아 귀를 지킨다. 백은 변에 자리를 잡는다",
    learner: 1,
    start: "19 B:D16 turn:W",
    source: `${SL}44PointLowApproachLowKnightsMoveBlock`,
    moves: [
      { move: "F17", note: "백이 날일자로 걸쳐 와요" },
      {
        move: "E18",
        note: "귀 쪽으로 날일자. 백이 귀로 들어오지 못하게 막아요",
      },
      { move: "F18", note: "백이 1선으로 막아 서요" },
      { move: "E17", note: "E17로 막아 백이 귀 쪽으로 오지 못하게 해요" },
      { move: "F16", note: "백은 위로 서서 자리를 넓혀요" },
      {
        move: "D14",
        note: "왼쪽 변으로 벌려 귀와 변을 함께 차지해요",
      },
      { move: "K17", note: "백은 오른쪽 변으로 벌려 자리를 잡아요" },
    ],
  },
  {
    id: "line-44-attach-block",
    name: "화점 날일자 걸침 — 붙여막기(흑)",
    summary:
      "붙여막기 정석의 뒷부분. 백이 젖혀 오면 끊어 모양을 정리하고 귀를 굳힌다",
    learner: 1,
    start: "19 B:E17,D16,E16,F16 W:F17,G16,F15 turn:W",
    source: `${SL}44PointLowApproachAttachBlockJoseki`,
    moves: [
      { move: "G15", note: "백이 이어 바깥을 단단히 해요" },
      {
        move: "G17",
        note: "백 F17 한 점을 위에서 눌러요. 백이 귀 쪽으로 이어지지 못하게 해요",
      },
      { move: "H17", note: "백은 옆으로 젖혀 버텨요" },
      {
        move: "F18",
        note: "아래로 내려 백 F17 한 점을 따내요. 귀가 확실한 흑 집이 돼요",
      },
      { move: "G18", note: "백이 막아 바깥을 정리해요" },
      {
        move: "D14",
        note: "귀를 굳혔으니 왼쪽 변으로 벌려 집을 넓혀요",
      },
    ],
  },
  {
    id: "line-34-knight-extension",
    name: "소목 날일자 걸침 — 날일자 받기(흑)",
    summary:
      "소목에 백이 걸쳐 오면 날일자로 받는다. 백이 귀에 붙으면 받아 주고 변으로 벌린다",
    learner: 1,
    start: "19 B:C16 turn:W",
    source: `${SL}34PointLowApproachKnightsMoveExtension`,
    moves: [
      { move: "E17", note: "백이 소목에 날일자로 걸쳐 와요" },
      {
        move: "D14",
        note: "날일자로 받아 귀와 왼쪽 변을 지켜요",
      },
      {
        move: "C17",
        note: "백이 귀에 붙어 와요",
        branches: [
          [
            { move: "C12", note: "백이 왼쪽 변에 다가서 흑을 압박해요" },
            {
              move: "D17",
              note: "귀를 젖혀 백이 들어오지 못하게 해요",
            },
            { move: "E16", note: "백이 서서 위쪽 자리를 잡아요" },
            {
              move: "C14",
              note: "왼쪽을 단단히 지켜 백 C12가 들어오지 못하게 해요",
            },
          ],
        ],
      },
      {
        move: "B17",
        note: "젖혀서 귀를 지켜요. 백이 귀로 미끄러져 들어오지 못해요",
      },
      { move: "D16", note: "백이 D16에 붙어 흑 C16을 압박해요" },
      { move: "C15", note: "아래로 이어 C16 돌의 활로를 늘려요" },
      { move: "C18", note: "백이 1선으로 내려 C17 돌의 활로를 늘려요" },
      {
        move: "C10",
        note: "왼쪽 변으로 크게 벌려 집 자리를 넓혀요",
      },
    ],
  },
  {
    id: "line-34-diagonal",
    name: "소목 날일자 걸침 — 마늘모로 막기(흑)",
    summary:
      "백 걸침에 마늘모로 서서 귀를 지키고, 백이 벌리면 위로 다가가 압박한다",
    learner: 0,
    start: "19 B:C16 W:E17 turn:B",
    source: `${SL}34PointLowApproachDiagonal`,
    moves: [
      {
        move: "D15",
        note: "마늘모로 서요. 귀를 지키면서 백 E17을 위쪽에 묶어 둬요",
      },
      { move: "J17", note: "백은 위쪽 변으로 벌려 자리를 잡아요" },
      {
        move: "G17",
        note: "백 사이에 다가가 압박해요. 백이 위쪽 변을 크게 차지하지 못하게 해요",
      },
      { move: "E15", note: "백이 붙여 와요" },
      { move: "E14", note: "젖혀서 바깥으로 나오는 길을 막아요" },
      { move: "F15", note: "백이 뻗어요" },
      { move: "D13", note: "이어서 왼쪽 벽을 튼튼히 해요" },
      { move: "H16", note: "백이 G17을 압박해요" },
      {
        move: "D17",
        note: "귀를 지켜 흑 귀가 확실해져요",
      },
      { move: "E18", note: "백이 막아 위쪽을 정리해요" },
    ],
  },
];

export const BADUK_JOSEKI_SET = {
  id: "joseki",
  title: "정석 따라 두기",
  summary:
    "19줄 귀에서 자주 나오는 정석을 처음부터 따라 둔다. 상대 수는 저절로 두고, 내 수가 다르면 다시 두게 한다",
  lines: BADUK_JOSEKI,
};

/** 시작 판 글자 "19 B:D16,K16 W:F17 turn:W"를 읽는다. 맞지 않으면 null */
export function parseJosekiStart(
  text: string,
): { size: 19; black: string[]; white: string[]; toPlay: 1 | 2 } | null {
  const m = /^19 B:([A-T0-9,]*)(?: W:([A-T0-9,]*))? turn:([BW])$/.exec(text);
  if (!m) return null;
  const list = (s: string | undefined) => (s ? s.split(",") : []);
  return {
    size: 19,
    black: list(m[1]),
    white: list(m[2]),
    toPlay: m[3] === "B" ? 1 : 2,
  };
}
