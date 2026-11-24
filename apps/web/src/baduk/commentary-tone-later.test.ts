// @vitest-environment node
import { STANDARD_RULES } from "@game/baduk-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { badukKit } from "./kit";

// `commentary-tone.test.ts`와 같은 대국의 40걸음부터(나눠 동시에 돈다)
describe("바둑 다시 보기 해설 말투(40걸음부터)", () => {
  commentaryToneSuite(
    badukKit,
    [
      {
        rules: STANDARD_RULES,
        seed: 1,
        level: 0,
        from: 40,
        steps: 160,
        every: 10,
      },
    ],
    19,
  );
});
