import { describe, expect, it } from "vitest";

import { applyMoves } from "./move";
import { parseMoves } from "./notation";
import {
  flowScore,
  milestonesOf,
  pairedEdgeLines,
  pieceScore,
  solvedCenterFaces,
  solveProgress,
} from "./solve-progress";
import { solvedCube } from "./state";

const after = (n: number, alg: string) =>
  applyMoves(n, solvedCube(n), parseMoves(n, alg));

/** 4×4 야우 이정표(센터가 다 맞으면 늘 함께 켜진다) */
const YAU = ["centers2", "cross3"] as const;

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
    expect(milestonesOf(4, solvedCube(4))).toEqual([
      "centers2",
      "cross3",
      "centers",
      "edges",
      "cross",
      "f2l1",
      "f2l2",
      "f2l3",
      "layer1",
      "layer2",
      "oll",
      "ll",
    ]);
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
      ...YAU,
      "centers",
      "edges",
    ]);
    expect(milestonesOf(5, after(5, "R U 2R"))).toEqual([]);
  });

  describe("4×4 야우: 센터 둘·십자 셋", () => {
    it("두 층 돌리기(Uw) 뒤: 위·아래 센터와 아래 십자 줄은 그대로라 센터 둘·십자 셋만 켜진다", () => {
      expect(milestonesOf(4, after(4, "Uw"))).toEqual(["centers2", "cross3"]);
    });

    it("아래 십자 줄 둘이 빠지면 센터 둘까지만", () => {
      // R·F가 아래-오른쪽·아래-앞 줄을 옮긴다(위 십자 줄도 Uw로 어긋남)
      expect(milestonesOf(4, after(4, "Uw R F"))).toEqual(["centers2"]);
    });

    it("아래 면을 돌려도 십자 셋은 그대로다(옆 센터 전이라 십자 줄끼리의 자리만 본다)", () => {
      expect(milestonesOf(4, after(4, "Uw R D"))).toEqual([
        "centers2",
        "cross3",
      ]);
    });

    it("맞은편 센터가 둘 다 깨지면 아무것도 켜지지 않는다", () => {
      expect(milestonesOf(4, after(4, "Uw Rw'"))).toEqual([]);
    });

    it("5×5 이상에는 야우 이정표가 없다(야우 풀이가 4×4만)", () => {
      expect(milestonesOf(5, after(5, "Uw"))).toEqual([]);
      expect(milestonesOf(5, solvedCube(5))).not.toContain("centers2");
    });
  });

  it("큰 큐브: 센터·엣지 짝 뒤에는 3×3처럼 십자·F2L·첫 층·둘째 층·윗면을 본다", () => {
    for (const n of [4, 5]) {
      const yau = n === 4 ? YAU : [];
      // F2L 한 칸을 빼면 F2L 3/4까지(3×3 「십자만」과 같은 상태)
      expect(milestonesOf(n, after(n, "R U R'"))).toEqual([
        ...yau,
        "centers",
        "edges",
        "cross",
        "f2l1",
        "f2l2",
        "f2l3",
      ]);
      // 수네만 둔 상태: 아래 두 층은 맞고 윗면은 아직
      expect(milestonesOf(n, after(n, "R U R' U R U2 R'"))).toEqual([
        ...yau,
        "centers",
        "edges",
        "cross",
        "f2l1",
        "f2l2",
        "f2l3",
        "layer1",
        "layer2",
      ]);
      // 큐브를 돌려 쥐어도 같다
      expect(milestonesOf(n, after(n, "x y R U R'"))).toEqual(
        milestonesOf(n, after(n, "R U R'")),
      );
    }
  });

  it("큰 큐브: 센터가 다 맞지 않으면 층 단계는 켜지지 않는다", () => {
    // 안쪽 층을 돌렸다 되돌리지 않은 상태: 바깥 조각은 그대로지만 센터 넷이 깨진다
    const got = milestonesOf(4, after(4, "2R U2 2R'"));
    expect(got).not.toContain("centers");
    expect(got).not.toContain("cross");
  });

  it("큰 큐브: 윗층 엣지 하나가 통째로 뒤집히면(4×4 마지막 층 패리티) 둘째 층까지, 윗면은 꺼진다", () => {
    // 4×4 OLL 패리티 공식: 아래 두 층·센터는 그대로, 윗층 엣지 한 줄이 짝은 그대로 뒤집힌다
    const parity = "Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'";
    expect(milestonesOf(4, after(4, parity))).toEqual([
      ...YAU,
      "centers",
      "edges",
      "cross",
      "f2l1",
      "f2l2",
      "f2l3",
      "layer1",
      "layer2",
    ]);
  });
});

describe("흐름 콤보의 진행 칸(flowScore)", () => {
  it("맞춘 큐브: 조각 반 점 + (큰 큐브) 센터 스티커 + 짝지은 엣지 조각", () => {
    expect(flowScore(2, solvedCube(2))).toBe(16);
    expect(flowScore(3, solvedCube(3))).toBe(40);
    // 4×4: 40 + 센터 4×6 + 엣지 줄 12개 × (날개 2 − 1)
    expect(flowScore(4, solvedCube(4))).toBe(40 + 24 + 12);
    // 5×5: 40 + 센터 9×6 + 엣지 줄 12개 × (조각 3 − 1)
    expect(flowScore(5, solvedCube(5))).toBe(40 + 54 + 24);
  });

  it("3×3 이하는 조각 점수 반 점이 한 칸이다", () => {
    const s = after(3, "R U F'");
    expect(flowScore(3, s)).toBe(pieceScore(3, s).score * 2);
  });

  it("큰 큐브는 센터·엣지 짝의 도중 진행도 칸으로 센다(막대의 센터 면 수는 그대로여도)", () => {
    // 5×5 안쪽 층을 하나(2R)·둘(2R 2L) 돌리면 둘 다 센터 넷 면이 깨지지만, 하나만 돌린 쪽이 더 맞아 있다
    const one = after(5, "2R");
    const two = after(5, "2R 2L");
    expect(solvedCenterFaces(5, one)).toBe(solvedCenterFaces(5, two));
    expect(flowScore(5, one)).toBeGreaterThan(flowScore(5, two));
  });
});
