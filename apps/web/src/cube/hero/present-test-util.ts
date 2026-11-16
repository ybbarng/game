/**
 * 보여 주기 변환 시험이 같이 쓰는 도우미. 시험이 오래 걸려 파일을 나눠 동시에 돈다
 * (present.test.ts 변환, present-search.test.ts 조각 찾기·강조, present-turns.test.ts 조각마다 큐브 돌리기).
 * 섞기는 정해진 rng로 결정적이다
 */
import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { orientForSolve, randomScramble } from "./loop";
import { findHeroMethod, solveWithFirst } from "./methods";
import { type PresentOutput, presentSolve } from "./present";

function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

export const play = (n: number, s: PuzzleState, moves: readonly string[]) =>
  applyMoves(n, s, parseMoves(n, moves.join(" ")));

export const sameState = (a: PuzzleState, b: PuzzleState) =>
  a.perm.every((v, i) => v === b.perm[i]);

/** 연출처럼 섞고(큐브 돌리기·가운데 층 포함) 풀기 전 방향을 맞춘 상태(`HeroLoop`이 해법에 넘기는 것) */
function scrambled(n: number, seed: number): PuzzleState {
  const len = n === 2 ? 11 : n === 3 ? 20 : 30;
  const s = play(n, solvedCube(n), randomScramble(seq(seed), len, n));
  const o = orientForSolve(n, s);
  return o.length ? play(n, s, o) : s;
}

interface Case {
  id: string;
  seeds: number[];
}

export const CASES: Case[] = [
  { id: "2-beginner", seeds: [1, 2, 3, 4] },
  { id: "2-algs", seeds: [1, 2, 3] },
  { id: "3-beginner", seeds: [1, 2, 3, 4, 5, 6] },
  { id: "3-cfop", seeds: [1, 2, 3, 4, 5, 6] },
  { id: "3-roux", seeds: [1, 2] },
  { id: "3-zz", seeds: [1, 2] },
  { id: "4-beginner", seeds: [7] },
  { id: "4-cfop", seeds: [7] },
  { id: "5-beginner", seeds: [7] },
  { id: "5-cfop", seeds: [7] },
];

export async function run(id: string, seed: number) {
  const def = findHeroMethod(id);
  if (!def) throw new Error(id);
  const n = def.size;
  const start = scrambled(n, seed);
  // 연출과 같이 첫 면 색을 고른다(초보자는 흰색, 그 밖은 십자가 가장 싼 색)
  const { raw, first } = await solveWithFirst(def, start);
  const shown = presentSolve(n, start, raw, def.view, first);
  return { n, start, raw, shown, view: def.view, first };
}

/** 단계마다 [수 번호 → 그 수 앞 상태]를 차례로 */
export function statesAt(
  n: number,
  start: PuzzleState,
  moves: readonly string[],
) {
  const out = [start];
  let s = start;
  for (const m of moves) {
    s = play(n, s, [m]);
    out.push(s);
  }
  return out;
}

export const centerColor = (n: number, s: PuzzleState, face: number) => {
  const c = Math.floor(n / 2);
  return faceColors(n, s)[face * n * n + c * n + c];
};
/** 면 위 첫 면 색(`color`, 기본 흰) 스티커 수 */
export const whites = (n: number, s: PuzzleState, face: number, color = 0) =>
  Array.from(faceColors(n, s).slice(face * n * n, (face + 1) * n * n)).filter(
    (c) => c === color,
  ).length;

/** 넣는 차례 경계: 단계 시작과 단계 안 살피기 자리 */
export function segments(
  shown: PresentOutput,
  name: string,
): [number, number][] {
  const st = shown.stages.find((s) => s.name === name);
  if (!st || st.end <= st.start) return [];
  const cuts = [
    st.start,
    ...shown.looks.filter((l) => l > st.start && l < st.end),
    st.end,
  ];
  return cuts.slice(0, -1).map((c, i) => [c, cuts[i + 1] as number]);
}
