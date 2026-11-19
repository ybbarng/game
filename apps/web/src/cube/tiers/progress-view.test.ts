import { describe, expect, it } from "vitest";
import {
  bandLayout,
  bandView,
  bestFiveView,
  nextSolveText,
  rangeText,
} from "./progress-view";
import { nextSolve, type TierBand, tierBand } from "./rank";

const band = (n: number, ms: number) =>
  bandView(tierBand(n, ms) as TierBand, ms);

describe("구간 안 자리 막대 글", () => {
  it("사용자 예: 왼쪽 브론즈 II 3:10.00, 오른쪽 브론즈 I 2:30.00, 표시 2:35.09", () => {
    expect(band(3, 155_090)).toEqual({
      leftName: "브론즈 II",
      leftTime: "3:10.00",
      rightName: "브론즈 I",
      rightTime: "2:30.00",
      value: "2:35.09",
      ratio: 0.87275,
      label: "브론즈 II 3:10.00 → 브론즈 I 2:30.00 · 최고 5판 평균 2:35.09",
    });
  });

  it("꼭대기는 오른쪽 이름 없이 0.00", () => {
    const v = band(3, 5_200);
    expect([v.leftName, v.leftTime, v.rightName, v.rightTime]).toEqual([
      "챌린저",
      "6.50",
      null,
      "0.00",
    ]);
    expect(v.label).toBe("챌린저 6.50 → 0.00 · 최고 5판 평균 5.20");
  });

  it("맨 아래 아이언 IV의 왼쪽 끝은 「다 맞춤」", () => {
    const v = band(3, 1_350_000);
    expect([v.leftName, v.leftTime, v.rightName, v.rightTime]).toEqual([
      "아이언 IV",
      "다 맞춤",
      "아이언 III",
      "15:00.00",
    ]);
  });
});

/** 앱 `TierBandTests`의 「layout…」 시험과 같은 예·같은 값 */
describe("구간 안 자리 막대 좌표", () => {
  it("경계 눈금은 양 끝에서 긴 경계 글의 절반만큼 안쪽, 자리는 두 눈금 사이에서 센다", () => {
    expect(bandLayout(0.5, 300, 120, 100, 50)).toEqual({
      tail: 60,
      lowX: 60,
      highX: 240,
      markX: 150,
      leftX: 0,
      rightX: 190,
      valueX: 125,
    });
  });

  it("꼭대기(오른쪽 글 「0.00」뿐)도 꼬리는 양쪽 같은 폭, 짧은 오른쪽 글은 눈금 아래 가운데", () => {
    expect(bandLayout(0, 300, 80, 28, 40)).toEqual({
      tail: 40,
      lowX: 40,
      highX: 260,
      markX: 40,
      leftX: 0,
      rightX: 246,
      valueX: 20,
    });
  });

  it("오른쪽 끝의 숫자는 막대 안으로 밀어 넣는다", () => {
    const l = bandLayout(1, 300, 60, 60, 80);
    expect([l.markX, l.valueX]).toEqual([270, 220]);
  });

  it("글이 짧아도 꼬리는 12px, 좁은 막대에서는 1/4까지이고 글은 막대 안에 남는다", () => {
    expect(bandLayout(0.5, 300, 10, 10, 30).tail).toBe(12);
    const l = bandLayout(0.5, 200, 140, 140, 30);
    expect([l.tail, l.leftX, l.rightX]).toEqual([50, 0, 60]);
  });

  it("자리가 0~1 밖이면 눈금에 붙인다", () => {
    expect(bandLayout(1.5, 300, 60, 60, 40).markX).toBe(270);
    expect(bandLayout(-1, 300, 60, 60, 40).markX).toBe(30);
  });
});

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
