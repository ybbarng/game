// @vitest-environment node
import { STANDARD_RULES } from "@game/janggi-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { janggiKit } from "./kit";

// `commentary-tone-intermediate.test.ts`와 같은 대국의 20걸음부터(나눠 동시에 돈다)
describe("장기 다시 보기 해설 말투(중수끼리, 20걸음부터)", () => {
  commentaryToneSuite(
    janggiKit,
    [
      {
        rules: STANDARD_RULES,
        seed: 2,
        level: 1,
        from: 20,
        steps: 40,
        every: 4,
      },
    ],
    8,
  );
});
