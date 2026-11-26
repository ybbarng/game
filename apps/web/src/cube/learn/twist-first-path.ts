// 3×3 초보자(코너 방향 먼저)의 마지막 두 걸음 「경우별 정해진 길」(docs/47 16-33). 예전 문방구 큐브(신광사)에 들어
// 있던 설명서의 해법이다. 흰 십자부터 옆면 맞추기(위 엣지 자리)까지는 3×3 처음 맞추기와 같고(beginner-path.ts), 그 뒤를
// 코너 방향 → 코너 위치 차례로 맞춘다. 위 엣지는 방향·자리 모두 맞아 있으니 두 걸음의 공식은 엣지와 아래 두 층을 그대로
// 둔다(시험이 엔진으로 본다). 윗면은 돌리지 않고(엣지가 비켜난다) 큐브를 통째로 돌려 쥔다(y).
// - 코너 방향: 설명서 6단계 결합 하나 R U' L' U R' U' L U(위 층 코너 셋의 자리와 방향을 바꾼다). 「기본형」(물고기)은
//   한 번에 다 맞고, 나머지 모양은 정한 쥐기로 한 번 치면 기본형에 한 걸음 가까운 모양이 된다(관계도 TWIST_FLOW).
// - 코너 위치: 설명서 7단계 결합 A(맞은 조각을 앞-오른쪽 위에 두고 남은 셋을 시계 방향으로)·B(앞-왼쪽 위에 두고
//   반시계 방향으로). 서로 왼쪽과 오른쪽을 바꾼 꼴이다.
// 단원 글(lessons-twist-first.ts)·경우 그림(beginner-cases.ts)·시험(twist-first-path.test.ts)이 이 자료를 함께 읽는다.
import { faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { play, reps } from "./beginner-path";
import type { GoalName } from "./types";

// ── 공식 ──────────────────────────────────────────────

/** 코너 방향 공식(설명서 6단계): R로 흐트러뜨리고 U' L' U로 바꾸고 R'로 되돌리고 U' L U로 바꾼 것을 되돌린다 */
export const CORNER_TURN = "R U' L' U R' U' L U";
/** 코너 위치 A(설명서 7단계 A): 앞-오른쪽 위는 그대로, 남은 셋을 위에서 보아 시계 방향으로 */
export const CORNER_A = "L2 B2 L' F' L B2 L' F L'";
/** 코너 위치 B(설명서 7단계 B): 앞-왼쪽 위는 그대로, 남은 셋을 위에서 보아 반시계 방향으로. A의 왼쪽과 오른쪽을 바꾼 꼴 */
export const CORNER_B = "R2 B2 R F R' B2 R F' R";

export { reps };

// ── 단계와 경우 ───────────────────────────────────────

export type TwistFirstStageId = "twist" | "place";

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
    id: "twist",
    title: "코너 방향",
    goal: "oll",
    cases: [
      {
        id: "base",
        shape:
          "기본형: 위를 보는 노란색 하나, 그 블럭을 앞-왼쪽 위에 두면 앞-오른쪽 위 노란색이 앞",
        hold: "위를 보는 코너 블럭이 앞-왼쪽 위에 오게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
      },
      {
        id: "fish",
        shape:
          "위를 보는 노란색 하나, 그 블럭을 앞-왼쪽 위에 두면 앞-오른쪽 위 노란색이 오른쪽",
        hold: "위를 보는 코너 블럭이 앞-왼쪽 위에 오게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["base"],
      },
      {
        id: "side",
        shape: "위를 보는 노란색 둘이 이웃, 옆을 보는 둘이 서로 다른 면",
        hold: "위를 보는 둘이 오른쪽에 오게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["fish"],
      },
      {
        id: "front",
        shape: "위를 보는 노란색 둘이 이웃, 옆을 보는 둘이 한 면",
        hold: "옆을 보는 둘이 앞에 오게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["fish"],
      },
      {
        id: "diagonal",
        shape: "위를 보는 노란색 둘이 대각선",
        hold: "위를 보는 둘이 앞-오른쪽 위와 뒤-왼쪽 위에, 앞-왼쪽 위 노란색이 앞을 보게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["fish"],
      },
      {
        id: "none-back",
        shape: "위를 보는 노란색 없음, 노란색 둘인 옆면이 하나",
        hold: "노란색 둘인 옆면이 뒤에 오게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["base"],
      },
      {
        id: "none-sides",
        shape: "위를 보는 노란색 없음, 노란색이 마주 보는 두 옆면에 둘씩",
        hold: "노란색 둘씩이 왼쪽과 오른쪽에 오게 돌려 쥐고(y)",
        alg: CORNER_TURN,
        times: 1,
        next: ["base"],
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
          "제자리 코너 블럭 하나, 그 블럭을 앞-오른쪽 위에 두면 앞-왼쪽 위 코너 블럭의 제자리가 뒤-왼쪽 위",
        hold: "제자리 코너 블럭이 앞-오른쪽 위에 오게 돌려 쥐고(y)",
        alg: CORNER_A,
        times: 1,
      },
      {
        id: "b",
        shape:
          "제자리 코너 블럭 하나, 그 블럭을 앞-오른쪽 위에 두면 앞-왼쪽 위 코너 블럭의 제자리가 뒤-오른쪽 위",
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

// 위 층 코너 자리의 스티커 번호(윗면 칸부터 위에서 보아 시계 방향, beginner-path.ts CORNER_SLOTS와 같은 자리)
const UFR = [8, 9, 20] as const;
const UFL = [6, 18, 38] as const;
const UBL = [0, 36, 47] as const;
const UBR = [2, 45, 11] as const;
const TOP_CORNERS = [UFR, UFL, UBL, UBR] as const;
const center = (col: Uint8Array, f: Face) =>
  col[FACES.indexOf(f) * 9 + 4] as number;

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

// ── 단계마다 다음 한 걸음 ─────────────────────────────

export interface TwistFirstStep {
  stage: TwistFirstStageId;
  caseId: string;
  /** 쥐는 수(y, 없으면 "") */
  hold: string;
  /** 칠 수(공식 × 횟수, 없으면 "") */
  alg: string;
}

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

/** 쥔 모양이 그 경우의 쥐기에 맞는지(노란색이 보는 면: 앞-오른쪽, 앞-왼쪽, 뒤-왼쪽, 뒤-오른쪽 위) */
const HELD: Record<string, (y: Face[]) => boolean> = {
  base: ([fr, fl, bl, br]) =>
    fl === "U" && fr === "F" && bl !== "U" && br !== "U",
  fish: ([fr, fl, bl, br]) =>
    fl === "U" && fr === "R" && bl !== "U" && br !== "U",
  side: ([fr, fl, bl, br]) =>
    fr === "U" && br === "U" && fl === "F" && bl === "B",
  front: ([fr, fl, bl, br]) =>
    bl === "U" && br === "U" && fl === "F" && fr === "F",
  diagonal: ([fr, fl, bl, br]) =>
    fr === "U" && bl === "U" && fl === "F" && br === "R",
  "none-back": ([fr, fl, bl, br]) =>
    fr === "R" && fl === "L" && bl === "B" && br === "B",
  "none-sides": ([fr, fl, bl, br]) =>
    fr === "R" && fl === "L" && bl === "L" && br === "R",
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
  // 제자리 블럭을 앞-오른쪽 위에 두고 앞-왼쪽 위 블럭의 제자리를 본다
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

/** 지금 모양에서 그 단계의 다음 한 걸음(끝났으면 null). 흰 면 아래·위 엣지가 맞은 3×3 */
export function nextTwistFirstStep(
  stage: TwistFirstStageId,
  s: PuzzleState,
): TwistFirstStep | null {
  return stage === "twist" ? twistNext(s) : placeNext(s);
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

/** 옆면 맞추기 뒤 두 단계 차례 */
export const TWIST_FIRST_ORDER: TwistFirstStageId[] = ["twist", "place"];
