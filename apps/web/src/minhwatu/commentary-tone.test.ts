// @vitest-environment node
import { STANDARD_RULES } from "@game/minhwatu-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { minhwatuKit } from "./kit";

describe("민화투 다시 보기 해설 말투", () => {
  commentaryToneSuite(minhwatuKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 120, every: 2 },
    { rules: STANDARD_RULES, seed: 2, level: 1, steps: 120, every: 2 },
  ]);
});
