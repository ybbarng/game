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
        label: "첫 블록 +1",
        full: "첫 블록 · 십자",
        ms: 2_000,
        lap: 2_000,
      },
      {
        ids: ["f2l1"],
        label: "F2L 1/4",
        full: "F2L 1/4",
        ms: 5_500,
        lap: 3_500,
      },
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

  it("위층만 어긋난 상태처럼 한꺼번에 켜지면 가장 나아간 단계 하나 + 나머지 수", () => {
    const ids = [
      "cross",
      "f2l1",
      "f2l2",
      "f2l3",
      "layer1",
      "layer2",
      "oll",
      "roux1",
      "roux2",
      "eoline",
    ];
    const [g] = groupSplits(ids.map((id) => ({ id, ms: 5_750 })));
    expect(g?.label).toBe("윗면 +9");
    expect(g?.full.startsWith("십자 · F2L 1/4")).toBe(true);
  });
});
