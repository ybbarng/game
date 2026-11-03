import {
  applyMoves,
  formatMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { ALG_SETS, type AlgCase } from "../learn";
import { caseById, caseStart, checkAlg, findSolvedCase } from "./check";
import {
  addAuf,
  inverseAlg,
  type MirrorPlane,
  mirrorAlg,
  moveCounts,
  regripAlg,
  removeRotations,
  simplifyMoves,
} from "./transform";

const byId = (id: string): AlgCase => {
  const c = caseById(id);
  if (!c) throw new Error(id);
  return c;
};
const setCases = (set: string) =>
  ALG_SETS.find((s) => s.set === set)?.cases ?? [];
const fmt = (n: number, alg: string) =>
  formatMoves(n, simplifyMoves(parseMoves(n, alg)));

/** 두 공식이 큐브 방향 차이만 빼고 같은 일을 하나(b 거꾸로 뒤 a가 큐브 돌리기 하나) */
function sameEffect(n: number, a: string, b: string): boolean {
  const s = applyMoves(n, solvedCube(n), parseMoves(n, inverseAlg(n, b)));
  const back = applyMoves(n, s, parseMoves(n, a));
  return isSolved(n, back, { orientCenters: true });
}

describe("거울", () => {
  it("좌우 거울: R↔L, 방향 반대. 넓게·가운데·큐브 돌리기도", () => {
    expect(mirrorAlg(3, "R U R' U R U2 R'", "M")).toBe("L' U' L U' L' U2 L");
    expect(mirrorAlg(3, "r U x M' y z S E", "M")).toBe(
      "Lw' U' x M' y' z' S' E'",
    );
    expect(mirrorAlg(4, "Rw U2 2R", "M")).toBe("Lw' U2 2L'");
  });

  it("앞뒤·위아래 거울", () => {
    expect(mirrorAlg(3, "R U F", "S")).toBe("R' U' B'");
    expect(mirrorAlg(3, "R U R'", "E")).toBe("R' D' R");
  });

  it.each(["M", "S", "E"] as MirrorPlane[])(
    "%s 거울을 두 번 하면 제자리",
    (plane) => {
      for (const c of [...setCases("pll"), ...setCases("oll")])
        for (const alg of c.algs)
          expect(mirrorAlg(3, mirrorAlg(3, alg, plane), plane)).toBe(
            fmt(3, alg),
          );
    },
  );

  it("수네의 좌우 거울은 안티수네 상황을 푼다", () => {
    const left = mirrorAlg(3, byId("oll-27").algs[0] as string, "M");
    expect(checkAlg(byId("oll-26"), left).ok).toBe(true);
  });

  it.each([
    ["pll-ua", "pll-ub"],
    ["pll-ja", "pll-jb"],
    ["pll-ra", "pll-rb"],
    ["pll-na", "pll-nb"],
    ["pll-aa", "pll-ab"],
  ])("%s의 좌우 거울은 %s 상황을 푼다", (a, b) => {
    const m = mirrorAlg(3, byId(a).algs[0] as string, "M");
    expect(checkAlg(byId(b), m).ok, m).toBe(true);
    const back = mirrorAlg(3, byId(b).algs[0] as string, "M");
    expect(checkAlg(byId(a), back).ok, back).toBe(true);
  });

  it("OLL·PLL 공식의 좌우·앞뒤 거울은 같은 묶음의 어느 상황을 푼다", () => {
    for (const set of ["oll", "pll"])
      for (const c of setCases(set))
        for (const plane of ["M", "S"] as const) {
          const m = mirrorAlg(3, c.algs[0] as string, plane);
          const moves = parseMoves(3, m);
          const solvesSome =
            checkAlg(c, m).ok || findSolvedCase(c, moves) !== null;
          expect(solvesSome, `${c.name} ${plane}: ${m}`).toBe(true);
        }
  });
});

describe("거꾸로·돌려 쥐기·윗면 돌리기", () => {
  it("거꾸로는 상황 만들기와 같다", () => {
    const c = byId("pll-t");
    const inv = inverseAlg(3, c.algs[0] as string);
    const made = applyMoves(
      3,
      applyMoves(3, solvedCube(3), parseMoves(3, "z2")),
      parseMoves(3, inv),
    );
    expect(Array.from(made.perm)).toEqual(Array.from(caseStart(c).perm));
    expect(inverseAlg(3, inv)).toBe(fmt(3, c.algs[0] as string));
  });

  it("큐브 돌리기를 빼도 같은 일을 하고(방향만 다름), 자기 상황을 푼다", () => {
    const withRot = [...setCases("pll"), ...setCases("f2l")].flatMap((c) =>
      c.algs.filter((a) => /[xyz]/.test(a)).map((a) => ({ c, a })),
    );
    expect(withRot.length).toBeGreaterThan(3);
    for (const { c, a } of withRot) {
      const r = removeRotations(3, a);
      expect(r, a).not.toMatch(/[xyz]/);
      expect(sameEffect(3, a, r), a).toBe(true);
      expect(checkAlg(c, r).ok, `${c.name}: ${r}`).toBe(true);
    }
  });

  it("y로 돌려 쥔 공식은 y A y'와 같고, 윗면 돌리기를 붙이면 같은 상황을 푼다", () => {
    const a = "R U R' U R U2 R'";
    expect(regripAlg(3, a, "y")).toBe("B U B' U B U2 B'");
    expect(sameEffect(3, `y ${a} y'`, regripAlg(3, a, "y"))).toBe(true);
    for (const c of setCases("oll"))
      for (const g of ["y", "y'", "y2"] as const)
        expect(checkAlg(c, regripAlg(3, c.algs[0] as string, g)).ok).toBe(true);
  });

  it("윗면 돌리기는 같은 쪽 U와 합친다", () => {
    expect(addAuf(3, "U R U' R'", "pre")).toBe("U2 R U' R'");
    expect(addAuf(3, "U' R U R'", "pre")).toBe("R U R'");
    expect(addAuf(3, "R U R' U", "post", "U2")).toBe("R U R' U'");
  });

  it("수 세기: 큐브 돌리기는 빼고, 가운데 층은 HTM 2", () => {
    expect(moveCounts(3, parseMoves(3, "x M2 U r R'"))).toEqual({
      htm: 5,
      stm: 4,
    });
    expect(moveCounts(4, parseMoves(4, "2R2 Uw2"))).toEqual({
      htm: 3,
      stm: 2,
    });
  });
});
