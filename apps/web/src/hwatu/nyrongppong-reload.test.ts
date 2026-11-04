// @vitest-environment node
/**
 * 화투 모양 게임을 진짜 암호로 이어 붙인 시험(가장 작게: 두 사람, 한 판). 나이롱뽕은 화투 셋 가운데 카드가
 * 가장 여러 길로 열린다(가져온 카드는 그 사람만, 버린 카드·뽕은 모두, 판이 끝나는 걸음 전에 모두).
 * - 걸음마다: 방장 엔진에는 손패·더미가 자리 표뿐이고, 참가자 손에 있는 카드는 방장 상태 어디에도 없으며,
 *   참가자 화면의 내 손패는 진짜 카드다
 * - 참가자·방장이 판 중간에 한 번씩 새로고침해도 이어 친다(가져온 카드는 그 사람만 알아 되살리는 것이 많다)
 * - 게임 끝 검증을 통과하고, 참가자 복기가 진짜 패로 게임 끝까지 돈다(새로고침한 참가자는 되살린 판의
 *   판마다 검증을 건너뛴다: guest-room `verifyRound`. 판마다 검증은 `fair-room-extra.test.ts`가 본다)
 * 인원·판 수를 넓힌 카드 표 약속은 암호 없이 게임마다 본다(`nyrongppong/fair.test.ts` 등, `card-table-sim.ts`).
 * 다른 시험과 떨어져 혼자 돌게 따로 둔다(같은 파일의 앞 시험이 남긴 계산과 겹치면 느려진다)
 */
import {
  nyrongppongBeginnerBot,
  nyrongppongIntermediateBot,
} from "@game/nyrongppong-ai";
import {
  STANDARD_RULES as NYRONGPPONG_RULES,
  type NyrongppongState,
  type NyrongppongView,
} from "@game/nyrongppong-engine";
import { describe, expect, it } from "vitest";

import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { nyrongppongKit } from "@/nyrongppong/kit";
import { ONLINE_CALL_SECONDS, onlineRules } from "@/nyrongppong/settings";
import type { ArchiveSource } from "@/review/recorder";
import { replayArchive } from "@/review/replay";

import {
  type AnyGuest,
  type AnyHost,
  expectHidden,
  hwatuHostOptions,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

describe("화투 암호화방: 나이롱뽕(가져온 카드는 그 사람만) 새로고침", () => {
  it("참가자와 방장이 한 번씩 새로고침해도 이어 치고, 방장 엔진에는 남의 손패·더미가 자리 표뿐이며 모두의 검증과 복기를 통과한다", () =>
    nyrongppongReloadScenario());
});

/**
 * 새로고침할 두 지점(참가자 4수, 방장 8수)까지 두는 컴퓨터: 뽕·스톱·약 선언을 하지 않는다.
 * 뽕을 하지 않으면 손패를 비우거나 스톱할 수 없고 약도 내지 않으니, 판이 그 지점보다 일찍 끝날 길이 없다.
 * 예전에는 초급 컴퓨터로 두어 패에 따라 일찍 끝나면 새 방으로 다시 했다(섞고 나누기를 한 번 더 해 느렸다)
 */
const patientBot: typeof nyrongppongBeginnerBot = {
  name: "nyrongppong-patient",
  decide(view, rng) {
    switch (view.decision?.kind) {
      case "call":
        return { type: "pass" };
      case "draw":
        return { type: "draw" };
      case "discard":
        return { type: "discard", card: view.hand[0] as string };
      default:
        return nyrongppongBeginnerBot.decide(view, rng);
    }
  },
};

/** 참가자 새로고침 → 방장 새로고침(참가자 행동이 끊긴 사이에 나감) → 판 끝·게임 끝 검증 */
async function nyrongppongReloadScenario(): Promise<void> {
  // 새로고침·재연결 진행 논리만 본다: 가장 가벼운 설정(두 사람, 한 판, 군 r255)에서 참가자·방장 새로고침과
  // 그 뒤 판 끝·게임 끝 검증까지. 나누고 섞는 일이 사람 수·판 수만큼 늘어 무거운 설정은 같은 논리를 느리게 되풀이할 뿐이다
  const rules = onlineRules({
    ...NYRONGPPONG_RULES,
    players: 2,
    rounds: 1,
  });
  const options = {
    kit: nyrongppongKit,
    rules,
    bot: nyrongppongIntermediateBot,
    botLevel: 1,
  };
  const { net, clock, host, guests, incidents, audits, store } =
    await setupHwatu({
      ...options,
      guests: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
      hostStore: true,
    });
  let current = host;
  const tick = () => {
    const raw = current.match?.rawState() as { phase?: string } | undefined;
    if (raw?.phase !== "call") return;
    const devices = [
      current.fair?.device,
      ...guests.map((g) => g.fair?.device),
    ];
    if (devices.some((d) => d?.busy())) return;
    const views = [
      current.match?.current(),
      ...guests.map((g) => g.match?.current()),
    ];
    if (views.some((v) => (v as { decision?: unknown })?.decision)) return;
    clock.advance(ONLINE_CALL_SECONDS * 1000 + 1);
  };
  /** 걸음마다: 방장 엔진은 자리 표뿐이고, 참가자 손에 있는 카드는 방장 상태 어디에도 없다 */
  let seen = 0;
  const check = () => {
    const raw = current.match?.rawState() as NyrongppongState | undefined;
    if (!raw || raw.phase === "roundEnd" || raw.phase === "gameOver") return;
    for (const hand of raw.hands) expectHidden(hand);
    expectHidden(raw.deck);
    const gv = guests[0]?.match?.current() as NyrongppongView | undefined;
    if (!gv || gv.roundNumber !== raw.roundNumber || gv.phase === "roundEnd")
      return;
    expect(gv.hand.some((id) => id.startsWith("?_"))).toBe(false);
    const text = JSON.stringify(raw);
    const leaked = gv.hand.filter((card) => text.includes(`"${card}"`));
    if (leaked.length > 0)
      expect(leaked, "방장 상태에 참가자 카드").toEqual([]);
    seen += gv.hand.length;
  };
  await host.start();
  const play = (done: () => boolean, bot = nyrongppongBeginnerBot) =>
    playHwatu({
      host: current,
      guests,
      bot,
      incidents,
      tick,
      done,
      check,
    });
  const over = () =>
    (current.match?.current() as { phase?: string } | undefined)?.phase ===
    "gameOver";
  // 참가자 새로고침
  await play(
    () => (current.match?.actionLog().length ?? 0) >= 4 || over(),
    patientBot,
  );
  expect(incidents).toEqual([]);
  expect(over()).toBe(false);
  const old = guests[0] as AnyGuest;
  net.disconnect("g0");
  old.leave();
  const fresh = new GuestRoom({
    kit: nyrongppongKit,
    transport: net.join("g0-reloaded"),
    name: "손님0",
    token: old.token,
    secret: old.secret,
    fairStore: (old as unknown as { fairStore: never }).fairStore,
    clock,
  });
  fresh.on("incident", (n) => incidents.push(n as never));
  // 새로고침 전 참가자 객체의 알림(방장이 기록 없이 나갔다)은 보지 않는다.
  const freshAudits: typeof audits = [];
  fresh.on("audit", (r) => freshAudits.push(r));
  const archives: ArchiveSource[] = [];
  fresh.on("archive", (s) => archives.push(s));
  guests[0] = fresh as never;
  await until(
    () => (fresh.match?.current().hand.length ?? 0) > 0,
    "새로고침한 참가자 화면",
  );
  // 방장 새로고침: 참가자 차례가 온 때 끊고, 방장 연결이 없는 사이에 참가자가 행동을 낸다.
  // 그 행동은 어디에도 가지 않았다. 새로고침한 참가자의 보낸 행동 목록은 새로고침 뒤 것뿐이라
  // 기록 수(`mine`)로는 잃은 것을 알 수 없어, "못 보냈다" 표시로 다시 보내야 한다(예전에 30번에 1번 멈춤).
  const guestView = () =>
    fresh.match?.current() as { decision?: unknown } | undefined;
  await play(
    () =>
      ((current.match?.actionLog().length ?? 0) >= 8 &&
        !!guestView()?.decision) ||
      over(),
    patientBot,
  );
  expect(incidents).toEqual([]);
  expect(over()).toBe(false);
  const states: string[] = [];
  fresh.on("connection", (s) => states.push(s as string));
  net.disconnect("host");
  await until(() => states.includes("reconnecting"), "방장 끊김");
  // 끊기기 직전 오가던 메시지로 차례가 이미 넘어갔으면 이 판에서는 "끊긴 사이 낸 행동"을 만들 수 없다.
  // 그때는 그 확인만 건너뛰고 새로고침 확인은 그대로 한다.
  const pendingView = guestView();
  const offline = !!pendingView?.decision;
  if (offline)
    expect(
      fresh.match?.submit(
        nyrongppongBeginnerBot.decide(pendingView as never, { seed: 99 }),
      ),
    ).toEqual({ ok: true });
  const mineBefore = (current.match?.actionLog() ?? []).filter(
    (e) => e.seat === fresh.seat,
  ).length;
  const restore = store?.load();
  current = new HostRoom({
    transport: net.join("host1"),
    ...hwatuHostOptions({ ...options, clock, ...(store ? { store } : {}) }),
    ...(restore ? { restore } : {}),
  } as never) as AnyHost;
  current.onIncident((n) => incidents.push(n));
  await until(
    () => current.lobby().seats.every((s) => s.connected),
    "참가자 다시 연결",
  );
  // 다시 이어지면 참가자 기기가 못 보낸 행동을 다시 보낸다. 방장이 이어 가기를 마치기 전에 닿아 거절되면
  // 화면에 다시 내 차례가 보이니 사람처럼 한 번 더 낸다. 그동안 방장과 컴퓨터도 평소처럼 둔다(판 끝 "계속"은
  // 모두가 눌러야 다음 판으로 넘어가므로, 참가자 것만 기다리면 방장 차례에서 멈춘다).
  if (offline)
    await play(
      () =>
        (current.match?.actionLog() ?? []).filter((e) => e.seat === fresh.seat)
          .length > mineBefore,
    );
  await play(over);
  expect(incidents.map((i) => `${i.reporter}:${i.seat}:${i.reason}`)).toEqual(
    [],
  );
  current.finish();
  await until(() => freshAudits.length >= 1, "판 끝 검증");
  expect(freshAudits).toEqual([{ ok: true }]);
  expect(seen).toBeGreaterThan(0);
  // 참가자 복기: 판 끝 검증과 판마다 검증이 차례 없이 끝나므로 진짜 패가 가장 많은 기록을 본다.
  const last = [...archives].sort(
    (a, b) =>
      Object.keys(b.deals ?? {}).length - Object.keys(a.deals ?? {}).length ||
      b.log.length - a.log.length,
  )[0];
  if (!last) throw new Error("복기 기록이 없다");
  const replayed = replayArchive(nyrongppongKit, {
    v: 1,
    game: "nyrongppong",
    ...last,
  } as never);
  expect(replayed.error).toBeNull();
  expect((replayed.states.at(-1) as NyrongppongState).phase).toBe("gameOver");
}
