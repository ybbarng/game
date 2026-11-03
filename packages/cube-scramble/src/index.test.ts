import {
  applyAlgorithm,
  distance2x2,
  isSolvedFacelets,
  parseMove,
  pocketApply,
  solve2x2,
  solve3x3,
  solvedFacelets,
  splitMoves,
} from "@game/cube-solver";
import { describe, expect, it } from "vitest";
import {
  MAX_333_LENGTH,
  MAX_333_TRIVIAL,
  MIN_222_DISTANCE,
  moveKinds,
  pocketScrambleExactly,
  RANDOM_MOVE_LENGTH,
  SCRAMBLE_222_LENGTH,
  SCRAMBLE_EVENTS,
  scramble,
  scrambledFacelets,
  solvableWithin,
} from "./index";

describe("씨앗에서 결정적", () => {
  it("같은 씨앗이면 같은 섞기, 다른 씨앗이면 다른 섞기", () => {
    for (const event of SCRAMBLE_EVENTS) {
      const a = scramble(event, 12345);
      expect(scramble(event, 12345)).toEqual(a);
      expect(scramble(event, 54321).text).not.toBe(a.text);
      expect(a.event).toBe(event);
    }
  });

  it("공식 방식 여부: 4×4 무작위 수만 공식이 아니다", () => {
    const official = SCRAMBLE_EVENTS.filter((e) => scramble(e, 1).official);
    expect(official).toEqual(["222", "333", "333bf", "555", "666", "777"]);
  });
});

/** 수 글자의 면 글자(`3Rw'` → R) */
const faceOf = (t: string) => t.replace(/[^URFDLB]/g, "");
const AXIS_OF: Record<string, string> = {
  U: "y",
  D: "y",
  R: "x",
  L: "x",
  F: "z",
  B: "z",
};
const axisOf = (t: string) => AXIS_OF[faceOf(t)] as string;

describe("2×2", () => {
  it("최적 해 4수 이상 상태를 딱 11수의 U·R·F로 만든다", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = scramble("222", seed);
      const moves = splitMoves(s.text);
      expect(moves).toHaveLength(SCRAMBLE_222_LENGTH);
      for (const t of moves) expect(t).toMatch(/^[URF][2']?$/);
      for (let i = 1; i < moves.length; i++) {
        expect(faceOf(moves[i] as string)).not.toBe(
          faceOf(moves[i - 1] as string),
        );
      }
      const f = scrambledFacelets(s);
      expect(distance2x2(f)).toBeGreaterThanOrEqual(MIN_222_DISTANCE);
      expect(
        isSolvedFacelets(
          scrambledFacelets({ ...s, text: `${s.text} ${solve2x2(f)}` }),
        ),
      ).toBe(true);
    }
  });

  it("짧게 풀리는 상태도 딱 11수로 만든다", () => {
    // 맞춘 상태에 R U를 돌린 상태(거리 2)
    const index = pocketApply(pocketApply(0, 3), 0);
    const text = pocketScrambleExactly(index, SCRAMBLE_222_LENGTH);
    expect(splitMoves(text ?? "")).toHaveLength(11);
    expect(
      distance2x2(
        scrambledFacelets({ event: "222", text: text ?? "", official: true }),
      ),
    ).toBe(2);
  });
});

describe("3×3", () => {
  it("2수 이상 필요하고, 21수를 넘지 않으며, 해법기로 다시 풀린다", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = scramble("333", seed);
      expect(splitMoves(s.text).length).toBeLessThanOrEqual(MAX_333_LENGTH);
      const f = scrambledFacelets(s);
      expect(solvableWithin(f, MAX_333_TRIVIAL)).toBe(false);
      const sol = solve3x3(f);
      expect(
        isSolvedFacelets(scrambledFacelets({ ...s, text: `${s.text} ${sol}` })),
      ).toBe(true);
    }
  });

  it("1수 이하로 풀리는 상태만 거른다(2수 상태는 섞기가 된다)", () => {
    const solved = solvedFacelets(3);
    expect(solvableWithin(solved, MAX_333_TRIVIAL)).toBe(true);
    expect(
      solvableWithin(applyAlgorithm(solved, "R", 3), MAX_333_TRIVIAL),
    ).toBe(true);
    expect(
      solvableWithin(applyAlgorithm(solved, "R U", 3), MAX_333_TRIVIAL),
    ).toBe(false);
  });

  it("블라인드는 끝에 넓은 층 방향 돌리기를 붙이고, 섞기 마지막 수는 그 첫 수의 축이 아니다", () => {
    let withSuffix = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const moves = splitMoves(scramble("333bf", seed).text);
      const suffix = moves.filter((t) => t.includes("w"));
      const body = moves.slice(0, moves.length - suffix.length);
      expect(suffix.length).toBeLessThanOrEqual(2);
      expect(moves.slice(body.length)).toEqual(suffix);
      for (const t of suffix) expect(t).toMatch(/^[RFU]w[2']?$/);
      if (suffix.length > 0) {
        withSuffix++;
        expect(axisOf(body.at(-1) as string)).not.toBe(
          axisOf(suffix[0] as string),
        );
      }
    }
    expect(withSuffix).toBeGreaterThan(0);
  });

  it("해법기는 첫 수의 축을 막을 수 있다", () => {
    for (let seed = 1; seed <= 3; seed++) {
      const f = scrambledFacelets(scramble("333", seed));
      for (const axis of ["U", "R", "F"] as const) {
        const sol = splitMoves(solve3x3(f, { firstAxisNot: axis }));
        expect(axisOf(sol[0] as string)).not.toBe(axisOf(axis));
        expect(isSolvedFacelets(applyAlgorithm(f, sol.join(" "), 3))).toBe(
          true,
        );
      }
    }
  });
});

describe("큰 큐브 무작위 수", () => {
  const sizes = [
    ["444", 4],
    ["555", 5],
    ["666", 6],
    ["777", 7],
  ] as const;

  it("길이가 40·60·80·100수이고 표기를 읽을 수 있다", () => {
    for (const [event, n] of sizes) {
      const moves = splitMoves(scramble(event, 7).text);
      expect(moves).toHaveLength(RANDOM_MOVE_LENGTH[n]);
      for (const t of moves) expect(() => parseMove(n, t)).not.toThrow();
    }
  });

  it("이어지는 같은 축 묶음 안에서 같은 면·두께는 한 번만 나온다", () => {
    let longRun = false;
    for (const [event] of sizes) {
      for (let seed = 1; seed <= 5; seed++) {
        const kinds = splitMoves(scramble(event, seed).text).map((t) =>
          t.replace(/[2']$/, ""),
        );
        let run: string[] = [];
        for (const k of kinds) {
          if (run.length > 0 && axisOf(run[0] as string) !== axisOf(k))
            run = [];
          expect(run).not.toContain(k);
          run.push(k);
          if (run.length >= 3) longRun = true;
        }
      }
    }
    // 예전의 "같은 축 세 번 금지"는 없앴다: 서로 다른 종류면 같은 축이 셋 넘게 이어질 수 있다
    expect(longRun).toBe(true);
  });

  it("크기별 수 종류", () => {
    expect(moveKinds(4).map((k) => k.name)).toEqual([
      "U",
      "D",
      "R",
      "L",
      "F",
      "B",
      "Uw",
      "Rw",
      "Fw",
    ]);
    expect(moveKinds(5)).toHaveLength(12);
    expect(
      moveKinds(6)
        .map((k) => k.name)
        .slice(12),
    ).toEqual(["3Uw", "3Rw", "3Fw"]);
    expect(moveKinds(7)).toHaveLength(18);
  });
});
