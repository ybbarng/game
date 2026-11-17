import { describe, expect, it } from "vitest";
import { bestFiveView, nextSolveText, rangeText } from "./progress-view";
import { nextSolve } from "./rank";

/** 사용자 Cubie 3×3 11판(새것이 앞, `rank.test.ts`와 같다) */
const USER = [
  138_650, 139_800, 123_810, 186_830, 249_710, 290_000, 330_000, 370_000,
  415_000, 460_000, 508_450,
].map((ms, i) => ({ ms, penalty: 0, no: 11 - i }));

describe("기록 줄에 티어를 정한 5판 짚기", () => {
  it("사용자 예: 7~11번, 9번이 빠진 가장 빠른 판, 7번이 가장 느린 판", () => {
    const v = bestFiveView(USER);
    expect(v && rangeText(v)).toBe("7~11번");
    expect(v?.ms).toBe(155_090);
    expect(Object.fromEntries(v?.marks ?? [])).toEqual({
      11: "in",
      10: "in",
      9: "fast",
      8: "in",
      7: "slow",
    });
  });

  it("남겨 둔 최고 5판이 이기면 그 번호(목록에 없을 수도 있다)", () => {
    const kept = [5, 4, 3, 2, 1].map((no, i) => ({
      ms: 100_000 + i * 1000,
      penalty: 0,
      no,
    }));
    const v = bestFiveView(USER, kept);
    expect(v && rangeText(v)).toBe("1~5번");
    expect(v?.marks.get(5)).toBe("fast");
    expect(v?.marks.get(1)).toBe("slow");
  });
});

describe("다음 판 목표 글", () => {
  it("사용자 예와 못 닿는 때", () => {
    const s = nextSolve(3, USER);
    expect(s && nextSolveText(s)).toBe("다음 판 2:51.56 안이면 브론즈 I");
    const slow = [240_000, 245_000, 250_000, 255_000].map((ms) => ({
      ms,
      penalty: 0,
    }));
    const out = nextSolve(3, [...slow, ...USER.slice(0, 5)]);
    expect(out && nextSolveText(out)).toBe(
      "다음 판 하나로는 브론즈 I에 못 닿아요. 최고 5판 평균을 5.09초 줄여야 해요.",
    );
  });
});
