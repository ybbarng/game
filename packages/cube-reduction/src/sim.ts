/**
 * 색 배열 위에서 수를 돌리는 작은 도구들.
 *
 * 색 배열은 스티커 자리마다 색(면 번호 U R F D L B = 0~5)을 담는다. 자리 번호는
 * cube-engine의 스티커 번호와 같다(Kociemba 순서: U면 n×n개, R, F, D, L, B, 한 면 안에서는
 * 위 줄부터 왼쪽에서 오른쪽으로).
 */
import {
  type CubeMove,
  formatMoves,
  moveTable,
  parseMoves,
} from "@game/cube-engine";

export type Colors = Uint8Array;

/** 수 하나를 돌린 새 색 배열 */
export function applyMoveColors(
  n: number,
  colors: Colors,
  move: CubeMove,
): Colors {
  const dest = moveTable(n, move).dest;
  const next = new Uint8Array(colors.length);
  for (let i = 0; i < colors.length; i++)
    next[dest[i] as number] = colors[i] as number;
  return next;
}

export function applyMovesColors(
  n: number,
  colors: Colors,
  moves: readonly CubeMove[],
): Colors {
  let c = colors;
  for (const m of moves) c = applyMoveColors(n, c, m);
  return c;
}

/**
 * 수열을 돌린 뒤 자리 p의 스티커가 원래 어느 자리에 있었는지(`src[p]`).
 * 돌린 뒤의 색은 `before[src[p]]`다.
 */
export function sourceMap(n: number, moves: readonly CubeMove[]): Int32Array {
  const size = 6 * n * n;
  let cur = new Int32Array(size);
  for (let i = 0; i < size; i++) cur[i] = i;
  for (const m of moves) {
    const dest = moveTable(n, m).dest;
    const next = new Int32Array(size);
    for (let i = 0; i < size; i++) next[dest[i] as number] = cur[i] as number;
    cur = next;
  }
  return cur;
}

/** 표기 → 수 목록(cube-engine 표기 그대로) */
export function moves(n: number, text: string): CubeMove[] {
  return parseMoves(n, text);
}

export function format(n: number, list: readonly CubeMove[]): string {
  return formatMoves(n, list);
}

export function invert(list: readonly CubeMove[]): CubeMove[] {
  return list.toReversed().map((m) => ({
    ...m,
    turns: (4 - m.turns) as 1 | 2 | 3,
  }));
}

/** 같은 층을 잇달아 돌린 수를 하나로 합치고, 한 바퀴가 된 수는 지운다 */
export function simplify(list: readonly CubeMove[]): CubeMove[] {
  const out: CubeMove[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    if (
      last &&
      last.axis === m.axis &&
      last.from === m.from &&
      last.to === m.to
    ) {
      const t = (last.turns + m.turns) % 4;
      out.pop();
      if (t !== 0) out.push({ ...m, turns: t as 1 | 2 | 3 });
    } else {
      out.push(m);
    }
  }
  return out;
}

export const FACE_LETTERS = ["U", "R", "F", "D", "L", "B"] as const;

/** 바깥층 한 면 돌리기 18가지(면 U R F D L B × 1·2·3) */
export function outerMoves(n: number): CubeMove[][] {
  const out: CubeMove[][] = [];
  for (const f of FACE_LETTERS) {
    for (const s of ["", "2", "'"]) out.push(moves(n, `${f}${s}`));
  }
  return out;
}

/** 바깥층 한 면 수 하나가 어느 면인지(0~5) */
export function outerFace(m: CubeMove): number {
  const plus = m.from === 1;
  const base = m.axis === "x" ? 1 : m.axis === "y" ? 0 : 2;
  return plus ? base : base + 3;
}

/**
 * 바깥층 수만으로 된 수열을 길이 0~`maxLength`까지 모두. 같은 면을 잇달아 두지 않고,
 * 맞은편 면은 U·R·F 쪽이 먼저 오게만 둔다(같은 결과를 되풀이하지 않게).
 */
export function outerSequences(n: number, maxLength: number): CubeMove[][] {
  const singles = outerMoves(n).map((l) => l[0] as CubeMove);
  const out: CubeMove[][] = [[]];
  let frontier: CubeMove[][] = [[]];
  for (let len = 1; len <= maxLength; len++) {
    const next: CubeMove[][] = [];
    for (const seq of frontier) {
      const last = seq[seq.length - 1];
      for (const m of singles) {
        if (last) {
          const lf = outerFace(last);
          const mf = outerFace(m);
          if (lf === mf) continue;
          if (last.axis === m.axis && lf > mf) continue;
        }
        next.push([...seq, m]);
      }
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}
