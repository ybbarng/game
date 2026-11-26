// 3×3 초보자(코너 방향 먼저)의 마지막 층 「경우별 정해진 길」(docs/47 16-33). 노란 십자까지는 3×3 처음 맞추기와
// 같고(beginner-path.ts), 그 뒤를 노란 면 → 코너 자리 → 엣지 자리 차례로 맞춘다(Sarah Strong 「My Beginner Method」,
// Rubik's 공식 풀이 안내와 같은 차례). 단계마다 지금 모양을 보고 경우 하나를 고르고, 그 경우의 쥐는 수와 공식·횟수를
// 낸다. 「될 때까지」가 없다: 경우마다 정해진 수를 치면 그 단계가 끝나거나 다른 경우 하나로 넘어간다.
// 노란 면·코너 자리는 2×2 처음 맞추기의 윗면·위 층 자리(beginner-path-222.ts)와 같은 공식·같은 쥐는 법이다(3×3의 코너는
// 2×2와 똑같이 움직인다). 엣지 자리는 노란 면 공식과 그 거울을 이어 친다(앞에서 배운 공식만 쓴다).
// 단원 글(lessons-twist-first.ts)·경우 그림(beginner-cases.ts)·시험(twist-first-path.test.ts)이 이 자료를 함께 읽는다.
import { faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { play, reps } from "./beginner-path";
import { TOP_FACE, TOP_FACE_BACK, TOP_SWAP } from "./beginner-path-222";
import type { GoalName } from "./types";

// ── 공식 ──────────────────────────────────────────────

/** 노란 면 공식: 위 층 코너 셋의 노란색을 돌린다(2×2 윗면 공식과 같다) */
export const YELLOW_FACE = TOP_FACE;
/** 노란 면 공식을 거꾸로 */
export const YELLOW_FACE_BACK = TOP_FACE_BACK;
/** 노란 면 공식을 거울에 비춘 것(왼쪽 층으로 친다) */
export const YELLOW_FACE_MIRROR = "L' U' L U' L' U2 L";
/** 코너 바꾸기: 바른 짝을 뒤에 두면 남은 코너 셋의 자리를 돌린다(2×2 위 층 코너 바꾸기와 같다) */
export const CORNER_SWAP = TOP_SWAP;
/**
 * 엣지 돌리기(오른손 먼저): 노란 면 공식 → U → 거울 → U'. 코너는 다 돌아오고 뒤 엣지는 그대로, 앞 엣지가 왼쪽으로
 * (왼쪽 → 오른쪽 → 앞) 돈다
 */
export const EDGE_CYCLE = `${YELLOW_FACE} U ${YELLOW_FACE_MIRROR} U'`;
/** 엣지 돌리기(왼손 먼저): 두 덩어리의 차례를 바꾸고 사이·끝의 U를 반대로. 앞 엣지가 오른쪽으로 돈다 */
export const EDGE_CYCLE_LEFT = `${YELLOW_FACE_MIRROR} U' ${YELLOW_FACE} U`;

export { reps };

// ── 단계와 경우 ───────────────────────────────────────

export type TwistFirstStageId = "face" | "corners" | "edges";

export interface TwistFirstCase {
  id: string;
  /** 모양(눈으로 보는 것) */
  shape: string;
  /** 쥐는 법(공식 앞에 할 일) */
  hold: string;
  /** 칠 공식(없으면 쥐기만) */
  alg: string;
  times: number;
  /** 같은 공식을 거꾸로 친다 */
  back?: boolean;
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
    id: "face",
    title: "노란 면",
    goal: "oll",
    cases: [
      {
        id: "one-front",
        shape:
          "노란색이 위를 보는 코너 블럭 하나, 그 블럭을 앞-왼쪽 위에 두면 앞-오른쪽 위 코너 블럭의 노란색이 앞",
        hold: "윗면을 돌려 위를 보는 코너 블럭을 앞-왼쪽 위로",
        alg: YELLOW_FACE,
        times: 1,
      },
      {
        id: "one-right",
        shape:
          "노란색이 위를 보는 코너 블럭 하나, 그 블럭을 앞-왼쪽 위에 두면 앞-오른쪽 위 코너 블럭의 노란색이 오른쪽",
        hold: "윗면을 돌려 위를 보는 코너 블럭을 뒤-오른쪽 위로",
        alg: YELLOW_FACE_BACK,
        times: 1,
        back: true,
      },
      {
        id: "none-sides",
        shape: "위를 보는 노란색 없음, 노란색이 마주 보는 두 옆면에 둘씩",
        hold: "윗면을 돌려 노란색 둘씩을 왼쪽과 오른쪽 면으로",
        alg: YELLOW_FACE,
        times: 2,
      },
      {
        id: "none",
        shape: "위를 보는 노란색 없음, 노란색 둘인 옆면이 하나",
        hold: "윗면을 돌려 노란색 둘인 면을 왼쪽으로",
        alg: YELLOW_FACE,
        times: 1,
        next: ["one-front", "one-right"],
      },
      {
        id: "two",
        shape: "노란색이 위를 보는 코너 블럭 둘",
        hold: "윗면을 돌려 앞-왼쪽 위 코너 블럭의 노란색이 앞을 보게",
        alg: YELLOW_FACE,
        times: 1,
        next: ["one-front", "one-right"],
      },
    ],
  },
  {
    id: "corners",
    title: "코너 자리",
    goal: "yellow-corners",
    cases: [
      {
        id: "one",
        shape: "바른 짝이 한 면",
        hold: "윗면을 돌려 바른 짝을 뒤로",
        alg: CORNER_SWAP,
        times: 1,
        next: ["align"],
      },
      {
        id: "none",
        shape: "바른 짝이 없음",
        hold: "그대로",
        alg: CORNER_SWAP,
        times: 1,
        next: ["one"],
      },
      {
        id: "align",
        shape: "네 면 모두 바른 짝",
        hold: "앞-오른쪽 위 코너 블럭의 제자리가 앞-왼쪽 위면 U, 뒤-오른쪽 위면 U', 뒤-왼쪽 위면 U2",
        alg: "",
        times: 0,
      },
    ],
  },
  {
    id: "edges",
    title: "엣지 자리",
    goal: "solved",
    cases: [
      {
        id: "right-first",
        shape:
          "제자리 엣지 블럭 하나, 그 블럭을 뒤에 두면 앞 엣지 블럭의 제자리가 왼쪽",
        hold: "큐브를 돌려 쥐어 제자리 엣지 블럭을 뒤로(y)",
        alg: EDGE_CYCLE,
        times: 1,
      },
      {
        id: "left-first",
        shape:
          "제자리 엣지 블럭 하나, 그 블럭을 뒤에 두면 앞 엣지 블럭의 제자리가 오른쪽",
        hold: "큐브를 돌려 쥐어 제자리 엣지 블럭을 뒤로(y)",
        alg: EDGE_CYCLE_LEFT,
        times: 1,
      },
      {
        id: "none",
        shape: "제자리 엣지 블럭 없음",
        hold: "그대로",
        alg: EDGE_CYCLE,
        times: 1,
        next: ["right-first", "left-first"],
      },
      {
        id: "turn",
        shape: "코너 블럭이 모두 같은 쪽으로 한 자리씩 비켜나 있음",
        hold: "앞-오른쪽 위 코너 블럭의 제자리가 앞-왼쪽 위면 U, 뒤-오른쪽 위면 U', 뒤-왼쪽 위면 U2",
        alg: "",
        times: 0,
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

// 위 층 코너 자리의 스티커 번호(면 U R F D L B 차례, 면마다 9칸. beginner-path.ts CORNER_SLOTS와 같은 자리)
const UFR = [8, 9, 20] as const;
const UFL = [6, 18, 38] as const;
const UBL = [0, 36, 47] as const;
const UBR = [2, 45, 11] as const;
const TOP_CORNERS = [UFR, UFL, UBL, UBR] as const;
/** 옆면 윗줄: 양 끝(코너 스티커) 둘과 가운데(엣지 스티커) */
const SIDE_ROW: Record<"F" | "R" | "B" | "L", [number, number, number]> = {
  F: [18, 19, 20],
  R: [9, 10, 11],
  B: [45, 46, 47],
  L: [36, 37, 38],
};
const SIDES = ["F", "R", "B", "L"] as const;
type Side = (typeof SIDES)[number];
const center = (col: Uint8Array, f: Face) =>
  col[FACES.indexOf(f) * 9 + 4] as number;

/** 코너 자리의 노란 스티커가 보는 면 */
function yellowAt(col: Uint8Array, slot: readonly number[]): Face {
  const i = slot.find((x) => col[x] === YELLOW);
  if (i === undefined) throw new Error("노란 코너가 위 층에 없다");
  return faceOf(i);
}
const upCount = (s: PuzzleState) => {
  const col = faceColors(3, s);
  return TOP_CORNERS.filter((c) => yellowAt(col, c) === "U").length;
};

/** 바른 짝(옆면 윗줄 양 끝 두 칸이 같은 색)인 옆면 */
export function pairedSides(s: PuzzleState): Side[] {
  const col = faceColors(3, s);
  return SIDES.filter((f) => {
    const [a, , b] = SIDE_ROW[f];
    return col[a] === col[b];
  });
}

/** 위 층 코너 넷이 제자리·바른 방향(아래 두 층은 보지 않는다) */
function cornersHome(s: PuzzleState): boolean {
  const col = faceColors(3, s);
  return TOP_CORNERS.every((slot) =>
    slot.every((i) => col[i] === center(col, faceOf(i))),
  );
}

/** 위 층 엣지 가운데 제자리(옆 스티커가 그 면 센터와 같은 색)인 옆면 */
export function edgesHome(s: PuzzleState): Side[] {
  const col = faceColors(3, s);
  return SIDES.filter((f) => col[SIDE_ROW[f][1]] === center(col, f));
}

// ── 단계마다 다음 한 걸음 ─────────────────────────────

export interface TwistFirstStep {
  stage: TwistFirstStageId;
  caseId: string;
  /** 쥐는 수(U·y, 없으면 "") */
  hold: string;
  /** 칠 수(공식 × 횟수, 없으면 "") */
  alg: string;
}

const U4 = ["", "U", "U'", "U2"];
const Y4 = ["", "y", "y'", "y2"];
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

function faceNext(s: PuzzleState): TwistFirstStep | null {
  const n = upCount(s);
  if (n === 4) return null;
  const y = (t: PuzzleState, slot: readonly number[]) =>
    yellowAt(faceColors(3, t), slot);
  if (n === 1) {
    const u = firstTurn(s, U4, (t) => y(t, UFL) === "U");
    if (y(play(s, u), UFR) === "F") return step("face", "one-front", u);
    return step(
      "face",
      "one-right",
      firstTurn(s, U4, (t) => y(t, UBR) === "U"),
    );
  }
  if (n === 0) {
    const sides = (t: PuzzleState) =>
      y(t, UBL) === "L" &&
      y(t, UFL) === "L" &&
      y(t, UBR) === "R" &&
      y(t, UFR) === "R";
    if (U4.some((u) => sides(play(s, u))))
      return step("face", "none-sides", firstTurn(s, U4, sides));
    return step(
      "face",
      "none",
      firstTurn(s, U4, (t) => y(t, UBL) === "L" && y(t, UFL) === "L"),
    );
  }
  if (n === 2)
    return step(
      "face",
      "two",
      firstTurn(s, U4, (t) => y(t, UFL) === "F"),
    );
  throw new Error(`노란색이 위인 코너가 ${n}개다`);
}

function cornersNext(s: PuzzleState): TwistFirstStep | null {
  if (cornersHome(s)) return null;
  const p = pairedSides(s);
  if (p.length === 4)
    return step("corners", "align", firstTurn(s, U4, cornersHome));
  if (p.length === 1)
    return step(
      "corners",
      "one",
      firstTurn(s, U4, (t) => pairedSides(t).includes("B")),
    );
  if (p.length === 0) return step("corners", "none", "");
  throw new Error(`바른 짝이 ${p.length}면이다`);
}

function edgesNext(s: PuzzleState): TwistFirstStep | null {
  if (!cornersHome(s))
    return step("edges", "turn", firstTurn(s, U4, cornersHome));
  const home = edgesHome(s);
  if (home.length === 4) return null;
  if (home.length === 0) return step("edges", "none", "");
  if (home.length !== 1) throw new Error(`제자리 엣지가 ${home.length}개다`);
  const y = firstTurn(s, Y4, (t) => edgesHome(t).includes("B"));
  const t = play(s, y);
  const col = faceColors(3, t);
  // 앞 엣지 블럭의 옆 색이 어느 면 센터 색인지
  const front = col[SIDE_ROW.F[1]] as number;
  const goes = SIDES.find((f) => center(col, f) === front);
  return step("edges", goes === "L" ? "right-first" : "left-first", y);
}

/** 지금 모양에서 그 단계의 다음 한 걸음(끝났으면 null). 흰 면 아래·노란 십자가 맞은 3×3 */
export function nextTwistFirstStep(
  stage: TwistFirstStageId,
  s: PuzzleState,
): TwistFirstStep | null {
  switch (stage) {
    case "face":
      return faceNext(s);
    case "corners":
      return cornersNext(s);
    case "edges":
      return edgesNext(s);
  }
}

export interface TwistFirstRun {
  state: PuzzleState;
  steps: TwistFirstStep[];
}

/** 그 단계를 규칙대로 끝까지(걸음 수 상한을 넘으면 던진다) */
export function runTwistFirstStage(
  stage: TwistFirstStageId,
  s: PuzzleState,
  limit = 6,
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

/** 노란 십자 뒤 세 단계 차례 */
export const TWIST_FIRST_ORDER: TwistFirstStageId[] = [
  "face",
  "corners",
  "edges",
];
