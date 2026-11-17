// @vitest-environment node
import { STANDARD_RULES, TEAM_RULES } from "@game/yut-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { yutKit } from "./kit";

describe("윷놀이 다시 보기 해설 말투", () => {
  commentaryToneSuite(yutKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 150, every: 2 },
    { rules: TEAM_RULES, seed: 2, level: 1, steps: 150, every: 2 },
  ]);
});
