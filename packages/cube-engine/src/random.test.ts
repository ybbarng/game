import { isValidPerm, statesEqual } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { applyMoves } from "./move";
import { parseMoves } from "./notation";
import {
  cornerTwistSum,
  edgeFlipSum,
  isSolvable,
  orbitParityMask,
  randomCubeState,
} from "./random";
import { isSolved, solvedCube } from "./state";
import { cubeTopology } from "./topology";

const SIZES = [2, 3, 4, 5] as const;

describe("맞출 수 있는지 판정", () => {
  it.each(SIZES.map((n) => [n, n]))(
    "%i×%i 수로 만든 상태는 맞출 수 있다",
    (n) => {
      const s = applyMoves(
        n,
        solvedCube(n),
        parseMoves(n, "R U' F2 Lw D' 2B x Rw2 y' U L' 2F z' B"),
      );
      expect(isSolvable(n, s)).toBe(true);
    },
  );

  it("꼭짓점 하나 비틀기·모서리 하나 뒤집기·두 조각 바꾸기는 맞출 수 없다", () => {
    const solved = solvedCube(3);
    // 꼭짓점 UFR(자리 U8, F2, R0)의 스티커를 한 칸 돌린다
    const twisted = solved.perm.slice();
    [twisted[8], twisted[18 + 2], twisted[9]] = [
      twisted[9] as number,
      twisted[8] as number,
      twisted[20] as number,
    ];
    const t = { perm: twisted, twist: solved.twist };
    expect(isValidPerm(t.perm)).toBe(true);
    expect(cornerTwistSum(3, t)).not.toBe(0);
    expect(isSolvable(3, t)).toBe(false);

    // 모서리 UF(자리 U7, F1)를 뒤집는다
    const flipped = solved.perm.slice();
    [flipped[7], flipped[19]] = [19, 7];
    const f = { perm: flipped, twist: solved.twist };
    expect(edgeFlipSum(3, f)).toBe(1);
    expect(isSolvable(3, f)).toBe(false);

    // 모서리 UF·UR 두 개만 맞바꾼다(홀짝 어긋남)
    const swapped = solved.perm.slice();
    [swapped[7], swapped[5]] = [5, 7];
    [swapped[19], swapped[10]] = [10, 19];
    const sw = { perm: swapped, twist: solved.twist };
    expect(isSolvable(3, sw)).toBe(false);
  });
});

describe("무작위 상태", () => {
  it.each(SIZES.map((n) => [n, n]))("%i×%i 씨앗마다 맞출 수 있는 상태", (n) => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = randomCubeState(n, seed);
      expect(isValidPerm(s.perm)).toBe(true);
      expect(isSolvable(n, s)).toBe(true);
      expect(isSolved(n, s)).toBe(false);
    }
  });

  it("같은 씨앗이면 같은 상태", () => {
    expect(statesEqual(randomCubeState(3, 42), randomCubeState(3, 42))).toBe(
      true,
    );
    expect(statesEqual(randomCubeState(3, 42), randomCubeState(3, 43))).toBe(
      false,
    );
  });

  it("3×3 꼭짓점과 모서리 홀짝이 같다", () => {
    const topo = cubeTopology(3);
    const corner = topo.orbits.findIndex((o) => o.kind === "corner");
    const edge = topo.orbits.findIndex((o) => o.kind === "edge");
    const seen = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const mask = orbitParityMask(3, randomCubeState(3, seed));
      const c = (mask >> corner) & 1;
      expect((mask >> edge) & 1).toBe(c);
      seen.add(c);
    }
    // 홀·짝 두 경우가 모두 나온다
    expect(seen.size).toBe(2);
  });

  it("4×4 홀짝 규칙: 가운데 홀짝 = 꼭짓점 홀짝, 날개는 자유", () => {
    const topo = cubeTopology(4);
    const corner = topo.orbits.findIndex((o) => o.kind === "corner");
    const wing = topo.orbits.findIndex((o) => o.kind === "wing");
    const center = topo.orbits.findIndex((o) => o.kind === "innerCenter");
    const wings = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const mask = orbitParityMask(4, randomCubeState(4, seed));
      expect((mask >> center) & 1).toBe((mask >> corner) & 1);
      wings.add((mask >> wing) & 1);
    }
    expect(wings.size).toBe(2);
  });
});
