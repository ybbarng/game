// @vitest-environment node
import { STANDARD_RULES } from "@game/janggi-engine";
import { describe } from "vitest";

import { commentaryToneSuite } from "@/review/commentary-tone-suite";

import { janggiKit } from "./kit";

// 초보끼리 둔 판(`commentary-tone.test.ts`)과 나눠 동시에 돈다. 중수끼리 둔 판도 해설마다 고수를 불러 무거워,
// 같은 대국을 20걸음 앞뒤로 나눠 뒤쪽은 `commentary-tone-intermediate-later.test.ts`가 본다
describe("장기 다시 보기 해설 말투(중수끼리)", () => {
  commentaryToneSuite(
    janggiKit,
    [{ rules: STANDARD_RULES, seed: 2, level: 1, steps: 20, every: 4 }],
    10,
  );
});
