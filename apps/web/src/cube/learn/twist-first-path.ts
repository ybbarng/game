// 3×3 초보자(코너 방향 먼저) 「경우별 정해진 길」(docs/47 16-33). 예전 문방구 큐브(신광사)에 들어 있던 설명서의 해법이다.
// 설명서의 일곱 단계를 설명서 공식 그대로 맞춘다: 흰 십자(1단계) → 첫 층 코너(2단계) → 둘째 층 엣지(3단계) → 엣지 방향
// (4단계) → 엣지 위치(5단계) → 코너 방향(6단계) → 코너 위치(7단계). 1·2단계는 흰 면 위, 3단계부터 흰 면 아래로 쥔다.
// 공식은 설명서 그림의 화살표를 수마다 읽은 것이고, 읽기와 엔진 대조는 git 밖 비공개 메모(learn-review/shinkwangsa/
// transcription.md)에 있다. 경우 나누기와 쥐는 법은 설명서가 말한 대로 두고, 설명서가 말하지 않은 경우(가운데 층의 흰 엣지
// 블럭, 자리 밑에서 흰색이 앞인 코너 블럭, 둘째 층에 잘못 든 엣지 블럭, 위를 보는 노란색이 없는 코너 모양의 쥐기)만 설명서의
// 수로 채웠다.
// 단원 글(lessons-twist-first.ts)·경우 그림(beginner-cases.ts)·시험(twist-first-path.test.ts)이 이 자료를 함께 읽는다.
import { faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { play, reps } from "./beginner-path";
import type { GoalName } from "./types";

// ── 공식(설명서 그대로) ─────────────────────────────────

/** 흰 십자 기본도 1(1단계): 흰 엣지 블럭이 그 색 센터 바로 아래(아래-앞)이고 흰색이 아래 */
export const CROSS_DOWN = "F2";
/** 흰 십자 기본도 2(1단계): 아래-앞, 흰색이 앞. D로 비키고 R로 앞-오른쪽 자리에 올려 F'로 넣고 R'로 오른쪽 층을 되돌린다 */
export const CROSS_FRONT = "D R F' R'";
/** 흰 십자 기본도 3(1단계): 위 층에 잘못 든 흰 엣지 블럭을 오른쪽에 두고 아래 층으로 뺀다 */
export const CROSS_PULL = "R2 D R2";
/** 첫 층 코너(2단계): 코너 블럭이 자리 밑(아래-앞-오른쪽)이고 흰색이 오른쪽. R' D' R D와 같은 꼴 */
export const CORNER_IN = "F' R F R'";
/** 첫 층 코너 빼기 ①(2단계): 앞-오른쪽 위에 잘못 든 코너 블럭을 아래 층으로 뺀다 */
export const CORNER_PULL = "R' D' R";
/** 첫 층 코너 빼기 ②(2단계): 자리 밑에서 흰색이 아래인 코너 블럭을 흰색이 옆을 보게 다시 놓는다 */
export const CORNER_DOWN = "R' D2 R";
/** (설명서에 없음, 채움) 자리 밑에서 흰색이 앞인 코너 블럭: D2로 비키고 빼기 ① */
export const CORNER_FRONT = `D2 ${CORNER_PULL}`;
/** (설명서에 없음, 채움) 가운데 층의 흰 엣지 블럭: 앞-오른쪽에 두고 빼기 ①과 같은 수로 아래 층에 내린다 */
export const CROSS_MIDDLE = CORNER_PULL;

/** 둘째 층 A(3단계, 오른쪽으로 넣을 때): U R U' R'로 첫 층 코너 블럭을 위로 꺼내고, F R' F' R로 엣지 블럭과 함께 넣는다 */
export const SECOND_A = "U R U' R' F R' F' R";
/** 둘째 층 B(3단계, 왼쪽으로 넣을 때): A의 왼쪽과 오른쪽을 바꾼 꼴 */
export const SECOND_B = "U' L' U L F' L F L'";
/** 엣지 방향(4단계): R'로 준비하고 U' F' U F 덩어리를 친 뒤 R로 준비를 되돌린다 */
export const EDGE_FLIP = "R' U' F' U F R";
/** 엣지 위치(5단계): 뒤 엣지 블럭은 그대로, 앞 → 왼쪽 → 오른쪽 → 앞으로 셋을 돌린다 */
export const EDGE_CYCLE = "R' U' R U' R' U2 R";
/** 코너 방향(6단계): 첫 층 코너 돌리기 R' D' R D에서 D'·D 자리에 덩어리 F' L' F·F' L F */
export const CORNER_TURN = "R' F' L' F R F' L F";
/** 코너 위치 A(7단계 A): 앞-오른쪽 위는 그대로, 남은 셋을 위에서 보아 시계 방향으로 */
export const CORNER_A = "R U B L B' R' B L' B' R U' R'";
/** 코너 위치 B(7단계 B): 앞-왼쪽 위는 그대로, 남은 셋을 위에서 보아 반시계 방향으로. A의 왼쪽과 오른쪽을 바꾼 꼴 */
export const CORNER_B = "L' U' B' R' B L B' R B L' U L";

export { reps };

// ── 단계와 경우 ───────────────────────────────────────

export type TwistFirstStageId =
  | "cross"
  | "corners"
  | "second"
  | "eo"
  | "ep"
  | "twist"
  | "place";

export interface TwistFirstCase {
  id: string;
  /** 모양(눈으로 보는 것) */
  shape: string;
  /** 쥐는 법(공식 앞에 할 일) */
  hold: string;
  /** 칠 공식(없으면 쥐기만) */
  alg: string;
  times: number;
  /** 이 공식 뒤 넘어가는 경우(여럿이면 그 가운데 하나, 없으면 그 단계가 끝남) */
  next?: readonly string[];
}

export interface TwistFirstStage {
  id: TwistFirstStageId;
  title: string;
  /** 이 단계가 끝난 모양 */
  goal: GoalName;
  cases: TwistFirstCase[];
}

export const TWIST_FIRST_STAGES: TwistFirstStage[] = [
  {
    id: "cross",
    title: "흰 십자",
    goal: "white-cross",
    cases: [
      {
        id: "down",
        shape: "아래 층, 흰색이 아래",
        hold: "짝 색 센터를 앞으로 돌려 쥐고(y), 아랫면을 돌려 엣지 블럭을 아래-앞으로",
        alg: CROSS_DOWN,
        times: 1,
      },
      {
        id: "front",
        shape: "아래 층, 흰색이 옆",
        hold: "짝 색 센터를 앞으로 돌려 쥐고(y), 아랫면을 돌려 엣지 블럭을 아래-앞으로",
        alg: CROSS_FRONT,
        times: 1,
      },
      {
        id: "middle",
        shape: "가운데 층(설명서에 없음, 채움)",
        hold: "엣지 블럭이 앞-오른쪽에 오게 돌려 쥐고(y)",
        alg: CROSS_MIDDLE,
        times: 1,
        next: ["down", "front"],
      },
      {
        id: "top",
        shape: "위 층에 잘못 들어감(다른 자리나 뒤집힘)",
        hold: "엣지 블럭이 위-오른쪽에 오게 돌려 쥐고(y)",
        alg: CROSS_PULL,
        times: 1,
        next: ["down", "front"],
      },
    ],
  },
  {
    id: "corners",
    title: "첫 층 코너",
    goal: "first-layer",
    cases: [
      {
        id: "right",
        shape: "자리 밑, 흰색이 오른쪽",
        hold: "넣을 자리를 앞-오른쪽 위로 돌려 쥐고(y), 아랫면을 돌려 코너 블럭을 자리 밑으로",
        alg: CORNER_IN,
        times: 1,
      },
      {
        id: "down",
        shape: "자리 밑, 흰색이 아래",
        hold: "넣을 자리를 앞-오른쪽 위로 돌려 쥐고(y), 아랫면을 돌려 코너 블럭을 자리 밑으로",
        alg: CORNER_DOWN,
        times: 1,
        next: ["right"],
      },
      {
        id: "front",
        shape: "자리 밑, 흰색이 앞(설명서에 없음, 채움)",
        hold: "넣을 자리를 앞-오른쪽 위로 돌려 쥐고(y), 아랫면을 돌려 코너 블럭을 자리 밑으로",
        alg: CORNER_FRONT,
        times: 1,
        next: ["right"],
      },
      {
        id: "slot",
        shape: "위 층에 잘못 들어감(다른 자리나 돌아감)",
        hold: "그 코너 블럭이 앞-오른쪽 위에 오게 돌려 쥐고(y)",
        alg: CORNER_PULL,
        times: 1,
        next: ["right", "down", "front"],
      },
    ],
  },
  {
    id: "second",
    title: "둘째 층 엣지",
    goal: "second-layer",
    cases: [
      {
        id: "right",
        shape: "위 층 엣지 블럭, 위 색이 오른쪽 센터 색",
        hold: "윗면을 돌려 엣지 블럭을 옆 색과 같은 색 센터 위로, 그 면을 앞으로 쥐고(y)",
        alg: SECOND_A,
        times: 1,
      },
      {
        id: "left",
        shape: "위 층 엣지 블럭, 위 색이 왼쪽 센터 색",
        hold: "윗면을 돌려 엣지 블럭을 옆 색과 같은 색 센터 위로, 그 면을 앞으로 쥐고(y)",
        alg: SECOND_B,
        times: 1,
      },
      {
        id: "stuck",
        shape: "위에 넣을 엣지가 없음(가운데 층에 잘못 들어감)",
        hold: "잘못 든 자리를 앞-오른쪽으로 돌려 쥐고(y)",
        alg: SECOND_A,
        times: 1,
        next: ["right", "left"],
      },
    ],
  },
  {
    id: "eo",
    title: "엣지 방향",
    goal: "yellow-cross",
    cases: [
      {
        id: "base",
        shape: "기본형: 위를 보는 노란 엣지 둘이 꺾여 이어짐(ㄱ자)",
        hold: "윗면을 돌려 노란 엣지 둘을 뒤와 왼쪽으로",
        alg: EDGE_FLIP,
        times: 1,
      },
      {
        id: "line",
        shape: "A: 위를 보는 노란 엣지 둘이 한 줄",
        hold: "윗면을 돌려 줄을 앞뒤로(세로)",
        alg: EDGE_FLIP,
        times: 1,
        next: ["base"],
      },
      {
        id: "dot",
        shape: "B: 위를 보는 노란 엣지 없음",
        hold: "그대로",
        alg: EDGE_FLIP,
        times: 1,
        next: ["line"],
      },
    ],
  },
  {
    id: "ep",
    title: "엣지 위치",
    goal: "yellow-edges",
    cases: [
      {
        id: "align",
        shape: "윗면을 돌리면 넷 다 제자리",
        hold: "윗면을 반시계 방향(U')으로 돌려 넷을 맞춤",
        alg: "",
        times: 0,
      },
      {
        id: "adjacent",
        shape: "윗면을 돌려 맞춘 둘이 이웃",
        hold: "윗면을 반시계 방향(U')으로 한 칸 더 돌려 하나만 맞게 하고, 맞은 것을 뒤로 돌려 쥐고(y)",
        alg: EDGE_CYCLE,
        times: 1,
      },
      {
        id: "opposite",
        shape: "윗면을 돌려 맞춘 둘이 마주 봄",
        hold: "그대로",
        alg: EDGE_CYCLE,
        times: 1,
        next: ["adjacent"],
      },
    ],
  },
  {
    id: "twist",
    title: "코너 방향",
    goal: "oll",
    cases: [
      {
        id: "base",
        shape:
          "기본형: 위를 보는 노란색이 앞-오른쪽·뒤-왼쪽 위 대각선, 앞-왼쪽 위 노란색은 왼쪽, 뒤-오른쪽 위 노란색은 뒤",
        hold: "그림처럼 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
      },
      {
        id: "a",
        shape: "a: 위를 보는 노란색이 왼쪽 둘, 오른쪽 둘은 노란색이 앞과 뒤",
        hold: "위를 보는 둘을 왼쪽에 두고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["base"],
      },
      {
        id: "b",
        shape: "b: 위를 보는 노란색이 오른쪽 둘, 왼쪽 둘은 노란색이 모두 왼쪽",
        hold: "위를 보는 둘을 오른쪽에 두고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["base"],
      },
      {
        id: "c",
        shape:
          "c: 위를 보는 노란색 하나, 그것을 뒤-왼쪽 위에 두면 앞-왼쪽 위 노란색이 앞",
        hold: "위를 보는 블럭을 뒤-왼쪽 위에 두고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["base"],
      },
      {
        id: "d",
        shape:
          "d: 위를 보는 노란색 하나, 그것을 앞-오른쪽 위에 두면 앞-왼쪽 위 노란색이 왼쪽",
        hold: "위를 보는 블럭을 앞-오른쪽 위에 두고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["base"],
      },
      {
        id: "cross",
        shape: "하나도 없음, 노란색이 마주 보는 두 옆면에 둘씩",
        hold: "노란색 둘씩이 앞과 뒤를 보게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["d"],
      },
      {
        id: "bar",
        shape: "하나도 없음, 노란색 둘인 옆면이 하나",
        hold: "노란색 둘인 옆면을 왼쪽에 두고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["b"],
      },
    ],
  },
  {
    id: "place",
    title: "코너 위치",
    goal: "solved",
    cases: [
      {
        id: "a",
        shape:
          "제자리 코너 블럭 하나, 그 블럭을 앞-오른쪽 위에 두면 남은 셋을 시계 방향으로",
        hold: "제자리 코너 블럭이 앞-오른쪽 위에 오게 돌려 쥐고(y)",
        alg: CORNER_A,
        times: 1,
      },
      {
        id: "b",
        shape:
          "제자리 코너 블럭 하나, 그 블럭을 앞-오른쪽 위에 두면 남은 셋을 반시계 방향으로",
        hold: "제자리 코너 블럭이 앞-왼쪽 위에 오게 돌려 쥐고(y)",
        alg: CORNER_B,
        times: 1,
      },
      {
        id: "none",
        shape: "제자리 코너 블럭 없음",
        hold: "그대로",
        alg: CORNER_A,
        times: 1,
        next: ["a", "b"],
      },
    ],
  },
];

export function twistFirstStage(id: TwistFirstStageId): TwistFirstStage {
  return TWIST_FIRST_STAGES.find((s) => s.id === id) as TwistFirstStage;
}

export function twistFirstCase(
  stage: TwistFirstStageId,
  id: string,
): TwistFirstCase {
  const c = twistFirstStage(stage).cases.find((x) => x.id === id);
  if (!c) throw new Error(`경우 없음: ${stage} ${id}`);
  return c;
}

// ── 모양 읽기(노란 면 위·흰 면 아래로 쥔 3×3) ───────────

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];
const YELLOW = 3;
const faceOf = (i: number) => FACES[Math.floor(i / 9)] as Face;

// 스티커 번호(면 U R F D L B 차례, 면마다 9칸). beginner-path.ts와 같은 자리
const EDGE_SLOTS: readonly (readonly number[])[] = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];
// 위 층 코너 자리의 스티커 번호(윗면 칸부터 위에서 보아 시계 방향)
const UFR = [8, 9, 20] as const;
const UFL = [6, 18, 38] as const;
const UBL = [0, 36, 47] as const;
const UBR = [2, 45, 11] as const;
const TOP_CORNERS = [UFR, UFL, UBL, UBR] as const;
const center = (col: Uint8Array, f: Face) =>
  col[FACES.indexOf(f) * 9 + 4] as number;
const centerOf = (col: Uint8Array, color: number) =>
  FACES.find((f) => center(col, f) === color) as Face;

/** 코너 자리의 노란 스티커가 보는 면 */
function yellowAt(col: Uint8Array, slot: readonly number[]): Face {
  const i = slot.find((x) => col[x] === YELLOW);
  if (i === undefined) throw new Error("노란 코너가 위 층에 없다");
  return faceOf(i);
}

/** 위 층 코너 자리 넷의 노란 스티커가 보는 면(앞-오른쪽, 앞-왼쪽, 뒤-왼쪽, 뒤-오른쪽 위) */
export function cornerYellows(s: PuzzleState): Face[] {
  const col = faceColors(3, s);
  return TOP_CORNERS.map((c) => yellowAt(col, c));
}

/** 위 층 엣지 자리(뒤, 왼쪽, 오른쪽, 앞) 가운데 노란 스티커가 위를 보는 쪽 */
export function edgesUp(s: PuzzleState): Face[] {
  const col = faceColors(3, s);
  const at: [Face, number][] = [
    ["B", 1],
    ["L", 3],
    ["R", 5],
    ["F", 7],
  ];
  return at.filter(([, i]) => col[i] === YELLOW).map(([f]) => f);
}

const EDGE_SIDE: [Face, number][] = [
  ["F", 19],
  ["R", 10],
  ["B", 46],
  ["L", 37],
];

/** 위 층 엣지 블럭 가운데 옆 색이 그 면 센터와 같은(제자리) 쪽 */
export function edgesMatched(s: PuzzleState): Face[] {
  const col = faceColors(3, s);
  return EDGE_SIDE.filter(([f, i]) => col[i] === center(col, f)).map(
    ([f]) => f,
  );
}

/** 위 층 코너 블럭이 제자리(세 색과 같은 색 센터 셋이 만나는 구석)인 자리: 0 앞-오른쪽, 1 앞-왼쪽, 2 뒤-왼쪽, 3 뒤-오른쪽 */
export function placedCorners(s: PuzzleState): number[] {
  const col = faceColors(3, s);
  return [0, 1, 2, 3].filter((k) => {
    const slot = TOP_CORNERS[k] as readonly number[];
    const got = slot
      .map((i) => col[i] as number)
      .sort()
      .join();
    const want = slot
      .map((i) => center(col, faceOf(i)))
      .sort()
      .join();
    return got === want;
  });
}

/** 위 층 코너 블럭 하나가 가야 할 자리(0~3, placedCorners와 같은 번호) */
function homeOf(s: PuzzleState, slotIndex: number): number {
  const col = faceColors(3, s);
  const colors = new Set(
    (TOP_CORNERS[slotIndex] as readonly number[]).map((i) => col[i]),
  );
  return [0, 1, 2, 3].findIndex((k) =>
    (TOP_CORNERS[k] as readonly number[]).every((i) =>
      colors.has(center(col, faceOf(i))),
    ),
  );
}

/** 둘째 층 엣지 블럭(노란색이 없는 엣지)의 자리: 색마다 그 스티커가 보는 면 */
function middleEdges(s: PuzzleState) {
  const col = faceColors(3, s);
  return EDGE_SLOTS.filter((slot) => slot.every((i) => col[i] !== YELLOW))
    .filter((slot) => slot.every((i) => col[i] !== 0))
    .map((slot) =>
      slot.map((i) => ({ color: col[i] as number, face: faceOf(i) })),
    );
}

// ── 단계마다 다음 한 걸음 ─────────────────────────────

export interface TwistFirstStep {
  stage: TwistFirstStageId;
  caseId: string;
  /** 쥐는 수(y·U, 없으면 "") */
  hold: string;
  /** 칠 수(공식 × 횟수, 없으면 "") */
  alg: string;
}

const Y4 = ["", "y", "y'", "y2"];
const U4 = ["", "U", "U'", "U2"];
/** 윗면을 반시계 방향으로 한 칸씩 돌려 가며 볼 때의 차례(설명서 5단계) */
const U_BACK = ["", "U'", "U2", "U"];
const join = (...xs: string[]) => xs.filter(Boolean).join(" ");

function firstTurn(
  s: PuzzleState,
  turns: readonly string[],
  ok: (t: PuzzleState) => boolean,
): string {
  const t = turns.find((x) => ok(play(s, x)));
  if (t === undefined) throw new Error("쥘 방향을 찾지 못했다");
  return t;
}

function step(
  stage: TwistFirstStageId,
  caseId: string,
  hold: string,
): TwistFirstStep {
  const c = twistFirstCase(stage, caseId);
  return { stage, caseId, hold, alg: reps(c.alg, c.times) };
}

/** 둘째 층 엣지 블럭이 제자리·바른 방향인지 */
const edgeOk = (s: PuzzleState, colors: number[]) => {
  const col = faceColors(3, s);
  const e = middleEdges(s).find((m) =>
    m.every((x) => colors.includes(x.color)),
  );
  return !!e && e.every((x) => centerOf(col, x.color) === x.face);
};
const MIDDLE_COLORS = [
  [2, 1],
  [1, 5],
  [5, 4],
  [4, 2],
];
const edgeOf = (s: PuzzleState, colors: number[]) =>
  middleEdges(s).find((m) => m.every((x) => colors.includes(x.color))) as {
    color: number;
    face: Face;
  }[];

function secondNext(s: PuzzleState): TwistFirstStep | null {
  const todo = MIDDLE_COLORS.filter((p) => !edgeOk(s, p));
  if (todo.length === 0) return null;
  const top = todo.filter((p) => edgeOf(s, p).some((x) => x.face === "U"));
  if (top.length > 0) {
    const p = top[0] as number[];
    const e = edgeOf(s, p);
    const side = (e.find((x) => x.face !== "U") as { color: number }).color;
    const up = (e.find((x) => x.face === "U") as { color: number }).color;
    // 설명서: 들어갈 조각을 들어갈 자리 옆에 색을 맞춰 돌려놓은 뒤, 오른쪽으로 넣으면 A, 왼쪽으로 넣으면 B
    const u = firstTurn(s, U4, (t) => {
      const col = faceColors(3, t);
      const m = edgeOf(t, p).find((x) => x.color === side);
      return !!m && m.face === centerOf(col, side);
    });
    const y = firstTurn(
      play(s, u),
      Y4,
      (t) => centerOf(faceColors(3, t), side) === "F",
    );
    const right = centerOf(faceColors(3, play(s, join(u, y))), up) === "R";
    return step("second", right ? "right" : "left", join(u, y));
  }
  const p = todo[0] as number[];
  const y = firstTurn(s, Y4, (t) => {
    const faces = new Set(edgeOf(t, p).map((x) => x.face));
    return faces.has("F") && faces.has("R");
  });
  return step("second", "stuck", y);
}

// ── 1·2단계(흰 면 위) ─────────────────────────────────

const WHITE = 0;
const SIDE_COLORS = [2, 1, 5, 4];
const WHITE_CORNERS = [
  [WHITE, 2, 1],
  [WHITE, 1, 5],
  [WHITE, 5, 4],
  [WHITE, 4, 2],
];
const CORNER_SLOTS: readonly (readonly number[])[] = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];
const D4 = ["", "D", "D'", "D2"];

/** 조각(색 묶음)이 든 자리: 색마다 그 스티커가 보는 면 */
function pieceAt(s: PuzzleState, colors: readonly number[]): Map<number, Face> {
  const col = faceColors(3, s);
  const want = [...colors].sort().join();
  const slots = colors.length === 2 ? EDGE_SLOTS : CORNER_SLOTS;
  for (const slot of slots) {
    const got = slot.map((i) => col[i] as number);
    if ([...got].sort().join() !== want) continue;
    return new Map(slot.map((i, k) => [got[k] as number, faceOf(i)]));
  }
  throw new Error(`조각 없음: ${colors.join()}`);
}
const facesOfPiece = (s: PuzzleState, colors: readonly number[]) =>
  new Set(pieceAt(s, colors).values());
const sameFaces = (got: Set<Face>, want: Face[]) =>
  got.size === want.length && want.every((f) => got.has(f));
/** 조각이 제자리·바른 방향(스티커마다 같은 색 센터 면을 봄) */
const pieceHome = (s: PuzzleState, colors: readonly number[]) => {
  const col = faceColors(3, s);
  return [...pieceAt(s, colors)].every(([c, f]) => centerOf(col, c) === f);
};

function crossNext(s: PuzzleState): TwistFirstStep | null {
  const todo = SIDE_COLORS.filter((c) => !pieceHome(s, [WHITE, c]));
  if (todo.length === 0) return null;
  // 아래 층 블럭부터: 짝 색 센터를 앞으로 쥐고 아랫면을 돌려 바로 아래(아래-앞)로 데려온다(설명서 「같은 색이 되도록」)
  const low = todo.filter((c) => facesOfPiece(s, [WHITE, c]).has("D"));
  if (low.length > 0) {
    const c = low[0] as number;
    const y = firstTurn(s, Y4, (t) => centerOf(faceColors(3, t), c) === "F");
    const d = firstTurn(play(s, y), D4, (t) =>
      sameFaces(facesOfPiece(t, [WHITE, c]), ["D", "F"]),
    );
    const white = pieceAt(play(s, join(y, d)), [WHITE, c]).get(WHITE);
    return step("cross", white === "D" ? "down" : "front", join(y, d));
  }
  const mid = todo.filter((c) => !facesOfPiece(s, [WHITE, c]).has("U"));
  if (mid.length > 0) {
    const c = mid[0] as number;
    const y = firstTurn(s, Y4, (t) =>
      sameFaces(facesOfPiece(t, [WHITE, c]), ["F", "R"]),
    );
    return step("cross", "middle", y);
  }
  const c = todo[0] as number;
  const y = firstTurn(s, Y4, (t) =>
    sameFaces(facesOfPiece(t, [WHITE, c]), ["U", "R"]),
  );
  return step("cross", "top", y);
}

function cornersNext(s: PuzzleState): TwistFirstStep | null {
  const todo = WHITE_CORNERS.filter((cc) => !pieceHome(s, cc));
  if (todo.length === 0) return null;
  // 아래 층 코너 블럭부터: 넣을 자리를 앞-오른쪽 위로 쥐고, 아랫면을 돌려 자리 밑으로
  const low = todo.filter((cc) => facesOfPiece(s, cc).has("D"));
  if (low.length > 0) {
    const cc = low[0] as number[];
    const y = firstTurn(s, Y4, (t) => {
      const col = faceColors(3, t);
      return sameFaces(
        new Set([
          centerOf(col, cc[1] as number),
          centerOf(col, cc[2] as number),
        ]),
        ["F", "R"],
      );
    });
    const d = firstTurn(play(s, y), D4, (t) =>
      sameFaces(facesOfPiece(t, cc), ["D", "F", "R"]),
    );
    const white = pieceAt(play(s, join(y, d)), cc).get(WHITE);
    const id = white === "R" ? "right" : white === "F" ? "front" : "down";
    return step("corners", id, join(y, d));
  }
  const cc = todo[0] as number[];
  const y = firstTurn(s, Y4, (t) =>
    sameFaces(facesOfPiece(t, cc), ["U", "F", "R"]),
  );
  return step("corners", "slot", y);
}

const hasUp = (t: PuzzleState, a: Face, b: Face) => {
  const x = edgesUp(t);
  return x.length === 2 && x.includes(a) && x.includes(b);
};

function eoNext(s: PuzzleState): TwistFirstStep | null {
  const up = edgesUp(s);
  if (up.length === 4) return null;
  if (up.length === 0) return step("eo", "dot", "");
  const line =
    (up.includes("L") && up.includes("R")) ||
    (up.includes("F") && up.includes("B"));
  if (line)
    return step(
      "eo",
      "line",
      firstTurn(s, U4, (t) => hasUp(t, "F", "B")),
    );
  return step(
    "eo",
    "base",
    firstTurn(s, U4, (t) => hasUp(t, "B", "L")),
  );
}

const isOpposite = (m: Face[]) =>
  m.length === 2 &&
  ((m.includes("F") && m.includes("B")) ||
    (m.includes("L") && m.includes("R")));

function epNext(s: PuzzleState): TwistFirstStep | null {
  if (edgesMatched(s).length === 4) return null;
  // 윗면을 반시계 방향으로 한 칸씩 돌려 둘 이상 맞는 곳에서 멈춘다(그런 곳이 꼭 있다)
  const u = U_BACK.find((x) => edgesMatched(play(s, x)).length >= 2);
  if (u === undefined) throw new Error("맞은 엣지 둘이 있는 자리가 없다");
  const t = play(s, u);
  const m = edgesMatched(t);
  if (m.length === 4) return step("ep", "align", u);
  if (isOpposite(m)) return step("ep", "opposite", u);
  // 이웃한 둘: 반시계로 한 칸 더 돌리면 하나만 맞는다(돌리기 둘은 한 수로 합친다). 맞은 것을 뒤로 돌려 쥔다
  const u2 = U_BACK[(U_BACK.indexOf(u) + 1) % 4] as string;
  const y = firstTurn(play(s, u2), Y4, (x) => {
    const mm = edgesMatched(x);
    return mm.length === 1 && mm[0] === "B";
  });
  return step("ep", "adjacent", join(u2, y));
}

/** 쥔 모양이 그 경우의 쥐기에 맞는지(노란색이 보는 면: 앞-오른쪽, 앞-왼쪽, 뒤-왼쪽, 뒤-오른쪽 위) */
const HELD: Record<string, (y: Face[]) => boolean> = {
  base: (y) => y.join("") === "ULUB",
  a: (y) => y.join("") === "FUUB",
  b: (y) => y.join("") === "ULLU",
  c: (y) => y.join("") === "RFUB",
  d: (y) => y.join("") === "ULBR",
  cross: (y) => y.join("") === "FFBB",
  bar: (y) => y.join("") === "FLLB",
};

function twistNext(s: PuzzleState): TwistFirstStep | null {
  const ys = cornerYellows(s);
  if (ys.every((f) => f === "U")) return null;
  for (const c of twistFirstStage("twist").cases) {
    const ok = HELD[c.id] as (y: Face[]) => boolean;
    const y = Y4.find((t) => ok(cornerYellows(play(s, t))));
    if (y !== undefined) return step("twist", c.id, y);
  }
  throw new Error(`코너 방향 모양을 모른다: ${ys.join("")}`);
}

function placeNext(s: PuzzleState): TwistFirstStep | null {
  const placed = placedCorners(s);
  if (placed.length === 4) return null;
  if (placed.length === 0) return step("place", "none", "");
  if (placed.length !== 1)
    throw new Error(`제자리 코너가 ${placed.length}개다`);
  // 제자리 블럭을 앞-오른쪽 위에 두고, 앞-왼쪽 위 블럭이 시계 방향으로 한 칸(뒤-왼쪽 위)에 가야 하면 A
  const y = firstTurn(s, Y4, (t) => placedCorners(t).includes(0));
  const home = homeOf(play(s, y), 1);
  if (home === 2) return step("place", "a", y);
  // 반시계: 제자리 블럭을 앞-왼쪽 위로
  return step(
    "place",
    "b",
    firstTurn(s, Y4, (t) => placedCorners(t).includes(1)),
  );
}

const NEXT: Record<
  TwistFirstStageId,
  (s: PuzzleState) => TwistFirstStep | null
> = {
  cross: crossNext,
  corners: cornersNext,
  second: secondNext,
  eo: eoNext,
  ep: epNext,
  twist: twistNext,
  place: placeNext,
};

/** 지금 모양에서 그 단계의 다음 한 걸음(끝났으면 null). 흰 면 아래로 쥔 3×3 */
export function nextTwistFirstStep(
  stage: TwistFirstStageId,
  s: PuzzleState,
): TwistFirstStep | null {
  return NEXT[stage](s);
}

// ── 쥐는 기준 조각 ────────────────────────────────────

/** 면 글자들이 만나는 자리의 스티커 번호(엣지·코너) */
function slotByFaces(faces: string): readonly number[] {
  const want = [...faces].sort().join("");
  const slot = [...EDGE_SLOTS, ...CORNER_SLOTS].find(
    (sl) =>
      sl
        .map((i) => faceOf(i))
        .sort()
        .join("") === want,
  );
  if (!slot) throw new Error(`자리 없음: ${faces}`);
  return slot;
}
const colorsAt = (s: PuzzleState, faces: string) => {
  const col = faceColors(3, s);
  return slotByFaces(faces).map((i) => col[i] as number);
};
/** 색 묶음의 조각이 지금 든 자리 이름(면 글자) */
const placeOf = (s: PuzzleState, colors: readonly number[]) =>
  [...pieceAt(s, colors).values()].join("");

/** 쥔 모습에서 기준으로 보는 자리(면 글자)와 함께 보일 센터 색(조각의 색 가운데 흰색·노란색 말고) */
const GRIP_AT: Record<string, { places: string[]; centers?: boolean }> = {
  "cross/down": { places: ["DF"], centers: true },
  "cross/front": { places: ["DF"], centers: true },
  "cross/middle": { places: ["FR"], centers: true },
  "cross/top": { places: ["UR"], centers: true },
  "corners/right": { places: ["DFR"], centers: true },
  "corners/front": { places: ["DFR"], centers: true },
  "corners/down": { places: ["DFR"], centers: true },
  "corners/slot": { places: ["UFR"], centers: true },
  "second/right": { places: ["UF"], centers: true },
  "second/left": { places: ["UF"], centers: true },
  "second/stuck": { places: ["FR"] },
  "eo/base": { places: ["UB", "UL"] },
  "eo/line": { places: ["UF", "UB"] },
  "ep/adjacent": { places: ["UB"] },
  "twist/bar": { places: ["UFL", "UBL"] },
  "place/a": { places: ["UFR", "UFL", "UBL"] },
  "place/b": { places: ["UFL", "UFR", "UBR"] },
};

/**
 * 그 단계 다음 한 걸음에서 쥐는 기준이 되는 조각이 지금(쥐기 전) 든 자리 이름(2026-11-27 사용자 「잡는 기준은 그림에서
 * 강조」). 흰 십자는 올릴 엣지 블럭과 짝 색 센터, 첫 층 코너는 코너 블럭과 넣을 자리를 알려 주는 옆 센터 둘, 둘째 층은
 * 넣을 엣지 블럭과 위 색·옆 색 센터, 엣지 방향은 ㄱ자·일자 두 엣지, 엣지 위치는 뒤에 둘(마주 보면 맞은 둘) 엣지,
 * 코너 방향은 노란색이 위를 보는 코너(둘인 옆면 모양은 그 둘), 코너 위치는 제자리 코너와 헤드라이트 둘. 없으면 빈 목록
 */
export function gripPieces(stage: TwistFirstStageId, s: PuzzleState): string[] {
  const st = NEXT[stage](s);
  if (!st) return [];
  const held = play(s, st.hold);
  const key = `${stage}/${st.caseId}`;
  let places = GRIP_AT[key]?.places ?? [];
  if (key === "ep/opposite") {
    const m = edgesMatched(held);
    places = m.map((f) => `U${f}`);
  }
  if (stage === "twist" && st.caseId !== "bar" && st.caseId !== "cross") {
    const ys = cornerYellows(held);
    places = ["UFR", "UFL", "UBL", "UBR"].filter((_, k) => ys[k] === "U");
  }
  const col = faceColors(3, s);
  const out: string[] = [];
  for (const p of places) {
    const colors = colorsAt(held, p);
    out.push(placeOf(s, colors));
    if (GRIP_AT[key]?.centers)
      for (const c of colors)
        if (c !== WHITE && c !== YELLOW) out.push(centerOf(col, c));
  }
  return out;
}

export interface TwistFirstRun {
  state: PuzzleState;
  steps: TwistFirstStep[];
}

/** 그 단계를 규칙대로 끝까지(걸음 수 상한을 넘으면 던진다) */
export function runTwistFirstStage(
  stage: TwistFirstStageId,
  s: PuzzleState,
  limit = 14,
): TwistFirstRun {
  const steps: TwistFirstStep[] = [];
  let state = s;
  for (;;) {
    const st = nextTwistFirstStep(stage, state);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > limit) throw new Error(`${stage} 단계가 끝나지 않는다`);
    state = play(state, join(st.hold, st.alg));
  }
}

/** 한 걸음을 수 하나의 문자열로 */
export const twistFirstMoves = (st: TwistFirstStep) => join(st.hold, st.alg);

/** 이 단계 앞에서 흰 면을 아래로 뒤집는다(설명서 2단계 끝 「맞춘 면을 밑으로 넣고」) */
export const TWIST_FIRST_FLIP_BEFORE: TwistFirstStageId = "second";

/** 일곱 단계 차례. 흰 십자·첫 층 코너는 흰 면 위, 둘째 층 엣지 앞에서 흰 면을 아래로 뒤집는다(z2, `TWIST_FIRST_FLIP_BEFORE`) */
export const TWIST_FIRST_ORDER: TwistFirstStageId[] = [
  "cross",
  "corners",
  "second",
  "eo",
  "ep",
  "twist",
  "place",
];
