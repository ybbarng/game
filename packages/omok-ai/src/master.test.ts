import { createRng } from "@game/mighty-engine";
import { createOmokScenario, pointName, viewOf } from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { createOmokMasterBot, MASTER_LIMITS } from "./master";

/** 백(0번 자리, 흑이 하나 많은 장면)이 둘 차례에 렌주 초고수가 고르는 자리 */
function pick(black: string[], white: string[], takeKey: boolean) {
  const s = createOmokScenario({
    rules: { variant: "renju", winsToFinish: 1 },
    black,
    white,
  });
  const bot = createOmokMasterBot({ ...MASTER_LIMITS, takeKey });
  const action = bot.decide(viewOf(s, 0), createRng(1));
  if (action.type !== "place") throw new Error("둘 차례인데 두지 않았다");
  return pointName(action.at);
}

// 초고수가 백으로 고수에게 지던 판(docs/20 9절)의 10수째. 흑은 F9부터 셋 위협으로 6수 만에 이긴다.
// 엔진 vct.ts로 7수까지 읽으면 그 길을 막는 백 자리는 G11·F9·I9·G8뿐이다. 급소 차지를 끄면 G7을 둬 이 시험이 실패한다
// (끈 판은 읽기가 길어 1.6초쯤 걸려 시험으로 두지 않았다, 2026-11-17 손으로 확인).
const BLACK = ["H8", "H9", "G10", "F11", "G9"];
const WHITE = ["F10", "H10", "F8", "I8"];

describe("초고수 렌주 백: 상대 몰아붙이기의 급소 차지", () => {
  it("끊는 자리를 노드 안에 확정하지 못해도 흑 몰아붙이기의 첫 수를 차지해 막는다", () => {
    expect(["G11", "F9", "I9", "G8"]).toContain(pick(BLACK, WHITE, true));
  });
});
