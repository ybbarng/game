import { describe, expect, it } from "vitest";

import {
  FLIP_STEP_MS,
  type FlightStep,
  type FlipSpots,
  sceneFlights,
} from "./flight-plan";
import { cardHeight, cardWidth, HWATU_SHAPE, PLAYING_SHAPE } from "./kind";

const spot = (x: number, y: number, zone: string | null = null) => ({
  rect: { x, y, w: 40, h: 64 },
  zone,
});
const faceOf = (id: string) => (id.startsWith("fan-") ? null : id);
const fly = (s: FlightStep) => {
  if (s.kind !== "fly") throw new Error("날기가 아니다");
  return s;
};

describe("카드 모양", () => {
  it("트럼프는 5:7, 화투는 5:8이고 너비 하나로 높이가 정해진다", () => {
    expect(cardHeight(PLAYING_SHAPE, 50)).toBe(70);
    expect(cardHeight(HWATU_SHAPE, 50)).toBe(80);
    expect(cardWidth(HWATU_SHAPE, 80)).toBe(50);
  });
});

describe("장면 연출 계획(sceneFlights)", () => {
  it("남이 낸 카드는 뒷면 부채에서 바닥 짝 위를 들러 먹은 패로 가고, 내려앉을 때까지 가린다", () => {
    const before: FlipSpots = new Map([
      ["fan-1-4", spot(100, 0)],
      ["0101", spot(200, 200, "floor")],
    ]);
    const next: FlipSpots = new Map([["0102", spot(400, 0, "captured")]]);
    const { steps, duration } = sceneFlights(
      before,
      next,
      [{ id: "0102", step: 0, from: "fan-1-4", via: ["0101"] }],
      faceOf,
    );
    expect(steps).toHaveLength(2);
    const [first, second] = steps.map(fly);
    expect(first?.from.x).toBe(120);
    expect(first?.to.x).toBe(220);
    expect(first?.wait).toBe(true);
    expect(first?.hide).toBeUndefined();
    expect(second?.at).toBe(FLIP_STEP_MS);
    expect(second?.hide).toBe("0102");
    expect(first?.card).toBe("0102");
    expect(duration).toBe(2 * FLIP_STEP_MS);
  });

  it("부르지 않은 카드도 자리가 바뀌었으면 첫 걸음에 옮기고, 그대로인 카드는 두지 않는다", () => {
    const before: FlipSpots = new Map([
      ["a", spot(0, 0)],
      ["b", spot(50, 0)],
    ]);
    const next: FlipSpots = new Map([
      ["a", spot(0, 0)],
      ["b", spot(20, 0)],
    ]);
    const { steps } = sceneFlights(before, next, [], faceOf);
    expect(steps.map((s) => fly(s).hide)).toEqual(["b"]);
    expect(steps[0]?.at).toBe(0);
  });

  it("뒷면 이름(부채)은 뒷면으로 날고, 앞 장면에 없던 카드는 두지 않는다", () => {
    const before: FlipSpots = new Map([["deck", spot(0, 0)]]);
    const next: FlipSpots = new Map([["fan-1-0", spot(90, 0)]]);
    const { steps } = sceneFlights(
      before,
      next,
      [
        { id: "fan-1-0", step: 0, from: "deck" },
        { id: "none", step: 1 },
      ],
      faceOf,
    );
    expect(steps).toHaveLength(1);
    expect(fly(steps[0] as FlightStep).card).toBeNull();
  });
});
