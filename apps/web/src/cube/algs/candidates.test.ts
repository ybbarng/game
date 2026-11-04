import { describe, expect, it } from "vitest";

import { ALG_SETS, type AlgCase } from "../learn";
import {
  candidateSpecs,
  candidatesOf,
  dataAlgTags,
  shapeTags,
} from "./candidates";
import { LL_CANDIDATES } from "./candidates-ll";
import { MORE_CANDIDATES } from "./candidates-more";
import { caseById, checkAlg } from "./check";

const byId = (id: string): AlgCase => {
  const c = caseById(id);
  if (!c) throw new Error(id);
  return c;
};

describe("추천 후보 공식", () => {
  it("자료 표의 상황 id가 모두 있다", () => {
    for (const id of [
      ...Object.keys(LL_CANDIDATES),
      ...Object.keys(MORE_CANDIDATES),
    ])
      expect(caseById(id), id).toBeDefined();
  });

  it.each(ALG_SETS.map((s) => ({ set: s.set, cases: s.cases })))(
    "$set: 모든 후보가 자기 상황의 검사기를 앞 윗면 돌리기 없이 통과한다",
    ({ cases }) => {
      for (const c of cases)
        for (const { alg } of candidatesOf(c)) {
          const r = checkAlg(c, alg, { findOther: false });
          expect(r.ok, `${c.id}: ${alg} → ${r.message}`).toBe(true);
          // 시연이 상황에서 바로 맞게 앞 윗면 돌리기까지 적어 두었다
          if (r.ok) expect(r.preAuf, `${c.id}: ${alg}`).toBe("");
        }
    },
  );

  it("자료(대표·대안)와 겹치는 후보, 같은 후보 두 번은 보이지 않는다", () => {
    for (const s of ALG_SETS)
      for (const c of s.cases) {
        const algs = candidatesOf(c).map((x) => x.alg);
        expect(new Set(algs).size).toBe(algs.length);
        for (const a of algs) expect(c.algs).not.toContain(a);
      }
  });

  it("묶음별 후보 수(PLL·2단계·OLL·F2L은 대부분의 상황에 있다)", () => {
    const count = (set: string) =>
      ALG_SETS.find((s) => s.set === set)?.cases.filter(
        (c) => candidatesOf(c).length > 0,
      ).length ?? 0;
    expect(count("pll")).toBeGreaterThanOrEqual(20);
    expect(count("oll")).toBeGreaterThanOrEqual(40);
    expect(count("f2l")).toBeGreaterThanOrEqual(29);
    expect(count("2look-pll")).toBe(6);
  });

  it("2단계 OLL 코너는 같은 번호의 OLL 후보를 함께 쓴다", () => {
    const two = candidateSpecs(byId("2look-oll-26")).map((x) => x.alg);
    for (const { alg } of LL_CANDIDATES["oll-26"] ?? [])
      expect(two).toContain(alg);
  });

  it("꼬리표: 수 모양은 코드로 센다", () => {
    expect(shapeTags(3, "R U R' U R U2 R'")).toEqual(["R·U만"]);
    expect(shapeTags(3, "M2 U M U2 M' U M2")).toEqual(["M·U만"]);
    expect(shapeTags(3, "F R U R' U' F'")).toEqual(["R·U·F만"]);
    expect(shapeTags(3, "y' R' U' R")).toEqual(["큐브 돌림"]);
    expect(shapeTags(3, "r U R' U' M")).toEqual([]);
  });

  it("꼬리표: 「짧음」은 대표·대안·후보 가운데 가장 적은 HTM", () => {
    const ua = byId("pll-ua");
    const all = [
      ...ua.algs.map((a) => ({ a, tags: dataAlgTags(ua, a) })),
      ...candidatesOf(ua).map((x) => ({ a: x.alg, tags: x.tags })),
    ];
    expect(all.some((x) => x.tags.includes("짧음"))).toBe(true);
    // F2L 찾은 공식은 꼬리표가 붙는다
    expect(
      candidatesOf(byId("f2l-8")).some((x) => x.tags.includes("찾은 공식")),
    ).toBe(true);
  });
});
