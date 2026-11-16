// @vitest-environment node
import { STANDARD_ONECARD_RULES } from "@game/onecard-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { onecardKit } from "./kit";

describe("원카드 다시 보기 해설 말투", () => {
  commentaryToneSuite(onecardKit, [
    { rules: STANDARD_ONECARD_RULES, seed: 1, level: 0, steps: 200 },
  ]);
});
