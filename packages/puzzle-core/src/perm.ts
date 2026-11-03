import type { MoveTable, PuzzleState } from "./types";

/**
 * 순열 도구.
 *
 * 순열은 "i가 p[i]로 간다"는 배열(`Uint16Array` 또는 수 배열)로 둔다.
 * 상태의 `perm`(자리 → 스티커)과 수 표의 `dest`(자리 → 옮겨 갈 자리)는 뜻이 다르니
 * 섞어 쓰지 않는다. 상태에 수를 적용할 때는 `applyTable`을 쓴다.
 */

export type Perm = ArrayLike<number>;

export function identityPerm(size: number): Uint16Array {
  const p = new Uint16Array(size);
  for (let i = 0; i < size; i++) p[i] = i;
  return p;
}

/** 먼저 `a`, 다음 `b`를 따른 순열: i → b[a[i]] */
export function composePerm(a: Perm, b: Perm): Uint16Array {
  const out = new Uint16Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = b[a[i] as number] as number;
  return out;
}

export function invertPerm(p: Perm): Uint16Array {
  const out = new Uint16Array(p.length);
  for (let i = 0; i < p.length; i++) out[p[i] as number] = i;
  return out;
}

/** `values[i]`를 `p[i]` 자리로 옮긴 새 배열 */
export function applyPerm<T>(p: Perm, values: readonly T[]): T[] {
  const out = new Array<T>(values.length);
  for (let i = 0; i < values.length; i++) out[p[i] as number] = values[i] as T;
  return out;
}

/** 순열의 홀짝: 짝이면 0, 홀이면 1 */
export function permParity(p: Perm): 0 | 1 {
  const seen = new Uint8Array(p.length);
  let parity = 0;
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j] as number) {
      seen[j] = 1;
      len++;
    }
    parity ^= (len - 1) & 1;
  }
  return parity as 0 | 1;
}

export function isValidPerm(p: Perm): boolean {
  const seen = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i++) {
    const v = p[i] as number;
    if (!Number.isInteger(v) || v < 0 || v >= p.length || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}

/** 맞춘 상태: 자리 i에 스티커 i, 방향 0 */
export function solvedState(stickerCount: number): PuzzleState {
  return {
    perm: identityPerm(stickerCount),
    twist: new Uint8Array(stickerCount),
  };
}

export function cloneState(state: PuzzleState): PuzzleState {
  return { perm: state.perm.slice(), twist: state.twist.slice() };
}

export function statesEqual(a: PuzzleState, b: PuzzleState): boolean {
  if (a.perm.length !== b.perm.length) return false;
  for (let i = 0; i < a.perm.length; i++) {
    if (a.perm[i] !== b.perm[i] || a.twist[i] !== b.twist[i]) return false;
  }
  return true;
}

/** 상태에 수 표를 적용한 새 상태 */
export function applyTable(state: PuzzleState, table: MoveTable): PuzzleState {
  const size = state.perm.length;
  const perm = new Uint16Array(size);
  const twist = new Uint8Array(size);
  const { dest, twistDelta, twistMod } = table;
  for (let i = 0; i < size; i++) {
    const j = dest[i] as number;
    perm[j] = state.perm[i] as number;
    twist[j] =
      ((state.twist[i] as number) + (twistDelta[i] as number)) % twistMod;
  }
  return { perm, twist };
}

/** 먼저 `a`, 다음 `b`를 적용한 것과 같은 수 표 */
export function composeTables(a: MoveTable, b: MoveTable): MoveTable {
  const size = a.dest.length;
  const dest = new Uint16Array(size);
  const twistDelta = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const mid = a.dest[i] as number;
    dest[i] = b.dest[mid] as number;
    twistDelta[i] =
      ((a.twistDelta[i] as number) + (b.twistDelta[mid] as number)) %
      a.twistMod;
  }
  return { dest, twistDelta, twistMod: a.twistMod };
}

/** 되돌리는 수 표 */
export function invertTable(t: MoveTable): MoveTable {
  const size = t.dest.length;
  const dest = new Uint16Array(size);
  const twistDelta = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const j = t.dest[i] as number;
    dest[j] = i;
    twistDelta[j] = (t.twistMod - (t.twistDelta[i] as number)) % t.twistMod;
  }
  return { dest, twistDelta, twistMod: t.twistMod };
}
