// @vitest-environment node
import { SHORT_RULES } from "@game/galaxy-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { galaxyKit } from "./kit";

describe("은하 다시 보기 해설 말투", () => {
  commentaryToneSuite(galaxyKit, [
    { rules: SHORT_RULES, seed: 1, level: 0, steps: 300 },
    { rules: SHORT_RULES, seed: 2, level: 1, steps: 300 },
  ]);
});
