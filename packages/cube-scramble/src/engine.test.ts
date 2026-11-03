import {
  applyMoves,
  faceColors,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { FACES, solve2x2, solve3x3 } from "@game/cube-solver";
import { describe, expect, it } from "vitest";
import { SCRAMBLE_EVENTS, scramble, scrambledFacelets } from "./index";

/**
 * 엔진·해법기·섞기가 서로 맞는지: 섞기 표기를 cube-engine으로 두고, 해법기 해를 이어 두면
 * 엔진 판정으로 맞는다. 화면은 엔진으로 돌리고 섞기·해는 해법기 시뮬레이터로 만들기 때문에
 * 두 표현이 어긋나면 여기서 드러난다.
 */

const SIZE = {
  "222": 2,
  "333": 3,
  "333bf": 3,
  "444": 4,
  "555": 5,
  "666": 6,
  "777": 7,
} as const;

function engineFacelets(n: number, text: string): string {
  const state = applyMoves(n, solvedCube(n), parseMoves(n, text));
  let s = "";
  for (const c of faceColors(n, state)) s += FACES[c];
  return s;
}

describe("섞기 → 엔진", () => {
  it("종목마다 엔진으로 둔 결과가 해법기 시뮬레이터 결과와 같다", () => {
    for (const event of SCRAMBLE_EVENTS) {
      const s = scramble(event, 7);
      expect(engineFacelets(SIZE[event], s.text)).toBe(scrambledFacelets(s));
    }
  });
});

describe("섞기 + 해 → 엔진에서 맞춤", () => {
  it.each([
    ["222", 1],
    ["222", 2],
    ["333", 1],
    ["333", 2],
  ] as const)("%s 씨앗 %i", (event, seed) => {
    expect(solvedInEngine(event, seed)).toBe(true);
  });

  it("333bf: 넓은 층으로 끝나 큐브가 돌아간 섞기도 해법기가 풀어 엔진에서 맞는다", () => {
    let rotated = 0;
    for (let seed = 1; seed <= 4; seed++) {
      if (/w/.test(scramble("333bf", seed).text)) rotated++;
      expect(solvedInEngine("333bf", seed)).toBe(true);
    }
    expect(rotated).toBeGreaterThan(0);
  });
});

function solvedInEngine(event: "222" | "333" | "333bf", seed: number): boolean {
  const n = SIZE[event];
  const s = scramble(event, seed);
  const f = scrambledFacelets(s);
  const sol = n === 2 ? solve2x2(f) : solve3x3(f);
  const end = applyMoves(n, solvedCube(n), parseMoves(n, `${s.text} ${sol}`));
  return isSolved(n, end);
}
