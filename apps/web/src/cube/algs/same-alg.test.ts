import { parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { sameAlg } from "./same-alg";

const typed = (t: string) => parseMoves(3, t);
const LL = { auf: true };

describe("내 공식으로 풀었나", () => {
  const sune = "R U R' U R U2 R'";

  it("그대로 치면 같다", () => {
    expect(sameAlg(3, typed(sune), sune, LL)).toBe(true);
  });

  it("앞뒤 윗면 돌리기는 봐준다", () => {
    expect(sameAlg(3, typed(`U2 ${sune} U'`), sune, LL)).toBe(true);
    expect(sameAlg(3, typed(`U ${sune}`), `U' ${sune}`, LL)).toBe(true);
  });

  it("윗면 돌리기를 봐주지 않는 묶음은 다르다", () => {
    expect(sameAlg(3, typed(`U ${sune}`), sune, { auf: false })).toBe(false);
  });

  it("큐브 전체 돌리기는 봐준다(돌려 쥐고 같은 공식)", () => {
    expect(sameAlg(3, typed(`y ${sune}`), sune, LL)).toBe(true);
    expect(sameAlg(3, typed(`y2 ${sune} y2`), sune, LL)).toBe(true);
    // 공식 안의 x를 직접 치지 않고 같은 일을 한 수(돌리기를 빼고 옮겨 적은 것)
    expect(
      sameAlg(
        3,
        typed("x R' U R' D2 R U' R' D2 R2 x'"),
        "x R' U R' D2 R U' R' D2 R2 x'",
        LL,
      ),
    ).toBe(true);
    expect(
      sameAlg(
        3,
        typed("R' F R' B2 R F' R' B2 R2"),
        "x R' U R' D2 R U' R' D2 R2 x'",
        LL,
      ),
    ).toBe(true);
  });

  it("표기 차이: R2와 R2', 나눠 친 같은 층, 같은 축 차례", () => {
    expect(sameAlg(3, typed("R U R' U R U2' R'"), sune, LL)).toBe(true);
    expect(sameAlg(3, typed("R U R' U R U U R'"), sune, LL)).toBe(true);
    expect(sameAlg(3, typed("R U R R' R' U R U2 R'"), sune, LL)).toBe(true);
    const g = "R2 U R' U R' U' R U' R2 U' D R' U R D'";
    expect(
      sameAlg(3, typed("R2 U R' U R' U' R U' R2 D U' R' U R D'"), g, LL),
    ).toBe(true);
  });

  it("다른 공식으로 같은 상황을 풀면 다르다", () => {
    // 수네를 왼손 거울(L' U' L ...)·다른 순서로 푼 것
    expect(sameAlg(3, typed("U L' U2 L U L' U L"), sune, LL)).toBe(false);
    // Ua: M 공식 대 R·U 공식
    expect(
      sameAlg(3, typed("R U' R U R U R U' R' U' R2"), "M2 U M U2 M' U M2", LL),
    ).toBe(false);
  });

  it("공식을 못 읽으면 아니다", () => {
    expect(sameAlg(3, typed(sune), "Q", LL)).toBe(false);
  });
});
