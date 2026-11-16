// @vitest-environment node
import { WINDOWS_RULES } from "@game/hearts-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { heartsKit } from "./kit";

describe("하트 다시 보기 해설 말투", () => {
  commentaryToneSuite(heartsKit, [
    { rules: WINDOWS_RULES, seed: 1, level: 0, steps: 60, every: 5 },
  ]);
});
