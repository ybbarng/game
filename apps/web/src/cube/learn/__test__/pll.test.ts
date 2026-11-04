import { describe, expect, it } from "vitest";
import { PLL_CASES } from "../algs-pll";
import {
  cornerPermClass,
  f2lIntact,
  llCornerPerm,
  llOrientation,
  llSolvedUpToAuf,
  pllKey,
} from "./pieces";
import { apply, invert, solved } from "./sim";

const stateOf = (alg: string) => apply(solved(3), invert(alg));

describe("PLL 21", () => {
  it("21 상황이 있다", () => {
    expect(PLL_CASES).toHaveLength(21);
  });

  it.each(PLL_CASES)(
    "$name: 아래 두 층과 윗면 색을 지키고 자리만 바꾼다",
    (c) => {
      for (const alg of c.algs) {
        const s = stateOf(alg);
        expect(f2lIntact(s), alg).toBe(true);
        expect(llOrientation(s), alg).toBe("00000000");
        expect(llSolvedUpToAuf(s), alg).toBe(false);
      }
    },
  );

  it("대안 공식은 대표 공식과 같은 상황을 푼다", () => {
    for (const c of PLL_CASES) {
      const k = pllKey(invert(c.algs[0] as string));
      for (const alg of c.algs.slice(1))
        expect(pllKey(invert(alg)), `${c.name}: ${alg}`).toBe(k);
    }
  });

  it("21 상황이 모두 다르다", () => {
    const keys = new Map<string, string>();
    for (const c of PLL_CASES) {
      const k = pllKey(invert(c.algs[0] as string));
      expect(keys.get(k), `${c.name}와 겹침`).toBeUndefined();
      keys.set(k, c.name);
    }
  });

  it("묶음이 코너·엣지 바꿈과 맞는다", () => {
    for (const c of PLL_CASES) {
      const s = stateOf(c.algs[0] as string);
      const cls = cornerPermClass(llCornerPerm(s));
      if (c.group === "edges") expect(cls, c.name).toBe("solved");
      if (c.group === "adjacent") expect(cls, c.name).toBe("adjacent");
      if (c.group === "diagonal") expect(cls, c.name).toBe("diagonal");
    }
  });
});
