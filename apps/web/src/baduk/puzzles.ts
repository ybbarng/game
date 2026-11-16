/*
 * 바둑 첫 수 배우기 문제(docs/23, docs/25). 9줄 판의 작은 장면이고, 늘 흑(나)이 둔다. 자리는 "D4"처럼 쓴다.
 * 장면은 엔진으로 무작위 판을 만들어 "정답이 하나뿐인 판"을 찾아 골랐고, study.test.ts(잡기)와 life.test.ts(사활)가 모든 문제를 다시 확인한다.
 * - 잡기(단수·축·장문·환격·패): `captureMoves`로 `within`수 안에 노리는 돌을 따내는 첫 수가 정답 하나뿐이고, 더 빨리는 못 따낸다.
 *   환격은 첫 수가 한 점을 내주는 수(`snapbackGain`), 패는 첫 수가 패를 따내는 수(`koRecapturePoint`)다
 * - 사활(두 눈 만들기·눈 빼앗기): `lifeKeyMoves`로 정한 빈 자리 안의 첫 수 가운데 정답이 하나뿐이고,
 *   다른 수는 반대 결과(사는 문제면 잡히고, 잡는 문제면 산다)가 된다(`lifeWrongMovesFail`)
 * - 이름 있는 모양(직삼·곡삼·T자 네 집·오궁도화·뭉친 다섯 집·매화육궁): 무작위가 아니라 모양을 손으로 놓은 사활 문제다.
 *   바깥을 둘러싼 돌은 귀에 한 집씩 두 눈을 가져 벤슨 방법으로 산 돌이다(안쪽 싸움만 남는다)
 * - 긴 축·축머리: 판 끝까지 가는 축이라 `captureMoves`로는 너무 오래 걸린다. 공격을 단수로만 좁힌 축 읽기(`ladderMoves`)로
 *   두 단수 가운데 정답만 축이 되고, 축머리 문제는 축머리 돌을 치우면 다른 쪽 단수도 축이 되는지 본다(ladder.test.ts)
 * - 패로 버티기(팻감 쓰기·팻감 받기): 손으로 놓은 패 모양과 팻감 모양을 판 대칭으로 돌려 놓았다.
 *   `setup`의 수를 먼저 두고 시작해, 같은 판 모양 금지가 실제 판 기록으로 걸린다(ko-fight.test.ts)
 * 해설은 장면에서 만든다(study.ts).
 */

/** 잡기 문제의 모양: 단수 방향, 축, 장문, 환격, 패, 긴 축, 축머리 */
export type CaptureTheme =
  | "atari"
  | "ladder"
  | "net"
  | "snapback"
  | "ko"
  | "long-ladder"
  | "breaker";

/** 축 읽기(`ladderMoves`)로 판정하는 모양. 나머지는 `captureMoves`로 읽는다 */
export const LADDER_THEMES: readonly CaptureTheme[] = [
  "long-ladder",
  "breaker",
];

/** 패로 버티기: 팻감 쓰기(패를 따인 쪽), 팻감 받기(패를 따낸 쪽) */
export type KoFightMode = "threat" | "answer";

/** 이름 있는 눈 모양: 직삼, 곡삼, T자 네 집, 오궁도화, 뭉친 다섯 집, 매화육궁 */
export type LifeShape =
  | "straight-three"
  | "bent-three"
  | "pyramid-four"
  | "flower-five"
  | "bulky-five"
  | "rabbity-six";

/** 눈 모양의 이름 */
export const LIFE_SHAPE_NAMES: Record<LifeShape, string> = {
  "straight-three": "직삼",
  "bent-three": "곡삼",
  "pyramid-four": "T자 네 집",
  "flower-five": "오궁도화",
  "bulky-five": "뭉친 다섯 집",
  "rabbity-six": "매화육궁",
};

/**
 * 문제 하나. 늘 흑이 둔다.
 * - capture: 노리는 백 돌(`target`)을 `within`수 안에 따낸다. 첫 수는 정답 하나, 그다음은 남은 수 안에 따내는 수면 맞다
 * - life: 사활. `goal`이 live면 흑 무리(`target`)를 살리고, kill이면 백 무리(`target`)를 잡는다. 첫 수 하나로 푼다
 */
export type BadukPuzzle = {
  id: string;
  black: readonly string[];
  white: readonly string[];
  /** 노리는(또는 살릴) 무리의 돌 하나 */
  target: string;
  /** 첫 정답 자리 */
  solution: string;
} & (
  | {
      kind: "capture";
      theme: CaptureTheme;
      within: number;
      /** 축머리 문제: 축을 깨는 백 돌 자리 */
      breaker?: string;
    }
  | {
      /**
       * 패로 버티기. `black`·`white`는 `setup`을 두기 전의 판이고, `setup`을 번갈아 둔 뒤 흑 차례로 시작한다
       * (`setup`의 마지막 수는 늘 백이라, 수가 홀수 개면 백부터 둔다).
       * - threat(팻감 쓰기): 백이 방금 패를 따냈다. 흑은 `solution`(팻감)을 두고, 백이 `reply`로 받으면 `ko`에 되따낸다.
       *   `target`은 팻감이 노리는 백 무리
       * - answer(팻감 받기): 흑이 패를 따냈고, 백이 팻감을 썼다. 흑은 `solution`으로 받는다.
       *   `target`은 백 팻감이 노리는 흑 무리, `ko`는 백이 받은 뒤 되따낼 자리
       */
      kind: "kofight";
      mode: KoFightMode;
      setup: readonly string[];
      ko: string;
      reply?: string;
    }
  | {
      kind: "life";
      goal: "live" | "kill";
      /** 사활을 읽는 빈 자리(둘러싸인 안쪽) */
      area: readonly string[];
      /** 이름 있는 눈 모양 문제면 그 모양 */
      shape?: LifeShape;
    }
);

export interface BadukPuzzleSet {
  id: string;
  title: string;
  summary: string;
  puzzles: readonly BadukPuzzle[];
}

type RawCapture = {
  black: string[];
  white: string[];
  target: string;
  solution: string;
  within: number;
  breaker?: string;
};
type RawKoFight = {
  black: string[];
  white: string[];
  setup: string[];
  ko: string;
  target: string;
  solution: string;
  reply?: string;
};
type RawLife = {
  black: string[];
  white: string[];
  target: string;
  area: string[];
  solution: string;
};

const ATARI: readonly RawCapture[] = [
  {
    black: ["G3", "H2", "F1", "H1"],
    white: ["G2"],
    target: "G2",
    solution: "F2",
    within: 2,
  },
  {
    black: ["E9", "G9", "G8", "F7"],
    white: ["F8"],
    target: "F8",
    solution: "E8",
    within: 2,
  },
  {
    black: ["C8", "D7", "B6", "D6"],
    white: ["C7"],
    target: "C7",
    solution: "B7",
    within: 2,
  },
  {
    black: ["B6", "A5", "A4", "C4"],
    white: ["B5"],
    target: "B5",
    solution: "C5",
    within: 2,
  },
  {
    black: ["G6", "H6", "J6", "H4"],
    white: ["H5"],
    target: "H5",
    solution: "G5",
    within: 2,
  },
  {
    black: ["F5", "G5", "E4", "G3"],
    white: ["F4", "F2"],
    target: "F4",
    solution: "F3",
    within: 2,
  },
  {
    black: ["H3", "J3", "G2"],
    white: ["H2", "J2"],
    target: "H2",
    solution: "H1",
    within: 2,
  },
  {
    black: ["E2", "G2", "E1"],
    white: ["G3", "F2"],
    target: "F2",
    solution: "F3",
    within: 2,
  },
];

const NETS: readonly RawCapture[] = [
  {
    black: ["B9", "C9", "A8", "A7"],
    white: ["B8"],
    target: "B8",
    solution: "C7",
    within: 3,
  },
  {
    black: ["E9", "F9", "D8", "D7"],
    white: ["E8"],
    target: "E8",
    solution: "F7",
    within: 3,
  },
  {
    black: ["J4", "J3", "G2", "H2"],
    white: ["H3", "E1"],
    target: "H3",
    solution: "G4",
    within: 3,
  },
  {
    black: ["A4", "A3", "B2", "C2"],
    white: ["B3"],
    target: "B3",
    solution: "C4",
    within: 3,
  },
  {
    black: ["D9", "E9", "E8", "E7"],
    white: ["D8", "E5"],
    target: "D8",
    solution: "C7",
    within: 4,
  },
  {
    black: ["C3", "C2", "C1", "D1"],
    white: ["D2"],
    target: "D2",
    solution: "E3",
    within: 4,
  },
  {
    black: ["G8", "H7"],
    white: ["H8", "J7", "J5"],
    target: "H8",
    solution: "H6",
    within: 4,
  },
  {
    black: ["D3", "D2", "D1", "E1"],
    white: ["A6", "E2"],
    target: "E2",
    solution: "F3",
    within: 4,
  },
];

const LADDERS: readonly RawCapture[] = [
  {
    black: ["D5", "B4", "D4"],
    white: ["C4"],
    target: "C4",
    solution: "C3",
    within: 5,
  },
  {
    black: ["F8", "F6", "G6"],
    white: ["F7"],
    target: "F7",
    solution: "E7",
    within: 5,
  },
  {
    black: ["E5", "F4", "F3"],
    white: ["G7", "F5", "E4"],
    target: "E4",
    solution: "D4",
    within: 6,
  },
  {
    black: ["F6", "G6", "E5"],
    white: ["B6", "J6", "F5"],
    target: "F5",
    solution: "F4",
    within: 6,
  },
  {
    black: ["F4", "D3", "E2"],
    white: ["E3", "J2"],
    target: "E3",
    solution: "E4",
    within: 5,
  },
];

/** 환격: 첫 수로 한 점을 내주고, 백이 따내면 같은 자리에 다시 두어 더 많이 되따낸다 */
const SNAPBACKS: readonly RawCapture[] = [
  {
    black: ["A7", "B7", "C8"],
    white: ["A8", "A9", "C9", "D9"],
    target: "A8",
    solution: "B9",
    within: 2,
  },
  {
    black: ["B3", "C2", "D1"],
    white: ["A3", "B2", "B1", "C1"],
    target: "B1",
    solution: "A2",
    within: 2,
  },
  {
    black: ["G2", "H3", "J4"],
    white: ["F1", "G1", "J1", "J2", "J3"],
    target: "J1",
    solution: "H1",
    within: 2,
  },
  {
    black: ["F3", "G2", "D1", "G1"],
    white: ["E3", "D2", "F2", "F1"],
    target: "F2",
    solution: "E2",
    within: 2,
  },
  {
    black: ["E9", "G7", "H9", "H8"],
    white: ["E8", "F7", "G9", "G8"],
    target: "G9",
    solution: "F8",
    within: 2,
  },
  {
    black: ["D4", "C3", "C5", "B3", "B6", "A3"],
    white: ["C4", "B4", "B5", "A6", "A7"],
    target: "C4",
    solution: "A5",
    within: 2,
  },
  {
    black: ["J7", "H7", "G7", "F8"],
    white: ["J8", "H8", "J9", "H9", "F9", "E9"],
    target: "J8",
    solution: "G9",
    within: 2,
  },
  {
    black: ["E4", "F5", "G2", "G5", "H3", "H4"],
    white: ["E3", "F2", "G3", "G4"],
    target: "G3",
    solution: "F3",
    within: 2,
  },
];

/** 패: 첫 수로 패를 따내며 단수. 백은 같은 판 모양 금지로 바로 되따낼 수 없다 */
const KOS: readonly RawCapture[] = [
  {
    black: ["A5", "B6", "B8"],
    white: ["A6", "B7", "A8"],
    target: "A8",
    solution: "A7",
    within: 2,
  },
  {
    black: ["D8", "C7", "B8"],
    white: ["D9", "C8", "B9"],
    target: "B9",
    solution: "C9",
    within: 2,
  },
  {
    black: ["F9", "G8", "H7"],
    white: ["G9", "H8", "J9"],
    target: "H8",
    solution: "H9",
    within: 2,
  },
  {
    black: ["E5", "F6", "G5", "G3", "H5", "H3"],
    white: ["E4", "F5", "F3", "G4"],
    target: "G4",
    solution: "F4",
    within: 2,
  },
  {
    black: ["E6", "E4", "D6", "D4", "C3", "B4"],
    white: ["D5", "C6", "C4", "B5"],
    target: "D5",
    solution: "C5",
    within: 2,
  },
  {
    black: ["F1", "H2", "H4", "J5"],
    white: ["G1", "H3", "J1", "J2", "J4"],
    target: "J1",
    solution: "J3",
    within: 2,
  },
  {
    black: ["A6", "B6", "C6", "B7", "D7", "D8", "C9"],
    white: ["A7", "C7", "B8", "C8", "A9"],
    target: "C7",
    solution: "A8",
    within: 2,
  },
  {
    black: ["D7", "C9", "C8", "C6", "B8", "B5"],
    white: ["C7", "B9", "B7", "B6", "A8", "A7"],
    target: "C7",
    solution: "A9",
    within: 2,
  },
];

/**
 * 긴 축: 판 끝까지 몰아 잡는다. 두 활로 가운데 한쪽 단수만 축이 된다(다른 쪽은 백이 넓은 쪽으로 뻗어 활로가 셋).
 * `within`은 백이 가장 오래 버틸 때 흑이 둘 수다
 */
const LONG_LADDERS: readonly RawCapture[] = [
  {
    black: ["B6", "B7", "D7"],
    white: ["C7"],
    target: "C7",
    solution: "C8",
    within: 12,
  },
  {
    black: ["G3", "G1", "F1"],
    white: ["G2"],
    target: "G2",
    solution: "H2",
    within: 12,
  },
  {
    black: ["D3", "C3", "C5"],
    white: ["C4"],
    target: "C4",
    solution: "B4",
    within: 11,
  },
  {
    black: ["F8", "G7", "G6"],
    white: ["F7"],
    target: "F7",
    solution: "E7",
    within: 11,
  },
  {
    black: ["F5", "F7", "E7"],
    white: ["F6"],
    target: "F6",
    solution: "G6",
    within: 10,
  },
];

/**
 * 축머리: 두 활로 어느 쪽 단수도 축이 되는 모양인데, 한쪽 길 끝에 백 돌(축머리)이 있다.
 * 그쪽으로 몰면 백이 축머리와 이어져 빠져나가니, 축머리를 피하는 쪽에서 몬다
 */
const BREAKERS: readonly RawCapture[] = [
  {
    black: ["C5", "D7", "E6"],
    white: ["D6", "G3"],
    target: "D6",
    breaker: "G3",
    solution: "D5",
    within: 6,
  },
  {
    black: ["C4", "D5", "E3"],
    white: ["D4", "C1"],
    target: "D4",
    breaker: "C1",
    solution: "D3",
    within: 10,
  },
  {
    black: ["D3", "C4", "E5"],
    white: ["D4", "G3"],
    target: "D4",
    breaker: "G3",
    solution: "E4",
    within: 7,
  },
  {
    black: ["C7", "E6", "D5"],
    white: ["D6", "A5"],
    target: "D6",
    breaker: "A5",
    solution: "C6",
    within: 6,
  },
  {
    black: ["E3", "G4", "F5"],
    white: ["F4", "G1"],
    target: "F4",
    breaker: "G1",
    solution: "F3",
    within: 10,
  },
];

/**
 * 팻감 쓰기: 백이 방금 `setup`으로 패를 따냈다. 흑이 `ko`에 바로 되따내면 같은 판 모양이 되어 둘 수 없다.
 * 흑은 다른 곳에서 백 두 점을 단수로 모는 팻감을 쓰고(판에 단수가 되는 수는 이것 하나), 백이 이어 받으면 되따낸다
 */
const KO_THREATS: readonly RawKoFight[] = [
  {
    black: ["D7", "C6", "D5", "E6", "H3", "H4"],
    white: ["E7", "F6", "E5", "J3", "J4", "H5", "J6"],
    setup: ["D6"],
    ko: "E6",
    target: "J3",
    solution: "J2",
    reply: "J5",
  },
  {
    black: ["G9", "F8", "E9", "B3", "B4"],
    white: ["D9", "E8", "A3", "A4", "B5", "A6"],
    setup: ["F9"],
    ko: "E9",
    target: "A3",
    solution: "A2",
    reply: "A5",
  },
  {
    black: ["D3", "C4", "D5", "E4", "H6", "H5"],
    white: ["E3", "F4", "E5", "J6", "J5", "H4", "J3"],
    setup: ["D4"],
    ko: "E4",
    target: "J6",
    solution: "J7",
    reply: "J4",
  },
  {
    black: ["J3", "H4", "J5", "E8", "F8"],
    white: ["J6", "H5", "E9", "F9", "G8", "H9"],
    setup: ["J4"],
    ko: "J5",
    target: "E9",
    solution: "D9",
    reply: "G9",
  },
  {
    black: ["G6", "F7", "E6", "F5", "D2", "E2"],
    white: ["G5", "F4", "E5", "D1", "E1", "F2", "G1"],
    setup: ["F6"],
    ko: "F5",
    target: "D1",
    solution: "C1",
    reply: "F1",
  },
  {
    black: ["A3", "B4", "A5", "F8", "E8"],
    white: ["A6", "B5", "F9", "E9", "D8", "C9"],
    setup: ["A4"],
    ko: "A5",
    target: "F9",
    solution: "G9",
    reply: "D9",
  },
];

/**
 * 팻감 받기: 흑이 `setup` 첫 수로 패를 따냈고, 백이 둘째 수로 흑 두 점을 단수로 모는 팻감을 썼다.
 * 노림받은 돌(두 점)이 패(한 점)보다 많으니 받는다. 살리는 수는 하나뿐이다
 */
const KO_ANSWERS: readonly RawKoFight[] = [
  {
    black: ["F7", "G6", "F5", "A4", "A5", "B6", "A7"],
    white: ["E7", "D6", "E5", "F6", "B4", "B5"],
    setup: ["E6", "A3"],
    ko: "F6",
    target: "A4",
    solution: "A6",
  },
  {
    black: ["C1", "D2", "J7", "J6", "H5", "J4"],
    white: ["F1", "E2", "D1", "H7", "H6"],
    setup: ["E1", "J8"],
    ko: "D1",
    target: "J7",
    solution: "J5",
  },
  {
    black: ["C4", "D3", "E4", "E9", "D9", "C8", "B9"],
    white: ["C5", "D6", "E5", "D4", "E8", "D8"],
    setup: ["D5", "F9"],
    ko: "D4",
    target: "E9",
    solution: "C9",
  },
  {
    black: ["J7", "H6", "D1", "E1", "F2", "G1"],
    white: ["J4", "H5", "J6", "D2", "E2"],
    setup: ["J5", "C1"],
    ko: "J6",
    target: "D1",
    solution: "F1",
  },
  {
    black: ["C6", "D7", "E6", "G1", "F1", "E2", "D1"],
    white: ["C5", "D4", "E5", "D6", "G2", "F2"],
    setup: ["D5", "H1"],
    ko: "D6",
    target: "G1",
    solution: "E1",
  },
  {
    black: ["G1", "F2", "A5", "A4", "B3", "A2"],
    white: ["D1", "E2", "F1", "B5", "B4"],
    setup: ["E1", "A6"],
    ko: "F1",
    target: "A5",
    solution: "A3",
  },
];

const LIVE: readonly RawLife[] = [
  {
    black: ["C9", "D9", "G9", "C8", "F8", "G8", "C7", "D7", "E7", "F7"],
    white: ["B9", "E9", "H9", "B8", "H8", "B7", "G7", "C6", "D6", "E6", "F6"],
    target: "D9",
    area: ["E9", "E8", "F9", "D8"],
    solution: "E8",
  },
  {
    black: ["A9", "D9", "A8", "C8", "D8", "A7", "B7", "C7"],
    white: ["E9", "E8", "D7", "A6", "B6", "C6"],
    target: "C8",
    area: ["C9", "B9", "B8"],
    solution: "B9",
  },
  {
    black: ["C9", "D9", "A8", "D8", "A7", "B7", "C7", "D7"],
    white: ["E9", "B8", "E8", "E7", "A6", "B6", "C6", "D6"],
    target: "C9",
    area: ["A9", "B9", "B8", "A8", "C8"],
    solution: "B9",
  },
  {
    black: ["C9", "C8", "A7", "C7", "A6", "B6", "C6"],
    white: ["B9", "D9", "D8", "B7", "D7", "D6", "A5", "B5", "C5"],
    target: "C9",
    area: ["A9", "B9", "B8", "B7", "A8"],
    solution: "B8",
  },
  {
    black: ["B9", "B8", "B7", "A6", "B6"],
    white: ["C9", "C8", "A7", "C7", "C6", "A5", "B5"],
    target: "B9",
    area: ["A9", "A8", "A7"],
    solution: "A8",
  },
  {
    black: ["D9", "G9", "D8", "F8", "G8", "D7", "E7", "F7"],
    white: ["C9", "F9", "H9", "C8", "H8", "C7", "G7", "D6", "E6", "F6"],
    target: "D9",
    area: ["E9", "F9", "E8"],
    solution: "E9",
  },
  {
    black: ["D9", "C8", "D8", "B7", "C7", "A6", "B6"],
    white: ["A9", "B9", "E9", "E8", "D7", "C6", "A5", "B5"],
    target: "C8",
    area: ["A9", "B9", "A8", "A7", "B8", "C9"],
    solution: "A8",
  },
  {
    black: ["A9", "B9", "D9", "E9", "A8", "E8", "A7", "B7", "C7", "D7", "E7"],
    white: ["F9", "B8", "F8", "F7", "A6", "B6", "C6", "D6", "E6"],
    target: "B9",
    area: ["C9", "D9", "C8", "D8", "B8"],
    solution: "C8",
  },
];

const KILL: readonly RawLife[] = [
  {
    black: ["C9", "C8", "C7", "C6", "A5", "B5"],
    white: ["B9", "B8", "B7", "A6", "B6"],
    target: "B9",
    area: ["A9", "A8", "A7"],
    solution: "A8",
  },
  {
    black: ["B9", "F9", "J9", "B8", "J8", "C7", "G7", "H7", "D6", "E6", "F6"],
    white: ["C9", "H9", "C8", "D8", "E8", "F8", "G8", "H8", "D7", "E7", "F7"],
    target: "C9",
    area: ["D9", "E9", "F9", "E8", "G9"],
    solution: "E9",
  },
  {
    black: ["B9", "G9", "B8", "G8", "C7", "G7", "D6", "E6", "F6"],
    white: ["C9", "F9", "C8", "D8", "F8", "D7", "E7", "F7"],
    target: "C9",
    area: ["D9", "E9", "E8"],
    solution: "E9",
  },
  {
    black: ["D9", "D8", "C7", "A6", "B6"],
    white: ["C9", "B8", "C8", "A7", "B7"],
    target: "B8",
    area: ["A9", "A8", "B9"],
    solution: "A9",
  },
  {
    black: ["B9", "E9", "E8", "E7", "A6", "B6", "C6", "D6"],
    white: ["D9", "B8", "D8", "A7", "B7", "C7", "D7"],
    target: "B8",
    area: ["A9", "B9", "C9", "C8", "A8"],
    solution: "C9",
  },
  {
    black: ["C9", "E9", "E8", "A7", "D7", "C6", "A5", "B5"],
    white: ["D9", "C8", "D8", "B7", "C7", "A6", "B6"],
    target: "B7",
    area: ["A9", "A8", "A7", "B8", "B9", "C9"],
    solution: "B8",
  },
  {
    black: [
      "B9",
      "G9",
      "B8",
      "E8",
      "G8",
      "B7",
      "D7",
      "G7",
      "B6",
      "F6",
      "C5",
      "D5",
      "E5",
    ],
    white: ["C9", "D9", "F9", "C8", "F8", "C7", "E7", "F7", "C6", "D6", "E6"],
    target: "D9",
    area: ["E9", "E8", "D8", "D7"],
    solution: "D8",
  },
  {
    black: ["D9", "D8", "A7", "D7", "D6", "A5", "B5", "C5"],
    white: ["C9", "C8", "B7", "C7", "A6", "B6", "C6"],
    target: "C9",
    area: ["A9", "A8", "B8", "A7", "B9", "B7"],
    solution: "A8",
  },
];

type RawShape = RawLife & { goal: "live" | "kill"; shape: LifeShape };

/**
 * 이름 있는 모양. 눈 자리(`area`)가 그 모양이고, 정답은 모양의 급소다.
 * 바깥 돌은 귀(A9·J9·A1·H1·F1 등)에 한 집씩 두 눈을 가진 한 무리라 그대로 산다
 */
const SHAPES: readonly RawShape[] = [
  // 직삼: 위 변 D9·E9·F9, 가운데 E9
  {
    goal: "live",
    shape: "straight-three",
    black: ["C9", "C8", "D8", "E8", "F8", "G8", "G9"],
    white: [
      "A8",
      "B9",
      "B8",
      "B7",
      "C7",
      "D7",
      "E7",
      "F7",
      "G7",
      "H7",
      "H8",
      "H9",
      "J8",
    ],
    target: "C9",
    area: ["D9", "E9", "F9"],
    solution: "E9",
  },
  // 직삼: 왼쪽 변 A6·A5·A4, 가운데 A5
  {
    goal: "kill",
    shape: "straight-three",
    black: [
      "B9",
      "A8",
      "B8",
      "C8",
      "C7",
      "C6",
      "C5",
      "C4",
      "C3",
      "C2",
      "B2",
      "A2",
      "B1",
    ],
    white: ["A7", "B7", "B6", "B5", "B4", "B3", "A3"],
    target: "A7",
    area: ["A6", "A5", "A4"],
    solution: "A5",
  },
  // 곡삼: D9·E9·E8, 꺾인 자리 E9
  {
    goal: "live",
    shape: "bent-three",
    black: ["C9", "C8", "D8", "D7", "E7", "F7", "F8", "F9"],
    white: [
      "B9",
      "A8",
      "B8",
      "B7",
      "C7",
      "C6",
      "D6",
      "E6",
      "F6",
      "G6",
      "G7",
      "G8",
      "G9",
      "H8",
      "J8",
      "J9",
    ],
    target: "C9",
    area: ["D9", "E9", "E8"],
    solution: "E9",
  },
  // 곡삼: 아래 변 D1·E1·E2, 꺾인 자리 E1
  {
    goal: "kill",
    shape: "bent-three",
    black: [
      "A2",
      "B1",
      "B2",
      "B3",
      "C3",
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "G3",
      "G2",
      "G1",
      "H2",
      "J2",
      "J1",
    ],
    white: ["C1", "C2", "D2", "D3", "E3", "F3", "F2", "F1"],
    target: "C1",
    area: ["D1", "E1", "E2"],
    solution: "E1",
  },
  // T자 네 집: D9·E9·F9·E8, 가운데 E9
  {
    goal: "live",
    shape: "pyramid-four",
    black: ["C9", "C8", "D8", "D7", "E7", "F7", "F8", "G8", "G9"],
    white: [
      "A8",
      "B9",
      "B8",
      "B7",
      "C7",
      "C6",
      "D6",
      "E6",
      "F6",
      "G6",
      "G7",
      "H7",
      "H8",
      "H9",
      "J8",
    ],
    target: "C9",
    area: ["D9", "E9", "F9", "E8"],
    solution: "E9",
  },
  // T자 네 집: 오른쪽 변 J5·J4·J3·H4, 가운데 J4
  {
    goal: "kill",
    shape: "pyramid-four",
    black: [
      "H9",
      "H8",
      "J8",
      "J7",
      "H7",
      "G7",
      "G6",
      "F6",
      "F5",
      "F4",
      "F3",
      "F2",
      "E2",
      "E1",
      "G2",
      "G1",
      "H1",
      "J1",
    ],
    white: ["J6", "H6", "H5", "G5", "G4", "G3", "H3", "H2", "J2"],
    target: "J6",
    area: ["J5", "J4", "J3", "H4"],
    solution: "J4",
  },
  // 오궁도화: 왼쪽 변 B6·A5·B5·C5·B4, 한가운데 B5
  {
    goal: "live",
    shape: "flower-five",
    black: [
      "A7",
      "A6",
      "B7",
      "C7",
      "C6",
      "D6",
      "D5",
      "D4",
      "C4",
      "C3",
      "B3",
      "A3",
      "A4",
    ],
    white: [
      "B9",
      "A8",
      "B8",
      "C8",
      "D8",
      "D7",
      "E7",
      "E6",
      "E5",
      "E4",
      "E3",
      "D3",
      "D2",
      "C2",
      "B2",
      "A2",
      "B1",
    ],
    target: "A7",
    area: ["B6", "A5", "B5", "C5", "B4"],
    solution: "B5",
  },
  // 오궁도화: E9·D8·E8·F8·E7, 한가운데 E8
  {
    goal: "kill",
    shape: "flower-five",
    black: [
      "A8",
      "B9",
      "B8",
      "B7",
      "B6",
      "C6",
      "C5",
      "D5",
      "E5",
      "F5",
      "G5",
      "G6",
      "H6",
      "H7",
      "H8",
      "H9",
      "J8",
    ],
    white: [
      "C9",
      "D9",
      "C8",
      "C7",
      "D7",
      "D6",
      "E6",
      "F6",
      "F7",
      "G7",
      "G8",
      "G9",
      "F9",
    ],
    target: "C9",
    area: ["E9", "D8", "E8", "F8", "E7"],
    solution: "E8",
  },
  // 뭉친 다섯 집: 네모 D9·E9·D8·E8에 F8, 세 집에 붙은 E8
  {
    goal: "kill",
    shape: "bulky-five",
    black: [
      "A8",
      "B9",
      "B8",
      "B7",
      "B6",
      "C6",
      "D6",
      "E6",
      "F6",
      "G6",
      "H6",
      "H7",
      "H8",
      "H9",
      "J8",
    ],
    white: ["C9", "C8", "C7", "D7", "E7", "F7", "G7", "G8", "G9", "F9"],
    target: "C9",
    area: ["D9", "E9", "D8", "E8", "F8"],
    solution: "E8",
  },
  // 매화육궁: E9·D8·E8·F8·E7·F7, 네 집에 붙은 E8
  {
    goal: "kill",
    shape: "rabbity-six",
    black: [
      "A8",
      "B9",
      "B8",
      "B7",
      "B6",
      "C6",
      "C5",
      "D5",
      "E5",
      "F5",
      "G5",
      "H5",
      "H6",
      "H7",
      "H8",
      "H9",
      "J8",
    ],
    white: [
      "C9",
      "D9",
      "C8",
      "C7",
      "D7",
      "D6",
      "E6",
      "F6",
      "G6",
      "G7",
      "G8",
      "G9",
      "F9",
    ],
    target: "C9",
    area: ["E9", "D8", "E8", "F8", "E7", "F7"],
    solution: "E8",
  },
];

const captureSet = (
  id: CaptureTheme,
  title: string,
  summary: string,
  raws: readonly RawCapture[],
): BadukPuzzleSet => ({
  id,
  title,
  summary,
  puzzles: raws.map((p, i) => ({
    id: `${id}-${i + 1}`,
    kind: "capture",
    theme: id,
    ...p,
  })),
});

const koFightSet = (
  mode: KoFightMode,
  title: string,
  summary: string,
  raws: readonly RawKoFight[],
): BadukPuzzleSet => ({
  id: mode === "threat" ? "ko-threat" : "ko-answer",
  title,
  summary,
  puzzles: raws.map((p, i) => ({
    id: `${mode === "threat" ? "ko-threat" : "ko-answer"}-${i + 1}`,
    kind: "kofight",
    mode,
    ...p,
  })),
});

const lifeSet = (
  goal: "live" | "kill",
  title: string,
  summary: string,
  raws: readonly RawLife[],
): BadukPuzzleSet => ({
  id: goal,
  title,
  summary,
  puzzles: raws.map((p, i) => ({
    id: `${goal}-${i + 1}`,
    kind: "life",
    goal,
    ...p,
  })),
});

const shapeSet = (
  title: string,
  summary: string,
  raws: readonly RawShape[],
): BadukPuzzleSet => ({
  id: "shapes",
  title,
  summary,
  puzzles: raws.map((p, i) => ({
    id: `shapes-${i + 1}`,
    kind: "life",
    ...p,
  })),
});

export const BADUK_PUZZLE_SETS: readonly BadukPuzzleSet[] = [
  captureSet(
    "atari",
    "단수 방향",
    "활로가 둘인 돌에 단수를 친다. 달아날 길을 막는 쪽에서 쳐야 따낸다.",
    ATARI,
  ),
  captureSet(
    "ladder",
    "축",
    "계속 단수를 치며 몰아 판 끝이나 내 돌에 부딪히게 해 따낸다.",
    LADDERS,
  ),
  captureSet(
    "net",
    "장문",
    "바로 단수 치지 않고 한 칸 떨어져 길을 막는다. 어느 쪽으로 나와도 잡힌다.",
    NETS,
  ),
  captureSet(
    "snapback",
    "환격(되따내기)",
    "일부러 한 점을 내준다. 백이 따내면 그 자리에 다시 두어 더 많은 백 돌을 되따낸다.",
    SNAPBACKS,
  ),
  captureSet(
    "ko",
    "패 따내기",
    "패를 따내며 단수를 친다. 백은 바로 되따낼 수 없어(같은 판 모양 금지) 달아날 틈이 없다.",
    KOS,
  ),
  lifeSet(
    "live",
    "두 눈 만들기",
    "눈이 둘이면 상대가 아무리 두어도 잡히지 않는다. 눈을 둘로 나누는 자리를 찾는다.",
    LIVE,
  ),
  lifeSet(
    "kill",
    "눈 빼앗기",
    "상대 눈 자리 한가운데(급소)에 두어 두 눈을 못 만들게 한다.",
    KILL,
  ),
  shapeSet(
    "이름 있는 모양",
    "직삼·곡삼·T자 네 집·오궁도화·매화육궁처럼 이름 있는 눈 모양은 급소 하나로 살고 죽는다. 급소를 먼저 차지한다.",
    SHAPES,
  ),
  koFightSet(
    "threat",
    "팻감 쓰기",
    "상대가 방금 패를 따내 바로 되따낼 수 없다. 다른 곳에 팻감을 두고, 상대가 받으면 그때 되따낸다.",
    KO_THREATS,
  ),
  koFightSet(
    "answer",
    "팻감 받기",
    "내가 패를 따냈더니 상대가 팻감을 썼다. 노리는 돌이 패보다 많으면 받는다.",
    KO_ANSWERS,
  ),
  captureSet(
    "long-ladder",
    "긴 축",
    "단수를 이어 쳐서 판 끝까지 몬다. 어느 쪽에서 단수를 쳐야 축이 되는지 고른다.",
    LONG_LADDERS,
  ),
  captureSet(
    "breaker",
    "축머리",
    "축이 가는 길에 상대 돌(축머리)이 있으면 축이 깨진다. 축머리가 없는 쪽으로 몬다.",
    BREAKERS,
  ),
];
