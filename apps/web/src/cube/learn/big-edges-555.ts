// 5×5 엣지 열둘의 경우별 정해진 길(docs/47 16-16). 4×4(big-path.ts)처럼 늘 앞-오른쪽 줄에서 묶고, 묶은 줄은
// R U R'로 위 층에 올려 모은다(위 층이 차면 x2). 5×5 줄은 가운데 엣지 블럭 하나와 날개 둘이고, 앞-오른쪽 가운데 엣지
// 블럭과 같은 두 색인 날개 둘(「짝 날개」)을 앞-오른쪽 줄 위·아래에 모은다. 짝 날개는 이렇게 옮긴다.
//  · 다른 줄 아래의 짝 날개 → Dw로 앞-오른쪽 아래에 데려와 엣지 뒤집기 → 되돌리기: 그 날개가 앞-오른쪽 위로 온다
//    (앞-오른쪽 위에 있던 날개가 그 자리로 가고, 앞-오른쪽 아래 날개는 그대로).
//  · 다른 줄 위의 짝 날개 → Uw로 같은 일: 그 날개가 앞-오른쪽 아래로 온다(앞-오른쪽 위 날개는 그대로).
//  · 엣지 뒤집기 한 번: 앞-오른쪽 위·아래 날개가 자리를 바꾼다.
//  · 위·아래 층의 짝 날개 → 4×4처럼 L' U' L(위-뒤에서)·L D L'(아래-뒤에서)로 앞-왼쪽 줄에 내린다.
// 짝 날개 둘이 앞-오른쪽에 모였는데 가운데 엣지 블럭과 색이 엇갈리면(날개 둘이 서로는 맞고 가운데만 뒤집힌 꼴),
// 그 줄을 위-앞에 올리고(앞-오른쪽이면 R U R', 앞-왼쪽이면 L' U' L) 「날개 바꾸기」 공식을 친다.
// 위·아래 층에 묶이지 않은 줄이 없어지면 남은 가운데 줄(넷까지)은 올리지 않고 같은 법으로 묶는다(y로 앞-오른쪽에).
import { cubeTopology, faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { EDGES_5X5 } from "./algs-big";
import { DROP_FROM_DOWN, DROP_FROM_UP, EDGE_FLIP, playN } from "./big-path";

export const WING_SWAP_5 = EDGES_5X5.find((c) => c.id === "edges-5x5-flip")
  ?.algs[0] as string;

const U = 0;
const R = 1;
const F = 2;
const D = 3;
const L = 4;
const B = 5;

type Line = {
  name: string;
  /** 날개 둘(가운데 줄은 [위, 아래]) */
  wings: [number, number];
  mid: number;
};

const LINES: Line[] = (() => {
  const topo = cubeTopology(5);
  const names: [string, number, number][] = [
    ["UF", U, F],
    ["UR", U, R],
    ["UB", U, B],
    ["UL", U, L],
    ["DF", D, F],
    ["DR", D, R],
    ["DB", D, B],
    ["DL", D, L],
    ["FR", F, R],
    ["FL", F, L],
    ["BR", B, R],
    ["BL", B, L],
  ];
  const touches = (p: { stickers: readonly number[] }, a: number, b: number) =>
    p.stickers.length === 2 &&
    [a, b].every((f) => p.stickers.some((st) => topo.stickers[st]?.face === f));
  return names.map(([name, a, b]) => {
    const pieces = topo.pieces
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => touches(p, a, b));
    const wings = pieces
      .filter(({ p }) => p.kind === "wing")
      .sort((x, y) => y.p.position[1] - x.p.position[1]);
    const mid = pieces.find(({ p }) => p.kind === "edge");
    return {
      name,
      wings: [wings[0]?.i as number, wings[1]?.i as number],
      mid: mid?.i as number,
    };
  });
})();
const line = (name: string) => LINES.find((l) => l.name === name) as Line;

/** 조각의 두 색(차례 없음) */
function colorsOf(col: Uint8Array, piece: number): string {
  return (cubeTopology(5).pieces[piece]?.stickers ?? [])
    .map((st) => col[st] as number)
    .sort()
    .join();
}

/** 줄의 세 조각이 두 면 모두 한 색인가 */
function paired(col: Uint8Array, l: Line): boolean {
  const topo = cubeTopology(5);
  const byFace = new Map<number, number>();
  for (const p of [l.mid, ...l.wings])
    for (const st of topo.pieces[p]?.stickers ?? []) {
      const f = topo.stickers[st]?.face as number;
      const c = col[st] as number;
      const seen = byFace.get(f);
      if (seen === undefined) byFace.set(f, c);
      else if (seen !== c) return false;
    }
  return true;
}

export type Edge5CaseId =
  | "store"
  | "turn-over"
  | "swap-wings"
  | "next-line"
  | "low"
  | "high"
  | "flip"
  | "drop-up"
  | "drop-down";

export interface Edge5Step {
  caseId: Edge5CaseId;
  hold: string;
  alg: string;
}

export const stepMoves5 = (st: Edge5Step) =>
  [st.hold, st.alg].filter(Boolean).join(" ");

const FACE4 = (f: string) => ["", f, `${f}'`, `${f}2`];
const firstTurn = (
  s: PuzzleState,
  turns: string[],
  ok: (t: PuzzleState) => boolean,
) => {
  const t = turns.find((x) => ok(playN(5, s, x)));
  if (t === undefined) throw new Error("돌릴 방향을 찾지 못했다");
  return t;
};
const inv = (m: string) =>
  m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`;
const DW: Record<string, string> = { FL: "Dw", BR: "Dw'", BL: "Dw2" };
const UW: Record<string, string> = { FL: "Uw'", BR: "Uw", BL: "Uw2" };
const MIDDLE = ["FR", "FL", "BR", "BL"];
const Y_TO_FR: Record<string, string> = {
  FL: "y'",
  BR: "y",
  BL: "y2",
};

/** 짝 날개가 든 자리: 앞-오른쪽 위(H)·아래(L), 다른 가운데 줄 위·아래, 위·아래 층 */
type Spot =
  | { at: "H" | "L" }
  | { at: "hi" | "lo"; slot: string }
  | { at: "U" | "D"; line: string };

function spotsOfTwins(col: Uint8Array): Spot[] {
  const want = colorsOf(col, line("FR").mid);
  const out: Spot[] = [];
  for (const l of LINES)
    l.wings.forEach((w, k) => {
      if (colorsOf(col, w) !== want) return;
      if (l.name === "FR") out.push({ at: k === 0 ? "H" : "L" });
      else if (MIDDLE.includes(l.name))
        out.push({ at: k === 0 ? "hi" : "lo", slot: l.name });
      else out.push({ at: l.name[0] as "U" | "D", line: l.name });
    });
  return out;
}

/** 5×5 엣지의 다음 한 걸음(다 묶였으면 null) */
export function nextEdge5(s: PuzzleState): Edge5Step | null {
  const col = faceColors(5, s);
  const open = LINES.filter((l) => !paired(col, l));
  if (open.length === 0) return null;
  const openOuter = (layer: "U" | "D") =>
    open.filter((l) => l.name.startsWith(layer));
  const storing = openOuter("U").length + openOuter("D").length > 0;
  const fr = line("FR");
  const twins = spotsOfTwins(col);
  const inFr = twins.filter((t) => t.at === "H" || t.at === "L").length;

  if (paired(col, fr)) {
    if (!storing) {
      // 남은 가운데 줄 가운데 하나를 앞-오른쪽으로
      const next = MIDDLE.find((m) => open.some((l) => l.name === m)) as string;
      return { caseId: "next-line", hold: "", alg: Y_TO_FR[next] as string };
    }
    if (openOuter("U").length === 0)
      return { caseId: "turn-over", hold: "", alg: "x2" };
    const u = firstTurn(
      s,
      FACE4("U"),
      (t) => !paired(faceColors(5, t), line("UB")),
    );
    return { caseId: "store", hold: u, alg: "R U R'" };
  }
  // 위-앞에 올린 줄이 엇갈렸으면 날개 바꾸기(올리기 바로 뒤)
  if (inFr === 2) {
    // 짝 날개가 모두 앞-오른쪽인데 묶이지 않았다 = 가운데 엣지 블럭과 엇갈림. 위-앞에 올려 날개 바꾸기
    return { caseId: "swap-wings", hold: "R U R'", alg: WING_SWAP_5 };
  }
  const has = (at: Spot["at"]) => twins.find((t) => t.at === at);
  const lo = has("lo") as { slot: string } | undefined;
  const hi = has("hi") as { slot: string } | undefined;
  const outside = twins.find((t) => t.at === "U" || t.at === "D") as
    | { at: "U" | "D"; line: string }
    | undefined;
  if (has("L")) {
    if (lo) return low(lo.slot);
    if (hi) return { caseId: "flip", hold: "", alg: EDGE_FLIP };
  }
  if (has("H")) {
    if (hi) return high(hi.slot);
    if (lo) return { caseId: "flip", hold: "", alg: EDGE_FLIP };
  }
  if (inFr === 0) {
    if (lo) return low(lo.slot);
    if (hi) return high(hi.slot);
  }
  // 남은 짝 날개가 위·아래 층: 앞-왼쪽 줄로 내린다
  if (!outside) throw new Error("짝 날개를 찾지 못했다");
  const target = line(outside.at === "U" ? "UB" : "DB");
  const want = colorsOf(col, fr.mid);
  const turn = firstTurn(s, FACE4(outside.at), (t) => {
    const c = faceColors(5, t);
    return target.wings.some((w) => colorsOf(c, w) === want);
  });
  return outside.at === "U"
    ? { caseId: "drop-up", hold: turn, alg: DROP_FROM_UP }
    : { caseId: "drop-down", hold: turn, alg: DROP_FROM_DOWN };
}

function low(slot: string): Edge5Step {
  const dw = DW[slot] as string;
  return { caseId: "low", hold: "", alg: `${dw} ${EDGE_FLIP} ${inv(dw)}` };
}
function high(slot: string): Edge5Step {
  const uw = UW[slot] as string;
  return { caseId: "high", hold: "", alg: `${uw} ${EDGE_FLIP} ${inv(uw)}` };
}

/** 센터가 맞은 5×5의 엣지 열둘을 규칙대로 */
export function runEdges555(
  s: PuzzleState,
  limit = 150,
): { state: PuzzleState; steps: Edge5Step[] } {
  const steps: Edge5Step[] = [];
  let state = s;
  for (;;) {
    const st = nextEdge5(state);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > limit) throw new Error("5×5 엣지가 끝나지 않는다");
    state = playN(5, state, stepMoves5(st));
  }
}
