// @vitest-environment node
import { STANDARD_RULES } from "@game/janggi-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { janggiKit } from "./kit";

// 해설마다 고수를 불러 무겁다. 중수끼리 둔 판은 `commentary-tone-intermediate.test.ts`로 나눠 동시에 돈다
describe("장기 다시 보기 해설 말투(초보끼리)", () => {
  commentaryToneSuite(janggiKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 40, every: 4 },
  ]);
});
