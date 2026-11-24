// @vitest-environment node
import { STANDARD_RULES } from "@game/baduk-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { badukKit } from "./kit";

// 해설마다 고수 탐색을 돌려 무겁다(빈 판에 가까운 앞쪽 수일수록 무겁다). 같은 대국을 40걸음 앞뒤로 나눠
// 뒤쪽은 `commentary-tone-later.test.ts`가 본다(나눠 동시에 돈다)
describe("바둑 다시 보기 해설 말투", () => {
  commentaryToneSuite(
    badukKit,
    [{ rules: STANDARD_RULES, seed: 1, level: 0, steps: 40, every: 10 }],
    12,
  );
});
