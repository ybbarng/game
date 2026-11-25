// 해법 지도의 평균 수(solve-map.ts MAP_MEASURE)를 다시 잰다. 해법을 끝까지 돌려 무거워서 지도 시험과 나눠 함께 돈다.
import { solveCfop, solveRoux } from "@game/cube-ai";
import { solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import { describe, expect, it } from "vitest";

import { play } from "./beginner-path";
import { turnCount } from "./ll-compare";
import { MAP_MEASURE } from "./solve-map";
import { measureMap, methodRun } from "./solve-map-measure";

describe("평균 수", () => {
  it("MAP_MEASURE는 지금 단원 규칙·컴퓨터 해법으로 길마다 잰 값이다", () => {
    expect(measureMap(MAP_MEASURE.seeds)).toEqual(MAP_MEASURE);
  });

  it("컴퓨터 해법을 길로 나눌 때 빠진 수가 없다(길마다 센 수의 합 = 해법 전체 수)", () => {
    for (const seed of [1, 2, 3]) {
      const text = scramble("333", seed).text;
      const start = play(solvedCube(3), text);
      const sum = (r: Record<string, string>) =>
        Object.values(r).reduce((k, m) => k + turnCount([m]), 0);
      expect(
        [sum(methodRun("cfop", text)), sum(methodRun("roux", text))],
        `씨앗 ${seed}`,
      ).toEqual([
        turnCount(solveCfop(start).moves),
        turnCount(solveRoux(start).moves),
      ]);
    }
  });
});
