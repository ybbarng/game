import {
  applyMoves,
  faceColors,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import { describe, expect, it } from "vitest";

import { recolor, solveYauHuman } from "./yau-hero";
import { solveYau } from "./yau-solve";

const n = 4;
const scrambled = (seed: number) =>
  applyMoves(n, solvedCube(n), parseMoves(n, scramble("444", seed).text));
const play = (s: ReturnType<typeof scrambled>, moves: readonly string[]) =>
  applyMoves(n, s, parseMoves(n, moves.join(" ")));
/** 그 단계 끝에서 아랫면 센터 블럭 넷의 색 */
const downCenters = (s: ReturnType<typeof scrambled>) => {
  const c = faceColors(n, s);
  return [53, 54, 57, 58].map((i) => c[i]);
};

describe("첫 화면 4×4 야우(`solveYauHuman`)", () => {
  it.each([0, 1, 2, 3, 4, 5])(
    "첫 면 색 %i: 섞기 여섯 판을 끝까지 맞추고, 십자 셋 단계 끝에 그 색 센터가 아랫면에 있다",
    (first) => {
      for (const seed of [11, 12, 13, 14, 15, 16]) {
        const start = scrambled(seed);
        const r = solveYauHuman(start, first);
        expect(isSolved(n, play(start, r.moves)), `씨앗 ${seed}`).toBe(true);
        const cross = r.stages.find((st) => st.name === "yau-cross3");
        if (!cross) throw new Error("십자 셋 단계가 없다");
        const at = play(start, r.moves.slice(0, cross.end));
        expect(downCenters(at)).toEqual([first, first, first, first]);
      }
    },
  );

  it("단계 차례: 첫 두 센터 → 십자 셋 → 나머지 센터 → 마지막 십자 엣지 → 엣지 짝 → 3×3 처음 맞추기 차례", () => {
    const r = solveYauHuman(scrambled(1));
    const names = r.stages.map((st) => st.name);
    expect(names.slice(0, 6)).toEqual([
      "yau-centers",
      "yau-cross3",
      "centers-rest",
      "yau-last-cross",
      "edges",
      "corners",
    ]);
    expect(names.at(-1)).toBe("ll-corner-twist");
    // 단계는 빈틈없이 이어지고, 살피는 자리는 단계 첫 수가 아니다
    let at = 0;
    for (const st of r.stages) {
      expect(st.start).toBe(at);
      at = st.end;
    }
    expect(at).toBe(r.moves.length);
    const starts = new Set(r.stages.map((st) => st.start));
    expect(r.looks.filter((l) => starts.has(l))).toEqual([]);
  });

  it("흰색으로 풀면 야우 풀이 함수와 같은 수다(이어 붙이면 `solveYau`의 수)", () => {
    for (const seed of [1, 2, 3]) {
      const start = scrambled(seed);
      expect(solveYauHuman(start, 0).moves.join(" ")).toBe(
        solveYau(start).moves.replace(/\s+/g, " "),
      );
    }
  });

  it("`until`이면 그 단계까지만 내고, 그때까지의 수는 끝까지 푼 판과 같다", () => {
    const start = scrambled(2);
    const full = solveYauHuman(start, 3);
    const part = solveYauHuman(start, 3, "yau-cross3");
    expect(part.stages.map((st) => st.name)).toEqual([
      "yau-centers",
      "yau-cross3",
    ]);
    expect(part.moves).toEqual(full.moves.slice(0, part.stages[1]?.end ?? 0));
  });

  it("색 바꾸기는 조각을 옮기지 않는다: 같은 수를 두면 바꾼 색끼리 같은 모양", () => {
    const map = [3, 4, 5, 0, 1, 2];
    const s = scrambled(5);
    const moved = play(s, ["R", "2U", "F'"]);
    const a = faceColors(n, play(recolor(n, s, map), ["R", "2U", "F'"]));
    const b = faceColors(n, moved);
    expect(Array.from(a)).toEqual(Array.from(b, (c) => map[c]));
  });
});
