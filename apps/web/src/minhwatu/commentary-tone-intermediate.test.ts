// @vitest-environment node
import { STANDARD_RULES } from "@game/minhwatu-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { minhwatuKit } from "./kit";

// 초보끼리 둔 대국(`commentary-tone.test.ts`·`commentary-tone-later.test.ts`)과 나눠 동시에 돈다
describe("민화투 다시 보기 해설 말투(중수끼리)", () => {
  commentaryToneSuite(
    minhwatuKit,
    [{ rules: STANDARD_RULES, seed: 2, level: 1, steps: 30, every: 5 }],
    13,
  );
});
