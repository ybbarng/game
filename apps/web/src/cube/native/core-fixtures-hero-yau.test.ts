import { describe, expect, it } from "vitest";

import { solveForHero } from "../hero/methods";
import {
  HERO_SHOW_YAU_SEEDS,
  heroShowCase,
  heroStart,
} from "./core-fixtures-hero";
import { checkFixture } from "./fixture-test-util";

// 4×4 야우는 배우기 단원 규칙만 따라 가벼워(판 하나 수 ms) 파일 하나로 본다. 큰 큐브 축소법 자료와는 따로 둔다
describe("Rust 코어 공통 자료: 홈 시연(4×4 야우)", () => {
  it("한 판: 섞기·첫 면 색·보여 주기 변환·연출 걸음", () =>
    checkFixture("fixtures/hero-show-yau.json"));
  it("자료가 바로 푸는 야우는 사이트 해법 표(`solveForHero`)와 같은 첫 면 색·수를 낸다", async () => {
    for (const seed of HERO_SHOW_YAU_SEEDS) {
      const { state } = heroStart(4, seed);
      const site = await solveForHero("4-yau", state);
      const made = heroShowCase("4-yau", seed);
      expect([made.first, made.moves], `씨앗 ${seed}`).toEqual([
        site.first ?? 0,
        site.moves.join(" "),
      ]);
    }
  });
});
