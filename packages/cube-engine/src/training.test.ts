import { statesEqual } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { caseFromAlgorithm } from "./cases";
import { cubeGroups, pieceName } from "./groups";
import { maskAtSlots, stageMask } from "./mask";
import { applyMoves } from "./move";
import { parseMoves } from "./notation";
import { cube3Progress, solvedPieceRatio } from "./progress";
import { isSolvable, randomCubeState } from "./random";
import { faceColors, isSolved, solvedCube } from "./state";
import { cubeTopology, D, L, U } from "./topology";

function run(n: number, text: string) {
  return applyMoves(n, solvedCube(n), parseMoves(n, text));
}

/** 조각들이 맞은 자리에 맞은 방향으로 있나 */
function piecesHome(
  n: number,
  state: ReturnType<typeof solvedCube>,
  pieces: readonly number[],
) {
  const topo = cubeTopology(n);
  return pieces.every((p) =>
    (topo.pieces[p]?.stickers ?? []).every((s) => state.perm[s] === s),
  );
}

describe("조각 묶음", () => {
  it("3×3 층별 묶음 크기와 이름", () => {
    const g = cubeGroups(3);
    expect(g.cross).toHaveLength(4);
    expect(g.firstLayerCorners).toHaveLength(4);
    expect(g.middleEdges).toHaveLength(4);
    expect(g.lastLayer).toHaveLength(8);
    expect(g.f2l).toHaveLength(4 + 4 + 4 + 6);
    expect(g.f2lPairs.every((p) => p.edges.length === 1)).toBe(true);
    expect(g.cross.map((p) => pieceName(3, p)).sort()).toEqual([
      "UB",
      "UF",
      "UL",
      "UR",
    ]);
    // 십자 면을 바꾸면 반대쪽
    expect(
      cubeGroups(3, D)
        .cross.map((p) => pieceName(3, p))
        .sort(),
    ).toEqual(["DB", "DF", "DL", "DR"]);
  });

  it("4×4 짝마다 날개 둘", () => {
    const g = cubeGroups(4);
    expect(g.cross).toHaveLength(8);
    expect(g.f2lPairs.every((p) => p.edges.length === 2)).toBe(true);
  });
});

describe("일부만 섞기", () => {
  it("3×3 십자는 맞은 채, 나머지만 섞인다", () => {
    const { cross } = cubeGroups(3);
    for (let seed = 1; seed <= 6; seed++) {
      const s = randomCubeState(3, seed, { keep: cross });
      expect(piecesHome(3, s, cross)).toBe(true);
      expect(isSolvable(3, s)).toBe(true);
      expect(cube3Progress(s).crossFace).toBe(U);
    }
  });

  it("3×3 F2L은 맞고 마지막 층만 무작위", () => {
    const g = cubeGroups(3);
    for (let seed = 1; seed <= 8; seed++) {
      const s = randomCubeState(3, seed, { keep: g.f2l });
      expect(piecesHome(3, s, g.f2l)).toBe(true);
      expect(isSolvable(3, s)).toBe(true);
      expect(cube3Progress(s).f2lPairs).toBe(4);
    }
  });

  it("4×4 F2L 고정도 맞출 수 있는 상태", () => {
    const g = cubeGroups(4);
    for (let seed = 1; seed <= 4; seed++) {
      const s = randomCubeState(4, seed, { keep: g.f2l });
      expect(piecesHome(4, s, g.f2l)).toBe(true);
      expect(isSolvable(4, s)).toBe(true);
    }
  });
});

describe("가리기", () => {
  it("단계 마스크의 보이는 스티커 수", () => {
    const count = (name: Parameters<typeof stageMask>[1], v = "visible") =>
      stageMask(3, name).filter((x) => x === v).length;
    expect(count("cross")).toBe(4 * 2 + 6);
    expect(count("f2l")).toBe(54 - (4 * 3 + 4 * 2)); // 마지막 층 조각만 가림
    expect(count("oll")).toBe(9);
    expect(count("oll", "gray")).toBe(45);
    expect(count("pll")).toBe(4 * 3 + 4 * 2 + 6);
    expect(count("all-hidden", "hidden")).toBe(54);
  });

  it("마스크는 스티커를 따라간다", () => {
    const mask = stageMask(3, "oll"); // 노란(D) 스티커만 보임
    const s = run(3, "x2");
    const slots = maskAtSlots(s, mask);
    // 큐브를 뒤집으면 노란 면이 위로 온다
    expect(slots.slice(U * 9, U * 9 + 9).every((v) => v === "visible")).toBe(
      true,
    );
    expect(slots.slice(D * 9, D * 9 + 9).every((v) => v === "gray")).toBe(true);
  });
});

describe("공식으로 상황 만들기", () => {
  // T 퍼뮤테이션(PLL)
  const T = "R U R' U' R' F R2 U' R' U' R U R' F'";

  it("공식과 윗면 돌리기로 맞춰지는 PLL 상황", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { state, setup } = caseFromAlgorithm(3, T, seed);
      expect(isSolved(3, state)).toBe(false);
      expect(statesEqual(state, applyMoves(3, solvedCube(3), setup))).toBe(
        true,
      );
      // 쥔 방향(z2)에서 윗면은 모두 노랑
      const colors = faceColors(3, state);
      expect([...colors.slice(0, 9)].every((c) => c === D)).toBe(true);
      expect(cube3Progress(state).stage).toBe("oll");
      const solvable = [0, 1, 2, 3].some((a) =>
        [0, 1, 2, 3].some((b) => {
          const pre = "U ".repeat(a);
          const post = "U ".repeat(b);
          return isSolved(
            3,
            applyMoves(3, state, parseMoves(3, `${pre} ${T} ${post}`)),
          );
        }),
      );
      expect(solvable).toBe(true);
    }
  });

  it("같은 씨앗이면 같은 상황, AUF를 끄면 공식만 거꾸로", () => {
    expect(
      statesEqual(
        caseFromAlgorithm(3, T, 7).state,
        caseFromAlgorithm(3, T, 7).state,
      ),
    ).toBe(true);
    const { state } = caseFromAlgorithm(3, T, 7, { auf: false, hold: "" });
    expect(isSolved(3, applyMoves(3, state, parseMoves(3, T)))).toBe(true);
  });
});

describe("진행 단계", () => {
  it("맞춤·F2L·십자 인식", () => {
    expect(cube3Progress(solvedCube(3)).stage).toBe("solved");
    // R 한 번: L 면 위로 F2L이 그대로고 R 면도 한 색이라 OLL까지 끝난 모양
    expect(cube3Progress(run(3, "R"))).toEqual({
      stage: "oll",
      crossFace: L,
      f2lPairs: 4,
    });
    // 큐브를 돌려도 같은 결과(자리 면 기준)
    expect(cube3Progress(run(3, "x R")).f2lPairs).toBe(4);
    // 윗층을 망가뜨리는 OLL 공식: 아래 면(D) 위로 F2L 그대로, 윗면은 한 색이 아니다
    const p = cube3Progress(run(3, "F R U R' U' F'"));
    expect(p).toEqual({ stage: "f2l", crossFace: D, f2lPairs: 4 });
    // 십자만 남은 상태
    const cross = cube3Progress(run(3, "R U R' U'"));
    expect(cross.stage).not.toBe("none");
    expect(cube3Progress(randomCubeState(3, 5)).stage).toBe("none");
  });

  it("맞은 조각 비율", () => {
    expect(solvedPieceRatio(3, solvedCube(3))).toBe(1);
    expect(solvedPieceRatio(3, run(3, "x y"))).toBe(1);
    // R 은 바깥층 조각 8개를 옮긴다 → 20개 중 12개
    expect(solvedPieceRatio(3, run(3, "R"))).toBeCloseTo(12 / 20);
    expect(solvedPieceRatio(4, run(4, "z"))).toBe(1);
    expect(solvedPieceRatio(4, run(4, "R"))).toBeLessThan(1);
  });
});
