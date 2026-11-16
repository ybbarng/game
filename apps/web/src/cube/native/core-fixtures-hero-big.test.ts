import { describe, expect, it } from "vitest";

import { HERO_METHODS, solveForHero } from "../hero/methods";
import {
  HERO_SHOW_BIG_CASES,
  HERO_SHOW_META,
  heroShowCase,
  heroStart,
} from "./core-fixtures-hero";
import { heroBigCaseTests } from "./core-fixtures-hero-big-cases";
import { checkFixtureLayout } from "./fixture-test-util";

// 큰 큐브 축소법은 판마다 무거워(사이트 엔진으로 6×6·7×7 판 하나가 1초 가까이) 2×2·3×3 자료와 나누고,
// 크기마다도 나눠 동시에 돈다: 4×4는 여기, 5×5·6×6은 core-fixtures-hero-big-56, 7×7은 core-fixtures-hero-big-7
describe("Rust 코어 공통 자료: 홈 시연(4×4~7×7 축소법)", () => {
  it("자료 파일의 머리·판 차례·꼴(판마다의 값은 크기별 시험이 본다)", () =>
    checkFixtureLayout(
      "fixtures/hero-show-big.json",
      HERO_SHOW_META,
      HERO_SHOW_BIG_CASES,
      (c) => [c.method, c.seed],
    ));
  heroBigCaseTests([4]);
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
