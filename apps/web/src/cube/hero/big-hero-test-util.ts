import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { expect } from "vitest";

import { orientForSolve, randomScramble } from "./loop";
import type { HeroSize, HeroSolve } from "./methods";

/** 시험에서만 쓰는 도구: 6×6·7×7 첫 화면 연출 한 판(연출처럼 섞고 방향을 맞춘 뒤 푼다) */

function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/**
 * 연출 섞기(큐브 돌리기·안쪽 층 포함)로 `len`수 섞는다. 축소법이 섞기마다 막히지 않는지는 cube-reduction 시험이
 * 무작위 상태로 보므로, 여기서는 연출 길(첫 면 색 고르기·보여 주기 변환·꼬리표)을 보려고 짧게 섞어 빨리 돈다
 */
export function heroScrambled(
  n: HeroSize,
  seed: number,
  len: number,
): PuzzleState {
  let s = applyMoves(
    n,
    solvedCube(n),
    parseMoves(n, randomScramble(seq(seed), len, n).join(" ")),
  );
  const o = orientForSolve(n, s);
  if (o.length) s = applyMoves(n, s, parseMoves(n, o.join(" ")));
  return s;
}

/**
 * 해법 `id`로 푼 연출 수가 끝까지 맞추고, 단계가 축소(센터 → 엣지 짝) → 3×3 차례로 이어지는지 본다.
 * 초보자면 첫 면이 흰색(「흰 십자」), 그 밖은 고른 색 이름이 꼬리표에 나온다
 */
export function expectBigHero(
  n: HeroSize,
  id: string,
  start: PuzzleState,
  h: HeroSolve,
): void {
  const end = applyMoves(n, start, parseMoves(n, h.moves.join(" ")));
  expect(isSolved(n, end)).toBe(true);
  const labels = h.stages.filter((s) => s.end > s.start).map((s) => s.label);
  expect(labels.slice(0, 3)).toEqual([
    "흰·노랑 센터",
    "나머지 센터",
    "엣지 짝",
  ]);
  const colors = ["흰", "빨간", "초록", "노란", "주황", "파란"];
  const cross = `${colors[h.first ?? 0]} 십자`;
  expect(labels).toContain(cross);
  if (id.endsWith("beginner")) expect(h.first).toBe(0);
  // 3×3 단계는 축소가 다 끝난 뒤에 시작한다
  expect(labels.indexOf(cross)).toBeGreaterThan(labels.indexOf("엣지 짝"));
  // 단계 경계가 이어진다
  let at = 0;
  for (const st of h.stages) {
    expect(st.start).toBe(at);
    at = st.end;
  }
  expect(at).toBe(h.moves.length);
}
