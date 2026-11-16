// @vitest-environment node
import { STANDARD_RULES } from "@game/nyrongppong-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { nyrongppongKit } from "./kit";

describe("나이롱뽕 다시 보기 해설 말투", () => {
  commentaryToneSuite(nyrongppongKit, [
    { rules: STANDARD_RULES, seed: 1, level: 0, steps: 200 },
    { rules: STANDARD_RULES, seed: 2, level: 1, steps: 200 },
  ]);
});
