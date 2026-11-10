/**
 * 크기마다 축소법이 보는 자리 묶음: 가운데 조각 자리, 모서리 칸(slot) 12개.
 */
import { cubeTopology, moveTable } from "@game/cube-engine";

/** 모서리 칸 하나: 두 면과, 그 칸에 놓인 조각마다 [첫 면 스티커 자리, 둘째 면 스티커 자리] */
export interface EdgeSlot {
  readonly faces: readonly [number, number];
  readonly pieces: readonly (readonly [number, number])[];
  /** 칸의 모든 스티커 자리 */
  readonly stickers: readonly number[];
  /** 홀수 크기에서 가운데 모서리 조각이 `pieces`의 몇 번째인지(짝수 크기는 -1) */
  readonly midge: number;
  /** 조각마다 모서리 끝에서 떨어진 칸 수(1부터, 맞은편 끝에서 센 것과 작은 쪽). 같은 값이 한 날개 묶음 */
  readonly depth: readonly number[];
  /**
   * 짝을 견줄 기준 조각(`pieces` 번호). 홀수 크기는 가운데 모서리 조각 하나, 짝수 크기는 가장 안쪽 날개 둘
   * (4×4는 날개 둘 다). 나머지 날개는 기준과 같은 색이면 짝이 맞은 것이다
   */
  readonly anchor: readonly number[];
}

export interface ReductionGeometry {
  readonly n: number;
  /** 움직이는 가운데 조각의 스티커 자리(홀수 크기의 정가운데는 빼고) */
  readonly centers: readonly number[];
  /** 홀수 크기의 면 정가운데 스티커 자리(면 순서), 짝수 크기는 빈 배열 */
  readonly fixedCenters: readonly number[];
  readonly slots: readonly EdgeSlot[];
  /** 스티커 자리 → 그 자리가 속한 모서리 칸 번호(모서리가 아니면 -1) */
  readonly slotOf: Int8Array;
  /** 스티커 자리 → 가운데 조각 자리인가 */
  readonly isCenter: Uint8Array;
}

const cache = new Map<number, ReductionGeometry>();

export function faceOfSticker(n: number, p: number): number {
  return Math.floor(p / (n * n));
}

/** 모서리 스티커 자리가 모서리 끝에서 떨어진 칸 수(1부터, 가까운 끝 기준) */
export function stickerDepth(n: number, p: number): number {
  const i = p % (n * n);
  const r = Math.floor(i / n);
  const c = i % n;
  const t = r === 0 || r === n - 1 ? c : r;
  return Math.min(t, n - 1 - t);
}

/** 날개 묶음(모서리 끝에서 떨어진 칸 수) 목록. 4×4·5×5는 [1], 6×6·7×7은 [1, 2] */
export function wingDepths(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= Math.floor((n - 2) / 2); d++) out.push(d);
  return out;
}

export function reductionGeometry(n: number): ReductionGeometry {
  const hit = cache.get(n);
  if (hit) return hit;
  const topo = cubeTopology(n);
  const centers: number[] = [];
  const fixedCenters = new Array<number>(n % 2 === 1 ? 6 : 0).fill(-1);
  const slotMap = new Map<
    string,
    { faces: [number, number]; list: number[] }
  >();
  for (const piece of topo.pieces) {
    if (piece.kind === "innerCenter") {
      centers.push(...piece.stickers);
    } else if (piece.kind === "center") {
      const s = piece.stickers[0] as number;
      fixedCenters[topo.stickers[s]?.face as number] = s;
    } else if (piece.kind === "edge" || piece.kind === "wing") {
      const faces = piece.stickers
        .map((s) => topo.stickers[s]?.face as number)
        .sort((a, b) => a - b) as [number, number];
      const key = faces.join(",");
      let slot = slotMap.get(key);
      if (!slot) {
        slot = { faces, list: [] };
        slotMap.set(key, slot);
      }
      slot.list.push(topo.pieces.indexOf(piece));
    }
  }
  centers.sort((a, b) => a - b);
  const slotOf = new Int8Array(topo.stickerCount).fill(-1);
  const isCenter = new Uint8Array(topo.stickerCount);
  for (const c of centers) isCenter[c] = 1;
  const slots: EdgeSlot[] = [...slotMap.values()].map((s, i) => {
    const pieces = s.list.map((pi) => {
      const stickers = topo.pieces[pi]?.stickers ?? [];
      const onFace = (f: number) =>
        stickers.find((st) => topo.stickers[st]?.face === f) as number;
      return [onFace(s.faces[0]), onFace(s.faces[1])] as const;
    });
    const stickers = pieces.flat();
    for (const st of stickers) slotOf[st] = i;
    const midge = s.list.findIndex((pi) => topo.pieces[pi]?.kind === "edge");
    const depth = pieces.map(([p]) => stickerDepth(n, p));
    const inner = Math.max(...depth);
    const anchor =
      midge >= 0 ? [midge] : depth.flatMap((d, k) => (d === inner ? [k] : []));
    return { faces: s.faces, pieces, stickers, midge, depth, anchor };
  });
  const g: ReductionGeometry = {
    n,
    centers,
    fixedCenters,
    slots,
    slotOf,
    isCenter,
  };
  cache.set(n, g);
  return g;
}

const stickerClassCache = new Map<number, Int32Array>();

/**
 * 스티커 자리마다 "수로 서로 옮겨 갈 수 있는 자리 묶음" 번호. 날개 조각은 두 스티커가 서로
 * 다른 묶음에 속해서, 색 두 개와 묶음으로 어느 날개인지 알 수 있다.
 */
function stickerClasses(n: number): Int32Array {
  const hit = stickerClassCache.get(n);
  if (hit) return hit;
  const size = 6 * n * n;
  const parent = new Int32Array(size);
  for (let i = 0; i < size; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r] as number;
    return r;
  };
  for (const axis of ["x", "y", "z"] as const) {
    for (let l = 1; l <= n; l++) {
      const dest = moveTable(n, { axis, from: l, to: l, turns: 1 }).dest;
      for (let i = 0; i < size; i++) {
        const a = find(i);
        const b = find(dest[i] as number);
        if (a !== b) parent[a] = b;
      }
    }
  }
  const out = new Int32Array(size);
  for (let i = 0; i < size; i++) out[i] = find(i);
  stickerClassCache.set(n, out);
  return out;
}

/**
 * 날개 조각 순열의 홀짝(맞춘 상태 기준). `depth`를 주면 그 날개 묶음만 본다(6×6·7×7은 묶음이 둘이고
 * 묶음마다 따로 홀짝이 있다). 홀수 크기에서 짝 지은 모양은 묶음마다 늘 짝이라, 홀이면 그 묶음에
 * 모서리 패리티 공식이 한 번 있어야 한다. 짝수 크기는 묶음끼리 홀짝이 같아야 짝 지을 수 있다.
 */
export function wingParity(
  n: number,
  colors: Uint8Array,
  depth?: number,
): number {
  const g = reductionGeometry(n);
  const cls = stickerClasses(n);
  // 날개 자리 목록(맞춘 상태에서 그 자리에 있는 날개 = 같은 번호)
  const wings: (readonly [number, number])[] = [];
  for (const s of g.slots) {
    s.pieces.forEach((p, i) => {
      if (i === s.midge) return;
      if (depth !== undefined && s.depth[i] !== depth) return;
      wings.push(p);
    });
  }
  const perm = wings.map(([q1, q2]) => {
    const x = colors[q1] as number;
    const y = colors[q2] as number;
    // 색 x를 x면에, y를 y면에 두는 날개 가운데, q1과 같은 묶음의 스티커를 x면에 둔 것
    return wings.findIndex(
      ([s1, s2]) =>
        (faceOfSticker(n, s1) === x &&
          faceOfSticker(n, s2) === y &&
          cls[s1] === cls[q1]) ||
        (faceOfSticker(n, s2) === x &&
          faceOfSticker(n, s1) === y &&
          cls[s2] === cls[q1]),
    );
  });
  if (perm.includes(-1)) throw new Error("날개 조각을 알아보지 못했다");
  let parity = 0;
  const seen = new Array<boolean>(perm.length).fill(false);
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = perm[j] as number) {
      seen[j] = true;
      len++;
    }
    parity ^= (len + 1) & 1;
  }
  return parity;
}

/**
 * 모서리 짝 점수(날개를 하나씩 붙여 가는 것도 나아진 것으로 센다). 홀수 크기는 가운데 모서리 조각과 맞은
 * 날개 수. 짝수 크기는 가장 안쪽 날개 둘이 맞으면 1에 그 둘과 맞은 날개 수를 더한다(4×4는 짝이 맞으면 1).
 */
export function slotScore(
  slot: EdgeSlot,
  color: (p: number) => number,
): number {
  const first = slot.pieces[slot.anchor[0] as number] as readonly [
    number,
    number,
  ];
  const a = color(first[0]);
  const b = color(first[1]);
  const same = (i: number) => {
    const p = slot.pieces[i] as readonly [number, number];
    return color(p[0]) === a && color(p[1]) === b;
  };
  let score = 0;
  if (slot.anchor.length === 2) {
    if (!same(slot.anchor[1] as number)) return 0;
    score = 1;
  }
  for (let i = 0; i < slot.pieces.length; i++)
    if (!slot.anchor.includes(i) && same(i)) score++;
  return score;
}

/** 칸의 조각이 모두 같은 두 색을 같은 면에 보이면 짝이 맞은 것 */
export function slotPaired(
  slot: EdgeSlot,
  color: (p: number) => number,
): boolean {
  const first = slot.pieces[0] as readonly [number, number];
  const a = color(first[0]);
  const b = color(first[1]);
  for (let i = 1; i < slot.pieces.length; i++) {
    const p = slot.pieces[i] as readonly [number, number];
    if (color(p[0]) !== a || color(p[1]) !== b) return false;
  }
  return true;
}
