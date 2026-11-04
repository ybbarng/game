// 「큐브의 구조」 분해·조립(docs/47 8-4). 맞춘 3×3을 가상으로 흩은 뒤 축 → 가운데 6 → 모서리 12 → 꼭짓점 8 차례로
// 끼우며 살펴본다(붙은 색이 1 → 2 → 3개로 는다). 화면 없이 시험한다. 조각은 엔진의 조각 자리 번호(맞춘 큐브라 정체와 같다).
import {
  cubeTopology,
  OPPOSITE_FACE,
  pieceFaces,
  piecesOfKind,
} from "@game/cube-engine";

export type BuildPhase =
  | "whole"
  | "core"
  | "centers"
  | "edges"
  | "corners"
  | "done";

export interface BuildState {
  phase: BuildPhase;
  /** 끼운 조각(차례대로) */
  placed: number[];
}

/** 종류마다 사용자가 직접 자리를 고르는 개수. 나머지는 「나머지 끼우기」로 한꺼번에 날아온다 */
const ASK = { centers: 6, edges: 2, corners: 1 } as const;
/** 가운데는 흰 위·초록 앞을 먼저 잡아 두고(방향을 정한다), 나머지 넷을 고른다 */
const AUTO_CENTERS = 2;

const KIND_OF: Record<
  "centers" | "edges" | "corners",
  "center" | "edge" | "corner"
> = {
  centers: "center",
  edges: "edge",
  corners: "corner",
};

/** 조각이 닿은 면들(맞춘 큐브라 곧 그 조각의 색) */
const facesOf = (p: number) => pieceFaces(3, p);

/** 면 차례(U R F D L B 중 앞의 것 먼저)로 이름 짓기 */
function pieceByFaces(kind: "center" | "edge" | "corner", faces: number[]) {
  const want = [...faces].sort((a, b) => a - b).join(",");
  const p = piecesOfKind(3, kind).find(
    (x) => [...facesOf(x)].sort((a, b) => a - b).join(",") === want,
  );
  if (p === undefined) throw new Error(`조각 없음: ${want}`);
  return p;
}

const [U, R, F, D, L, B] = [0, 1, 2, 3, 4, 5] as const;

/**
 * 끼우는 차례. 가운데: 흰·초록(먼저 잡음) → 노랑 → 빨강 → 파랑 → 주황. 모서리: 흰-초록 → 흰-빨강 → 나머지.
 * 꼭짓점: 흰-초록-빨강 → 나머지
 */
export function buildOrder(): Record<
  "centers" | "edges" | "corners",
  number[]
> {
  const centers = [U, F, D, R, B, L].map((f) => pieceByFaces("center", [f]));
  const edgesFirst = [
    pieceByFaces("edge", [U, F]),
    pieceByFaces("edge", [U, R]),
  ];
  const edges = [
    ...edgesFirst,
    ...piecesOfKind(3, "edge").filter((p) => !edgesFirst.includes(p)),
  ];
  const cornerFirst = pieceByFaces("corner", [U, F, R]);
  const corners = [
    cornerFirst,
    ...piecesOfKind(3, "corner").filter((p) => p !== cornerFirst),
  ];
  return { centers, edges, corners };
}

export const BUILD_START: BuildState = {
  phase: "whole",
  placed: cubeTopology(3).pieces.map((_, i) => i),
};

/** 분해: 다 흩고 축만 남긴다 */
export function buildTakeApart(): BuildState {
  return { phase: "core", placed: [] };
}

/** 다음 차례로: 축 → 가운데(흰·초록을 먼저 끼움) */
export function buildBegin(b: BuildState): BuildState {
  if (b.phase !== "core") return b;
  return {
    phase: "centers",
    placed: buildOrder().centers.slice(0, AUTO_CENTERS),
  };
}

type Part = "centers" | "edges" | "corners";
const isPart = (p: BuildPhase): p is Part =>
  p === "centers" || p === "edges" || p === "corners";

/** 지금 끼울 조각(없으면 null) */
export function buildNext(b: BuildState): number | null {
  if (!isPart(b.phase)) return null;
  return buildOrder()[b.phase].find((p) => !b.placed.includes(p)) ?? null;
}

/** 지금 종류를 몇 개 끼웠나 / 모두 몇 개 */
export function buildCount(b: BuildState): { done: number; total: number } {
  if (!isPart(b.phase)) return { done: 0, total: 0 };
  const all = buildOrder()[b.phase];
  return {
    done: all.filter((p) => b.placed.includes(p)).length,
    total: all.length,
  };
}

/** 다음 조각의 자리를 사용자가 고르나(아니면 「나머지 끼우기」) */
export function buildAsks(b: BuildState): boolean {
  if (!isPart(b.phase)) return false;
  return buildCount(b).done < ASK[b.phase] && buildNext(b) !== null;
}

/**
 * 빈자리를 눌렀을 때의 판정.
 * - ok: 맞는 자리 · taken: 이미 끼운 자리 · kind: 다른 종류의 자리(가운데 자리에 모서리 등)
 * - opposite: 가운데 맞은편 짝(흰-노, 초-파, 빨-주)이 어긋남. `pair`는 이미 끼운 짝 색. `across`면 그 자리의
 *   맞은편에 `pair`가 있어 그 자리는 `pair`의 짝 자리, 아니면 이 색의 짝 `pair`의 맞은편이 아닌 자리
 * - mirror: 맞은편은 맞지만 도는 차례가 거꾸로(빨강·주황을 바꿔 끼움). 맞출 수 없는 큐브가 된다
 * - slot: 모서리·꼭짓점이 제 가운데 색 사이가 아닌 자리. `between`은 그 자리의 가운데 색
 */
export type BuildVerdict =
  | { kind: "ok" }
  | { kind: "taken" }
  | { kind: "kind" }
  | { kind: "opposite"; pair: number; across: boolean }
  | { kind: "mirror" }
  | { kind: "slot"; between: number[] };

export function buildVerdict(b: BuildState, slot: number): BuildVerdict {
  const next = buildNext(b);
  if (next === null || !isPart(b.phase)) return { kind: "taken" };
  if (b.placed.includes(slot)) return { kind: "taken" };
  const topo = cubeTopology(3);
  const want = KIND_OF[b.phase];
  if (topo.pieces[slot]?.kind !== want) return { kind: "kind" };
  if (slot === next) return { kind: "ok" };
  if (b.phase !== "centers") return { kind: "slot", between: facesOf(slot) };
  // 가운데: 맞춘 큐브의 가운데 조각은 제 면 자리에만 있다
  const color = facesOf(next)[0] as number;
  const at = facesOf(slot)[0] as number;
  const placedColor = (face: number) =>
    b.placed.some((p) => facesOf(p)[0] === face) ? face : null;
  // 그 자리의 맞은편에 이미 가운데가 있으면 이 자리는 그 색의 짝 자리다
  const across = placedColor(OPPOSITE_FACE[at as 0] as number);
  if (across !== null) return { kind: "opposite", pair: across, across: true };
  // 이 색의 짝이 이미 있으면 그 맞은편에만 온다
  const mate = placedColor(OPPOSITE_FACE[color as 0] as number);
  if (mate !== null) return { kind: "opposite", pair: mate, across: false };
  return { kind: "mirror" };
}

/** 자리를 눌러 끼운다(맞을 때만 끼운다) */
export function buildTap(
  b: BuildState,
  slot: number,
): { state: BuildState; verdict: BuildVerdict } {
  const verdict = buildVerdict(b, slot);
  if (verdict.kind !== "ok") return { state: b, verdict };
  return { state: advance({ ...b, placed: [...b.placed, slot] }), verdict };
}

/** 지금 종류의 나머지를 한꺼번에 끼운다 */
export function buildFill(b: BuildState): BuildState {
  if (!isPart(b.phase)) return b;
  const rest = buildOrder()[b.phase].filter((p) => !b.placed.includes(p));
  return advance({ ...b, placed: [...b.placed, ...rest] });
}

/** 한 종류를 다 끼우면 다음 종류로 */
function advance(b: BuildState): BuildState {
  if (!isPart(b.phase) || buildNext(b) !== null) return b;
  const next: BuildPhase =
    b.phase === "centers" ? "edges" : b.phase === "edges" ? "corners" : "done";
  return { ...b, phase: next };
}

/**
 * 세 면의 바깥 방향이 이루는 돌림 차례(오른손 +1, 거울 −1). 꼭짓점의 세 색은 이 차례로 붙어 있어, 가운데의
 * 빨강·주황을 바꿔 끼우면 그 자리의 돌림 차례가 거꾸로라 어떻게 돌려 끼워도 세 색이 함께 맞지 않는다
 */
export function handedness(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
): number {
  const [ax, ay, az] = a as [number, number, number];
  const [bx, by, bz] = b as [number, number, number];
  const [cx, cy, cz] = c as [number, number, number];
  const det =
    ax * (by * cz - bz * cy) -
    ay * (bx * cz - bz * cx) +
    az * (bx * cy - by * cx);
  return Math.sign(det);
}

export { B, D, F, L, R, U };
