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
    return { faces: s.faces, pieces, stickers, midge };
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
 * 날개 조각 순열의 홀짝(맞춘 상태 기준). 홀수 크기에서 짝 지은 모양은 늘 짝이라, 홀이면
 * 모서리 패리티 공식이 한 번 있어야 한다.
 */
export function wingParity(n: number, colors: Uint8Array): number {
  const g = reductionGeometry(n);
  const cls = stickerClasses(n);
  // 날개 자리 목록(맞춘 상태에서 그 자리에 있는 날개 = 같은 번호)
  const wings: (readonly [number, number])[] = [];
  for (const s of g.slots) {
    s.pieces.forEach((p, i) => {
      if (i !== s.midge) wings.push(p);
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
 * 모서리 짝 점수. 짝수 크기는 짝이 다 맞으면 1, 홀수 크기는 가운데 모서리 조각과 맞은 날개 수
 * (날개를 하나씩 붙여 가는 것도 나아진 것으로 센다).
 */
export function slotScore(
  slot: EdgeSlot,
  color: (p: number) => number,
): number {
  if (slot.midge < 0) return slotPaired(slot, color) ? 1 : 0;
  const mid = slot.pieces[slot.midge] as readonly [number, number];
  const a = color(mid[0]);
  const b = color(mid[1]);
  let score = 0;
  for (let i = 0; i < slot.pieces.length; i++) {
    if (i === slot.midge) continue;
    const p = slot.pieces[i] as readonly [number, number];
    if (color(p[0]) === a && color(p[1]) === b) score++;
  }
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
