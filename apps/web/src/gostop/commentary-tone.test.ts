// @vitest-environment node
import { GOSTOP3_RULES, MATGO_RULES } from "@game/gostop-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { gostopKit } from "./kit";

describe("고스톱 다시 보기 해설 말투", () => {
  commentaryToneSuite(gostopKit, [
    { rules: MATGO_RULES, seed: 1, level: 0, steps: 120, every: 2 },
    { rules: GOSTOP3_RULES, seed: 2, level: 1, steps: 120, every: 2 },
  ]);
});
