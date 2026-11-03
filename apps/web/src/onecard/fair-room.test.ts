// @vitest-environment node
import {
  type OnecardState,
  type OnecardView,
  STANDARD_ONECARD_RULES,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { expectHidden, setupHwatu, until } from "@/hwatu/fair-room-fixture";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import { onecardBotFor, toKitBot } from "./bots";
import { onecardFair } from "./fair";
import { onecardKit } from "./kit";

/**
 * 원카드 암호화방(멘탈 포커): 방장도 남의 패를 모른다. 짧은 덱(특수 카드 없는 14장: 손패 5·5, 펼칠 카드 1, 더미 3)으로
 * 판 도중 뽑기와 다시 섞기(새 섞기 사슬)를 꼭 일으키고, 판 끝에 진짜 카드로 다시 계산해 통과하는지 본다.
 * 섞기는 매번 무작위지만 확인하는 것(다시 섞기가 일어남, 검증 통과)은 운과 상관없다: 더미가 석 장뿐이고
 * 방장은 손패가 많을 때만 내 참가자가 다 내기 전에 더미가 바닥난다.
 */
const SHORT = [
  "H3",
  "H4",
  "H5",
  "H6",
  "H8",
  "H9",
  "H10",
  "D3",
  "D4",
  "D5",
  "D6",
  "D8",
  "D9",
  "D10",
] as const;

const shortKit = {
  ...onecardKit,
  cardTable: { ...onecardFair, deckCards: SHORT },
};

const bot = onecardBotFor(1);

describe("원카드 암호화방", () => {
  it("참가자 하나: 판 도중 뽑기·다시 섞기(새 사슬)·외침 청구를 거쳐 끝나고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 판 끝 검증을 통과한다", async () => {
    const rules = {
      ...STANDARD_ONECARD_RULES,
      players: 2,
      handSize: 5 as const,
      endOnFirst: true,
    };
    const { host, guests, incidents, audits, clock } = await setupHwatu({
      kit: shortKit,
      rules,
      guests: 1,
      bot: toKitBot(bot),
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    const guest = guests[0] as (typeof guests)[number];
    await host.start();
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    await until(() => guest.match !== null, "참가자 첫 화면");

    let shouted = false;
    const stamps = new Map<string, string>();
    // 늦게 거절된 행동(앞 행동을 처리하는 중 등)은 같은 화면이어도 다시 낸다
    host.onOwnError(() => stamps.delete("host"));
    guest.on("rejected", () => stamps.delete("guest"));
    const start = Date.now();
    let seed = 1;
    while (match.rawState().phase !== "over" && incidents.length === 0) {
      if (Date.now() - start > 120_000)
        throw new Error(
          `끝나지 않는다 ${JSON.stringify(match.rawState()).slice(0, 300)}`,
        );
      const raw = match.rawState() as OnecardState;
      // 방장 엔진: 참가자 손패와 더미는 자리 표뿐이다(방장 자기 패도 자리 표로 든다).
      expectHidden(raw.hands[1] ?? []);
      expectHidden(raw.deck);
      const hv = match.current() as OnecardView;
      const gv = guest.match?.current() as OnecardView | undefined;
      // 참가자 화면: 내 손패는 진짜 카드다.
      if (gv) expect(gv.hand.some((c) => c.startsWith("?_"))).toBe(false);
      if (
        !shouted &&
        gv?.decision === "turn" &&
        gv.hand.length === 2 &&
        gv.turnNo === raw.turnNo
      ) {
        // 두 장일 때 더미를 친다: 청구가 모두에게 가고 방장이 묶음으로 엔진에 넣는다.
        expect(guest.claims?.claim({}, { seen: gv.turnNo })).not.toBeNull();
        // 청구가 망을 건너 방장 통로에 닿은 뒤에야 묶음 창(100ms) 시계가 걸리므로, 닿을 때까지 시계를 조금씩 옮긴다
        // (한 번에 옮기면 늦게 닿은 청구의 창이 영영 닫히지 않는다).
        await until(() => {
          if ((match.rawState() as OnecardState).preCalled[1]) return true;
          clock.advance(20);
          return false;
        }, "미리 외침");
        shouted = true;
        continue;
      }
      const act = (
        key: string,
        view: OnecardView | undefined,
        submit: (a: unknown) => boolean,
        choose: (v: OnecardView) => unknown,
      ) => {
        if (view?.decision !== "turn") return;
        const stamp = JSON.stringify(view);
        if (stamps.get(key) === stamp) return;
        stamps.set(key, stamp);
        if (!submit(choose(view))) stamps.delete(key);
      };
      act(
        "host",
        hv,
        (a) => match.submit(a as never).ok,
        (v) =>
          v.hand.length > 8
            ? bot.seatBot(v.mySeat).chooseAction(v, { seed: seed++ })
            : { type: "draw" },
      );
      act(
        "guest",
        gv,
        (a) => guest.match?.submit(a as never)?.ok ?? false,
        (v) => bot.seatBot(v.mySeat).chooseAction(v, { seed: seed++ }),
      );
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(incidents).toEqual([]);
    const final = match.rawState() as OnecardState;
    expect(final.phase).toBe("over");
    // 더미가 석 장뿐이라 다시 섞기(새 섞기 사슬)가 적어도 한 번 있었다.
    expect(final.reshuffles ?? 0).toBeGreaterThan(0);
    expect(
      (
        host.fair as { deck?: { reshuffles(r: number): number } } | null
      )?.deck?.reshuffles(1),
    ).toBe(final.reshuffles);
    expect(shouted).toBe(true);
    // 끝 화면: 모든 손패가 진짜 카드로 보인다(게임이 끝나기 전에 열쇠를 모두 공개했다).
    await until(() => guest.match?.current().phase === "over", "끝 화면");
    const end = guest.match?.current() as OnecardView;
    for (const h of end.result?.hands ?? [])
      expect(h.some((c) => c.startsWith("?_"))).toBe(false);
    host.finish();
    await until(() => audits.length === 1, "판 끝 검증");
    expect(audits).toEqual([{ ok: true }]);
  }, 180_000);
});
