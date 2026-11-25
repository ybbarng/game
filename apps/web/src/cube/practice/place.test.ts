import { applyMoves, parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { notationKeymap, twoHandKeymap } from "../input/keymaps";
import { goalMet } from "../learn/judge";
import { algTokens } from "../learn/notation";
import { PLACE_STAGES, placeCase } from "./place";
import { caseStart, PRACTICE_N, problemFor } from "./problem";

const n = PRACTICE_N;
const solves = (start: Parameters<typeof applyMoves>[1], alg: string) =>
  applyMoves(n, start, parseMoves(n, algTokens(alg).join(" ")));

describe("상황 놓기", () => {
  it("메뉴 묶음은 2단계 OLL → 2단계 PLL → OLL → PLL", () => {
    expect(PLACE_STAGES.map((s) => s.title)).toEqual([
      "2단계 OLL",
      "2단계 PLL",
      "OLL",
      "PLL",
    ]);
    // OLL 57개·PLL 21개가 모두 든다
    expect(PLACE_STAGES.map((s) => s.cases.length)).toEqual([
      expect.any(Number),
      expect.any(Number),
      57,
      21,
    ]);
  });

  it("모든 상황: 놓은 모양은 공식 연습 문제의 시작 모양이고, 대표 공식과 보일 공식 모두 그 단계를 푼다", () => {
    let count = 0;
    for (const stage of PLACE_STAGES)
      for (const c of stage.cases) {
        const start = caseStart(stage, c);
        // 대표 공식(자료의 첫 공식, 앞에 맞춤을 붙여서)
        const common = problemFor(stage, c, "", c.algs[0] as string);
        expect(common, `${stage.id} ${c.id} 대표`).not.toBeNull();
        expect(
          goalMet(n, solves(start, common?.alg ?? ""), stage.goal(c)),
          `${stage.id} ${c.id} 대표`,
        ).toBe(true);
        for (const km of [twoHandKeymap(), notationKeymap()]) {
          const p = placeCase(stage.id, c.id, km);
          expect(p?.start).toEqual(start);
          const goal = stage.goal(c);
          expect(
            goalMet(n, solves(start, p?.alg ?? ""), goal),
            `${stage.id} ${c.id}`,
          ).toBe(true);
          // 놓은 모양은 아직 풀리지 않았다(공식 없이 통과 모양이 아니다)
          expect(goalMet(n, start, goal), `${stage.id} ${c.id}`).toBe(false);
          count++;
        }
      }
    expect(count).toBeGreaterThan(150);
  });

  it("내 공식(`cube.algs.v1`)에서 고른 공식이 있으면 그것을 보인다", () => {
    const pll = PLACE_STAGES[3];
    const t = pll?.cases.find((c) => c.source && c.algs.length > 1);
    if (!pll || !t?.source) throw new Error("자료");
    const mine = t.algs[1] as string;
    const p = placeCase(pll.id, t.id, twoHandKeymap(), {
      [t.source.id]: { mine: [], use: mine },
    });
    expect(p?.alg.endsWith(mine)).toBe(true);
  });

  it("상황 놓기 단계가 아니거나 모르는 상황이면 놓지 않는다", () => {
    const km = twoHandKeymap();
    expect(placeCase("f2l", "f2l-1", km)).toBeNull();
    expect(placeCase("pll", "nope", km)).toBeNull();
  });
});
