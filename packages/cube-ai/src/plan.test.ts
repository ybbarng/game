import { randomCubeState } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { BOT_LEVELS } from "./methods";
import { BOT_SPEEDS, botPlan } from "./plan";

/** 속도 흉내: 같은 씨앗이면 같은 계획, 시각은 늘어나기만, 단계별 빠르기 차례 */

describe("botPlan", () => {
  const start3 = randomCubeState(3, 11);

  it("같은 씨앗이면 수와 시각까지 같고, 다른 씨앗이면 시각만 다르다", () => {
    const a = botPlan("advanced", 3, start3, 1);
    expect(botPlan("advanced", 3, start3, 1)).toEqual(a);
    const b = botPlan("advanced", 3, start3, 2);
    expect(b.moves.map((m) => m.move)).toEqual(a.moves.map((m) => m.move));
    expect(b.moves.map((m) => m.at)).not.toEqual(a.moves.map((m) => m.at));
  });

  it("시각은 살펴보기 뒤부터 늘어나기만 하고, 끝 시각은 마지막 수", () => {
    const p = botPlan("beginner", 3, start3, 3, { inspectionMs: 15_000 });
    let prev = 15_000;
    for (const m of p.moves) {
      expect(m.at).toBeGreaterThan(prev);
      prev = m.at;
    }
    expect(p.finishAt).toBe(prev);
  });

  it("단계가 높을수록 빨리 끝난다(3×3·2×2)", () => {
    for (const [size, start] of [
      [3, start3],
      [2, randomCubeState(2, 11)],
    ] as const) {
      const ends = BOT_LEVELS.map(
        (level) => botPlan(level, size, start, 5).finishAt,
      );
      for (let i = 1; i < ends.length; i++) {
        expect(ends[i]).toBeLessThan(ends[i - 1] as number);
      }
    }
  });

  it("평균 빠르기가 정해 둔 초당 수에 가깝다(멈춤을 빼고)", () => {
    const p = botPlan("intermediate", 3, start3, 7);
    const pauses = p.stages.filter((s) => s.end > s.start).length;
    const moving = p.finishAt - pauses * BOT_SPEEDS.intermediate.pauseMs;
    const tps = (p.moves.length / moving) * 1000;
    expect(tps).toBeGreaterThan(3);
    expect(tps).toBeLessThan(5.5);
  });

  it("4×4는 아직 없다", () => {
    expect(() => botPlan("beginner", 4, randomCubeState(4, 1), 1)).toThrow();
  });
});
