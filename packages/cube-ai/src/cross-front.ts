import { parseMoves } from "@game/cube-engine";
import { movePermutation } from "@game/cube-solver";
import { EDGE_FACELETS } from "./cubie";
import { toFaceletMove } from "./facelets";

/**
 * 흰 십자 엣지 하나를 앞면(F)으로만 올리는 가장 짧은 수(2026-11-05 사용자 「항상 D면으로 내려서 옮겨서 올려」).
 * 흰 면이 위(U)이고, 쓰는 수는 F·D·y뿐이다. 그래서 맞춘 면(U)도, 오른쪽·왼쪽·뒷면도 돌리지 않는다.
 * 엣지는 늘 아래층을 거친다: 아래층으로 내리고 D로 자리 밑에 두고, y로 그 자리를 앞으로 가져와 F로 올린다.
 * 가운데 줄 엣지를 바로 올리는 F'도 내렸다 올리는 「F F2」로 둔다(합치면 F').
 *
 * 너비 우선으로 찾는다. 쫓는 것은 넣을 엣지, 이미 맞춘 십자 엣지, 옆 센터 넷의 스티커 자리뿐이라
 * 상태가 작다. 문제는 (넣을 엣지의 흰 스티커 자리, 그 색, 이미 맞춘 자리) 하나로 정해지므로 답을 모아 둔다.
 *
 * 수 차례(2026-11-05 사용자 「먼저 큐브 전체를 돌려서 맞출 공간을 정면에 둔 후에 면을 돌려서 대상 조각을 앞으로
 * 가져와서 넣어줘」): 답은 토막을 이은 꼴이고, 토막 하나는 「큐브 돌리기(y, 없어도 됨) → 칸 밑으로 D(없어도 됨)
 * → F로 시작하는 공식(F·D)」이다. 큐브 돌리기는 토막 맨 앞에만 오고 D 바로 뒤에는 오지 않는다(D와 y는 같은 축이라
 * `D y`는 `y D`와 같다). 새 토막은 공식이 F로 끝난 뒤에만 시작한다. F·D만으로는 흰색이 옆(앞면)을 보는 엣지를
 * 세울 수 없어, 그런 엣지는 「빼기」 토막 뒤 「넣기」 토막으로 나뉜다. 고르는 차례: 토막이 적은 것, 짧은 것, y가 적은 것.
 * 예전(D를 y 앞에 두던 때)과 견주어 문제 672가지의 수 합은 2796 → 2800, 최대 8 그대로다.
 */

const MOVES = ["D", "D'", "D2", "F", "F'", "F2", "y", "y'", "y2"] as const;
/** 같은 층 수는 잇지 않고, D와 y는 바꿔 둬도 같아 D를 앞에 둔다 */
const LAYER = [0, 0, 0, 1, 1, 1, 2, 2, 2];

const PERMS: number[][] = MOVES.map((name) => {
  const m = parseMoves(3, name)[0];
  if (!m) throw new Error(name);
  return [...movePermutation(3, toFaceletMove(m))];
});

/** 십자 자리(UR UF UL UB)의 흰 스티커와 옆 스티커 */
const CROSS_WHITE = [5, 7, 3, 1];
const CROSS_SIDE = [10, 19, 37, 46];
/** 옆 센터 R F L B 자리 */
const SIDE_CENTERS = [13, 22, 40, 49];
const FACE_OF_SIDE = ["R", "F", "L", "B"] as const;
export type SideFace = (typeof FACE_OF_SIDE)[number];

const partnerOf = (i: number): number => {
  for (const [a, b] of EDGE_FACELETS) {
    if (a === i) return b;
    if (b === i) return a;
  }
  throw new Error(`엣지 스티커가 아니다: ${i}`);
};

const memo = new Map<string, string>();

/**
 * `white`: 넣을 엣지의 흰 스티커 자리(흰 면 위, 지금 쥔 방향), `color`: 그 엣지의 다른 색이 와야 할 면,
 * `solved`: 이미 맞은 십자 자리 번호(0 UR, 1 UF, 2 UL, 3 UB). 그 자리는 끝에도 맞아 있다.
 */
export function frontCrossInsert(
  white: number,
  color: SideFace,
  solved: readonly number[],
): string {
  const key = `${white}|${color}|${[...solved].sort().join("")}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const alg = search(white, color, solved);
  memo.set(key, alg);
  return alg;
}

function search(
  white: number,
  color: SideFace,
  solved: readonly number[],
): string {
  // 쫓는 스티커: [센터 R F L B, 넣을 엣지 흰·옆, 맞은 엣지마다 흰·옆]
  // 엣지마다 와야 할 센터 번호(0..3)
  const start: number[] = [...SIDE_CENTERS, white, partnerOf(white)];
  const want: number[] = [FACE_OF_SIDE.indexOf(color)];
  for (const j of solved) {
    start.push(CROSS_WHITE[j] as number, CROSS_SIDE[j] as number);
    want.push(j);
  }
  const done = (p: readonly number[]) =>
    want.every((c, e) => {
      const w = p[4 + e * 2] as number;
      const o = p[5 + e * 2] as number;
      return w < 9 && Math.floor(o / 9) === Math.floor((p[c] as number) / 9);
    });
  // 넣을 엣지가 아랫면에 닿았나(스티커 4·5번)
  const low = (p: readonly number[]) =>
    Math.floor((p[4] as number) / 9) === 3 ||
    Math.floor((p[5] as number) / 9) === 3;
  const v0 = low(start);
  if (done(start)) return "";
  for (let maxRounds = 1; maxRounds <= MAX_ROUNDS; maxRounds++) {
    const found = searchRounds(start, v0, low, done, maxRounds);
    if (found !== null) return found;
  }
  throw new Error("F·D·y로 십자 엣지를 넣지 못했다");
}

/** 한 엣지에 드는 토막 수 상한(문제 672가지 모두 이 안에서 풀린다) */
const MAX_ROUNDS = 3;

/** 토막 안 자리: 0 시작(아무 수나), 1 큐브 돌리기 뒤(D나 F), 2 칸 밑으로 D 뒤(F만), 3 공식 안 */
type Phase = 0 | 1 | 2 | 3;

function searchRounds(
  start: number[],
  v0: boolean,
  low: (p: readonly number[]) => boolean,
  done: (p: readonly number[]) => boolean,
  maxRounds: number,
): string | null {
  type Node = {
    p: number[];
    path: number[];
    ys: number;
    v: boolean;
    phase: Phase;
    rounds: number;
  };
  const seen = new Set<string>();
  let layer: Node[] = [
    { p: start, path: [], ys: 0, v: v0, phase: 0, rounds: 1 },
  ];
  for (let depth = 1; depth <= 14; depth++) {
    const next: Node[] = [];
    let best: Node | null = null;
    for (const node of layer) {
      const last = node.path.at(-1);
      const lastLayer = last === undefined ? -1 : (LAYER[last] as number);
      for (let mi = 0; mi < MOVES.length; mi++) {
        const kind = LAYER[mi] as number;
        let phase: Phase;
        let rounds = node.rounds;
        if (kind === 2) {
          // 큐브 돌리기는 토막 맨 앞에만: 처음, 또는 공식이 F로 끝난 뒤(새 토막). D 뒤의 y는 y 뒤의 D와 같아
          // (같은 축) 늘 y를 앞에 둔다
          if (node.phase === 0) phase = 1;
          else if (node.phase === 3 && lastLayer === 1) {
            if (rounds >= maxRounds) continue;
            rounds++;
            phase = 1;
          } else continue;
        } else if (kind === 0) {
          // D: 토막 앞에서 칸 밑으로 한 번, 또는 공식 안
          if (node.phase === 2 || lastLayer === 0) continue;
          phase = node.phase === 3 ? 3 : 2;
        } else {
          // 가운데 줄 엣지를 내렸다 올리는 F F2(합치면 F')만 같은 층을 잇는다
          const lowerRaise = (last === 3 || last === 4) && mi === 5;
          if (lastLayer === 1 && !lowerRaise) continue;
          phase = 3;
        }
        const perm = PERMS[mi] as number[];
        const p = node.p.map((i) => perm[i] as number);
        const v = node.v || low(p);
        const k = `${p.join(",")}|${v}|${phase}|${rounds}|${kind}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const child: Node = {
          p,
          path: [...node.path, mi],
          ys: node.ys + (kind === 2 ? 1 : 0),
          v,
          phase,
          rounds,
        };
        if (v && done(p)) {
          if (!best || child.ys < best.ys) best = child;
          continue;
        }
        next.push(child);
      }
    }
    if (best) return best.path.map((i) => MOVES[i]).join(" ");
    layer = next;
  }
  return null;
}
