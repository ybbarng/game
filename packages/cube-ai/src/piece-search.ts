import { parseMoves } from "@game/cube-engine";
import { solvedFacelets } from "@game/cube-solver";
import { readCubie } from "./cubie";
import { applyToFacelets } from "./facelets";
import type { Tracked } from "./search";

/**
 * 고른 수 묶음(가운데 층 M, 두 층 r 포함)으로 조각 몇 개만 보는 작은 탐색(루·ZZ 해법).
 *
 * `search.ts`는 바깥 면 18수만 다룬다. 루는 가운데 층(M)을 돌리므로 가운데 조각이 움직이고,
 * 그래서 조각 좌표는 처음 정한 기준 방향(`Solve`의 고정 frame)에서 읽는다. 가운데 층이
 * 얼마나 돌았는지는 따로 센다(`center`: 위 가운데 자리에 무엇이 와 있나, 0 맞음·1·2·3).
 */

export interface PieceMove {
  /** WCA 표기(R, r', M2 등) */
  name: string;
  /** 꼭짓점 좌표(자리×3+방향) → 수 뒤 좌표 */
  corner: Uint8Array;
  /** 모서리 좌표(자리×2+방향) → 수 뒤 좌표 */
  edge: Uint8Array;
  /** 가운데 층이 도는 만큼(0..3) */
  center: number;
  axis: string;
  /** 같은 축 안 차례(같은 축 수는 서로 바꿔 둬도 같으니 한 차례로만 찾는다) */
  order: number;
}

const LAYER: Readonly<Record<string, [string, number]>> = {
  U: ["y", 0],
  D: ["y", 1],
  R: ["x", 0],
  r: ["x", 1],
  M: ["x", 2],
  L: ["x", 3],
  F: ["z", 0],
  B: ["z", 1],
};

/** 위 가운데 자리의 글자 → 가운데 층이 돈 만큼(M 한 번이면 뒤 가운데가 위로 온다) */
export const CENTER_OFFSET = ["U", "B", "D", "F"] as const;

const moveCache = new Map<string, PieceMove>();

/** 수 하나의 조각 좌표 표. 맞춘 3×3에 두고 읽은 조각 표현으로 만든다(`coordMoveTables`와 같은 방법) */
export function pieceMove(name: string): PieceMove {
  const hit = moveCache.get(name);
  if (hit) return hit;
  let f = solvedFacelets(3).split("");
  for (const m of parseMoves(3, name)) f = applyToFacelets(3, f, m);
  const M = readCubie(f.join(""), 3);
  const corner = new Uint8Array(24);
  const edge = new Uint8Array(24);
  for (let s2 = 0; s2 < 8; s2++) {
    const s = M.cp[s2] as number;
    for (let o = 0; o < 3; o++)
      corner[s * 3 + o] = s2 * 3 + ((o + (M.co[s2] as number)) % 3);
  }
  for (let s2 = 0; s2 < 12; s2++) {
    const s = M.ep[s2] as number;
    for (let o = 0; o < 2; o++)
      edge[s * 2 + o] = s2 * 2 + ((o + (M.eo[s2] as number)) % 2);
  }
  const center = CENTER_OFFSET.indexOf(f[4] as (typeof CENTER_OFFSET)[number]);
  const [axis, order] = LAYER[name[0] as string] as [string, number];
  const pm = { name, corner, edge, center, axis, order };
  moveCache.set(name, pm);
  return pm;
}

/** 면 글자들의 수 셋(R → R R2 R') */
export function moveSet(layers: string): PieceMove[] {
  return [...layers].flatMap((l) =>
    ["", "2", "'"].map((t) => pieceMove(`${l}${t}`)),
  );
}

/** 조각 좌표에 수 하나 */
export function step(t: Tracked, coord: number, m: PieceMove): number {
  return (t.kind === "c" ? m.corner : m.edge)[coord] as number;
}

const homeOf = (t: Tracked) => (t.kind === "c" ? t.piece * 3 : t.piece * 2);

const pdbCache = new Map<string, Uint8Array>();

/** 조각 묶음(4개까지)의 거리 표. 칸 번호 = Σ 좌표_k × 24^k */
export function pdb(group: readonly Tracked[], moves: readonly PieceMove[]) {
  const key = `${group.map((t) => `${t.kind}${t.piece}`).join(",")}|${moves
    .map((m) => m.name)
    .join(",")}`;
  const hit = pdbCache.get(key);
  if (hit) return hit;
  const k = group.length;
  const size = 24 ** k;
  const dist = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let start = 0;
  for (let i = k - 1; i >= 0; i--)
    start = start * 24 + homeOf(group[i] as Tracked);
  dist[start] = 0;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  const cur = new Array<number>(k).fill(0);
  while (head < tail) {
    const idx = queue[head++] as number;
    let rest = idx;
    for (let i = 0; i < k; i++) {
      cur[i] = rest % 24;
      rest = Math.floor(rest / 24);
    }
    const d = dist[idx] as number;
    for (const m of moves) {
      let next = 0;
      for (let i = k - 1; i >= 0; i--)
        next = next * 24 + step(group[i] as Tracked, cur[i] as number, m);
      if (dist[next] === 255) {
        dist[next] = d + 1;
        queue[tail++] = next;
      }
    }
  }
  pdbCache.set(key, dist);
  return dist;
}

/** 지켜볼 조각을 셋씩 묶어 거리 표를 만들고, 그중 가장 큰 값을 어림값으로 쓴다 */
export function chunkHeuristic(
  tracked: readonly Tracked[],
  moves: readonly PieceMove[],
): (c: Int8Array) => number {
  const groups: { members: number[]; table: Uint8Array }[] = [];
  for (let i = 0; i < tracked.length; i += 3) {
    const members = [i, i + 1, i + 2].filter((j) => j < tracked.length);
    groups.push({
      members,
      table: pdb(
        members.map((j) => tracked[j] as Tracked),
        moves,
      ),
    });
  }
  return (c) => {
    let best = 0;
    for (const { members, table } of groups) {
      let idx = 0;
      for (let i = members.length - 1; i >= 0; i--)
        idx = idx * 24 + (c[members[i] as number] as number);
      const v = table[idx] as number;
      if (v > best) best = v;
    }
    return best;
  };
}

export interface SearchSpec {
  tracked: readonly Tracked[];
  /** 조각 좌표(tracked 차례) */
  start: readonly number[];
  /** 가운데 층이 돈 만큼 */
  center?: number;
  moves: readonly PieceMove[];
  /** 남은 수의 어림값(실제보다 크면 안 된다) */
  h: (c: Int8Array, center: number) => number;
  /** 다 됐나. 없으면 지켜볼 조각이 모두 제자리·제방향 */
  goal?: (c: Int8Array, center: number) => boolean;
}

/**
 * IDA*. `depth`를 주면 그 길이만 찾는다(여러 후보 중 짧은 것을 고를 때), 아니면 `maxDepth`까지 늘려 간다.
 * 같은 층을 잇달아 두지 않고, 같은 축 수는 정한 차례로만 둔다. 찾은 수 이름 목록, 없으면 null.
 */
export function pieceSearch(
  spec: SearchSpec,
  opts: { depth?: number; maxDepth?: number } = {},
): string[] | null {
  const { tracked, moves, h } = spec;
  const k = tracked.length;
  const homes = tracked.map(homeOf);
  const goal =
    spec.goal ??
    ((c: Int8Array) => {
      for (let i = 0; i < k; i++) if (c[i] !== homes[i]) return false;
      return true;
    });
  const stack: Int8Array[] = [Int8Array.from(spec.start)];
  const path: PieceMove[] = [];
  const dfs = (
    depth: number,
    togo: number,
    center: number,
    prev: PieceMove | null,
  ): boolean => {
    const c = stack[depth] as Int8Array;
    if (togo === 0) return goal(c, center);
    if (stack.length <= depth + 1) stack.push(new Int8Array(k));
    const next = stack[depth + 1] as Int8Array;
    for (const m of moves) {
      if (prev && prev.axis === m.axis && m.order <= prev.order) continue;
      for (let i = 0; i < k; i++)
        next[i] = step(tracked[i] as Tracked, c[i] as number, m);
      const nc = (center + m.center) % 4;
      if (h(next, nc) > togo - 1) continue;
      path[depth] = m;
      if (dfs(depth + 1, togo - 1, nc, m)) return true;
    }
    return false;
  };
  const center0 = spec.center ?? 0;
  const h0 = h(stack[0] as Int8Array, center0);
  const lo = opts.depth ?? h0;
  const hi = opts.depth ?? opts.maxDepth ?? 20;
  for (let d = lo; d <= hi; d++) {
    if (d < h0) continue;
    if (dfs(0, d, center0, null)) return path.slice(0, d).map((m) => m.name);
  }
  return null;
}
