import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { statesEqual } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { canonicalNotation } from "./actions";

const same = (n: number, a: string, b: string) =>
  statesEqual(
    applyMoves(n, solvedCube(n), parseMoves(n, a)),
    applyMoves(n, solvedCube(n), parseMoves(n, b)),
  );

describe("가장 짧은 이름(canonicalNotation)", () => {
  it("사용자가 정한 예", () => {
    expect(canonicalNotation(3, "3R")).toBe("L'");
    expect(canonicalNotation(3, "2R")).toBe("M'");
    expect(canonicalNotation(3, "3Rw")).toBe("x");
    expect(canonicalNotation(4, "3R")).toBe("2L'");
    expect(canonicalNotation(4, "4R")).toBe("L'");
    expect(canonicalNotation(4, "4Rw")).toBe("x");
    expect(canonicalNotation(4, "3Rw")).toBe("3Rw");
    expect(canonicalNotation(5, "3U")).toBe("E'");
    expect(canonicalNotation(3, "2Rw")).toBe("Rw");
    expect(canonicalNotation(3, "1Rw")).toBe("R");
    expect(canonicalNotation(4, "2R")).toBe("2R");
    expect(canonicalNotation(3, "R'")).toBe("R'");
  });

  it("모든 크기·면·층·방향에서 같은 돌리기이고, 층 번호는 가운데 층을 넘지 않는다", () => {
    for (let n = 2; n <= 7; n++)
      for (const face of ["R", "L", "U", "D", "F", "B"])
        for (let k = 1; k <= n; k++)
          for (const wide of ["", "w"])
            for (const sfx of ["", "'", "2", "2'"]) {
              const raw = `${k}${face}${wide}${sfx}`;
              if (parseMoves(n, raw).length === 0) continue;
              const c = canonicalNotation(n, raw);
              expect(same(n, raw, c), `${n} ${raw} → ${c}`).toBe(true);
              const d = /^(\d+)[RLUDFB](?!w)/.exec(c);
              if (d)
                expect(Number(d[1]), `${n} ${raw} → ${c}`).toBeLessThanOrEqual(
                  Math.ceil(n / 2),
                );
            }
  });
});
