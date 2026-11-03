import type { GameEvent, PlayerView } from "@game/hearts-engine";
import { describe, expect, it } from "vitest";
import { canActHearts, type HeartsSnapshot } from "./store";

const passing = {
  phase: "passing",
  decision: { kind: "pass", count: 3 },
} as unknown as PlayerView;
const snapshot = (...events: GameEvent[]): HeartsSnapshot => ({
  view: passing,
  events,
});
const base = { view: passing, shownTrick: null, dealing: null };

describe("canActHearts", () => {
  it("남이 넘길 카드를 골랐다는 알림이 줄을 서 있어도 넘기기를 고를 수 있다", () => {
    const queue = [
      snapshot({ type: "passChosen", seat: 2 }),
      snapshot({ type: "passChosen", seat: 3 }),
    ];
    expect(canActHearts({ ...base, queue })).toBe(true);
  });

  it("넘기기가 끝났다는 알림처럼 할 일을 바꾸는 알림이 줄을 서 있으면 기다린다", () => {
    const queue = [
      snapshot({ type: "passChosen", seat: 3 }),
      snapshot({ type: "passed", direction: "left" }),
    ];
    expect(canActHearts({ ...base, queue })).toBe(false);
    expect(canActHearts({ ...base, queue: [snapshot()] })).toBe(false);
  });
});
