import { describe, expect, it } from "vitest";
import { OLL_CASES } from "../algs-oll";
import { f2lIntact, llOrientation, ollKey } from "./pieces";
import { apply, invert, solved } from "./sim";

// 맞춘 큐브에 공식의 거꾸로를 적용하면 그 공식이 푸는 상황이 된다.
// 공식이 F2L을 건드리지 않고, 57개가 서로 다른 윗면 무늬를 만들면 57 상황을 빠짐없이 덮는다.
const stateOf = (alg: string) => apply(solved(3), invert(alg));
const edgesOriented = (alg: string) =>
  llOrientation(stateOf(alg))
    .slice(4)
    .split("")
    .filter((x) => x === "0").length;
const cornersOriented = (alg: string) =>
  llOrientation(stateOf(alg))
    .slice(0, 4)
    .split("")
    .filter((x) => x === "0").length;

describe("OLL 57", () => {
  it("57 상황이 있다", () => {
    expect(OLL_CASES).toHaveLength(57);
  });

  it.each(OLL_CASES.filter((c) => c.verified !== false))(
    "$name: 아래 두 층을 지키고 윗면만 바꾼다",
    (c) => {
      for (const alg of c.algs) {
        const s = stateOf(alg);
        expect(f2lIntact(s), alg).toBe(true);
        expect(ollKey(s), alg).not.toBe("00000000");
      }
    },
  );

  it("대안 공식은 대표 공식과 같은 상황을 푼다", () => {
    for (const c of OLL_CASES) {
      const k = ollKey(stateOf(c.algs[0] as string));
      for (const alg of c.algs.slice(1))
        expect(ollKey(stateOf(alg)), `${c.name}: ${alg}`).toBe(k);
    }
  });

  it("57 상황이 모두 다르다", () => {
    const keys = new Map<string, string>();
    for (const c of OLL_CASES) {
      const k = ollKey(stateOf(c.algs[0] as string));
      expect(keys.get(k), `${c.name}와 겹침`).toBeUndefined();
      keys.set(k, c.name);
    }
  });

  it("모양 묶음이 모서리·꼭짓점 수와 맞는다", () => {
    for (const c of OLL_CASES) {
      const alg = c.algs[0] as string;
      const e = edgesOriented(alg);
      if (c.group === "dot") expect(e, c.name).toBe(0);
      else if (c.group === "ocll") expect(e, c.name).toBe(4);
      else expect(e, c.name).toBe(2);
      if (c.group === "edges-only")
        expect(cornersOriented(alg), c.name).toBe(4);
    }
  });
});
