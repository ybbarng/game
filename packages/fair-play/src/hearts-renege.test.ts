import { WINDOWS_RULES } from "@game/hearts-engine";
import type { Card } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { HeartsRenegeWatch } from "./hearts";

/** 한 판 안의 공개된 카드 한 장. `before`는 그 카드를 내기 전 턴에 먼저 나온 카드들 */
function play(
  trickIndex: number,
  seat: number,
  card: Card,
  before: { seat: number; card: Card }[] = [],
  broken = false,
) {
  return {
    trickIndex,
    seat,
    card,
    before: { leader: before[0]?.seat ?? seat, plays: before },
    broken,
  };
}

describe("하트 무늬 안 따르기 즉시 잡기(HeartsRenegeWatch)", () => {
  it("♥가 선인데 ♣를 냈던 사람이 나중에 ♥를 내면 그 순간 잡힌다", () => {
    const watch = new HeartsRenegeWatch(WINDOWS_RULES);
    expect(watch.reveal(play(1, 0, "H5"))).toBeNull();
    expect(
      watch.reveal(play(1, 1, "C3", [{ seat: 0, card: "H5" }])),
    ).toBeNull();
    expect(watch.reveal(play(2, 1, "H9"))).toEqual({
      seat: 1,
      reason:
        "2번째 턴에 ♣3을 냈는데, 그때 ♥9가 손에 있었어요. 선 무늬가 있었는데 따라 내지 않았어요.",
    });
  });

  it("하트가 깨지기 전에 하트로 선을 잡았던 사람이 나중에 다른 무늬를 내면 잡힌다", () => {
    const watch = new HeartsRenegeWatch(WINDOWS_RULES);
    expect(watch.reveal(play(2, 1, "H4"))).toBeNull();
    expect(watch.reveal(play(3, 1, "D9", [{ seat: 0, card: "D2" }]))).toEqual({
      seat: 1,
      reason:
        "3번째 턴에 ♥4를 냈는데, 그때 ◆9가 손에 있었어요. 하트가 깨지기 전에 다른 무늬가 있었는데 하트로 선을 잡았어요.",
    });
  });

  it("첫 선을 ♣2가 아닌 카드로 잡았던 사람이 나중에 ♣2를 내면 잡힌다", () => {
    const watch = new HeartsRenegeWatch(WINDOWS_RULES);
    expect(watch.reveal(play(0, 1, "D5"))).toBeNull();
    expect(watch.reveal(play(1, 1, "C2", [{ seat: 0, card: "C9" }]))).toEqual({
      seat: 1,
      reason:
        "1번째 턴에 ◆5를 냈는데, 그때 ♣2가 손에 있었어요. 첫 선은 ♣2로 해야 해요.",
    });
  });

  it("첫 턴에 따라 낼 무늬가 없어 점수 카드를 냈던 사람이 나중에 점수 아닌 카드를 내면 잡힌다(까닭은 첫 턴 점수 카드)", () => {
    const watch = new HeartsRenegeWatch(WINDOWS_RULES);
    expect(watch.reveal(play(0, 0, "C2"))).toBeNull();
    expect(
      watch.reveal(play(0, 1, "H5", [{ seat: 0, card: "C2" }])),
    ).toBeNull();
    expect(watch.reveal(play(1, 1, "D3", [{ seat: 2, card: "D9" }]))).toEqual({
      seat: 1,
      reason:
        "1번째 턴에 ♥5를 냈는데, 그때 ◆3이 손에 있었어요. 첫 턴에 다른 카드가 있었는데 점수 카드를 냈어요.",
    });
  });

  it("같은 카드가 두 번 나오면 섞기 조작으로 잡는다", () => {
    const watch = new HeartsRenegeWatch(WINDOWS_RULES);
    expect(watch.reveal(play(1, 0, "HA"))).toBeNull();
    expect(watch.reveal(play(2, 3, "HA"))).toEqual({
      seat: 3,
      reason: "♥A가 두 번 나왔어요.",
      duplicate: true,
    });
  });

  it("정직하게 무늬가 떨어진 사람은 잡히지 않는다", () => {
    const watch = new HeartsRenegeWatch(WINDOWS_RULES);
    expect(watch.reveal(play(1, 0, "H5"))).toBeNull();
    expect(
      watch.reveal(play(1, 1, "C3", [{ seat: 0, card: "H5" }])),
    ).toBeNull();
    expect(watch.reveal(play(2, 1, "D9"))).toBeNull();
    expect(
      watch.reveal(play(3, 1, "C4", [{ seat: 2, card: "C8" }])),
    ).toBeNull();
  });
});
