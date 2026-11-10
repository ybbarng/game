import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 조각 단위로 「찾기 → 넣기 → 맞춤」을 보이는 데 쓰는 순수 함수들(docs/47 0절 2026-11-05).
 * 첫 화면 연출(`hero/present.ts`)이 쓰고, 배우기의 느린 시연도 같은 것을 쓸 수 있게 화면과 떼어 둔다.
 *
 * - 조각은 맞춘 큐브에서의 자리 번호(엔진 `cubeTopology().pieces`의 번호)로 부른다. 그 조각의 스티커 정체는
 *   `pieces[p].stickers`(맞춘 큐브의 스티커 자리 번호)라 큐브를 어떻게 돌려도 바뀌지 않는다.
 * - 「묶음」(`PieceUnit`)은 한 번에 넣는 조각들이다: 십자 엣지 하나, 첫 층 코너 하나, 둘째 층 엣지 하나,
 *   F2L 짝(코너 + 엣지) 하나. 3×3만 다룬다.
 * - 「맞음」은 센터 색 기준이다(큐브를 통째로 돌려도 같다).
 * - 「보인다」는 그 묶음의 조각 가운데 하나라도 스티커 하나가 지금 위·앞·오른쪽(U·F·R) 면에 있다는 뜻이다.
 *   찾는 동안에는 이것만 본다(안 보이는 면의 정보를 쓰지 않는다).
 */

export interface PieceUnit {
  /** 맞춘 큐브에서의 조각 자리 번호(짝이면 코너, 엣지) */
  pieces: readonly number[];
}

/** 강조 사건. `slot`은 넣을 곳, `found`는 찾은 조각, `placed`는 맞춘 조각. 스티커는 정체 번호 */
export type PieceMarkKind = "slot" | "found" | "placed";
export interface PieceMark {
  kind: PieceMarkKind;
  stickers: number[];
  /** 같은 자리의 다른 사건과 묶지 않고 따로 빛낸다(마지막 층 단계 시작·모양·단계 끝, 맞은 조각 확인) */
  solo?: boolean;
  /** 이미 맞은 조각을 앞으로 돌려 확인한 것(수 없이 지나간다) */
  check?: boolean;
}

/**
 * 찾는 차례(한 가지로 정해 둔다): y를 세 번(한 번마다 본다), 그래도 없으면 x2로 아랫면을 위로 들고 다시 y 세 번.
 * 조각이 처음 보이는 걸음에서 멈춘다. 위·앞·오른쪽이 보이는 자리에서 y 넷이면 모든 조각이 한 번은 보이므로
 * 실제로는 y 세 번 안에 끝난다(x2는 안전장치다)
 */
export const SEARCH_ORDER: readonly string[] = [
  "y",
  "y",
  "y",
  "x2",
  "y",
  "y",
  "y",
];

/** 보이는 세 면: U(0)·R(1)·F(2) */
const VISIBLE_FACES = new Set([0, 1, 2]);

function topo3() {
  return cubeTopology(3);
}

/** 조각 p(맞춘 큐브 자리)의 색(면 번호) 목록 */
function pieceFaces(p: number): number[] {
  const t = topo3();
  return (t.pieces[p]?.stickers ?? []).map((s) => t.stickers[s]?.face ?? -1);
}

const kindOf = (p: number) => topo3().pieces[p]?.kind;

function piecesOfKind(kind: "edge" | "corner"): number[] {
  const t = topo3();
  return t.pieces.flatMap((q, i) => (q.kind === kind ? [i] : []));
}

/**
 * 단계 이름 → 그 단계에서 하나씩 넣는 묶음들. 찾기를 하지 않는 단계면 null.
 * `first`는 첫 면 색(기본 흰 0, 색 중립이면 그 판의 십자 색). 맞은편 색은 `(first + 3) % 6`
 */
export function unitsForStage(
  n: number,
  stage: string,
  first = 0,
): PieceUnit[] | null {
  if (n !== 3) return null;
  const WHITE = first;
  const YELLOW = (first + 3) % 6;
  const edges = piecesOfKind("edge");
  const corners = piecesOfKind("corner");
  const has = (p: number, f: number) => pieceFaces(p).includes(f);
  if (stage === "cross")
    return edges.filter((p) => has(p, WHITE)).map((p) => ({ pieces: [p] }));
  if (stage === "corners")
    return corners.filter((p) => has(p, WHITE)).map((p) => ({ pieces: [p] }));
  if (stage === "middle")
    return edges
      .filter((p) => !has(p, WHITE) && !has(p, YELLOW))
      .map((p) => ({ pieces: [p] }));
  if (stage.startsWith("f2l-"))
    return corners
      .filter((c) => has(c, WHITE))
      .map((c) => {
        const others = pieceFaces(c).filter((f) => f !== WHITE);
        const e = edges.find((p) => {
          const fs = pieceFaces(p);
          return fs.length === 2 && others.every((f) => fs.includes(f));
        }) as number;
        return { pieces: [c, e] };
      });
  return null;
}

/** 조각 p가 지금 있는 자리(조각 자리 번호) */
function locationOf(state: PuzzleState, p: number): number {
  const t = topo3();
  for (let s = 0; s < state.perm.length; s++)
    if (t.stickers[state.perm[s] as number]?.piece === p)
      return t.stickers[s]?.piece ?? -1;
  return -1;
}

/** 면마다 센터 색 */
function centerColors(state: PuzzleState): number[] {
  const colors = faceColors(3, state);
  return [0, 1, 2, 3, 4, 5].map((f) => colors[f * 9 + 4] as number);
}

/** 조각 p가 센터 색 기준으로 제자리·바른 방향인가 */
function pieceSolved(state: PuzzleState, p: number): boolean {
  const t = topo3();
  const colors = faceColors(3, state);
  const centers = centerColors(state);
  const at = t.pieces[locationOf(state, p)];
  if (!at) return false;
  return at.stickers.every(
    (s) => colors[s] === centers[t.stickers[s]?.face ?? -1],
  );
}

export function unitSolved(state: PuzzleState, unit: PieceUnit): boolean {
  return unit.pieces.every((p) => pieceSolved(state, p));
}

/** 묶음의 조각 가운데 하나라도 지금 위·앞·오른쪽에 스티커가 보이는가 */
export function unitVisible(state: PuzzleState, unit: PieceUnit): boolean {
  const t = topo3();
  return unit.pieces.some((p) => {
    const at = t.pieces[locationOf(state, p)];
    return (at?.stickers ?? []).some((s) =>
      VISIBLE_FACES.has(t.stickers[s]?.face ?? -1),
    );
  });
}

/** 묶음 조각들의 스티커 정체 */
export function unitStickers(unit: PieceUnit): number[] {
  const t = topo3();
  return unit.pieces.flatMap((p) => [...(t.pieces[p]?.stickers ?? [])]);
}

/**
 * 묶음이 들어갈 곳(센터 색 기준 제자리)에 지금 붙은 스티커의 정체. 「넣을 곳」을 빛낼 때 쓴다
 * (지금 그 자리에 있는 조각의 스티커가 빛난다)
 */
export function slotStickers(state: PuzzleState, unit: PieceUnit): number[] {
  const t = topo3();
  const centers = centerColors(state);
  const out: number[] = [];
  for (const p of unit.pieces) {
    const want = [...pieceFaces(p)].sort().join(",");
    const kind = kindOf(p);
    const home = t.pieces.findIndex(
      (q) =>
        q.kind === kind &&
        q.stickers
          .map((s) => centers[t.stickers[s]?.face ?? -1])
          .sort()
          .join(",") === want,
    );
    for (const s of t.pieces[home]?.stickers ?? [])
      out.push(state.perm[s] as number);
  }
  return out;
}

/**
 * 묶음들 가운데 하나라도 보일 때까지 `SEARCH_ORDER`대로 돌린 큐브 돌리기(이미 보이면 빈 목록).
 * 돌릴 때마다 보이는 세 면만 본다. 끝까지 안 보이면 null(3×3에서는 생기지 않는다)
 */
export function searchTurns(
  state: PuzzleState,
  units: readonly PieceUnit[],
): string[] | null {
  const seen = (s: PuzzleState) => units.some((u) => unitVisible(s, u));
  if (seen(state)) return [];
  const out: string[] = [];
  let s = state;
  for (const t of SEARCH_ORDER) {
    s = applyMoves(3, s, parseMoves(3, t));
    out.push(t);
    if (seen(s)) return out;
  }
  return null;
}

/**
 * 수 [from, to) 동안(states[i]는 i번째 수 앞 상태) 새로 맞춘 묶음을 돌려준다. 걸음 차례로 [끝 걸음, 그때 맞춘 묶음].
 * 처음부터 맞은 묶음은 넣지 않는다. 해법의 수 꼴(살피는 자리, 공식 모양)에 기대지 않고 상태만 본다.
 *
 * 새로 맞은 묶음이 둘 이상이면 맞은 걸음으로 나눈다(최적 십자처럼 한 번에 짠 수, 살피는 자리 없이 이어 넣은
 * 수): 묶음마다 「그 걸음부터 끝까지 내내 맞은」 가장 이른 걸음에서, `guard`(이미 맞춘 것을 지켜야 하는 묶음,
 * 앞 단계 것 포함) 가운데 처음에 맞아 있던 것이 모두 다시 맞은 걸음까지 늦춘다(잠깐 빼냈다 되돌리는 수가 끝나기
 * 전에 끊지 않게). 하나면 `to`에서 끊는다
 */
export function splitByUnits(
  states: readonly PuzzleState[],
  from: number,
  to: number,
  units: readonly PieceUnit[],
  guard: readonly PieceUnit[] = units,
): { at: number; units: PieceUnit[] }[] {
  const start = states[from];
  const end = states[to];
  if (!start || !end) return [];
  const fresh = units.filter(
    (u) => !unitSolved(start, u) && unitSolved(end, u),
  );
  if (fresh.length <= 1) return fresh.length ? [{ at: to, units: fresh }] : [];
  const kept = guard.filter((u) => unitSolved(start, u));
  const groups = new Map<number, PieceUnit[]>();
  for (const u of fresh) {
    let at = to;
    while (at - 1 > from && unitSolved(states[at - 1] as PuzzleState, u)) at--;
    while (
      at < to &&
      !kept.every((k) => unitSolved(states[at] as PuzzleState, k))
    )
      at++;
    groups.set(at, [...(groups.get(at) ?? []), u]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, us]) => ({ at, units: us }));
}

/** 자리 `positions`에 지금 있는 스티커 정체 */
export const idsAt = (state: PuzzleState, positions: readonly number[]) =>
  positions.map((p) => state.perm[p] as number);

/** 묶음의 조각이 지금 자리 `positions`(스티커 자리 번호)를 꼭 채우는가(방향은 따지지 않는다) */
export function unitAt(
  state: PuzzleState,
  unit: PieceUnit,
  positions: readonly number[],
): boolean {
  const want = new Set(unitStickers(unit));
  const here = idsAt(state, positions);
  return here.length === want.size && here.every((id) => want.has(id));
}

// ---------- 마지막 층 단계(윗면이 마지막 층, 3×3) ----------

/** 윗면 엣지 칸 · 윗면 전부 · 위 엣지 옆 칸 · 위 코너(U 스티커 먼저) · 위층 옆 칸(면마다 왼쪽부터) */
const U_EDGES = [1, 3, 5, 7];
const U_ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const EDGE_SIDES = [10, 19, 37, 46];
const TOP_CORNERS = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
];
const SIDE_ROWS = [
  [18, 19, 20],
  [9, 10, 11],
  [45, 46, 47],
  [36, 37, 38],
];

type LlKind = "u-edges" | "u-face" | "corners" | "edge-sides" | "side-rows";

/**
 * 마지막 층 단계마다 맞출 칸(docs/47 0절 2026-11-05 「마지막면 맞추는 건 무엇을 맞추는 단계인지 하이라이트」).
 * 단계 이름은 `@game/cube-ai`의 `STAGE_LABELS`를 따른다. 초보자는 노란 십자(`eo`) → 옆면 맞추기(`ll-edges`) →
 * 코너 자리(`ll-corner-place`) → 코너 방향(`ll-corner-twist`), 프리드리히는 `oll` → `pll`, 두 단계 공식은
 * `eo`·`co`·`cp`·`ep`
 */
const LL_STAGES: Readonly<Record<string, LlKind>> = {
  eo: "u-edges",
  co: "u-face",
  oll: "u-face",
  "ll-corner-twist": "u-face",
  cp: "corners",
  "ll-corner-place": "corners",
  ep: "edge-sides",
  "ll-edges": "edge-sides",
  pll: "side-rows",
};

export const isLlStage = (n: number, stage: string) =>
  n === 3 && stage in LL_STAGES;

function llPositions(kind: LlKind): number[] {
  switch (kind) {
    case "u-edges":
      return U_EDGES;
    case "u-face":
      return U_ALL;
    case "corners":
      return TOP_CORNERS.flat();
    case "edge-sides":
      return EDGE_SIDES;
    case "side-rows":
      return SIDE_ROWS.flat();
  }
}

/** 단계가 맞출 칸에 지금 있는 스티커 정체(단계 시작에 「넣을 곳」으로 빛낸다). 마지막 층 단계가 아니면 빈 목록 */
export function llTargetIds(state: PuzzleState, stage: string): number[] {
  const kind = LL_STAGES[stage];
  return kind ? idsAt(state, llPositions(kind)) : [];
}

/** 맞출 칸 가운데 지금 맞은 칸(센터 색 기준)의 자리 */
function llCorrectPositions(state: PuzzleState, kind: LlKind): number[] {
  const colors = faceColors(3, state);
  const centers = centerColors(state);
  const face = (p: number) => Math.floor(p / 9);
  const ok = (p: number) => colors[p] === centers[face(p)];
  if (kind === "corners")
    return TOP_CORNERS.filter((c) => {
      const have = c.map((p) => colors[p]).sort();
      const want = c.map((p) => centers[face(p)]).sort();
      return have.every((v, i) => v === want[i]);
    }).flat();
  return llPositions(kind).filter(ok);
}

/** 맞출 칸 가운데 지금 맞은 칸의 스티커 정체 */
export function llCorrectIds(state: PuzzleState, stage: string): number[] {
  const kind = LL_STAGES[stage];
  return kind ? idsAt(state, llCorrectPositions(state, kind)) : [];
}

/**
 * 공식을 고르려고 알아보는 모양(「찾은 조각」으로 빛낸다). 상태만 본다.
 * - 노란 십자: 윗면 센터와 노란 엣지 칸(점·ㄱ자·일자). 노란 면(OLL·코너 방향 공식): 위층의 노란 칸 전부.
 *   초보자 코너 방향은 이 토막이 돌릴 코너(`after`에서 새로 노랑이 위를 본 코너).
 * - 옆면 맞추기·위 엣지 자리: 윗면만 돌려 옆색이 가장 많이 맞는 자리에서 맞는 엣지의 옆 칸.
 * - 코너 자리: 이미 제자리인 코너. PLL: 옆 칸 가운데 같은 줄 이웃과 색이 같은 칸(전조등·막대), 그런 칸이 없으면 옆 칸 전체.
 */
export function llShapeIds(
  state: PuzzleState,
  stage: string,
  after?: PuzzleState,
): number[] {
  const kind = LL_STAGES[stage];
  if (!kind) return [];
  const colors = faceColors(3, state);
  const yellow = colors[4] as number;
  if (stage === "ll-corner-twist" && after) {
    const was = new Set(
      idsAt(
        state,
        [0, 2, 6, 8].filter((p) => colors[p] === yellow),
      ),
    );
    const now = faceColors(3, after);
    const fixed = TOP_CORNERS.filter(
      (c) => now[c[0] as number] === yellow,
    ).filter((c) => !was.has(after.perm[c[0] as number] as number));
    const ids = new Set(fixed.flatMap((c) => idsAt(after, c)));
    return [...ids];
  }
  switch (kind) {
    case "u-edges":
      return idsAt(state, [4, ...U_EDGES.filter((p) => colors[p] === yellow)]);
    case "u-face":
      return idsAt(
        state,
        [...U_ALL, ...SIDE_ROWS.flat()].filter((p) => colors[p] === yellow),
      );
    case "edge-sides": {
      let best: number[] = [];
      for (const t of ["", "U", "U2", "U'"]) {
        const s = t ? applyMoves(3, state, parseMoves(3, t)) : state;
        const ids = idsAt(s, llCorrectPositions(s, "edge-sides"));
        if (ids.length > best.length) best = ids;
      }
      return best;
    }
    case "corners":
      return idsAt(state, llCorrectPositions(state, "corners"));
    case "side-rows": {
      const marked = SIDE_ROWS.flatMap((row) =>
        row.filter((p) => row.some((q) => q !== p && colors[q] === colors[p])),
      );
      // 전조등·막대가 하나도 없는 모양(E 퍼뮤처럼)은 옆 칸 전체를 보고 고른다
      return idsAt(state, marked.length ? marked : SIDE_ROWS.flat());
    }
  }
}
