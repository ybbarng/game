import {
  createMatch,
  type OnecardCard,
  STANDARD_ONECARD_RULES,
  step,
  viewOf,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { onecardStats } from "./kit";

const DECK = [
  "H3",
  "H4",
  "H5",
  "H6",
  "H8",
  "H9",
  "H10",
  "D3",
  "D4",
  "D5",
  "D6",
  "D8",
  "D9",
  "D10",
] as OnecardCard[];
const RULES = { ...STANDARD_ONECARD_RULES, players: 2, handSize: 5 as const };

describe("원카드 판 기록: 그만둔 게임", () => {
  it("그만둔 게임은 끝까지 치지 않은 판이라 판 기록(등수·1등 판)을 남기지 않는다", () => {
    const start = createMatch(RULES, { deck: DECK });
    const retired = step(start.state, 0, { type: "retire" });
    if (!retired.ok) throw new Error(retired.error);
    const end = viewOf(retired.state, 1);
    expect([end.phase, end.retired, end.result !== null]).toEqual([
      "over",
      true,
      true,
    ]);
    expect(onecardStats.round(null, end, retired.events)).toBeNull();
  });
});
