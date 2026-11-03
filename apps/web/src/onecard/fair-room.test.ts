// @vitest-environment node
import {
  type OnecardState,
  type OnecardView,
  STANDARD_ONECARD_RULES,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import {
  type AnyGuest,
  type AnyHost,
  expectHidden,
  setupHwatu,
  until,
} from "@/hwatu/fair-room-fixture";
import type { AuditResult } from "@/net/guest-room";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import { onecardBotFor, toKitBot } from "./bots";
import { onecardFair } from "./fair";
import { onecardKit } from "./kit";

/**
 * 원카드 암호화방(멘탈 포커): 방장도 남의 패를 모른다. 짧은 덱(특수 카드 없는 14장: 손패 5·5, 펼칠 카드 1, 더미 3)으로
 * 판 도중 뽑기와 다시 섞기(새 섞기 사슬)를 꼭 일으킨다. 판 끝 검증은 다 연 뒤에만 하므로 판은 끝까지 둔다(짧은 덱이라 금방).
 * 섞기는 매번 무작위지만 확인하는 것(다시 섞기가 일어남, 검증 통과·실패)은 운과 상관없다: 더미가 석 장뿐이고
 * 방장은 손패가 많을 때만 내 참가자가 다 내기 전에 더미가 바닥난다.
 * 시간은 `ManualClock`이고, 기다림은 모두 조건(엔진 기록 길이·화면)으로 한다(실제 시간으로 기다리지 않는다).
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

const rules = {
  ...STANDARD_ONECARD_RULES,
  players: 2,
  handSize: 5 as const,
  endOnFirst: true,
};

/** 방장·참가자 수는 중수 컴퓨터가 고른다(낼 카드가 없어 서로 먹기만 도는 판이 나오지 않게) */
const bot = onecardBotFor(1);
let seed = 1;
/**
 * 판을 끝까지 둔다. 참가자는 두 장인 차례에 한 번 더미를 친다(청구). `tamper`는 그 청구 전에 한 번 부른다
 * (고친 방장 기기 흉내). 판 끝 검증 결과와 부정 알림, 방장 엔진 상태를 돌려준다
 */
async function playFair(tamper?: (host: AnyHost, guest: AnyGuest) => void) {
  const { host, guests, incidents, audits, clock } = await setupHwatu({
    kit: shortKit,
    rules,
    guests: 1,
    bot: toKitBot(onecardBotFor(1)),
    botLevel: 1,
    HostRoom: HostRoom as never,
    GuestRoom: GuestRoom as never,
  });
  const guest = guests[0] as AnyGuest;
  await host.start();
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  await until(() => guest.match !== null, "참가자 첫 화면");
  const raw = () => match.rawState() as OnecardState;
  const guestView = () => guest.match?.current() as OnecardView | undefined;
  // 늦게 거절된 행동(앞 행동을 처리하는 중 등)도 "다음 걸음"으로 본다(다시 낸다)
  let rejections = 0;
  host.onOwnError(() => rejections++);
  guest.on("rejected", () => rejections++);
  resolvedSeen(guest);
  let shouted = false;
  while (raw().phase !== "over" && incidents.length === 0) {
    const state = raw();
    // 방장 엔진: 참가자 손패와 더미는 자리 표뿐이다(방장 자기 패도 자리 표로 든다).
    expectHidden(state.hands[1] ?? []);
    expectHidden(state.deck);
    const gv = guestView();
    // 참가자 화면: 내 손패는 진짜 카드다.
    if (gv) expect(gv.hand.some((c) => c.startsWith("?_"))).toBe(false);
    const version = state.version;
    if (
      !shouted &&
      gv?.decision === "turn" &&
      gv.hand.length === 2 &&
      gv.turnNo === state.turnNo
    ) {
      tamper?.(host, guest);
      // 두 장일 때 더미를 친다: 청구가 모두에게 가고 방장이 묶음으로 엔진에 넣는다(고친 방장은 빼기도 한다).
      const before = resolvedSeen(guest);
      expect(guest.claims?.claim({}, { seen: gv.turnNo })).not.toBeNull();
      shouted = true;
      // 청구가 방장 통로에 닿은 뒤에야 묶음 창(100ms) 시계가 걸리므로, 발표가 닿을 때까지 시계를 조금씩 옮긴다.
      await until(() => {
        if (resolvedSeen(guest) > before) return true;
        clock.advance(20);
        return false;
      }, "청구 발표");
      continue;
    }
    const hv = match.current() as OnecardView;
    const rejected = rejections;
    let acted = false;
    if (hv.decision === "turn")
      acted = match.submit(
        hv.hand.length > 8
          ? bot.seatBot(0).chooseAction(hv, { seed: seed++ })
          : { type: "draw" },
      ).ok;
    else if (gv?.decision === "turn")
      acted =
        guest.match?.submit(bot.seatBot(1).chooseAction(gv, { seed: seed++ }))
          .ok ?? false;
    // 다음 걸음(엔진 기록이 늘고 참가자 화면이 따라옴, 또는 판 끝)까지. 내지 못했으면(준비 중·카드를 여는 중)
    // 두 화면 중 하나가 바뀔 때까지(바로 다시 내며 맴돌지 않게)
    const stamp = JSON.stringify([match.current(), guestView()]);
    await until(
      () =>
        incidents.length > 0 ||
        rejections !== rejected ||
        (raw().version !== version &&
          (raw().phase === "over" || guestView()?.version === raw().version)) ||
        (!acted && JSON.stringify([match.current(), guestView()]) !== stamp),
      "다음 걸음",
    );
  }
  host.finish();
  await until(() => audits.length === 1 || incidents.length > 0, "판 끝 검증");
  return { host, guest, incidents, audits, state: raw(), shouted };
}

/** 참가자가 받아들인 발표 수(청구 통로 이벤트로 센다) */
const seenResolved = new WeakMap<object, number>();
function resolvedSeen(guest: AnyGuest): number {
  const claims = guest.claims;
  if (!claims) return 0;
  if (!seenResolved.has(claims)) {
    seenResolved.set(claims, 0);
    claims.onResolved(() =>
      seenResolved.set(claims, (seenResolved.get(claims) ?? 0) + 1),
    );
  }
  return seenResolved.get(claims) ?? 0;
}

describe("원카드 암호화방", () => {
  it("판 도중 뽑기·다시 섞기(새 사슬)·외침 청구를 거쳐 끝나고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 판 끝 검증을 통과한다", async () => {
    const { host, guest, incidents, audits, state, shouted } = await playFair();
    expect(incidents).toEqual([]);
    expect(state.phase).toBe("over");
    expect(shouted).toBe(true);
    expect(
      state.preCalled[1] || state.called[1] || state.finished.length > 0,
    ).toBe(true);
    // 더미가 석 장뿐이라 다시 섞기(새 섞기 사슬)가 적어도 한 번 있었다.
    expect(state.reshuffles ?? 0).toBeGreaterThan(0);
    expect(
      (
        host.fair as { deck?: { reshuffles(r: number): number } } | null
      )?.deck?.reshuffles(1),
    ).toBe(state.reshuffles);
    // 끝 화면: 모든 손패가 진짜 카드로 보인다(게임이 끝나기 전에 열쇠를 모두 공개했다).
    await until(() => guest.match?.current().phase === "over", "끝 화면");
    const end = guest.match?.current() as OnecardView;
    for (const h of end.result?.hands ?? [])
      expect(h.some((c) => c.startsWith("?_"))).toBe(false);
    expect(audits).toEqual([{ ok: true }]);
  }, 60_000);

  it("방장이 사람 자리의 외침을 지어내 넣으면(청구 없이) 판 끝 검증이 짚는다", async () => {
    const { incidents, audits } = await playFair((host) => {
      const match = host.match;
      if (!match) return;
      const seen = (match.rawState() as OnecardState).turnNo;
      match.submitAs(1, { type: "shout", seen });
    });
    const reasons = [
      ...incidents.map((n) => n.reason),
      ...audits.map((a: AuditResult) => (a.ok ? "" : a.reason)),
    ];
    expect(reasons.some((r) => r.includes("청구 통로를 거치지 않고"))).toBe(
      true,
    );
  }, 60_000);

  it("방장이 발표는 바르게 하고 기록에서 청구를 빼면 판 끝 검증이 짚는다", async () => {
    const { audits } = await playFair((host) => {
      (
        host.claims as unknown as { options: { apply?: unknown } }
      ).options.apply = () => {};
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ ok: false });
    expect(audits[0]?.ok ? "" : audits[0]?.reason).toContain("빠졌다");
  }, 60_000);
});
