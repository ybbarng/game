// 큰 큐브 홈 시연 공통 자료(`hero-show-big.json`)를 크기마다 나눠 보는 시험의 공통 본문(시험 전용).
// 사이트 엔진으로 6×6·7×7 판이 무거워 크기마다 파일을 나눠 동시에 돈다. 파일 전체가 같은지는
// 판마다의 확인(여기)과 머리·판 차례·꼴의 확인(`core-fixtures-hero-big.test.ts`)을 합친 것이다.
import { it } from "vitest";

import { HERO_SHOW_BIG_CASES, heroShowCase } from "./core-fixtures-hero";
import { checkFixtureCase } from "./fixture-test-util";

/** 크기 `sizes`의 판마다 시험 하나: 그 판 줄이 지금 사이트 코드로 만든 판과 같은지 */
export function heroBigCaseTests(sizes: readonly number[]): void {
  HERO_SHOW_BIG_CASES.forEach(([method, seed], index) => {
    if (!sizes.includes(Number(method.split("-")[0]))) return;
    it(`한 판(${method}, 씨앗 ${seed}): 섞기·보여 주기 변환·연출 걸음`, () =>
      checkFixtureCase(
        "fixtures/hero-show-big.json",
        index,
        heroShowCase(method, seed),
      ));
  });
}
