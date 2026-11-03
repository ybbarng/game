import {
  type Cubie,
  coordMoveTables,
  cornerCoord,
  edgeCoord,
  FACE_MOVE_COUNT,
} from "./cubie";

/**
 * 조각 몇 개만 보는 작은 탐색(십자, F2L 짝, 2×2 첫 층).
 *
 * 지켜볼 조각마다 좌표(자리×방향, 0..23)를 들고, 조각 묶음마다 "맞춘 상태까지 몇 수"
 * 표를 너비 우선으로 만들어 둔다(묶음 하나에 24^k칸, k ≤ 4). 탐색은 IDA*이고
 * 남은 거리 어림값은 묶음 표 값 중 가장 큰 것이다(어느 것도 실제보다 크지 않다).
 */

export interface Tracked {
  kind: "c" | "e";
  piece: number;
}

export function homeCoord(t: Tracked): number {
  return t.kind === "c" ? t.piece * 3 : t.piece * 2;
}

export function coordsOf(c: Cubie, tracked: readonly Tracked[]): number[] {
  return tracked.map((t) =>
    t.kind === "c" ? cornerCoord(c, t.piece) : edgeCoord(c, t.piece),
  );
}

const tableCache = new Map<string, Uint8Array>();

function keyOf(tracked: readonly Tracked[]): string {
  return tracked.map((t) => `${t.kind}${t.piece}`).join(",");
}

/** 조각 묶음의 거리 표(바깥 면 18수 기준). 칸 번호 = Σ 좌표_k × 24^k */
export function distanceTable(tracked: readonly Tracked[]): Uint8Array {
  const key = keyOf(tracked);
  const hit = tableCache.get(key);
  if (hit) return hit;
  const { corner, edge } = coordMoveTables();
  const k = tracked.length;
  const size = 24 ** k;
  const dist = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let start = 0;
  for (let i = k - 1; i >= 0; i--)
    start = start * 24 + homeCoord(tracked[i] as Tracked);
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
    for (let m = 0; m < FACE_MOVE_COUNT; m++) {
      let next = 0;
      for (let i = k - 1; i >= 0; i--) {
        const table = (tracked[i] as Tracked).kind === "c" ? corner : edge;
        next =
          next * 24 +
          (table[(cur[i] as number) * FACE_MOVE_COUNT + m] as number);
      }
      if (dist[next] === 255) {
        dist[next] = d + 1;
        queue[tail++] = next;
      }
    }
  }
  tableCache.set(key, dist);
  return dist;
}

export interface Heuristic {
  /** `tracked` 안에서 이 표가 보는 조각 자리들 */
  members: number[];
  table: Uint8Array;
}

/** `tracked`의 일부 묶음으로 어림 표를 만든다 */
export function heuristic(
  tracked: readonly Tracked[],
  members: number[],
): Heuristic {
  return {
    members,
    table: distanceTable(members.map((i) => tracked[i] as Tracked)),
  };
}

/** 같은 면, 그리고 맞은편 면은 U·R·F 쪽이 먼저 오게(D 다음 U는 두지 않는다) */
function skipMove(face: number, prevFace: number): boolean {
  return face === prevFace || face === prevFace - 3;
}

/**
 * 지켜볼 조각이 모두 제자리·제방향이 되는 가장 짧은 수(바깥 면 수 번호 목록).
 * `depth`를 정하면 그 길이만 찾는다(여러 목표 중 쉬운 것을 고를 때). 없으면 null.
 */
export function idaSearch(
  start: readonly number[],
  tracked: readonly Tracked[],
  hs: readonly Heuristic[],
  moves: readonly number[],
  opts: { maxDepth?: number; depth?: number } = {},
): number[] | null {
  const { corner, edge } = coordMoveTables();
  const k = tracked.length;
  const goal = tracked.map(homeCoord);
  const isCorner = tracked.map((t) => t.kind === "c");
  const stack: Int8Array[] = [];
  const path: number[] = [];

  const h = (c: Int8Array): number => {
    let best = 0;
    for (const { members, table } of hs) {
      let idx = 0;
      for (let i = members.length - 1; i >= 0; i--)
        idx = idx * 24 + (c[members[i] as number] as number);
      const v = table[idx] as number;
      if (v > best) best = v;
    }
    return best;
  };

  const isGoal = (c: Int8Array): boolean => {
    for (let i = 0; i < k; i++) if (c[i] !== goal[i]) return false;
    return true;
  };

  const dfs = (depth: number, togo: number, prevFace: number): boolean => {
    const c = stack[depth] as Int8Array;
    if (togo === 0) return isGoal(c);
    if (stack.length <= depth + 1) stack.push(new Int8Array(k));
    const next = stack[depth + 1] as Int8Array;
    for (const m of moves) {
      const face = Math.floor(m / 3);
      if (prevFace >= 0 && skipMove(face, prevFace)) continue;
      for (let i = 0; i < k; i++) {
        const table = isCorner[i] ? corner : edge;
        next[i] = table[(c[i] as number) * FACE_MOVE_COUNT + m] as number;
      }
      if (h(next) > togo - 1) continue;
      path[depth] = m;
      if (dfs(depth + 1, togo - 1, face)) return true;
    }
    return false;
  };

  stack.push(Int8Array.from(start));
  const first = stack[0] as Int8Array;
  const h0 = h(first);
  const lo = opts.depth ?? h0;
  const hi = opts.depth ?? opts.maxDepth ?? 20;
  for (let d = lo; d <= hi; d++) {
    if (d < h0) continue;
    if (dfs(0, d, -1)) return path.slice(0, d);
  }
  return null;
}
