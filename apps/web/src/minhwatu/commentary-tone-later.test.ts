// @vitest-environment node
import { STANDARD_RULES } from "@game/minhwatu-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { minhwatuKit } from "./kit";

// `commentary-tone.test.ts`와 같은 대국(초보끼리)의 15걸음부터(나눠 동시에 돈다)
describe("민화투 다시 보기 해설 말투(15걸음부터)", () => {
  commentaryToneSuite(
    minhwatuKit,
    [
      {
        rules: STANDARD_RULES,
        seed: 1,
        level: 0,
        from: 15,
        steps: 50,
        every: 5,
      },
    ],
    14,
  );
});
