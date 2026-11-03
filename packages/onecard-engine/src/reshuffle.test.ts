import { describe, expect, it } from "vitest";

import type { OnecardCard } from "./cards";
import {
  reshuffleRequest,
  type StepResult,
  seededReshuffle,
  step,
} from "./match";
import { createOnecardScenario } from "./scenario";
import type { GameEvent, OnecardState } from "./state";

function okEvents(result: StepResult): [OnecardState, GameEvent[]] {
  if (!result.ok) throw new Error(result.error);
  return [result.state, result.events];
}

/** 더미 `deck`, 버린 더미 `pile`(끝이 맨 위)에서 자리 1이 공격 `attack`을 받은 장면 */
function table(deck: OnecardCard[], pile: OnecardCard[], attack = 0) {
  return createOnecardScenario({
    hands: [
      ["H9", "H8"],
      ["D3", "D4"],
      ["S3", "S4"],
    ],
    pile,
    deck,
    turn: 1,
    attack,
  });
}

describe("더미가 바닥나면 다시 섞기", () => {
  it("먹을 때 더미가 없으면 다시 섞기를 기다리고, 섞은 순서를 받아 이어서 먹는다", () => {
    const s = table([], ["C3", "C4", "C5", "H5"]);
    const [waiting, events] = okEvents(step(s, 1, { type: "draw" }));
    expect(waiting.phase).toBe("reshuffle");
    expect(events).toEqual([{ type: "reshuffleNeeded", count: 3 }]);
    expect(waiting.turn).toBe(1);
    expect(reshuffleRequest(waiting)).toEqual(["C3", "C4", "C5"]);
    // 기다리는 동안 차례 행동은 받지 않는다
    expect(step(waiting, 1, { type: "draw" }).ok).toBe(false);
    // 카드가 맞지 않으면 받지 않는다
    expect(
      step(waiting, 0, { type: "reshuffle", order: ["C3", "C4"] }).ok,
    ).toBe(false);
    expect(
      step(waiting, 0, { type: "reshuffle", order: ["C3", "C4", "C6"] }).ok,
    ).toBe(false);
    const [after, more] = okEvents(
      step(waiting, 0, { type: "reshuffle", order: ["C5", "C3", "C4"] }),
    );
    expect(more).toEqual([
      { type: "reshuffled", count: 3 },
      { type: "drew", seat: 1, count: 1, reason: "draw" },
    ]);
    expect(after.phase).toBe("play");
    expect(after.pile).toEqual(["H5"]);
    expect(after.deck).toEqual(["C3", "C4"]);
    expect(after.hands[1]).toContain("C5");
    expect(after.turn).toBe(2);
  });

  it("다시 섞을 때가 아니면 섞은 순서를 받지 않는다", () => {
    const s = table(["C3"], ["H5"]);
    expect(step(s, 0, { type: "reshuffle", order: [] }).ok).toBe(false);
    expect(reshuffleRequest(s)).toBeNull();
    expect(seededReshuffle(s, 1)).toBeNull();
  });

  it("먹는 도중 바닥나면 몇 장 먹고 → 다시 섞기 → 나머지", () => {
    const s = table(["C3", "C4"], ["C5", "C6", "C8", "HA"], 5);
    const [waiting, events] = okEvents(step(s, 1, { type: "draw" }));
    expect(events).toEqual([
      { type: "drew", seat: 1, count: 2, reason: "attack" },
      { type: "reshuffleNeeded", count: 3 },
    ]);
    expect(waiting.attack).toBe(0);
    expect(waiting.hands[1]).toHaveLength(4);
    const action = seededReshuffle(waiting, 42);
    if (!action) throw new Error("섞을 때다");
    const [after, more] = okEvents(step(waiting, 0, action));
    expect(more).toEqual([
      { type: "reshuffled", count: 3 },
      { type: "drew", seat: 1, count: 3, reason: "attack" },
    ]);
    expect(after.hands[1]).toHaveLength(7);
    expect(after.deck).toEqual([]);
    expect(after.turn).toBe(2);
  });

  it("버린 더미까지 모자라면 있는 만큼만 먹는다", () => {
    const s = table(["C3"], ["HA"], 5);
    const [after, events] = okEvents(step(s, 1, { type: "draw" }));
    expect(events).toEqual([
      { type: "drew", seat: 1, count: 1, reason: "attack" },
    ]);
    expect(after.phase).toBe("play");
    expect(after.hands[1]).toHaveLength(3);
    expect(after.turn).toBe(2);
  });

  it("다시 섞은 뒤에도 모자라면 거기서 멈춘다", () => {
    const s = table([], ["C5", "C6", "HA"], 5);
    const [waiting] = okEvents(step(s, 1, { type: "draw" }));
    const [after, events] = okEvents(
      step(waiting, 2, { type: "reshuffle", order: ["C6", "C5"] }),
    );
    expect(events.at(-1)).toEqual({
      type: "drew",
      seat: 1,
      count: 2,
      reason: "attack",
    });
    expect(after.hands[1]).toHaveLength(4);
    expect(after.phase).toBe("play");
    expect(after.turn).toBe(2);
  });

  it("씨앗 다시 섞기는 같은 씨앗이면 같은 순서", () => {
    const s = table([], ["C3", "C4", "C5", "C6", "C8", "H5"]);
    const [waiting] = okEvents(step(s, 1, { type: "draw" }));
    expect(seededReshuffle(waiting, 9)).toEqual(seededReshuffle(waiting, 9));
  });
});
