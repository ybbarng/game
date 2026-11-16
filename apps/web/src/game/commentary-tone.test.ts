// @vitest-environment node
import { presetRules } from "@game/mighty-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { mightyKit } from "./mighty-kit";

describe("마이티 다시 보기 해설 말투", () => {
  commentaryToneSuite(mightyKit, [
    { rules: presetRules("standard5"), seed: 1, level: 0, steps: 50, every: 4 },
  ]);
});
