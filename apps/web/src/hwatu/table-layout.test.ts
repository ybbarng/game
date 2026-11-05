// @vitest-environment node
import { describe, expect, it } from "vitest";

import { fanSlot, type Rect, rectsOverlap } from "@/layout/compute-layout";

import { handStepFor, hwatuLayout } from "./table-layout";

/** 화면 시험 세 크기(PC 1280×720, Pixel 7 세로·가로)와 큰 PC, 작은 휴대폰 */
const SCREENS = [
  [1280, 720],
  [1920, 1080],
  [412, 839],
  [360, 740],
  [863, 360],
  [915, 412],
] as const;

/**
 * 고스톱 맞고 10장·셋이서 7장, 민화투 둘 10장·셋 7장·넷 5장, 나이롱뽕 2~5명 5장(가져오면 6장)
 */
const cases = SCREENS.flatMap(([width, height]) =>
  [
    { players: 2, handMax: 10 },
    { players: 3, handMax: 7 },
    { players: 4, handMax: 6 },
    { players: 5, handMax: 6 },
  ]
    .flatMap((p) => [
      { ...p, compact: false },
      // 나이롱뽕은 낮은 자리 판
      ...(p.handMax === 6 || p.players === 2 || p.players === 3
        ? [{ ...p, handMax: 6, compact: true }]
        : []),
    ])
    .map((p) => ({ width, height, ...p })),
);

function inside(inner: Rect, outer: Rect): boolean {
  const e = 0.5;
  return (
    inner.x >= outer.x - e &&
    inner.y >= outer.y - e &&
    inner.x + inner.w <= outer.x + outer.w + e &&
    inner.y + inner.h <= outer.y + outer.h + e
  );
}

describe.each(cases)(
  "$width×$height / 인원 $players / 낮은 판 $compact",
  ({ width, height, players, handMax, compact }) => {
    const layout = hwatuLayout(width, height, players, handMax, { compact });
    const plates = layout.seats.slice(1).map((s) => s.plate);
    const actions = layout.actions as Rect;
    const screen: Rect = { x: 0, y: 0, w: width, h: height };
    const handCards = layout.hand.slots.map((s) => ({
      x: s.x - layout.hand.card.w / 2,
      y: s.y - layout.hand.card.h / 2,
      ...layout.hand.card,
    }));

    it("상대는 맞은편(2인)·위 양옆(3인)에 판 위 끝에 붙어 앉는다", () => {
      expect(plates).toHaveLength(players - 1);
      if (players <= 3)
        for (const p of plates) expect(p.y).toBe(layout.table.y);
      if (players === 3) {
        const [left, right] = plates as [Rect, Rect];
        expect(left.x + left.w / 2).toBeLessThan(width / 2);
        expect(right.x + right.w / 2).toBeGreaterThan(width / 2);
      }
    });

    it("바닥·자리 판·내 자리 판·단추 칸·손패·위 막대가 서로 겹치지 않는다", () => {
      const all = [
        layout.hud,
        layout.center,
        layout.myPlate,
        actions,
        ...plates,
      ];
      for (const [i, a] of all.entries())
        for (const b of all.slice(i + 1))
          expect(rectsOverlap(a, b)).toBe(false);
      for (const card of handCards)
        for (const r of [layout.center, layout.myPlate, actions, ...plates])
          expect(rectsOverlap(card, r)).toBe(false);
      for (const r of all) expect(inside(r, screen)).toBe(true);
    });

    it("바닥은 화면을 넓게 쓴다", () => {
      expect(layout.center.w).toBeGreaterThanOrEqual(width * 0.5);
      expect(layout.center.h).toBeGreaterThanOrEqual(height * 0.25);
    });

    it("손패 뒷면 부채는 바닥·다른 자리 판·내 자리 판·단추 칸·손패와 겹치지 않는다", () => {
      for (const seat of layout.seats.slice(1)) {
        const count = handMax;
        for (let i = 0; i < count; i++) {
          const at = fanSlot(layout, seat.offset, i, count, layout.fan);
          // 기울기(최대 몇 도)만큼 넉넉히 1px 줄여 본다
          const card: Rect = {
            x: at.x - layout.fan.w / 2 + 1,
            y: at.y - layout.fan.h / 2 + 1,
            w: layout.fan.w - 2,
            h: layout.fan.h - 2,
          };
          const rest = plates.filter((p) => p !== seat.plate);
          for (const r of [
            layout.center,
            layout.myPlate,
            actions,
            layout.hud,
            ...rest,
          ])
            expect(rectsOverlap(card, r)).toBe(false);
          for (const c of handCards) expect(rectsOverlap(card, c)).toBe(false);
          expect(inside(card, screen)).toBe(true);
        }
      }
    });

    it.skipIf(compact)("먹은 패 네 묶음이 자리 판 안에 들어갈 크기다", () => {
      for (const p of [...plates, layout.myPlate]) {
        expect(4 * layout.captured + 3 * 8 + 16).toBeLessThanOrEqual(p.w);
        expect(layout.captured * 1.6 + 54).toBeLessThanOrEqual(p.h);
      }
    });

    it("손패는 남는 폭만큼 벌려도 내 자리 판·단추 칸과 겹치지 않는다", () => {
      for (let count = 1; count <= handMax; count++) {
        const step = handStepFor(layout, count);
        const w = layout.hand.card.w + step * (count - 1);
        const row: Rect = {
          x: width / 2 - w / 2,
          y: layout.hand.top,
          w,
          h: height - layout.hand.top,
        };
        expect(step).toBeLessThanOrEqual(layout.hand.card.w * 1.06);
        expect(inside(row, screen)).toBe(true);
        for (const r of [layout.myPlate, actions])
          expect(rectsOverlap(row, r)).toBe(false);
      }
    });
  },
);
