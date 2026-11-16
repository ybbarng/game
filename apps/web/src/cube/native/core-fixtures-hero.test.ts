import { describe, expect, it } from "vitest";

import { HERO_METHODS, solveForHero } from "../hero/methods";
import { HERO_SYNC, heroShowCase, heroStart } from "./core-fixtures-hero";
import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료: 홈 시연", () => {
  it("3×3 프리드리히: 십자가 가장 싼 첫 면 색과 그 풀이", () =>
    checkFixture("fixtures/hero.json"));
  it("Cubie 홈 시연 한 판(2×2·3×3 해법 여섯): 섞기·보여 주기 변환·연출 걸음", () =>
    checkFixture("fixtures/hero-show.json"));
  it("자료가 바로 푸는 해법은 사이트 해법 표(`solveForHero`)와 같은 첫 면 색·수를 낸다", async () => {
    expect(Object.keys(HERO_SYNC).sort()).toEqual(
      HERO_METHODS.map((m) => m.id).sort(),
    );
    for (const def of HERO_METHODS.filter((m) => m.size <= 3)) {
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
