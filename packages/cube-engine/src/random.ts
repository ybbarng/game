import {
  createRng,
  nextInt,
  type RngState,
  shuffleInPlace,
} from "@game/mighty-engine";
import { type PuzzleState, permParity, type Vec3 } from "@game/puzzle-core";
import { AXES } from "./move";
import {
  B,
  CUBE_ROTATIONS,
  type CubeTopology,
  cross,
  cubeTopology,
  D,
  dot,
  F,
  faceOfNormal,
  layerOf,
  QUARTER_TURNS,
  quarterTurnsBetween,
  type Rot,
  rotate,
  U,
  vecEqual,
} from "./topology";

/**
 * 무작위 상태와 맞출 수 있는지 판정(docs/47 2-3).
 *
 * 해법기 없이 조각별로 섞는다. 맞출 수 있는 조건은 셋이다.
 * 1. 꼭짓점 방향 합이 3의 배수, 가운데 모서리(홀수 크기) 방향 합이 짝수.
 * 2. 궤도(수로 서로 자리를 바꿀 수 있는 조각 묶음)마다 순열의 홀짝을 모은 값이,
 *    층 하나를 90° 돌리는 수들의 홀짝 값으로 만들 수 있는 묶음 안에 있다.
 *    (4×4의 "가운데 홀짝 = 꼭짓점 홀짝" 같은 규칙을 크기마다 손으로 적지 않고 계산한다.)
 * 3. 날개 모서리·안쪽 가운데 조각은 자리가 정해지면 방향도 정해진다(자리로 옮기는 회전이 하나뿐).
 */

export type Seed = number | RngState;

/** 씨앗(수)이면 새 난수 생성기를, 생성기면 그대로 */
export function createRngFromSeed(seed: Seed): RngState {
  return typeof seed === "number" ? createRng(seed) : seed;
}

/** 조각 P를 조각 자리 Q로 옮기는 큐브 회전들(가짓수 = 그 조각이 그 자리에 놓일 수 있는 방향 수) */
function rotationsBetween(topo: CubeTopology, p: number, q: number): Rot[] {
  const from = topo.pieces[p]?.position as Vec3;
  const to = topo.pieces[q]?.position as Vec3;
  return CUBE_ROTATIONS.filter((g) => vecEqual(rotate(g, from), to));
}

/** 조각 P의 스티커를 회전 g로 옮겨 상태에 적는다 */
function place(
  topo: CubeTopology,
  perm: Uint16Array,
  twist: Uint8Array,
  p: number,
  g: Rot,
): void {
  const piece = topo.pieces[p];
  if (!piece) return;
  const pos = rotate(g, piece.position);
  for (const s of piece.stickers) {
    const st = topo.stickers[s];
    if (!st) continue;
    const normal = rotate(g, st.normal);
    const j = topo.stickerAt(pos, faceOfNormal(normal));
    const target = topo.stickers[j];
    if (!target) throw new Error("스티커 자리를 찾지 못했다");
    perm[j] = s;
    twist[j] = quarterTurnsBetween(target.up, normal, rotate(g, st.up));
  }
}

/** 조각 자리 Q에 지금 들어 있는 조각(스티커 첫 자리로 본다) */
function pieceIn(topo: CubeTopology, state: PuzzleState, q: number): number {
  const slot = topo.pieces[q]?.stickers[0] as number;
  const sticker = state.perm[slot] as number;
  return topo.stickers[sticker]?.piece as number;
}

/** 궤도마다 조각 순열의 홀짝(비트 i = 궤도 i가 홀) */
export function orbitParityMask(n: number, state: PuzzleState): number {
  const topo = cubeTopology(n);
  let mask = 0;
  topo.orbits.forEach((o, i) => {
    const local = new Map(o.pieces.map((p, k) => [p, k]));
    const perm = o.pieces.map(
      (q) => local.get(pieceIn(topo, state, q)) as number,
    );
    if (permParity(perm)) mask |= 1 << i;
  });
  return mask;
}

const spanCache = new Map<number, Set<number>>();

/** 층 하나 90° 돌리기들의 홀짝 값으로 만들 수 있는 모든 값 */
export function reachableParityMasks(n: number): ReadonlySet<number> {
  const hit = spanCache.get(n);
  if (hit) return hit;
  const topo = cubeTopology(n);
  const gens: number[] = [];
  AXES.forEach((axis, ai) => {
    const rot = QUARTER_TURNS[axis];
    for (let l = 1; l <= n; l++) {
      let mask = 0;
      topo.orbits.forEach((o, oi) => {
        const local = new Map(o.pieces.map((p, k) => [p, k]));
        const perm = o.pieces.map((p, k) => {
          const pos = topo.pieces[p]?.position as Vec3;
          if (layerOf(n, pos[ai] as number) !== l) return k;
          return local.get(topo.pieceAt(rotate(rot, pos))) as number;
        });
        if (permParity(perm)) mask |= 1 << oi;
      });
      gens.push(mask);
    }
  });
  const span = new Set([0]);
  for (const g of gens) {
    for (const v of [...span]) span.add(v ^ g);
  }
  spanCache.set(n, span);
  return span;
}

/** 조각 자리 Q에서 어느 스티커 자리가 기준(U·D 면, 없으면 F·B 면)인가 */
function referenceSlot(topo: CubeTopology, q: number): number {
  const slots = topo.pieces[q]?.stickers ?? [];
  const ud = slots.find((s) => {
    const f = topo.stickers[s]?.face;
    return f === U || f === D;
  });
  if (ud !== undefined) return ud;
  return slots.find((s) => {
    const f = topo.stickers[s]?.face;
    return f === F || f === B;
  }) as number;
}

/** 조각 자리 Q에서 조각의 기준 스티커(색이 U·D, 없으면 F·B)가 있는 스티커 자리 */
function pieceReferenceAt(
  topo: CubeTopology,
  state: PuzzleState,
  q: number,
): number {
  const slots = topo.pieces[q]?.stickers ?? [];
  const nn = topo.n * topo.n;
  const colorOf = (s: number) => Math.floor((state.perm[s] as number) / nn);
  const ud = slots.find((s) => colorOf(s) === U || colorOf(s) === D);
  if (ud !== undefined) return ud;
  return slots.find((s) => colorOf(s) === F || colorOf(s) === B) as number;
}

/** 꼭짓점 방향 합(3으로 나눈 나머지). 맞출 수 있으면 0 */
export function cornerTwistSum(n: number, state: PuzzleState): number {
  const topo = cubeTopology(n);
  let sum = 0;
  topo.pieces.forEach((piece, q) => {
    if (piece.kind !== "corner") return;
    const ref = referenceSlot(topo, q);
    const at = pieceReferenceAt(topo, state, q);
    if (at === ref) return;
    const a = topo.stickers[ref]?.normal as Vec3;
    const b = topo.stickers[at]?.normal as Vec3;
    sum += dot(cross(a, b), piece.position) > 0 ? 1 : 2;
  });
  return sum % 3;
}

/** 가운데 모서리 방향 합(2로 나눈 나머지). 맞출 수 있으면 0. 짝수 크기는 늘 0 */
export function edgeFlipSum(n: number, state: PuzzleState): number {
  const topo = cubeTopology(n);
  let sum = 0;
  topo.pieces.forEach((piece, q) => {
    if (piece.kind !== "edge") return;
    if (pieceReferenceAt(topo, state, q) !== referenceSlot(topo, q)) sum++;
  });
  return sum % 2;
}

/**
 * 맞출 수 있는 상태인가(스티커 순열만 본다. 방향 `twist`는 보지 않는다).
 * 조각이 깨지지 않았는지, 홀수 크기 가운데 6개가 한 방향으로 돌린 모양인지, 위 조건 1·2를 본다.
 *
 * 주의: **조각 단위 판정**이다. 큰 큐브에서 같은 색 날개 모서리끼리(또는 같은 색 안쪽 가운데끼리)
 * 자리만 바뀐 상태는 눈으로는 똑같아도 false가 될 수 있다. 사용자가 색을 칠해 넣은 큐브를
 * 검사하는 데 쓰지 말 것(색만으로는 조각 번호를 정할 수 없다).
 */
export function isSolvable(n: number, state: PuzzleState): boolean {
  const topo = cubeTopology(n);
  for (let q = 0; q < topo.pieces.length; q++) {
    const p = pieceIn(topo, state, q);
    if (topo.pieces[p]?.orbit !== topo.pieces[q]?.orbit) return false;
    const ok = rotationsBetween(topo, p, q).some((g) => {
      const piece = topo.pieces[p];
      if (!piece) return false;
      const pos = rotate(g, piece.position);
      return piece.stickers.every((s) => {
        const normal = rotate(g, topo.stickers[s]?.normal as Vec3);
        return state.perm[topo.stickerAt(pos, faceOfNormal(normal))] === s;
      });
    });
    if (!ok) return false;
  }
  const centers = topo.pieces
    .map((p, i) => (p.kind === "center" ? i : -1))
    .filter((i) => i >= 0);
  if (centers.length > 0) {
    const asRotation = CUBE_ROTATIONS.some((g) =>
      centers.every(
        (p) =>
          pieceIn(
            topo,
            state,
            topo.pieceAt(rotate(g, topo.pieces[p]?.position as Vec3)),
          ) === p,
      ),
    );
    if (!asRotation) return false;
  }
  return (
    cornerTwistSum(n, state) === 0 &&
    edgeFlipSum(n, state) === 0 &&
    reachableParityMasks(n).has(orbitParityMask(n, state))
  );
}

export interface RandomStateOptions {
  /**
   * 맞은 채로 둘 조각 자리 번호들(일부만 섞기). 나머지만 무작위로 섞는다.
   * 홀수 크기의 면 정가운데 조각은 늘 그대로 둔다.
   */
  keep?: readonly number[];
}

/**
 * 맞출 수 있는 무작위 상태. 같은 씨앗이면 같은 상태가 나온다.
 * 큐브 전체 방향은 맞춘 상태 그대로(위 흰색·앞 초록)다.
 *
 * 가운데 조각의 방향(`twist`)은 늘 0으로 둔다. 그래서 그림 큐브(`orientCenters`)에는 아직 맞지 않는다:
 * 실물에서는 가운데 방향 합의 홀짝이 꼭짓점 순열의 홀짝과 묶여 있어, 그림 큐브용으로 쓰려면
 * 그 조건에 맞춰 가운데 방향도 무작위로 정해야 한다.
 */
export function randomCubeState(
  n: number,
  seed: Seed,
  opts: RandomStateOptions = {},
): PuzzleState {
  const topo = cubeTopology(n);
  const rng = createRngFromSeed(seed);
  const keep = new Set(opts.keep ?? []);
  topo.pieces.forEach((p, i) => {
    if (p.kind === "center") keep.add(i);
  });

  // 1. 궤도마다 자유로운 조각이 2개 미만이면 그 궤도의 홀짝은 짝으로 정해진다
  const free = topo.orbits.map((o) => o.pieces.filter((p) => !keep.has(p)));
  let locked = 0;
  free.forEach((f, i) => {
    if (f.length < 2) locked |= 1 << i;
  });
  const choices = [...reachableParityMasks(n)].filter((m) => !(m & locked));
  const target = choices[nextInt(rng, choices.length)] as number;

  // 2. 궤도마다 목표 홀짝에 맞춰 자리 섞기
  const placed: { p: number; q: number; options: Rot[] }[] = [];
  const perm = new Uint16Array(topo.stickerCount);
  const twist = new Uint8Array(topo.stickerCount);
  for (const p of keep) place(topo, perm, twist, p, CUBE_ROTATIONS[0] as Rot);
  free.forEach((slots, oi) => {
    if (slots.length === 0) return;
    const pieces = shuffleInPlace(rng, [...slots]);
    const local = new Map(slots.map((p, k) => [p, k]));
    const parity = permParity(pieces.map((p) => local.get(p) as number));
    if (parity !== ((target >> oi) & 1)) {
      [pieces[0], pieces[1]] = [pieces[1] as number, pieces[0] as number];
    }
    slots.forEach((q, k) => {
      const p = pieces[k] as number;
      const options = rotationsBetween(topo, p, q);
      const g = options[nextInt(rng, options.length)] as Rot;
      place(topo, perm, twist, p, g);
      placed.push({ p, q, options });
    });
  });
  const state: PuzzleState = { perm, twist };

  // 3. 마지막 자유 꼭짓점·가운데 모서리의 방향으로 방향 합을 맞춘다
  for (const kind of ["corner", "edge"] as const) {
    const sum = kind === "corner" ? cornerTwistSum : edgeFlipSum;
    const last = placed.findLast(({ q }) => topo.pieces[q]?.kind === kind);
    if (!last) continue;
    for (const g of last.options) {
      if (sum(n, state) === 0) break;
      place(topo, perm, twist, last.p, g);
    }
  }
  return state;
}
