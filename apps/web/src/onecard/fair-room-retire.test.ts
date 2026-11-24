// @vitest-environment node
// 원카드 암호화방 시험은 판을 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다(fair-room.test.ts 끝까지 둔 판)
import {
  type Action,
  type OnecardState,
  type OnecardView,
  STANDARD_ONECARD_RULES,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import {
  type AnyGuest,
  type AnyHost,
  setupHwatu,
  until,
} from "@/hwatu/fair-room-fixture";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { neverOpens } from "@/net/unopened-round-fixture";

import { onecardBotFor, toKitBot } from "./bots";
import { onecardFair } from "./fair";
import { onecardKit } from "./kit";

describe("원카드 암호화방: 도중에 그만하기", () => {
  it("덱을 열기 전에 방장이 끝내도 참가자 게임 끝 검증은 통과한다(끝까지 치지 않은 판은 결과 없음)", async () => {
    const { host, guests, incidents, audits, clock } = await setupHwatu({
      kit: onecardKit,
      rules: { ...STANDARD_ONECARD_RULES, players: 2 },
      guests: 1,
      bot: toKitBot(onecardBotFor(1)),
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await until(() => guests.every((g) => g.match !== null), "첫 화면");
    host.abandon();
    // 방장은 청구 통로가 닫히길(유예 시간의 절반) 기다린 뒤 게임 끝 기록을 보낸다. 그 시계를 옮긴다.
    const end = () => guests[0]?.match?.current() as OnecardView | undefined;
    await until(() => {
      if (audits.length === 1 && end()?.phase === "over") return true;
      clock.advance(500);
      return false;
    }, "게임 끝 검증");
    // 끝 화면: 내 손패는 진짜 카드, 열지 못한 방장 손패는 가린다(뒷면).
    const view = end() as OnecardView;
    const me = guests[0]?.seat as number;
    expect(view.retired).toBe(true);
    expect(view.result?.hands[1 - me]).toBeNull();
    expect(view.result?.hands[me]?.some((c) => c.startsWith("?_"))).toBe(false);
    expect(audits).toEqual([{ ok: true }]);
    expect(incidents).toEqual([]);
  });

  it("게임을 끝까지 친 뒤 기록 끝에 끝내기를 붙여 그만둔 것처럼 꾸며도, 덱이 열리지 않은 참가자는 게임 끝 검증에서 짚는다", async () => {
    const { host, guests, incidents, audits, clock } = await setupHwatu({
      kit: shortKit,
      rules: SHORT_RULES,
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
    // 방장이 판 끝에 덱을 열지 않은 것과 같다: 참가자 기기에서 덱이 끝내 열리지 않는다.
    neverOpens(guest, 1);
    const raw = () => match.rawState() as OnecardState;
    // 고친 방장 기기: 게임이 끝난 뒤 보내는 기록 끝에 끝내기를 붙인다(엔진은 끝난 게임의 끝내기를 받지 않는다).
    const honestLog = match.actionLog.bind(match);
    match.actionLog = () =>
      raw().phase === "over"
        ? [...honestLog(), { seat: 0, action: { type: "retire" } } as never]
        : honestLog();
    await playToEnd(host, guest, incidents);
    void host.finish();
    // 참가자는 끝난 게임의 덱이 열리길(상한 30초) 기다린 뒤 검증한다.
    await until(() => {
      if (audits.length === 1) return true;
      clock.advance(1_000);
      return false;
    }, "게임 끝 검증");
    expect(audits).toEqual([
      {
        ok: false,
        reason: "1판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.",
      },
    ]);
  });
});

/** 특수 카드 없는 짧은 덱(fair-room.test.ts와 같다): 손패 5·5, 펼칠 카드 1, 더미 3이라 판이 금방 끝난다 */
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
const SHORT_RULES = {
  ...STANDARD_ONECARD_RULES,
  players: 2,
  handSize: 5 as const,
  endOnFirst: true,
};

/**
 * 판을 끝까지 둔다(fair-room.test.ts의 진행과 같다). 방장은 다시 섞기가 한 번 일어날 때까지 먹고, 그 뒤로는
 * 참가자가 이어 낼 수 있게 되는 카드를 낸다. 참가자는 낼 수 있으면 늘 낸다. 그래서 판이 반드시 끝난다
 */
async function playToEnd(
  host: AnyHost,
  guest: AnyGuest,
  incidents: unknown[],
): Promise<void> {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  const raw = () => match.rawState() as OnecardState;
  const guestView = () => guest.match?.current() as OnecardView | undefined;
  let rejections = 0;
  host.onOwnError(() => rejections++);
  guest.on("rejected", () => rejections++);
  while (raw().phase !== "over" && incidents.length === 0) {
    const state = raw();
    const version = state.version;
    const hv = match.current() as OnecardView;
    const gv = guestView();
    const rejected = rejections;
    let acted = false;
    if (hv.decision === "turn")
      acted = match.submit(hostMove(hv, gv, state)).ok;
    else if (gv?.decision === "turn")
      acted = guest.match?.submit(firstMove(gv)).ok ?? false;
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
}

const firstMove = (view: OnecardView): Action =>
  view.moves.find((a) => a.type === "play") ?? { type: "draw" };

function hostMove(
  hv: OnecardView,
  gv: OnecardView | undefined,
  state: OnecardState,
): Action {
  const draw: Action = { type: "draw" };
  if ((state.reshuffles ?? 0) === 0 && (hv.deckCount > 0 || hv.pile.length > 1))
    return draw;
  const follows = (card: string) =>
    (gv?.hand ?? []).some(
      (c) => c[0] === card[0] || c.slice(1) === card.slice(1),
    );
  return (
    hv.moves.find((a) => a.type === "play" && follows(a.card)) ??
    hv.moves.find((a) => a.type === "play") ??
    draw
  );
}
