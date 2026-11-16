import { describe, expect, it } from "vitest";

import { filterBook } from "@/stats/period";
import type { RoundRecord, StatsBook } from "@/stats/records";

import {
  type JokerCallRecord,
  jokerCallVerdict,
  type MightyRound,
  summarizeMighty,
} from "./mighty-stats";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-17T12:00:00+09:00");

/** 판을 처음부터 본 마이티 판 기록 하나(조커콜만 바꿔 가며 쓴다) */
function round(
  id: string,
  role: MightyRound["role"],
  calls: JokerCallRecord[] | undefined,
  at = NOW.getTime(),
): RoundRecord<MightyRound> {
  return {
    id,
    game: "mighty",
    at,
    mode: "solo",
    data: {
      players: 5,
      role,
      won: true,
      goal: { kiruda: "S", score: 14 },
      friend: "card",
      multipliers: [],
      rulingPoints: 14,
      money: 2,
      moneyAfter: 2,
      bid: role === "declarer" ? 14 : null,
      tricks: 3,
      points: 5,
      mighty: false,
      joker: false,
      jokerCall: calls === undefined ? true : calls.length > 0,
      ...(calls ? { calls } : {}),
      killed: false,
      killer: false,
    },
  };
}

const call = (
  fromSide: JokerCallRecord["fromSide"],
  won: boolean,
): JokerCallRecord => ({
  trick: 3,
  from: fromSide === null ? null : 2,
  fromSide,
  won,
  points: 1,
});

describe("내 기록: 효과 있는 조커콜(남긴 기록에서 다시 계산)", () => {
  it("야당인 내가 여당 조커를 끌어내고 먹었으면 효과가 있다", () => {
    expect(jokerCallVerdict("opposition", call("ruling", true))).toBe(
      "effective",
    );
  });

  it("주공·프렌드인 내가 야당 조커를 끌어내고 먹었으면 효과가 있다", () => {
    expect(jokerCallVerdict("declarer", call("opposition", true))).toBe(
      "effective",
    );
    expect(jokerCallVerdict("friend", call("opposition", true))).toBe(
      "effective",
    );
  });

  it("우리 편 조커·조커 없음·그 턴을 상대가 먹음은 효과가 없다", () => {
    expect(jokerCallVerdict("opposition", call("opposition", true))).toBe(
      "ownJoker",
    );
    expect(jokerCallVerdict("declarer", call(null, true))).toBe("noJoker");
    expect(jokerCallVerdict("declarer", call("opposition", false))).toBe(
      "lostTrick",
    );
  });

  it("조커콜 수와 효과 있는 조커콜 수를 센다", () => {
    const rounds = [
      round("a:1", "opposition", [call("ruling", true), call(null, false)]),
      round("a:2", "declarer", [call("ruling", true)]),
      round("a:3", "friend", [call("opposition", true)]),
    ];
    const c = summarizeMighty(rounds, []).counts;
    expect(c.jokerCalls).toBe(4);
    expect(c.jokerCallEffective).toBe(2);
  });

  it("판 처음을 못 본 판과 조커콜 기록이 생기기 전 판은 효과에 넣지 않는다", () => {
    const partial = {
      ...round("b:1", "opposition", [call("ruling", true)]),
      partial: true as const,
    };
    const old = round("b:2", "opposition", undefined);
    const c = summarizeMighty([partial, old], []).counts;
    // 옛 판은 조커콜 한 번으로만 센다(턴마다 기록이 없다).
    expect(c.jokerCalls).toBe(1);
    expect(c.jokerCallEffective).toBe(0);
  });

  it("기간을 고르면 그 기간의 판만 센다", () => {
    const book: StatsBook = {
      version: 1,
      since: 0,
      rounds: [
        round("c:1", "opposition", [call("ruling", true)]),
        round(
          "c:2",
          "opposition",
          [call("ruling", true)],
          NOW.getTime() - 40 * DAY,
        ),
      ],
      games: [],
    };
    const all = summarizeMighty(book.rounds, book.games).counts;
    const week = filterBook(book, "week", NOW);
    const recent = summarizeMighty(week.rounds, week.games).counts;
    expect(all.jokerCallEffective).toBe(2);
    expect(recent.jokerCallEffective).toBe(1);
  });
});
