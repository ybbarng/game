import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { solveHuman } from "./methods";
import { scrambledState } from "./scramble-test-util";
import { yauReduce } from "./yau";

/** 4×4 고수·초고수 컴퓨터의 야우(docs/47 10-5): 앞 네 단계는 단원 규칙, 엣지 짝은 십자를 지키는 짧은 길, 3×3처럼은 CFOP */

const SEEDS = [1, 2, 3];
const start = (seed: number) => scrambledState("444", seed);

describe("4×4 고수·초고수 야우(짧은 엣지 짝 + CFOP)", () => {
  it.each(SEEDS)(
    "섞기(씨앗 %i)를 앞 네 단계는 단원 규칙 그대로, 엣지 짝은 짧은 길로, 뒤는 CFOP로 끝까지 맞춘다",
    (seed) => {
      const s = start(seed);
      const h = solveHuman("yau-cfop", 4, s);
      expect(
        isSolved(4, applyMoves(4, s, parseMoves(4, h.moves.join(" ")))),
      ).toBe(true);
      expect(h.stages.slice(0, 5).map((st) => st.name)).toEqual([
        "yau-centers",
        "yau-cross3",
        "centers-rest",
        "yau-last-cross",
        "edges",
      ]);
      const taught = yauReduce(s).stages;
      const short = yauReduce(s, () => 0, "short").stages;
      // 앞 네 단계는 단원 규칙 수, 엣지 짝만 짧은 길
      expect(short.slice(0, 4)).toEqual(taught.slice(0, 4));
      const front = h.moves.slice(0, (h.stages[4]?.end ?? 0) as number);
      expect(front.join(" ")).toBe(
        short
          .map((st) => st.moves)
          .filter(Boolean)
          .join(" "),
      );
      const edges = (h.stages[4]?.end ?? 0) - (h.stages[4]?.start ?? 0);
      expect(edges).toBeLessThan(taught[4]?.moves.split(" ").length ?? 0);
    },
  );
});
