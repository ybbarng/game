// @vitest-environment node
import { STANDARD_RULES } from "@game/janggi-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { janggiKit } from "./kit";

describe("장기 다시 보기 해설 말투", () => {
  commentaryToneSuite(janggiKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 60, every: 3 },
    { rules: STANDARD_RULES, seed: 2, level: 1, steps: 60, every: 3 },
  ]);
});
