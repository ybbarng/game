import { describe, expect, it } from "vitest";

import { HERO_METHODS, solveForHero } from "../hero/methods";
import { heroShowCase, heroStart } from "./core-fixtures-hero";
import { checkFixture } from "./fixture-test-util";

// 큰 큐브 축소법은 판마다 무거워(사이트 엔진으로 6×6·7×7 몇 초) 2×2·3×3 자료와 나눠 따로 돈다
describe("Rust 코어 공통 자료: 홈 시연(4×4~7×7 축소법)", () => {
  it("한 판: 섞기·보여 주기 변환·연출 걸음", () =>
    checkFixture("fixtures/hero-show-big.json"));
  it("자료가 바로 푸는 해법은 사이트 해법 표(`solveForHero`)와 같은 첫 면 색·수를 낸다(4×4)", async () => {
    for (const def of HERO_METHODS.filter((m) => m.size === 4)) {
      const { state } = heroStart(def.size, 1);
      const site = await solveForHero(def.id, state);
      const made = heroShowCase(def.id, 1);
      expect([made.first, made.moves], def.id).toEqual([
        site.first ?? 0,
        site.moves.join(" "),
      ]);
    }
  });
});
