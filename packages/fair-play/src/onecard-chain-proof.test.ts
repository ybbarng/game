import { describe, expect, it, vi } from "vitest";

import type { FairWire } from "./device";
import { type Played, playRound, SEG3, settled } from "./onecard-chain-fixture";
import { onecardNet } from "./onecard-fixture";
import { type Party, Party as PartyClass } from "./protocol";

/* 세 번 다시 섞는 판에서 참가자가 세 번째 다시 섞기 사슬이나 그 섞기 증명을 꾸미면 그 기기를 짚는다 */
describe("다시 섞기 사슬·섞기 증명을 꾸민 참가자(세 번째 다시 섞기)", () => {
  it("사슬에서 한 장을 다른 카드의 복제로 바꾸면 섞기 증명이 그 기기를 짚는다", async () => {
    let armed = false;
    const real = PartyClass.prototype.lockAndShuffle;
    PartyClass.prototype.lockAndShuffle = async function (
      this: Party,
      deck,
      pass,
    ) {
      const out = await real.call(this, deck, pass);
      if (armed && this.id === 1 && pass === "shuffle")
        out[1] = out[2] as bigint;
      return out;
    };
    let played: Played;
    try {
      played = await playRound({
        before3: () => {
          armed = true;
        },
      });
    } finally {
      PartyClass.prototype.lockAndShuffle = real;
    }
    const { net } = played;
    expect((await net.devices[0]?.shuffleCulprit(SEG3))?.device).toBe(1);
    await vi.waitFor(() =>
      expect(settled(net.incidents[0])).toMatchObject({ seat: 1 }),
    );
    expect(net.decks[0]?.roundDeal(1)).toBeNull();
  });

  it("섞기는 정직하게 하고 증명 응답을 꾸며 보내면(순열 앞 두 칸을 바꿈) 방장 기기가 그 기기를 짚는다", async () => {
    const swap = (xs: number[]) => [xs[1], xs[0], ...xs.slice(2)] as number[];
    const rewrite = (m: FairWire, from: number): FairWire => {
      if (from !== 1 || m.k !== "sproof" || m.deal !== SEG3 || !m.answers)
        return m;
      const [a, ...rest] = m.answers;
      if (!a) return m;
      const forged =
        a.b === 0 ? { ...a, sigma: swap(a.sigma) } : { ...a, tau: swap(a.tau) };
      return { ...m, answers: [forged, ...rest] };
    };
    const { net } = await playRound({ net: onecardNet({ rewrite }) });
    expect(settled(net.incidents[0])).toEqual({
      seat: 1,
      reason: "섞기 증명이 맞지 않는다(섞을 때 카드를 바꿨다)",
    });
    expect(net.incidents[1]).toEqual([]);
  });
});
