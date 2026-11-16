import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { orientForSolve, randomScramble } from "./loop";
import { findHeroMethod, solveWithFirst } from "./methods";
import { presentSolve } from "./present";

/** `present.test.ts`에서 나눈 파일(섞기 200개가 혼자 3초라 파일을 따로 두어 동시에 돈다). 섞기는 정해진 rng로 결정적이다. */

function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const play = (n: number, s: PuzzleState, moves: readonly string[]) =>
  applyMoves(n, s, parseMoves(n, moves.join(" ")));

/** 연출처럼 섞고 풀기 전 방향을 맞춘 3×3 상태 */
function scrambled(seed: number): PuzzleState {
  const s = play(3, solvedCube(3), randomScramble(seq(seed), 20, 3));
  const o = orientForSolve(3, s);
  return o.length ? play(3, s, o) : s;
}

async function run(id: string, seed: number) {
  const def = findHeroMethod(id);
  if (!def) throw new Error(id);
  const start = scrambled(seed);
  const { raw, first } = await solveWithFirst(def, start);
  return { shown: presentSolve(3, start, raw, def.view, first) };
}

describe("조각마다 큐브 돌리기 → 반대 면 → 공식(2026-11-05 사용자 「먼저 큐브 전체를 돌려서 맞출 공간을 정면에 둔 후에 면을 돌려서 대상 조각을 앞으로 가져와서 넣어줘」)", () => {
  const isRot = (m: string) => /^[xyz]/.test(m);

  it("3×3 초보자 섞기 200개: 화면에서 큐브 돌리기는 조각 맨 앞(살피는 자리·강조 뒤)에만 오고, 반대 면 다음에는 오지 않는다", async () => {
    let gaps = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { shown } = await run("3-beginner", seed);
      const cuts = new Set([
        ...shown.looks,
        ...shown.marks.map((m) => m.at),
        ...shown.stages.map((s) => s.start),
      ]);
      for (const name of ["cross", "corners", "middle"]) {
        const st = shown.stages.find((s) => s.name === name);
        if (!st) continue;
        for (let i = st.start + 1; i < st.end; i++) {
          const prev = shown.moves[i - 1] as string;
          const cur = shown.moves[i] as string;
          if (cuts.has(i) || !isRot(cur) || isRot(prev)) continue;
          const at = `${seed} ${name}: ${shown.moves.slice(Math.max(st.start, i - 4), i + 2).join(" ")}`;
          // 십자만 빼기 토막 뒤 넣기 토막이 이어진다(공식이 F로 끝난 뒤)
          expect(name, at).toBe("cross");
          expect(prev, at).toMatch(/^F/);
        }
      }
      for (const g of shown.gaps) {
        // 쉬는 자리는 반대 면(D)으로 칸 밑에 둔 바로 뒤, 공식(F·R)의 첫 수 앞
        const st = shown.stages.find((s) => s.start <= g && g < s.end);
        expect(["cross", "corners"]).toContain(st?.name);
        expect(shown.moves[g - 1]).toMatch(/^D/);
        expect(shown.moves[g]).toMatch(/^[FR]/);
        gaps++;
      }
    }
    expect(gaps).toBeGreaterThan(200);
  });
});
