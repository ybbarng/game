import { emptyWinners, type RoundRecord } from "@game/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  bestRank,
  hillFaces,
  hillRanks,
  MARKS_DELAY_MS,
  marksDelay,
  speechAt,
  speechRank,
  winnersLine,
} from "./after-observe";
import { celebrationPlan } from "./celebrate";

/** 당첨 번호 1~6, 보너스 7인 기록(당첨 예측서 수는 장 수만큼 빈 id) */
function record(
  counts: Partial<Record<1 | 2 | 3 | 4 | 5, number>> = {},
  extra: Partial<RoundRecord> = {},
): RoundRecord {
  const winners = emptyWinners();
  for (const [r, n] of Object.entries(counts))
    winners[Number(r) as 1] = Array.from(
      { length: n },
      () => new Uint8Array(32),
    );
  return {
    round: 3,
    void: false,
    numbers: [1, 2, 3, 4, 5, 6],
    bonus: 7,
    winners,
    ...extra,
  } as RoundRecord;
}

describe("등수별 인원 한 줄", () => {
  it("당첨이 있는 등수만 높은 등수부터", () => {
    expect(winnersLine(record({ 4: 3, 5: 12 }))).toBe("4등 3명 · 5등 12명");
    expect(winnersLine(record({ 1: 1, 5: 2 }))).toBe("1등 1명 · 5등 2명");
  });
  it("아무도 없으면 한 문장", () => {
    expect(winnersLine(record())).toBe("이번 관측에서는 당첨이 없었습니다.");
  });
  it("무효 회차는 줄을 두지 않는다", () => {
    expect(winnersLine(record({}, { void: true }))).toBeNull();
  });
});

describe("언덕 위 등수", () => {
  const byPerson = {
    a: [1, 2, 3, 4, 5, 6], // 1등
    b: [1, 2, 3, 4, 5, 7], // 2등
    c: [1, 2, 3, 4, 5, 40], // 3등
    d: [1, 2, 3, 4, 40, 41], // 4등
    e: [1, 2, 3, 40, 41, 42], // 5등
    f: [1, 2, 7, 40, 41, 42], // 낙첨(보너스는 5등부터 상관없다)
  };
  it("고른 별과 당첨 번호로 등수, 당첨이 아니면 없다", () => {
    const ranks = hillRanks(record(), byPerson);
    expect(Object.fromEntries(ranks)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  });
  it("기록이 없거나 무효거나 고른 별이 아직 없으면 비었다", () => {
    expect(hillRanks(null, byPerson).size).toBe(0);
    expect(hillRanks(record({}, { void: true }), byPerson).size).toBe(0);
    expect(hillRanks(record(), null).size).toBe(0);
  });
  it("가장 높은 등수는 언덕에 있는 사람 가운데서", () => {
    const ranks = hillRanks(record(), byPerson);
    expect(bestRank(ranks, ["d", "e", "f"])).toBe(4);
    expect(bestRank(ranks, ["e", "a"])).toBe(1);
    expect(bestRank(ranks, ["f"])).toBeNull();
  });
});

describe("언덕에 보일 얼굴", () => {
  const ranks = new Map([
    ["p9", 4 as const],
    ["p7", 5 as const],
  ]);
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  it("넘치지 않으면 온 차례 그대로", () => {
    expect(hillFaces(ids, ranks, 12)).toEqual(ids);
  });
  it("넘치면 당첨된 얼굴을 높은 등수부터 앞으로", () => {
    expect(hillFaces(ids, ranks, 4)).toEqual(["p9", "p7", "p0", "p1"]);
  });
});

describe("표지가 붙는 때", () => {
  it("당첨이 아니면 결과 카드 뒤 잠깐", () => {
    expect(marksDelay(null)).toBe(MARKS_DELAY_MS);
  });
  it("내가 당첨이면 하늘의 축하 연출이 끝난 뒤", () => {
    const plan = celebrationPlan(1, [1, 2, 3, 4, 5, 6]);
    const last = Math.max(...plan.meteors.map((m) => m.at));
    expect(marksDelay(plan)).toBeGreaterThan(last + 1000);
    expect(marksDelay(plan)).toBeGreaterThan((plan.sealAt ?? 0) + 900);
  });
});

describe("당첨 소감", () => {
  it("관측 뒤 1~3등의 첫 말만", () => {
    expect(speechRank({ after: true, rank: 1, spokeBefore: false })).toBe(1);
    expect(speechRank({ after: true, rank: 3, spokeBefore: false })).toBe(3);
  });
  it("4·5등, 낙첨, 관측 전, 두 번째 말은 보통 풍등", () => {
    expect(speechRank({ after: true, rank: 4, spokeBefore: false })).toBeNull();
    expect(
      speechRank({ after: true, rank: null, spokeBefore: false }),
    ).toBeNull();
    expect(
      speechRank({ after: false, rank: 1, spokeBefore: false }),
    ).toBeNull();
    expect(speechRank({ after: true, rank: 2, spokeBefore: true })).toBeNull();
  });
  it("표지가 붙은 뒤, 앞 소감이 걷힌 뒤에 차례로", () => {
    expect(speechAt(100, 500, 0)).toBe(500);
    expect(speechAt(900, 500, 0)).toBe(900);
    expect(speechAt(900, 500, 9500)).toBe(9500);
  });
});
