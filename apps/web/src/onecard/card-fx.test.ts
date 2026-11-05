import type { GameEvent, OnecardCard } from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import {
  DRAW_GAP_MS,
  DRAW_MS,
  type FxContext,
  type FxStep,
  fxStart,
  onecardDealPattern,
  PLAY_MS,
  planFx,
  RESHUFFLE_MS,
} from "./card-fx";

const deck = { x: 100, y: 100, w: 40 };
const pile = { x: 160, y: 100, w: 50 };

function ctx(over: Partial<FxContext> = {}): FxContext {
  return {
    me: 0,
    prevHand: [],
    hand: [],
    prevCounts: [3, 3],
    deck,
    pile,
    prevHandSpot: (card) => ({ x: card.length * 10, y: 300, w: 60 }),
    handSpot: (card) => ({ x: card.length * 10, y: 300, w: 60 }),
    fanSpot: (seat, index) => ({ x: seat * 100 + index, y: 20, w: 30 }),
    ...over,
  };
}

const fly = (s: FxStep) => {
  if (s.kind !== "fly") throw new Error("날기가 아니다");
  return s;
};

describe("원카드 카드 연출 계획", () => {
  it("내가 낸 카드는 걸음 전 손패 자리에서 버린 더미로 난다", () => {
    const events: GameEvent[] = [
      { type: "played", seat: 0, card: "H5", suit: null, attack: 0 },
    ];
    const { steps, duration } = planFx(
      events,
      ctx({ prevHand: ["H5", "S2"] as OnecardCard[], hand: ["S2"] }),
    );
    expect(steps).toHaveLength(1);
    const s = fly(steps[0] as FxStep);
    expect(s.card).toBe("H5");
    expect(s.from).toEqual({ x: 20, y: 300, w: 60 });
    expect(s.to).toBe(pile);
    expect(duration).toBe(PLAY_MS);
  });

  it("남이 낸 카드는 그 사람 뒷면 부채에서 앞면으로 난다", () => {
    const { steps } = planFx(
      [{ type: "played", seat: 1, card: "DK", suit: null, attack: 0 }],
      ctx(),
    );
    const s = fly(steps[0] as FxStep);
    expect(s.card).toBe("DK");
    expect(s.from.x).toBe(101);
    expect(s.to).toBe(pile);
  });

  it("먹은 카드는 덱에서 한 장씩 차례로 날고, 내려앉을 때까지 손패·부채에서 가린다", () => {
    const events: GameEvent[] = [
      { type: "drew", seat: 0, count: 2, reason: "attack" },
      { type: "drew", seat: 1, count: 1, reason: "draw" },
    ];
    const { steps, duration } = planFx(
      events,
      ctx({ prevHand: ["S2"], hand: ["S2", "H9", "CJ"] as OnecardCard[] }),
    );
    expect(steps.map((s) => fly(s).hide)).toEqual(["H9", "CJ", "fan-1-3"]);
    expect(steps.map((s) => s.at)).toEqual([
      0,
      DRAW_GAP_MS,
      DRAW_GAP_MS + DRAW_MS + 80,
    ]);
    for (const s of steps) expect(fly(s).from).toBe(deck);
    expect(fly(steps[2] as FxStep).card).toBeNull();
    expect(duration).toBe(DRAW_GAP_MS + DRAW_MS + 80 + DRAW_MS);
  });

  it("앞 연출이 끝나야 다음 연출이 시작한다(한 걸음 안의 내기와 먹기가 겹치지 않는다)", () => {
    const { steps } = planFx(
      [
        { type: "played", seat: 1, card: "SA", suit: null, attack: 3 },
        { type: "drew", seat: 0, count: 1, reason: "attack" },
      ],
      ctx({ prevHand: ["S2"], hand: ["S2", "H9"] as OnecardCard[] }),
    );
    const [play, draw] = steps as [FxStep, FxStep];
    expect(draw.at).toBeGreaterThanOrEqual(play.at + play.ms);
  });

  it("더미가 바닥나면 버린 더미를 덱으로 모은 뒤 섞는다", () => {
    const { steps } = planFx(
      [
        { type: "reshuffleNeeded", count: 9 },
        { type: "reshuffled", count: 9 },
      ],
      ctx(),
    );
    const gather = steps.filter((s) => s.kind === "fly");
    expect(gather).toHaveLength(4);
    for (const s of gather) {
      expect(fly(s).from).toBe(pile);
      expect(fly(s).to).toBe(deck);
    }
    const shuffle = steps.at(-1) as FxStep;
    expect(shuffle.kind).toBe("shuffle");
    expect(shuffle.ms).toBe(RESHUFFLE_MS);
    if (shuffle.kind === "shuffle") expect(shuffle.deck).toBe(deck);
    const lastGather = gather.at(-1) as FxStep;
    expect(shuffle.at).toBeGreaterThanOrEqual(lastGather.at + lastGather.ms);
  });

  it("나눠 주기·외침 같은 다른 사건은 날기가 없다", () => {
    expect(
      planFx(
        [
          { type: "dealt", first: 0, top: "H5" },
          { type: "shouted", seat: 1 },
        ],
        ctx(),
      ).steps,
    ).toEqual([]);
  });

  it("앞 연출이 조금 남았으면 그 뒤에 잇고, 너무 밀렸으면 버리고 바로 한다", () => {
    expect(fxStart(1000, 0)).toEqual({ delay: 0, flush: false });
    expect(fxStart(1000, 1300)).toEqual({ delay: 300, flush: false });
    expect(fxStart(1000, 3000)).toEqual({ delay: 0, flush: true });
  });

  it("손패를 두 번에 나눠 준다", () => {
    expect(onecardDealPattern(7)).toEqual([3, 4]);
    expect(onecardDealPattern(5)).toEqual([2, 3]);
  });
});
