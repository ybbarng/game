import { describe, expect, it } from "vitest";

import { groupSplits } from "./splits";

describe("구간 기록 묶기", () => {
  it("같은 순간은 칩 하나, 구간은 앞 묶음부터", () => {
    expect(
      groupSplits([
        { id: "roux1", ms: 2_000 },
        { id: "cross", ms: 2_000 },
        { id: "f2l1", ms: 5_500 },
      ]),
    ).toEqual([
      {
        ids: ["roux1", "cross"],
        label: "첫 블록 · 십자",
        ms: 2_000,
        lap: 2_000,
      },
      { ids: ["f2l1"], label: "F2L 1/4", ms: 5_500, lap: 3_500 },
    ]);
  });

  it("다 맞춘 순간에 함께 켜진 것은 윗층만", () => {
    const got = groupSplits([
      { id: "cross", ms: 1_000 },
      { id: "corners", ms: 9_000 },
      { id: "ll", ms: 9_000 },
    ]);
    expect(got.map((g) => g.label)).toEqual(["십자", "윗층"]);
    expect(got[1]?.lap).toBe(8_000);
  });
});
