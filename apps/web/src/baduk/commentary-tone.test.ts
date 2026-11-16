// @vitest-environment node
import { STANDARD_RULES } from "@game/baduk-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { badukKit } from "./kit";

describe("바둑 다시 보기 해설 말투", () => {
  commentaryToneSuite(badukKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 200, every: 8 },
  ]);
});
