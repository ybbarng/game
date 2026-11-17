// @vitest-environment node
import { STANDARD_RULES } from "@game/chess-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { chessKit } from "./kit";

// 해설마다 고수(판 수 2만)를 불러 무겁다. 중수끼리 둔 판은 `commentary-tone-intermediate.test.ts`로 나눠 동시에 돈다
describe("체스 다시 보기 해설 말투(초보끼리)", () => {
  commentaryToneSuite(chessKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 40, every: 4 },
  ]);
});
