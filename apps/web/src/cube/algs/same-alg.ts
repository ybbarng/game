// 친 수가 「쓰는 공식」과 같은가(버릇 들이기 훈련, docs/47 8-1).
// 결과 모양 채점과 따로, 버릇을 들이려는 그 공식으로 풀었는지 본다. 다음은 봐준다:
// - 앞뒤 윗면 돌리기(AUF): 처음·끝의 U(같이 돈 D와는 따로)
// - 큐브 전체 돌리기(x·y·z): 친 수와 공식 모두 돌리기를 빼고 처음 방향으로 옮겨 적은 뒤, 공식을 큐브 방향 24가지로 쥐고 견준다
// - 표기 차이: R2와 R2', 잇달아 친 같은 층(R R = R2), 서로 바뀌어도 되는 같은 축 수의 차례(U D' = D' U)
// 넓게 돌리기와 「바깥 층 + 큐브 돌리기」(r = L x)처럼 다른 수로 같은 일을 하는 것은 다른 공식으로 본다.
import { type CubeMove, formatMoves, parseMoves } from "@game/cube-engine";

import { removeRotationMoves } from "./transform";

/** 같은 축 수가 이어진 묶음을 층 차례로 늘어놓고, 같은 층은 합친다(합쳐 제자리면 지운다). 더 바뀌지 않을 때까지 */
export function canonicalMoves(moves: readonly CubeMove[]): CubeMove[] {
  let cur = [...moves];
  for (;;) {
    const out: CubeMove[] = [];
    let i = 0;
    while (i < cur.length) {
      let j = i;
      const axis = cur[i]?.axis;
      while (j < cur.length && cur[j]?.axis === axis) j++;
      const group = cur
        .slice(i, j)
        .sort((a, b) => a.from - b.from || a.to - b.to);
      for (const m of group) {
        const last = out.at(-1);
        if (
          last &&
          last.axis === m.axis &&
          last.from === m.from &&
          last.to === m.to
        ) {
          out.pop();
          const t = (last.turns + m.turns) % 4;
          if (t !== 0) out.push({ ...m, turns: t as 1 | 2 | 3 });
        } else out.push(m);
      }
      i = j;
    }
    if (out.length === cur.length) return out;
    cur = out;
  }
}

/** 윗면(U 바깥 층) 수인가 */
function isTopTurn(top: CubeMove, m: CubeMove): boolean {
  return m.axis === top.axis && m.from === top.from && m.to === top.to;
}

/** 처음·끝 같은 축 묶음에서 윗면 돌리기를 뺀다 */
function stripAuf(n: number, moves: CubeMove[]): CubeMove[] {
  const top = parseMoves(n, "U")[0] as CubeMove;
  let out = moves;
  for (const end of ["head", "tail"] as const) {
    const idx = out.map((_, k) => k);
    const order = end === "head" ? idx : idx.reverse();
    for (const k of order) {
      const m = out[k] as CubeMove;
      if (m.axis !== top.axis) break;
      if (isTopTurn(top, m)) {
        out = out.filter((_, x) => x !== k);
        break;
      }
    }
  }
  return out;
}

/** 큐브 방향 24가지(쥐는 법) */
const HOLDS = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y2", "y'"].map((b) => `${a} ${b}`.trim()),
);

function key(
  n: number,
  moves: readonly CubeMove[],
  opts: SameAlgOptions,
): string {
  let m = canonicalMoves(removeRotationMoves(n, moves));
  if (opts.auf) m = stripAuf(n, m);
  return formatMoves(n, m);
}

export interface SameAlgOptions {
  /** 앞뒤 윗면 돌리기를 봐주나(마지막 층·F2L처럼 윗면을 돌려 맞추는 묶음) */
  auf: boolean;
}

/**
 * 친 수(되돌린 수는 빼고, 큐브 돌리기 포함)가 공식과 같은 공식인가.
 * 공식을 못 읽으면 아니다
 */
export function sameAlg(
  n: number,
  typed: readonly CubeMove[],
  alg: string,
  opts: SameAlgOptions,
): boolean {
  let algMoves: CubeMove[];
  try {
    algMoves = parseMoves(n, alg);
  } catch {
    return false;
  }
  const mine = key(n, typed, opts);
  return HOLDS.some(
    (hold) =>
      key(n, [...(hold ? parseMoves(n, hold) : []), ...algMoves], opts) ===
      mine,
  );
}
