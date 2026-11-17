import { describe, expect, it } from "vitest";

import { changeLine, chartLabel, chartLayout } from "./history-chart";
import { tierHistory } from "./rank";

/** 사용자 Cubie 3×3 11판(새것이 앞, `rank.test.ts`와 같다): 1번 11/10 … 11번 11/15 */
const USER = [
  138_650, 139_800, 123_810, 186_830, 249_710, 290_000, 330_000, 370_000,
  415_000, 460_000, 508_450,
].map((ms, i, all) => ({
  ms,
  penalty: 0,
  no: all.length - i,
  at: Date.UTC(2026, 10, 10 + Math.floor((all.length - 1 - i) / 2), 3),
}));
const utcDay = (at: number) => {
  const d = new Date(at);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

describe("티어 이력 그래프 자리", () => {
  const h = tierHistory(3, USER);
  const c = chartLayout(3, h, 600, 220, utcDay);

  it("선은 계단이고 빨라질수록 위로만 간다", () => {
    expect(c).not.toBeNull();
    const ys = c?.line.map(([, y]) => y) ?? [];
    for (let i = 1; i < ys.length; i++)
      expect(ys[i]).toBeLessThanOrEqual(ys[i - 1] as number);
    // 계단: 이어진 두 점은 x나 y 하나만 다르다
    const line = c?.line ?? [];
    for (let i = 1; i < line.length; i++) {
      const [x0, y0] = line[i - 1] as [number, number];
      const [x1, y1] = line[i] as [number, number];
      expect(x0 === x1 || y0 === y1).toBe(true);
    }
    // 첫 점은 5번(첫 5판 평균 6:55.00). 세로 범위는 다음 목표 2:30 / 1.12 ~ 6:55 × 1.12, 그림 칸 8~198px:
    // y = 8 + ln(415000 / 133928.6) / ln(464800 / 133928.6) × 190 = 180.7. 끝은 오른쪽 끝의 2:35.09(30.4)
    expect(line[0]).toEqual([214.4, 180.7]);
    expect(line.at(-1)).toEqual([524, 30.4]);
  });

  it("티어가 바뀐 네 판에 점, 날짜 눈금은 날마다 하나", () => {
    expect(c?.dots.map(([x]) => x)).toEqual([214.4, 369.2, 472.4, 524]);
    // 끝 눈금은 글을 안쪽으로 붙여 잘리지 않게(2026-11-18 휴대폰 너비 스크린샷에서 「11/10」이 잘렸다).
    // 11/15는 오른쪽 끝 판(11번) 하나라 왼쪽으로 붙는다
    expect(c?.ticks.map((t) => t.anchor)).toEqual([
      "start",
      "middle",
      "middle",
      "middle",
      "middle",
      "end",
    ]);
    expect(c?.ticks.map((t) => t.label)).toEqual([
      "11/10",
      "11/11",
      "11/12",
      "11/13",
      "11/14",
      "11/15",
    ]);
  });

  it("뒤 띠는 지나온 아이언과 지금·다음 목표(2:30)가 든 브론즈, 위가 빠른 쪽", () => {
    expect(c?.bands.map((b) => [b.tier, b.label])).toEqual([
      ["iron", true],
      ["bronze", true],
    ]);
    const [iron, bronze] = c?.bands ?? [];
    expect(bronze?.y0).toBe(8);
    // 브론즈·아이언 경계 5:00: 8 + ln(300000 / 133928.6) / ln(464800 / 133928.6) × 190
    expect(bronze?.y1).toBe(131.1);
    expect(iron?.y0).toBe(131.1);
    expect(iron?.y1).toBe(198);
  });

  it("5판 평균이 하나도 없으면 그리지 않는다", () => {
    expect(chartLayout(3, tierHistory(3, USER.slice(-4)), 600, 220)).toBeNull();
  });

  it("바뀐 순간 글과 그림 설명", () => {
    expect(h.changes.map((x) => changeLine(x, utcDay))).toEqual([
      "11/12 아이언 I",
      "11/13 아이언 I → 브론즈 IV",
      "11/14 브론즈 IV → 브론즈 III",
      "11/15 브론즈 III → 브론즈 II",
    ]);
    expect(chartLabel(3, h)).toBe(
      "3×3 티어 이력, 11판. 아이언 I에서 브론즈 II까지.",
    );
  });
});
