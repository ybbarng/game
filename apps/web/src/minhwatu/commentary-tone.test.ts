// @vitest-environment node
import { STANDARD_RULES } from "@game/minhwatu-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { minhwatuKit } from "./kit";

// 해설마다 고수를 불러 무겁다(더미가 많은 판 앞쪽일수록 무겁다). 초보끼리 둔 대국의 15걸음부터는
// `commentary-tone-later.test.ts`, 중수끼리 둔 대국은 `commentary-tone-intermediate.test.ts`가 나눠 동시에 본다
describe("민화투 다시 보기 해설 말투", () => {
  commentaryToneSuite(
    minhwatuKit,
    [{ rules: STANDARD_RULES, seed: 1, level: 0, steps: 15, every: 5 }],
    7,
  );
});
