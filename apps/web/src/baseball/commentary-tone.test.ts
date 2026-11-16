// @vitest-environment node
import { STANDARD_RULES } from "@game/baseball-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { baseballKit } from "./kit";

describe("숫자야구 다시 보기 해설 말투", () => {
  commentaryToneSuite(baseballKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 60 },
    { rules: STANDARD_RULES, seed: 2, level: 1, steps: 60 },
  ]);
});
