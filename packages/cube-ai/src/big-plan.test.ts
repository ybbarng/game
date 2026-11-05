import { randomCubeState } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { botPlan, botSpeed } from "./plan";
import { BOT_LEVELS, type BotSkill } from "./skill";

/** 큰 큐브 속도 흉내: 결정적, 시각은 늘어나기만, 3×3보다 느리다 */

const level = (l: (typeof BOT_LEVELS)[number]): BotSkill => ({
  kind: "level",
  level: l,
});

describe("4×4 botPlan", () => {
  const start4 = randomCubeState(4, 31);

  it("같은 씨앗이면 같은 계획, 시각은 살펴보기 뒤부터 늘어나기만 한다", () => {
    const a = botPlan(level("club"), 4, start4, 1, { inspectionMs: 15_000 });
    expect(
      botPlan(level("club"), 4, start4, 1, { inspectionMs: 15_000 }),
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
    const ends = BOT_LEVELS.map((l) => {
      const t4 = botPlan(level(l), 4, start4, 5).finishAt;
      expect(t4).toBeGreaterThan(botPlan(level(l), 3, start3, 5).finishAt);
      return t4;
    });
    for (let i = 1; i < ends.length; i++) {
      expect(ends[i]).toBeLessThan(ends[i - 1] as number);
    }
  });

  it("큰 큐브는 단계마다 찾는 단계 초당 수가 3×3보다 낮다", () => {
    for (const l of BOT_LEVELS) {
      expect(botSpeed(l, 4).searchTps).toBeLessThan(botSpeed(l, 3).searchTps);
    }
  });
});
