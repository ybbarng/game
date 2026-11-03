import {
  distance2x2,
  isSolvedFacelets,
  parseMove,
  solve2x2,
  solve3x3,
  splitMoves,
} from "@game/cube-solver";
import { describe, expect, it } from "vitest";
import {
  MIN_222_DISTANCE,
  moveKinds,
  RANDOM_MOVE_LENGTH,
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

describe("2×2", () => {
  it("최적 해 4수 이상 상태이고, 섞기 길이가 최적 해 길이와 같다", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = scramble("222", seed);
      const f = scrambledFacelets(s);
      const d = distance2x2(f);
      expect(d).toBeGreaterThanOrEqual(MIN_222_DISTANCE);
      expect(splitMoves(s.text)).toHaveLength(d);
      expect(isSolvedFacelets(f)).toBe(false);
      expect(s.text).toMatch(/^([URF][2']? ?)+$/);
      expect(splitMoves(solve2x2(f))).toHaveLength(d);
    }
  });
});

describe("3×3", () => {
  it("2수 안에 풀리지 않고, 21수를 넘지 않으며, 해법기로 다시 풀린다", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const s = scramble("333", seed);
      expect(splitMoves(s.text).length).toBeLessThanOrEqual(21);
      const f = scrambledFacelets(s);
      expect(solvableWithin(f, 2)).toBe(false);
      const sol = solve3x3(f);
      expect(
        isSolvedFacelets(scrambledFacelets({ ...s, text: `${s.text} ${sol}` })),
      ).toBe(true);
    }
  });

  it("블라인드는 3×3 섞기 뒤에 넓은 층 돌리기를 붙인다", () => {
    let withSuffix = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const base = scramble("333", seed).text;
      const bf = scramble("333bf", seed).text;
      expect(bf.startsWith(base)).toBe(true);
      const suffix = splitMoves(bf.slice(base.length));
      expect(suffix.length).toBeLessThanOrEqual(2);
      for (const t of suffix) expect(t).toMatch(/^[RFU]w[2']?$/);
      if (suffix.length > 0) withSuffix++;
    }
    expect(withSuffix).toBeGreaterThan(0);
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

  it("같은 수 종류 연달아, 같은 축 세 번 연달아가 없다", () => {
    const axisOf = (t: string) =>
      ({ U: "y", D: "y", R: "x", L: "x", F: "z", B: "z" })[
        t.replace(/[^URFDLB]/g, "") as "U"
      ];
    for (const [event] of sizes) {
      for (let seed = 1; seed <= 5; seed++) {
        const moves = splitMoves(scramble(event, seed).text).map((t) =>
          t.replace(/[2']$/, ""),
        );
        for (let i = 1; i < moves.length; i++) {
          expect(moves[i]).not.toBe(moves[i - 1]);
          if (i >= 2) {
            const same =
              axisOf(moves[i] as string) === axisOf(moves[i - 1] as string) &&
              axisOf(moves[i] as string) === axisOf(moves[i - 2] as string);
            expect(same).toBe(false);
          }
        }
      }
    }
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
