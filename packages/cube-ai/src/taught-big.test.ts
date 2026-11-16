import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { solveHuman } from "./methods";

/**
 * 배우는 방식 마지막 층의 4×4·5×5(축소법 뒤 3×3 단계). 축소법이 오래 걸려 taught.test.ts와 파일을 나눠 동시에 돈다
 */

describe("배우는 방식 마지막 층(4×4·5×5 축소법의 3×3 단계)", () => {
  const LL = ["eo", "ll-edges", "ll-corner-place", "ll-corner-twist"];
  it.each([
    [4, [1, 2, 3, 4]],
    [5, [1]],
  ])(
    "%i×%i: 패리티는 옆면 맞추기 전에 고치고, 같은 마지막 층으로 다 맞춘다",
    (n, seeds) => {
      const parities = new Set<string>();
      for (const seed of seeds as number[]) {
        const start = randomCubeState(n as number, seed);
        const solve = solveHuman("beginner", n as number, start, undefined, {
          taught: true,
        });
        const end = applyMoves(
          n as number,
          start,
          parseMoves(n as number, solve.moves.join(" ")),
        );
        expect(isSolved(n as number, end), `${seed}`).toBe(true);
        // 3×3 단계의 첫 두 층도 맞춘 면(십자·코너는 U, 둘째 층은 z2 뒤 D)을 돌리지 않는다
        for (const [name, face] of [
          ["cross", "U"],
          ["corners", "U"],
          ["middle", "D"],
        ] as const) {
          const st = solve.stages.find((x) => x.name === name);
          const turns = solve.moves.slice(st?.start, st?.end);
          expect(turns.length, `${seed} ${name}`).toBeGreaterThan(0);
          for (const m of turns)
            expect(m[0], `${seed} ${name} ${m}`).not.toBe(face);
        }
        const names = solve.stages.map((x) => x.name);
        for (const p of names.filter((x) => x.endsWith("parity")))
          parities.add(p);
        expect(
          names.filter((x) => LL.includes(x)),
          `${seed}`,
        ).toEqual(LL);
        // PLL 패리티는 노란 십자 뒤·옆면 맞추기 앞
        const pll = names.indexOf("pll-parity");
        if (pll >= 0) {
          expect(names[pll - 1]).toBe("eo");
          expect(names[pll + 1]).toBe("ll-edges");
        }
      }
      if (n === 4) expect(parities.has("pll-parity")).toBe(true);
    },
  );
});
