import { describe, expect, it } from "vitest";
import {
  type BandWidths,
  bandLayout,
  bandView,
  bestFiveView,
  nextSolveText,
  rangeText,
  timePieces,
} from "./progress-view";
import { nextSolve, type TierBand, tierBand } from "./rank";

const band = (n: number, ms: number) =>
  bandView(tierBand(n, ms) as TierBand, ms);

describe("구간 안 자리 막대 글", () => {
  it("사용자 예: 세 칸 브론즈 III·브론즈 II·브론즈 I, 경계 3:10.00·2:30.00, 표시 2:35.09", () => {
    expect(band(3, 155_090)).toEqual({
      downName: "브론즈 III",
      hereName: "브론즈 II",
      upName: "브론즈 I",
      lowTime: "3:10.00",
      highTime: "2:30.00",
      value: "2:35.09",
      ratio: 0.87275,
      label: "브론즈 II 3:10.00 → 브론즈 I 2:30.00 · 최고 5판 평균 2:35.09",
    });
  });

  it("꼭대기는 위 칸 없이 오른쪽 경계 0.00", () => {
    const v = band(3, 5_200);
    expect([v.downName, v.hereName, v.upName, v.lowTime, v.highTime]).toEqual([
      "그랜드마스터",
      "챌린저",
      null,
      "6.50",
      "0.00",
    ]);
    expect(v.label).toBe("챌린저 6.50 → 0.00 · 최고 5판 평균 5.20");
  });

  it("맨 아래 아이언 IV는 아래 칸 없이 왼쪽 경계 「다 맞춤」", () => {
    const v = band(3, 1_350_000);
    expect([v.downName, v.hereName, v.upName, v.lowTime, v.highTime]).toEqual([
      null,
      "아이언 IV",
      "아이언 III",
      "다 맞춤",
      "15:00.00",
    ]);
  });
});

/** 글 폭 묶음(막대 320px). 앱 `TierBandTests`의 `widths`와 같다 */
const widths = (o: Partial<BandWidths> = {}): BandWidths => ({
  width: 320,
  down: 60,
  here: 80,
  up: 70,
  low: 40,
  high: 36,
  value: 50,
  ...o,
});

/** 앱 `TierBandTests`의 「layout…」 시험과 같은 예·같은 값 */
describe("구간 안 자리 막대 좌표(세 칸 사다리)", () => {
  it("옆 칸 폭은 긴 옆 칸 이름만큼(양쪽 같은 폭), 이름은 칸 아래 가운데, 시간은 경계 아래 가운데", () => {
    expect(bandLayout(0.5, widths())).toEqual({
      side: 70,
      lowX: 70,
      highX: 250,
      markX: 160,
      downX: 5,
      hereX: 120,
      upX: 250,
      downShort: false,
      upShort: false,
      lowTimeX: 50,
      highTimeX: 232,
      valueX: 135,
    });
  });

  it("꼭대기: 위 칸 자리를 비우지 않고 지금 칸이 막대 오른쪽 끝(0.00)까지, 0.00은 끝 안쪽으로", () => {
    expect(
      bandLayout(
        0.2,
        widths({ up: null, here: 60, low: 30, high: 28, value: 40 }),
      ),
    ).toEqual({
      side: 60,
      lowX: 60,
      highX: 320,
      markX: 112,
      downX: 0,
      hereX: 160,
      upX: null,
      downShort: false,
      upShort: false,
      lowTimeX: 45,
      highTimeX: 292,
      valueX: 92,
    });
  });

  it("맨 아래: 아래 칸 없이 지금 칸이 막대 왼쪽 끝에서 시작, 「다 맞춤」은 끝 안쪽으로", () => {
    expect(
      bandLayout(
        0.75,
        widths({ down: null, here: 70, low: 44, high: 52, value: 50 }),
      ),
    ).toEqual({
      side: 70,
      lowX: 0,
      highX: 250,
      markX: 187.5,
      downX: null,
      hereX: 90,
      upX: 250,
      downShort: false,
      upShort: false,
      lowTimeX: 0,
      highTimeX: 224,
      valueX: 162.5,
    });
  });

  it("좁은 막대: 옆 칸은 1/4까지, 안 들어가는 옆 칸 이름은 엠블럼만 칸 가운데", () => {
    const l = bandLayout(0.5, widths({ width: 200, down: 70, up: 60 }));
    expect([l.side, l.downShort, l.upShort, l.downX, l.upX]).toEqual([
      50,
      true,
      true,
      18,
      168,
    ]);
  });

  it("이름이 짧아도 옆 칸은 24px", () => {
    expect(bandLayout(0.5, widths({ down: 10, up: 10 })).side).toBe(24);
  });

  it("오른쪽 끝의 숫자는 막대 안으로 밀어 넣는다", () => {
    const l = bandLayout(1, widths({ up: null, value: 80 }));
    expect([l.markX, l.valueX]).toEqual([320, 240]);
  });

  it("자리가 0~1 밖이면 경계에 붙인다", () => {
    expect(bandLayout(1.5, widths()).markX).toBe(250);
    expect(bandLayout(-1, widths()).markX).toBe(70);
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

  it("1분 넘게 줄여야 하면 분:초 꼴 뒤에 「초」를 붙이지 않는다(「20:00.00초」는 20초처럼 읽힌다)", () => {
    // 6×6 아이언(5판 평균 100분): 브론즈 IV 상한 80분까지 20분
    const six = [5_900_000, 6_000_000, 6_100_000, 5_800_000, 6_200_000].map(
      (ms) => ({ ms, penalty: 0 }),
    );
    const out = nextSolve(6, six);
    expect(out && nextSolveText(out)).toBe(
      "다음 판 하나로는 브론즈 IV에 못 닿아요. 최고 5판 평균을 20:00.00 줄여야 해요.",
    );
  });

  it("시간 조각을 따로 나눠 화면이 시간 가운데서 줄을 바꾸지 않게 한다", () => {
    expect(
      timePieces(
        "다음 판 하나로는 브론즈 IV에 못 닿아요. 최고 5판 평균을 20:00.00 줄여야 해요.",
      ),
    ).toEqual([
      {
        text: "다음 판 하나로는 브론즈 IV에 못 닿아요. 최고 5판 평균을 ",
        time: false,
      },
      { text: "20:00.00", time: true },
      { text: " 줄여야 해요.", time: false },
    ]);
    expect(timePieces("다음 판 1:10:00.00 안이면 브론즈 I")).toEqual([
      { text: "다음 판 ", time: false },
      { text: "1:10:00.00", time: true },
      { text: " 안이면 브론즈 I", time: false },
    ]);
    // 티어 이름의 숫자(「5판」)는 시간이 아니다
    expect(timePieces("다음 판을 맞추면 브론즈 I")).toEqual([
      { text: "다음 판을 맞추면 브론즈 I", time: false },
    ]);
  });
});
