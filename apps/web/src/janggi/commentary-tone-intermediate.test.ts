// @vitest-environment node
import { STANDARD_RULES } from "@game/janggi-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { janggiKit } from "./kit";

// 초보끼리 둔 판(`commentary-tone.test.ts`)과 나눠 동시에 돈다
describe("장기 다시 보기 해설 말투(중수끼리)", () => {
  commentaryToneSuite(janggiKit, [
    { rules: STANDARD_RULES, seed: 2, level: 1, steps: 40, every: 4 },
  ]);
});
