import { describe, expect, it } from "vitest";
import { F2L_CASES } from "../algs-f2l";
import {
  crossIntact,
  f2lGroup,
  f2lKey,
  otherSlotsIntact,
  pairState,
} from "./pieces";
import { apply, invert, solved } from "./sim";

const stateOf = (alg: string) => apply(solved(3), invert(alg));
const SOLVED_PAIR = pairState(solved(3));

describe("F2L 41", () => {
  it("41 상황이 있다", () => {
    expect(F2L_CASES).toHaveLength(41);
  });

  it.each(F2L_CASES)(
    "$name: 십자와 다른 칸을 지키고 앞-오른쪽 짝을 넣는다",
    (c) => {
      for (const alg of c.algs) {
        const s = stateOf(alg);
        expect(crossIntact(s), alg).toBe(true);
        expect(otherSlotsIntact(s), alg).toBe(true);
        expect(pairState(s), alg).not.toBe(SOLVED_PAIR);
      }
    },
  );

  it("묶음이 짝의 자리와 맞는다", () => {
    for (const c of F2L_CASES)
      expect(f2lGroup(invert(c.algs[0] as string)), c.name).toBe(c.group);
  });

  it("41 상황이 모두 다르다", () => {
    const keys = new Map<string, string>();
    for (const c of F2L_CASES) {
      const k = f2lKey(invert(c.algs[0] as string));
      expect(keys.get(k), `${c.name}와 겹침`).toBeUndefined();
      keys.set(k, c.name);
    }
  });
});
