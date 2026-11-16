import type { StudyLine } from "@/study/line";

/*
 * 바둑 포석 따라 두기(docs/23 바둑 3. 포석 원칙). 빈 19줄 판에서 첫 몇 수를 둔다.
 * 수순은 남의 기보나 책에서 옮기지 않고 「빈 귀 → 굳힘·벌림 → 변 → 가운데」 원리로 직접 만들었다.
 * 이연성·삼연성은 널리 쓰는 이름(사실)이라 그대로 쓰고, 설명(note)은 우리말로 새로 썼다.
 * 시작 판 글자는 정석과 같은 꼴(joseki.ts `parseJosekiStart`)이다. fuseki.test.ts가 모든 수순을 엔진으로 다시 둔다.
 */

/** 빈 19줄 판, 흑부터 */
const EMPTY = "19 B: turn:B";
const SOURCE = "직접 만듦: 귀 → 변 → 가운데 원리(docs/23 바둑 포석)";

export const BADUK_FUSEKI: readonly StudyLine[] = [
  {
    id: "line-fuseki-nirensei",
    name: "이연성(흑)",
    summary: "같은 쪽 두 귀의 화점에 둔다. 두 돌이 그 사이 변을 함께 바라본다.",
    learner: 0,
    start: EMPTY,
    source: SOURCE,
    moves: [
      {
        move: "Q16",
        note: "빈 판에서는 귀부터 둬요. 오른쪽 위 귀의 화점이에요.",
      },
      { move: "D4", note: "백도 빈 귀를 차지해요." },
      {
        move: "Q4",
        note: "같은 오른쪽의 아래 귀 화점에 둬요. 두 돌이 오른쪽 변을 함께 바라봐요. 이 모양이 이연성이에요.",
      },
    ],
  },
  {
    id: "line-fuseki-sanrensei",
    name: "삼연성(흑)",
    summary: "이연성에 더해 그 사이 변의 화점까지 세 곳에 둔다.",
    learner: 0,
    start: EMPTY,
    source: SOURCE,
    moves: [
      { move: "Q16", note: "오른쪽 위 귀의 화점부터 둬요." },
      { move: "D4", note: "백은 왼쪽 아래 귀를 차지해요." },
      {
        move: "Q4",
        note: "오른쪽 아래 귀 화점. 오른쪽 변을 두 돌이 바라봐요(이연성).",
      },
      { move: "D16", note: "백이 마지막 빈 귀를 차지해요." },
      {
        move: "Q10",
        note: "빈 귀가 없으니 변으로 가요. 두 흑 돌 사이 변의 화점에 두면 세 돌이 나란히 서요. 오른쪽 변이 넓은 흑 자리가 돼요.",
      },
    ],
  },
  {
    id: "line-fuseki-diagonal",
    name: "마주 보는 화점(흑)",
    summary: "백이 한 귀를 차지하면, 흑은 그 대각선 쪽 귀에 둔다.",
    learner: 0,
    start: EMPTY,
    source: SOURCE,
    moves: [
      { move: "Q16", note: "오른쪽 위 귀의 화점이에요." },
      { move: "D16", note: "백은 왼쪽 위 귀를 차지해요." },
      {
        move: "D4",
        note: "왼쪽 아래 귀에 둬요. 두 흑 돌이 판을 비스듬히 마주 봐요. 서로 멀어서 귀마다 따로 집을 지어야 해요.",
      },
      {
        move: "Q4",
        note: "백이 마지막 빈 귀를 차지해요. 이제 네 귀가 다 찼으니 다음은 굳힘이나 벌림이에요.",
      },
    ],
  },
  {
    id: "line-fuseki-komoku-shimari",
    name: "소목 굳힘(흑)",
    summary: "소목에 두고, 빈 귀를 나눠 가진 뒤 귀를 한 수 더 굳힌다.",
    learner: 0,
    start: EMPTY,
    source: SOURCE,
    moves: [
      {
        move: "R16",
        note: "오른쪽 위 귀의 소목이에요. 오른쪽 끝에서 셋째 줄, 위 끝에서 넷째 줄이에요.",
      },
      { move: "D4", note: "백은 왼쪽 아래 귀를 차지해요." },
      { move: "Q4", note: "흑도 빈 귀를 하나 더 차지해요." },
      { move: "D16", note: "백이 마지막 빈 귀를 차지해요." },
      {
        move: "P17",
        note: "빈 귀가 없으니 소목을 굳혀요. 가로로 두 칸, 세로로 한 칸 떨어진 자리(날일자)에 두어 상대가 귀에 들어오기 어렵게 해요.",
      },
    ],
  },
  {
    id: "line-fuseki-empty-corners",
    name: "빈 귀 먼저(백)",
    summary: "백으로 둔다. 흑이 귀를 둘 차지해도 백은 남은 빈 귀부터 차지한다.",
    learner: 1,
    start: EMPTY,
    source: SOURCE,
    moves: [
      { move: "Q16", note: "흑이 오른쪽 위 귀에 둬요." },
      {
        move: "D4",
        note: "백도 빈 귀에 둬요. 흑 돌 옆에 붙이는 것보다 빈 귀가 커요.",
      },
      { move: "Q4", note: "흑이 오른쪽 아래 귀를 차지해요." },
      {
        move: "D16",
        note: "남은 빈 귀를 차지해요. 귀는 판 끝이 두 쪽을 막아 주어 적은 돌로 집을 지어요.",
      },
      { move: "Q10", note: "흑은 빈 귀가 없으니 오른쪽 변으로 가요(삼연성)." },
      {
        move: "D10",
        note: "백도 변으로 가요. 백 두 귀 사이 왼쪽 변의 화점에 둬 흑과 같은 크기로 맞서요.",
      },
    ],
  },
];

export const BADUK_FUSEKI_SET = {
  id: "fuseki",
  title: "포석 따라 두기",
  summary:
    "빈 19줄 판에서 귀 → 변 → 가운데 순서로 첫 몇 수를 따라 둔다. 상대 수는 저절로 두고, 내 수가 다르면 다시 두게 한다.",
  lines: BADUK_FUSEKI,
};
