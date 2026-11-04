import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, test } from "vitest";

import { faceGrid } from "../bridge";
import {
  levelOf,
  moveCount,
  PATTERN_LINKS,
  PATTERNS,
  patternById,
} from "./data";
import {
  isAllHalves,
  isCheckerboard,
  isColumnStripes,
  isCross,
  isCubeInCube,
  isCubeInCubeInCube,
  isEdgeSwap,
  isPillars,
  isSideStripes,
  isSpots,
  isSuperflip,
  isTopBottomChecker,
  patternState,
  samePattern,
} from "./shape";

/** 성질로 확인하는 패턴과 그 성질 */
const PROPERTY: Record<string, (n: number, s: PuzzleState) => boolean> = {
  "3-checkerboard": isCheckerboard,
  "3-six-spots": (n, s) => isSpots(n, s),
  "3-four-spots": (n, s) => isSpots(n, s, [1, 2, 4, 5]),
  "3-pillars": isPillars,
  "3-cross": isCross,
  "3-stripes": isColumnStripes,
  "3-cube-in-cube": isCubeInCube,
  "3-cube-in-cube-in-cube": isCubeInCubeInCube,
  "3-superflip": (_n, s) => isSuperflip(s),
  "2-side-stripes": isSideStripes,
  "2-halves": (_n, s) => isAllHalves(s),
  "2-top-checker": (_n, s) => isTopBottomChecker(s),
  "2-cube-in-cube": isCubeInCube,
  "4-frame": isEdgeSwap,
  "4-six-spots": (n, s) => isSpots(n, s),
  "4-cube-in-cube": isCubeInCube,
  "5-checkerboard": isCheckerboard,
  "5-frame": isEdgeSwap,
  "5-six-spots": (n, s) => isSpots(n, s),
  "5-cube-in-cube": isCubeInCube,
  "5-cube-in-cube-in-cube": isCubeInCubeInCube,
};

const LETTER = "WRGYOB";
/** 펼친 그림 글자(위 흰 W·오른 빨강 R·앞 초록 G·아래 노랑 Y·왼 주황 O·뒤 파랑 B) */
function netText(n: number, s: PuzzleState): string {
  const faces = faceGrid(n, s);
  const row = (f: number, r: number) =>
    (faces[f] as number[])
      .slice(r * n, r * n + n)
      .map((c) => LETTER[c])
      .join("");
  const pad = " ".repeat(n + 1);
  const out: string[] = [];
  for (let r = 0; r < n; r++) out.push(pad + row(0, r));
  for (let r = 0; r < n; r++)
    out.push([4, 2, 1, 5].map((f) => row(f, r)).join(" "));
  for (let r = 0; r < n; r++) out.push(pad + row(3, r));
  return out.join("\n");
}

describe("패턴 자료", () => {
  test("id가 겹치지 않고 공식을 읽을 수 있다", () => {
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
    for (const p of PATTERNS) {
      expect(() => parseMoves(p.size, p.alg)).not.toThrow();
      expect(isSolved(p.size, patternState(p.size, p.alg)), p.id).toBe(false);
    }
  });

  test("성질로 확인하는 패턴은 모두 성질 표에 있고, 눈으로 본 패턴은 없다", () => {
    for (const p of PATTERNS)
      expect(p.id in PROPERTY, p.id).toBe(p.check === "property");
  });

  test.each(
    PATTERNS.filter((p) => p.check === "property").map((p) => [p.id, p]),
  )("%s: 공식 결과가 이름대로의 모양이다", (_id, p) => {
    const check = PROPERTY[p.id] as (n: number, s: PuzzleState) => boolean;
    expect(check(p.size, patternState(p.size, p.alg))).toBe(true);
    // 다른 공식도 같은 모양
    if (p.alt)
      expect(
        samePattern(
          p.size,
          patternState(p.size, p.alt),
          patternState(p.size, p.alg),
        ),
      ).toBe(true);
  });

  test("성질 판정은 맞춘 큐브를 패턴으로 보지 않는다", () => {
    for (const p of PATTERNS) {
      if (p.check !== "property") continue;
      const check = PROPERTY[p.id] as (n: number, s: PuzzleState) => boolean;
      expect(check(p.size, patternState(p.size, "")), p.id).toBe(false);
    }
  });

  test("눈으로 확인한 패턴의 펼친 그림", () => {
    const eye = PATTERNS.filter((p) => p.check === "eye").map(
      (p) =>
        `${p.id}: ${p.alg}\n${netText(p.size, patternState(p.size, p.alg))}`,
    );
    expect(eye.join("\n\n")).toMatchSnapshot();
  });

  test("패턴에서 패턴으로 이어지는 공식", () => {
    const [toThree, sixTwice] = PATTERN_LINKS;
    const chain = (from: string, then: string) => {
      const a = patternById(from);
      const b = patternById(then);
      if (!a || !b) throw new Error("없는 패턴");
      return patternState(3, `${a.alg} ${b.alg}`);
    };
    // 면마다 귀퉁이 넷·모서리 넷·가운데가 각각 한 색이고 셋이 서로 다르다
    const three = faceGrid(3, chain(toThree?.from ?? "", toThree?.next ?? ""));
    for (const face of three) {
      const corners = new Set([0, 2, 6, 8].map((k) => face[k]));
      const edges = new Set([1, 3, 5, 7].map((k) => face[k]));
      expect(corners.size).toBe(1);
      expect(edges.size).toBe(1);
      expect(new Set([face[0], face[1], face[4]]).size).toBe(3);
    }
    const again = chain(sixTwice?.from ?? "", sixTwice?.next ?? "");
    expect(isSpots(3, again)).toBe(true);
  });

  test("수 개수와 어려움", () => {
    expect(moveCount(3, "R2 L2 U2 D2 F2 B2")).toBe(6);
    expect(moveCount(3, "R U x y' R")).toBe(3);
    expect(levelOf(8)).toBe("easy");
    expect(levelOf(9)).toBe("normal");
    expect(levelOf(15)).toBe("hard");
  });
});

describe("같은 모양 판정", () => {
  const checker = patternState(3, "R2 L2 U2 D2 F2 B2");
  test("큐브를 통째로 돌려도 같은 모양", () => {
    for (const r of ["y", "x2", "z'", "x y2"]) {
      const turned = applyMoves(3, checker, parseMoves(3, r));
      expect(samePattern(3, turned, checker), r).toBe(true);
    }
  });
  test("한 수라도 다르면 다른 모양", () => {
    expect(
      samePattern(3, applyMoves(3, checker, parseMoves(3, "U")), checker),
    ).toBe(false);
    expect(samePattern(3, patternState(3, ""), checker)).toBe(false);
  });
  test("다른 공식으로 만들어도 모양이 같으면 같다", () => {
    expect(samePattern(3, patternState(3, "M2 E2 S2"), checker)).toBe(true);
    expect(samePattern(3, patternState(3, "U2 D2 F2 B2 L2 R2"), checker)).toBe(
      true,
    );
  });
});
