import { randomCubeState } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { BOT_LEVELS } from "./methods";
import { BIG_BOT_SPEEDS, BOT_SPEEDS, botPlan } from "./plan";

/** 큰 큐브 속도 흉내: 결정적, 시각은 늘어나기만, 3×3보다 느리다 */

describe("4×4 botPlan", () => {
  const start4 = randomCubeState(4, 31);

  it("같은 씨앗이면 같은 계획, 시각은 살펴보기 뒤부터 늘어나기만 한다", () => {
    const a = botPlan("intermediate", 4, start4, 1, { inspectionMs: 15_000 });
    expect(
      botPlan("intermediate", 4, start4, 1, { inspectionMs: 15_000 }),
    ).toEqual(a);
    let prev = 15_000;
    for (const m of a.moves) {
      expect(m.at).toBeGreaterThan(prev);
      prev = m.at;
    }
    expect(a.finishAt).toBe(prev);
  });

  it("같은 단계의 3×3보다 오래 걸리고, 단계가 높을수록 빨리 끝난다", () => {
    const start3 = randomCubeState(3, 31);
    const ends = BOT_LEVELS.map((level) => {
      const t4 = botPlan(level, 4, start4, 5).finishAt;
      expect(t4).toBeGreaterThan(botPlan(level, 3, start3, 5).finishAt);
      return t4;
    });
    for (let i = 1; i < ends.length; i++) {
      expect(ends[i]).toBeLessThan(ends[i - 1] as number);
    }
  });

  it("큰 큐브는 단계마다 초당 수가 3×3보다 낮다", () => {
    for (const level of BOT_LEVELS) {
      expect(BIG_BOT_SPEEDS[level].tps).toBeLessThan(BOT_SPEEDS[level].tps);
    }
  });
});
