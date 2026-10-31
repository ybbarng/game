import { beforeEach, describe, expect, it } from "vitest";

import { removeHolding } from "./qual-store";

describe("이 기기에서 지우기(qual-store)", () => {
  beforeEach(() => localStorage.clear());

  it("그 기간의 자격과 받다가 끊겨 남은 요청(씨앗)을 함께 지운다", () => {
    localStorage.setItem(
      "t-qual",
      JSON.stringify([
        { ledger: "L", periodId: "aa", seed: "s1", stamp: "x" },
        { ledger: "L", periodId: "bb", seed: "s2", stamp: "y" },
      ]),
    );
    localStorage.setItem(
      "t-qual-pending",
      JSON.stringify({
        ledger: "L",
        periodId: "aa",
        seed: "s3",
        factor: "1",
        blinded: "b",
      }),
    );
    removeHolding("t", "L", "aa");
    expect(JSON.parse(localStorage.getItem("t-qual") ?? "[]")).toEqual([
      { ledger: "L", periodId: "bb", seed: "s2", stamp: "y" },
    ]);
    expect(localStorage.getItem("t-qual-pending")).toBeNull();
  });

  it("다른 기간의 남은 요청은 그대로 둔다", () => {
    const pending = {
      ledger: "L",
      periodId: "bb",
      seed: "s3",
      factor: "1",
      blinded: "b",
    };
    localStorage.setItem("t-qual-pending", JSON.stringify(pending));
    removeHolding("t", "L", "aa");
    expect(
      JSON.parse(localStorage.getItem("t-qual-pending") ?? "null"),
    ).toEqual(pending);
  });
});
