import { describe, expect, it } from "vitest";

import { moveToSan, parseFen } from "./board";
import {
  forcesMate,
  forcesMateAfter,
  mateInMoves,
  mateInThreeMoves,
} from "./puzzle";

const sans = (
  fen: string,
  pick: (fen: string) => ReturnType<typeof mateInMoves>,
) => {
  const pos = parseFen(fen);
  return pick(fen).map((m) => moveToSan(pos, m));
};

describe("n수 안 메이트 읽기", () => {
  it("상대가 둘 수가 없는데 체크가 아니면(스테일메이트) 메이트로 치지 않는다", () => {
    const stalemate = parseFen("k7/8/1Q6/8/8/8/8/2K5 b - - 0 1");
    expect(forcesMateAfter(stalemate, 2)).toBe(false);
  });

  it("체크메이트가 된 판은 남은 수와 상관없이 메이트다", () => {
    const mated = parseFen("1R4k1/5ppp/6r1/8/8/6P1/K3P3/8 b - - 0 1");
    expect(forcesMateAfter(mated, 0)).toBe(true);
  });

  it("n수 안 메이트의 첫 수에는 더 빠른 메이트도 들고, 세 수 메이트의 첫 수에서는 빠진다", () => {
    const fen = "6k1/5ppp/6r1/1R6/8/6P1/K3P3/8 w - - 0 30";
    expect(sans(fen, (f) => mateInMoves(parseFen(f), 3))).toContain("Rb8#");
    expect(sans(fen, (f) => mateInThreeMoves(parseFen(f)))).not.toContain(
      "Rb8#",
    );
  });

  it("세 수 메이트 판: 두 수로는 못 하고 세 수로는 한다", () => {
    const pos = parseFen("3k4/2p5/2p5/8/6R1/6Q1/8/4K3 w - - 0 30");
    expect(forcesMate(pos, 2)).toBe(false);
    expect(forcesMate(pos, 3)).toBe(true);
    expect(mateInThreeMoves(pos).map((m) => moveToSan(pos, m))).toEqual([
      "Rg7",
    ]);
  });
});
