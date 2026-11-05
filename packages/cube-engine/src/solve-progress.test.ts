import { describe, expect, it } from "vitest";

import { applyMoves } from "./move";
import { parseMoves } from "./notation";
import {
  milestonesOf,
  pairedEdgeLines,
  pieceScore,
  solvedCenterFaces,
  solveProgress,
} from "./solve-progress";
import { solvedCube } from "./state";

const after = (n: number, alg: string) =>
  applyMoves(n, solvedCube(n), parseMoves(n, alg));

/** 대회 규칙 섞기 하나(3×3, 고정) */
const SCRAMBLE = "D2 F2 U' B2 R2 D' L2 U' R2 U2 F' L' D B' R' U' R2 F U' L";

describe("조각 점수", () => {
  it("맞춘 3×3은 20점, 2×2는 8점", () => {
    expect(pieceScore(3, solvedCube(3))).toEqual({
      score: 20,
      max: 20,
      placed: 20,
      oriented: 20,
    });
    expect(pieceScore(2, solvedCube(2)).score).toBe(8);
  });

  it("큐브를 통째로 돌려도 같은 점수다", () => {
    const base = pieceScore(3, after(3, SCRAMBLE));
    for (const rot of ["x", "y2", "z'", "x y", "x2 z"])
      expect(pieceScore(3, after(3, `${SCRAMBLE} ${rot}`))).toEqual(base);
    const pocket = pieceScore(2, after(2, "R U2 F' R2 U"));
    expect(pieceScore(2, after(2, "R U2 F' R2 U x y'"))).toEqual(pocket);
  });

  it("면 하나만 돌린 상태는 거의 만점이다(다 맞지 않았으니 만점보다 반 점 아래)", () => {
    for (const m of ["U", "R'", "D2", "B"]) {
      const s = pieceScore(3, after(3, m));
      expect(s.score).toBe(19.5);
      expect(s.oriented).toBe(20);
    }
  });

  it("섞인 상태는 정해진 값이다", () => {
    expect(pieceScore(3, after(3, SCRAMBLE))).toMatchInlineSnapshot(`
      {
        "max": 20,
        "oriented": 1,
        "placed": 3,
        "score": 2,
      }
    `);
  });

  it("자리만 맞은 조각은 반 점: 슈퍼플립(엣지 12개 모두 뒤집힘)은 코너 8 + 엣지 6 = 14점", () => {
    const superflip = "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2";
    expect(pieceScore(3, after(3, superflip))).toEqual({
      score: 14,
      max: 20,
      placed: 20,
      oriented: 8,
    });
  });
});

describe("큰 큐브", () => {
  it("맞춘 4×4·5×5는 센터 6면, 엣지 짝 12, 막대 1", () => {
    for (const n of [4, 5]) {
      expect(solvedCenterFaces(n, solvedCube(n))).toBe(6);
      expect(pairedEdgeLines(n, solvedCube(n))).toBe(12);
      expect(solveProgress(n, solvedCube(n)).value).toBe(1);
    }
  });

  it("안쪽 층 하나를 돌리면 센터 네 면과 엣지 짝 넷이 깨진다", () => {
    const s = after(4, "2R");
    expect(solvedCenterFaces(4, s)).toBe(2);
    expect(pairedEdgeLines(4, s)).toBe(8);
    const p = solveProgress(4, s);
    expect(p.focus).toBe("centers");
    expect(p.value).toBeLessThan(1);
  });
});

describe("이정표", () => {
  it("맞춘 큐브는 그 크기의 이정표가 모두 켜진다", () => {
    expect(milestonesOf(3, solvedCube(3))).toContain("ll");
    expect(milestonesOf(2, solvedCube(2))).toEqual(["layer1", "oll", "ll"]);
    expect(milestonesOf(4, solvedCube(4))).toEqual(["centers", "edges", "ll"]);
  });

  it("섞인 큐브는 아무것도 켜지지 않는다", () => {
    expect(milestonesOf(3, after(3, SCRAMBLE))).toEqual([]);
  });

  it("층별: 윗층만 섞으면 십자·F2L·첫 층·둘째 층까지 켜진다(아래 흰 면이 아니어도)", () => {
    // 윗층 공식(T 퍼뮤 + 수네)만 둔 상태: 아래 두 층은 맞다
    const ll = "R U R' U' R' F R2 U' R' U' R U R' F' R U R' U R U2 R'";
    const got = milestonesOf(3, after(3, ll));
    expect(got).toEqual(
      expect.arrayContaining([
        "cross",
        "f2l1",
        "f2l2",
        "f2l3",
        "layer1",
        "layer2",
      ]),
    );
    expect(got).not.toContain("oll");
    expect(got).not.toContain("ll");
    // 큐브를 돌려 쥐어도, 다른 면(오른쪽)이 아래여도 같다
    expect(milestonesOf(3, after(3, `z ${ll}`))).toEqual(got);
  });

  it("윗면: 윗층 옆면만 섞인 상태(PLL)는 윗면까지 켜진다", () => {
    const got = milestonesOf(
      3,
      after(3, "R U R' U' R' F R2 U' R' U' R U R' F'"),
    );
    expect(got).toContain("oll");
    expect(got).not.toContain("ll");
  });

  it("십자만: F2L 한 칸을 빼면 F2L 3/4까지", () => {
    const got = milestonesOf(3, after(3, "R U R'"));
    expect(got).toContain("cross");
    expect(got).toContain("f2l3");
    expect(got).not.toContain("layer2");
    expect(got).not.toContain("layer1");
  });

  it("루: 오른쪽 블록을 흐트러뜨려도 왼쪽 첫 블록은 남는다, 가운데 층(M)을 돌려도 그대로다", () => {
    const first = milestonesOf(3, after(3, "R U R' U'"));
    expect(first).toContain("roux1");
    expect(first).not.toContain("roux2");
    // 마지막 단계(LSE)처럼 M·U만 돌리면 두 블록 그대로
    const lse = milestonesOf(3, after(3, "M U M' U2 M"));
    expect(lse).toContain("roux2");
    expect(lse).not.toContain("cross");
  });

  it("ZZ EOLine: 엣지 방향이 맞고 아래 앞·뒤 엣지가 맞으면 켜지고, F 한 번이면 꺼진다", () => {
    // <U, R, L> 수만 두면 엣지 방향이 그대로이고 DF·DB도 그대로
    const eo = milestonesOf(3, after(3, "R U L' U2 R' L U' R2 U L"));
    expect(eo).toContain("eoline");
    expect(
      milestonesOf(3, after(3, "R U L' U2 R' L U' R2 U L F")),
    ).not.toContain("eoline");
  });

  it("코너 먼저: 엣지만 섞인 상태(M·E·S 섞기)는 코너 8이 켜진다", () => {
    const got = milestonesOf(3, after(3, "M E S M' E2 S'"));
    expect(got).toContain("corners");
    expect(got).not.toContain("cross");
  });

  it("2×2: 윗층만 돌리면 첫 층과 윗면", () => {
    expect(milestonesOf(2, after(2, "U"))).toEqual(["layer1", "oll"]);
    const sune = milestonesOf(2, after(2, "R U R' U R U2 R'"));
    expect(sune).toContain("layer1");
    expect(sune).not.toContain("oll");
  });

  it("큰 큐브: 바깥 면 돌리기는 센터·엣지 짝을 그대로 둔다", () => {
    expect(milestonesOf(4, after(4, "R U F' D2"))).toEqual([
      "centers",
      "edges",
    ]);
    expect(milestonesOf(5, after(5, "R U 2R"))).toEqual([]);
  });
});
