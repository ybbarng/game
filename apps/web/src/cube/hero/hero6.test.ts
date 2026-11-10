import { describe, it } from "vitest";

import { expectBigHero, heroScrambled } from "./big-hero-test-util";
import { solveForHero } from "./methods";

// 6×6 연출(Cubie 홈 시연·첫 화면 크기 6×6). 짧은 섞기 하나로 두 해법을 본다. 축소법이 1~2초라 풀이는
// 불러올 때 한 번 한다(프리드리히는 같은 상태의 축소 해를 기억해 둔 것을 쓴다)
const start = heroScrambled(6, 1, 14);
const beginner = await solveForHero("6-beginner", start);
const cfop = await solveForHero("6-cfop", start);

describe("6×6 첫 화면 연출", () => {
  it("축소법(초보자): 흰 면부터 끝까지 맞춘다", () => {
    expectBigHero(6, "6-beginner", start, beginner);
  });
  it("축소법(프리드리히): 십자가 가장 싼 색으로 끝까지 맞춘다", () => {
    expectBigHero(6, "6-cfop", start, cfop);
  });
});
