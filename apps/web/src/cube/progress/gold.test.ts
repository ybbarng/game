import { describe, expect, it } from "vitest";

import { parseSplits, type SolveRecord } from "../records";
import { bestSegments, goldSplits, isPersonalBest, segmentsOf } from "./gold";

const rec = (ms: number | null, splits?: string, penalty = 0): SolveRecord => ({
  at: 1,
  n: 3,
  mode: "solo",
  ms,
  penalty,
  moves: 50,
  scramble: "R U",
  ...(splits === undefined ? {} : { splits }),
});

describe("구간 골드", () => {
  it("구간 이름은 앞 칩의 대표 단계 > 이 칩의 대표 단계", () => {
    // 같은 순간(6000)의 f2l1·roux1은 칩 하나, 대표는 진행이 더 나아간 첫 블록
    const s = parseSplits("cross@2000 f2l1@6000 roux1@6000 oll@20000 ll@24000");
    expect(segmentsOf(s)).toEqual([
      { key: "start>cross", ms: 2_000, lap: 2_000 },
      { key: "cross>roux1", ms: 6_000, lap: 4_000 },
      { key: "roux1>oll", ms: 20_000, lap: 14_000 },
      { key: "oll>ll", ms: 24_000, lap: 4_000 },
    ]);
  });

  it("옛 기록이 없으면 골드가 없다", () => {
    const now = parseSplits("cross@1000 oll@9000 ll@12000");
    expect(goldSplits(now, bestSegments([])).size).toBe(0);
    expect(isPersonalBest(12_000, [])).toBe(false);
  });

  it("구간 기록이 없는 옛 기록과 섞여도 있는 것끼리만 견준다", () => {
    const prior = [
      rec(9_000), // 구간 칸이 없는 옛 기록(시간은 개인 최고 판정에만 쓴다)
      rec(30_000, "cross@3000 oll@20000 ll@30000"),
      rec(28_000, "cross@2500 oll@21000 ll@28000"),
      rec(null), // DNF
    ];
    const best = bestSegments(prior);
    expect(best.get("start>cross")).toBe(2_500);
    expect(best.get("cross>oll")).toBe(17_000);
    expect(best.get("oll>ll")).toBe(7_000);
    // 이번: 십자 2.4(골드), 십자>윗면 16.6(골드), 윗면>윗층 7.4(아님)
    const now = parseSplits("cross@2400 oll@19000 ll@26400");
    expect([...goldSplits(now, best)].sort((a, b) => a - b)).toEqual([
      2_400, 19_000,
    ]);
    // 옛 최고와 같으면 골드가 아니다
    expect(goldSplits(parseSplits("cross@2500"), best).size).toBe(0);
    // 처음 만난 구간(십자 > F2L 1/4)은 견줄 것이 없다
    expect(goldSplits(parseSplits("cross@2600 f2l1@3000"), best).size).toBe(0);
    // 개인 최고: 구간이 없는 옛 기록(9초)도 시간으로는 견준다
    expect(isPersonalBest(26_400, prior)).toBe(false);
    expect(isPersonalBest(8_900, prior)).toBe(true);
  });

  it("개인 최고는 벌점을 더한 시간으로 견준다", () => {
    const prior = [rec(10_000, undefined, 2_000)];
    expect(isPersonalBest(11_000, prior)).toBe(true);
    expect(isPersonalBest(12_000, prior)).toBe(false);
    expect(isPersonalBest(null, prior)).toBe(false);
  });
});
