import {
  applyMoves,
  caseFromAlgorithm,
  invertMoves,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import type { AlgCase } from "../learn";
import { caseById } from "./check";
import { spotCase } from "./spot";

const byId = (id: string): AlgCase => {
  const c = caseById(id);
  if (!c) throw new Error(id);
  return c;
};

describe("상황 알림 판정", () => {
  const sune = byId("oll-27");
  const t = byId("pll-t");
  const list = [byId("pll-ua"), t, sune];

  it("엔진이 만든 상황(무작위 윗면 돌리기)을 알아본다", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = caseFromAlgorithm(3, sune.algs[0] as string, seed).state;
      expect(spotCase(3, s, list)?.id, `씨앗 ${seed}`).toBe("oll-27");
      const p = caseFromAlgorithm(3, t.algs[0] as string, seed).state;
      expect(spotCase(3, p, list)?.id, `씨앗 ${seed}`).toBe("pll-t");
    }
  });

  it("큐브를 어느 쪽으로 들고 있어도 된다(흰 면 위·옆)", () => {
    const base = caseFromAlgorithm(3, sune.algs[0] as string, 9).state;
    for (const r of ["y", "x2", "z", "x y'"]) {
      const s = applyMoves(3, base, parseMoves(3, r));
      expect(spotCase(3, s, list)?.id, r).toBe("oll-27");
    }
  });

  it("F2L이 안 끝났거나, 목록 밖 상황이거나, 3×3이 아니면 없다", () => {
    const s = caseFromAlgorithm(3, sune.algs[0] as string, 1).state;
    expect(spotCase(3, applyMoves(3, s, parseMoves(3, "R")), list)).toBeNull();
    expect(spotCase(3, s, [t])).toBeNull();
    expect(spotCase(3, solvedCube(3), list)).toBeNull();
    expect(spotCase(2, solvedCube(2), list)).toBeNull();
    // F2L 상황은 보지 않는다
    const f2l = byId("f2l-4");
    const fs = applyMoves(3, solvedCube(3), [
      ...parseMoves(3, "z2"),
      ...invertMoves(parseMoves(3, f2l.algs[0] as string)),
    ]);
    expect(spotCase(3, fs, [f2l])).toBeNull();
  });
});
