import { firstFaceMap, STAGE_LABELS } from "@game/cube-ai";
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { orientForSolve, randomScramble } from "./loop";
import {
  FIRST_COLOR_ORDER,
  findHeroMethod,
  heroStageLabel,
  solveForHero,
  solveWithFirst,
} from "./methods";

/**
 * 자동 맞추기 첫 면 색(docs/47 0절 2026-11-10): 초보자 해법은 늘 흰색, 그 밖은 십자(2×2는 첫 층, 루는 첫 블록,
 * ZZ는 EO라인)가 가장 싼 색이고 같으면 흰색 먼저. 꼬리표의 색 이름은 그 판의 색을 따른다.
 */

function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const play = (n: number, s: PuzzleState, text: string) =>
  text ? applyMoves(n, s, parseMoves(n, text)) : s;

/** 연출처럼 섞고 풀기 전 방향을 맞춘 상태 */
function scrambled(n: number, seed: number): PuzzleState {
  const len = n === 2 ? 11 : n === 3 ? 20 : 30;
  const s = play(n, solvedCube(n), randomScramble(seq(seed), len, n).join(" "));
  return play(n, s, orientForSolve(n, s).join(" "));
}

/** 단계 `stage`의 수(큐브 돌리기는 세지 않는다) */
function cost(
  moves: readonly string[],
  stages: readonly { name: string; start: number; end: number }[],
  stage: string,
): number {
  const st = stages.find((s) => s.name === stage);
  if (!st) return 0;
  return moves.slice(st.start, st.end).filter((m) => !/^[xyz]/.test(m)).length;
}

describe("첫 면 색 바꿈표(`firstFaceMap`)", () => {
  it("고른 색을 흰 글자로 읽고, 맞은편 짝을 지킨다(큐브 돌리기 하나와 같은 바꿈)", () => {
    expect(firstFaceMap(0)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const c of [0, 1, 2, 3, 4, 5]) {
      const map = firstFaceMap(c);
      expect(map[c]).toBe(0);
      expect(map[(c + 3) % 6]).toBe(3);
      expect([...map].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      for (const k of [0, 1, 2])
        expect((map[(k + 3) % 6] as number) % 3).toBe((map[k] as number) % 3);
    }
  });
});

describe("초보자 해법은 늘 흰 면부터", () => {
  it.each([
    ["2-beginner", 2],
    ["3-beginner", 3],
    ["4-beginner", 4],
  ] as const)("%s", async (id, n) => {
    for (const seed of n === 4 ? [7] : [1, 2, 3]) {
      const h = await solveForHero(id, scrambled(n, seed));
      expect(h.first).toBe(0);
      if (n >= 3) {
        expect(h.stages.map((s) => s.label)).toContain("흰 십자");
        expect(h.stages.map((s) => s.label)).toContain("노란 십자");
      }
    }
  });
});

describe("그 밖의 해법은 십자가 가장 싼 색(같으면 흰색)", () => {
  it("맞춘 큐브는 모든 색이 0수라 흰색, U 한 번이면 노랑, R 한 번이면 주황", async () => {
    const solved = solvedCube(3);
    expect((await solveForHero("3-cfop", solved)).first).toBe(0);
    // U는 흰 십자·옆 넷의 십자를 흩뜨리고 노란 십자만 남긴다
    expect((await solveForHero("3-cfop", play(3, solved, "U"))).first).toBe(3);
    // R은 주황(L) 십자만 남긴다
    const r = await solveForHero("3-cfop", play(3, solved, "R"));
    expect(r.first).toBe(4);
    expect(r.stages[0]?.label).toBe("주황 십자");
  });

  it.each([
    ["3-cfop", 3, "cross", [1, 2, 3, 4]],
    ["2-algs", 2, "first-layer", [1, 2, 3]],
    ["3-zz", 3, "eoline", [1, 2]],
    ["3-roux", 3, "fb", [1, 2]],
  ] as const)(
    "%s: 고른 색의 %s 단계 수가 여섯 색 가운데 가장 적다",
    async (id, n, stage, seeds) => {
      const def = findHeroMethod(id);
      if (!def) throw new Error(id);
      for (const seed of seeds) {
        const start = scrambled(n, seed);
        const costs: number[] = [];
        for (const c of FIRST_COLOR_ORDER) {
          const raw = await def.solve(start, c);
          costs[c] = cost(raw.moves, raw.stages, stage);
        }
        const { first } = await solveWithFirst(def, start);
        const min = Math.min(...costs);
        // 가장 싼 색 가운데 차례가 가장 앞선 색(흰색 먼저)
        expect(first).toBe(FIRST_COLOR_ORDER.find((c) => costs[c] === min));
      }
    },
  );
});

describe("꼬리표 색 이름", () => {
  it("십자는 첫 면 색, 마지막 층 십자·면은 맞은편 색, 그 밖은 그대로", () => {
    expect(heroStageLabel("cross", 0, STAGE_LABELS)).toBe("흰 십자");
    expect(heroStageLabel("eo", 0, STAGE_LABELS)).toBe("노란 십자");
    expect(heroStageLabel("co", 0, STAGE_LABELS)).toBe("노란 면");
    expect(heroStageLabel("cross", 3, STAGE_LABELS)).toBe("노란 십자");
    expect(heroStageLabel("eo", 3, STAGE_LABELS)).toBe("흰 십자");
    expect(heroStageLabel("cross", 1, STAGE_LABELS)).toBe("빨간 십자");
    expect(heroStageLabel("co", 1, STAGE_LABELS)).toBe("주황 면");
    expect(heroStageLabel("cross", 2, STAGE_LABELS)).toBe("초록 십자");
    expect(heroStageLabel("eo", 2, STAGE_LABELS)).toBe("파란 십자");
    expect(heroStageLabel("f2l-1", 4, STAGE_LABELS)).toBe("F2L 첫째 짝");
    expect(heroStageLabel("centers-ud", 4, STAGE_LABELS)).toBe("흰·노랑 센터");
  });
});
