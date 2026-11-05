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
const WHITE = 0;
const YELLOW = 3;

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

/** 단계 이름 → 그 단계에서 하나씩 넣는 묶음들. 찾기를 하지 않는 단계면 null */
export function unitsForStage(n: number, stage: string): PieceUnit[] | null {
  if (n !== 3) return null;
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
 * 처음부터 맞은 묶음은 넣지 않는다.
 *
 * `split`이면 맞은 걸음으로 더 나눈다(최적 십자처럼 살피는 자리 없이 한 번에 짠 수를 엣지 하나씩): 묶음마다
 * 「그 걸음부터 끝까지 내내 맞은」 가장 이른 걸음에서, 처음에 맞아 있던 묶음이 모두 다시 맞은 걸음까지 늦춘다
 * (잠깐 빼냈다 되돌리는 수가 끝나기 전에 끊지 않게). 아니면 모두 `to`에서 한 묶음이다
 */
export function splitByUnits(
  states: readonly PuzzleState[],
  from: number,
  to: number,
  units: readonly PieceUnit[],
  split = false,
): { at: number; units: PieceUnit[] }[] {
  const start = states[from];
  const end = states[to];
  if (!start || !end) return [];
  const fresh = units.filter(
    (u) => !unitSolved(start, u) && unitSolved(end, u),
  );
  if (!fresh.length) return [];
  if (!split) return [{ at: to, units: fresh }];
  const kept = units.filter((u) => unitSolved(start, u));
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
