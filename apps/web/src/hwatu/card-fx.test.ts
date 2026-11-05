// @vitest-environment node
import type { GameEvent as GostopEvent } from "@game/gostop-engine";
import type { GameEvent as MinhwatuEvent } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import type { FlipSpot } from "@/components/card-fx";
import { gostopMoves, gostopSceneMs } from "@/gostop/card-fx";
import { minhwatuMoves } from "@/minhwatu/card-fx";

import { fanSource, floorMatch, hwatuPlayMoves } from "./card-fx";

/** 앞 장면 자리: id → 칸. 좌표는 움직임 계획에 쓰지 않아 모두 같은 크기로 둔다 */
function spots(zones: Record<string, string | null>): Map<string, FlipSpot> {
  return new Map(
    Object.entries(zones).map(([id, zone], i) => [
      id,
      { rect: { x: i * 10, y: 0, w: 40, h: 64 }, zone },
    ]),
  );
}

describe("화투 공통: 낸 카드와 먹은 바닥 카드", () => {
  const prev = spots({
    "01g": "hand",
    "05a": "hand",
    "01p": "floor",
    "09a": "floor",
    deck: "deck",
    "fan-1-0": null,
    "fan-1-1": null,
  });

  it("남이 낸 카드는 그 자리 뒷면 부채 맨 끝에서 출발한다", () => {
    expect(fanSource(prev, 1)).toBe("fan-1-1");
    expect(fanSource(prev, 2)).toBeUndefined();
  });

  it("짝 맞춘 바닥 카드는 앞 장면 바닥에 있던 같은 달 카드다", () => {
    expect(floorMatch(prev, "01g", ["01g", "01p"])).toBe("01p");
    expect(floorMatch(prev, "05a", ["05a"])).toBeUndefined();
  });

  it("먹으면 짝 위에 놓였다가 다음 걸음에 짝과 함께 먹은 패로 간다", () => {
    const { moves, steps } = hwatuPlayMoves(prev, [
      { card: "01g", source: "hand", offset: 0, took: ["01g", "01p"] },
    ]);
    expect(moves).toEqual([
      { id: "01g", step: 0, via: ["01p"] },
      { id: "01p", step: 1 },
    ]);
    expect(steps).toBe(2);
  });

  it("못 먹으면 바닥에 놓이기만 하고 한 걸음이다", () => {
    const { moves, steps } = hwatuPlayMoves(prev, [
      { card: "05a", source: "hand", offset: 1, took: [] },
    ]);
    expect(moves).toEqual([{ id: "05a", step: 0, from: "fan-1-1" }]);
    expect(steps).toBe(1);
  });
});

describe("고스톱: 내고 뒤집은 뒤 한꺼번에 가져간다", () => {
  const prev = spots({
    "01g": "hand",
    "01p": "floor",
    "09a": "floor",
    "09p": "floor",
    deck: "deck",
  });
  const events: GostopEvent[] = [
    { type: "played", seat: 0, card: "01g" },
    { type: "flipped", seat: 0, card: "09r" },
    { type: "captured", seat: 0, cards: ["01g", "01p", "09r", "09a"] },
  ];

  it("낸 카드(0걸음) → 뒤집은 카드(1걸음) → 둘째 걸음에 모두 먹은 패로", () => {
    const moves = gostopMoves(prev, events, () => 0);
    expect(moves).toEqual([
      // 낸 카드: 손패 → 1월 바닥 위(1걸음 머묾) → 먹은 패
      { id: "01g", step: 0, via: ["01p", "01p"] },
      // 뒤집은 카드: 더미 → 9월 바닥 위 → 먹은 패
      { id: "09r", step: 1, from: "deck", via: ["09a"] },
      { id: "01p", step: 2 },
      { id: "09a", step: 2 },
    ]);
  });

  it("다음 장면은 세 걸음만큼 늦게 보인다", () => {
    const rules = { players: 2 } as Parameters<typeof gostopSceneMs>[1];
    expect(gostopSceneMs(events, rules)).toBe(3 * 420);
  });
});

describe("민화투: 낸 패와 뒤집은 패를 차례로 먹는다", () => {
  it("낸 패 먹기(0·1걸음) 뒤에 뒤집은 패(2걸음)", () => {
    const prev = spots({
      "03g": "hand",
      "03r": "floor",
      deck: "deck",
      "fan-1-0": null,
    });
    const events: MinhwatuEvent[] = [
      { type: "played", seat: 0, card: "03g", took: ["03g", "03r"] },
      { type: "flipped", seat: 0, card: "07a", took: [] },
    ];
    expect(minhwatuMoves(prev, events, () => 0)).toEqual([
      { id: "03g", step: 0, via: ["03r"] },
      { id: "03r", step: 1 },
      { id: "07a", step: 2, from: "deck" },
    ]);
  });
});
