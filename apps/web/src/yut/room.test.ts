// @vitest-environment node

import { ManualClock } from "@game/fair-play";
import { createRng } from "@game/mighty-engine";
import { yutBotFor } from "@game/yut-ai";
import {
  type Action,
  chainLink,
  type Gesture,
  gestureThrow,
  OPEN_WAIT_MS,
  STANDARD_RULES,
  type YutRules,
  type YutView,
} from "@game/yut-engine";
import { describe, expect, it } from "vitest";

import type { MatchHost } from "@/game/host";
import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { roomRandom } from "@/net/room-random-fixture";
import { MemoryNetwork } from "@/net/transport";

import {
  commitAction,
  mySeed,
  openAction,
  type PendingThrow,
  revealAction,
  type SeedBook,
  sealGesture,
} from "./chain";
import { yutKit } from "./kit";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 50_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

/**
 * 한 사람의 기기: 사슬 씨앗과 몸짓 소금은 이 안에만 있다. 약속·공개·몸짓 열기는 화면 저장소처럼 자동으로,
 * 던지기는 몸짓을 봉인해 바로(던질 때마다 몸짓을 조금씩 바꾼다), 움직이기는 중수 컴퓨터처럼
 */
class Device {
  readonly book: SeedBook;
  /** 봉인해 던진 몸짓(소금은 이 기기에서 만든 값) */
  readonly kept: PendingThrow[] = [];
  private readonly rng = createRng(7);
  /** 시험이 일부러 다르게 행동하게 할 때. null을 돌려주면 평소대로 한다 */
  lie: ((view: YutView) => Action | null) | null = null;
  /** true를 돌려주면 이번에는 아무것도 하지 않는다(공개를 미루는 기기) */
  hold: ((view: YutView) => boolean) | null = null;
  constructor(
    readonly seed: string,
    private readonly salt: (n: number) => string,
    private readonly host: () => MatchHost<YutView, Action, unknown> | null,
  ) {
    this.book = { 0: seed };
  }
  act(): boolean {
    const match = this.host();
    const view = match?.current();
    if (!match || !view?.decision) return false;
    if (this.hold?.(view)) return false;
    const lied = this.lie?.(view) ?? null;
    if (lied) return match.submit(lied).ok;
    let action: Action | null;
    switch (view.decision.kind) {
      case "commit":
        action = commitAction(this.seed);
        break;
      case "reveal": {
        const seed = mySeed(view, this.book);
        action = seed ? revealAction(view, seed) : null;
        break;
      }
      case "throw": {
        const n = this.kept.length;
        const gesture: Gesture = {
          height: 30 + (n % 40),
          direction: (n % 9) - 4,
          strength: 30 + (n % 30),
        };
        const pending = sealGesture(gesture, this.salt(n));
        this.kept.push(pending);
        action = { type: "throw", seal: pending.seal };
        break;
      }
      case "open":
        action = openAction(view, this.kept);
        break;
      default:
        action = yutBotFor(1).decide(view, this.rng);
    }
    return action ? match.submit(action).ok : false;
  }
}

const HOST_SEED = "1a".repeat(32);
const GUEST_SEED = "9f".repeat(32);
/** n번째 던지기의 소금(16진수 64자). 참가자 소금이 방장 쪽에 새는지 찾을 수 있게 알아보기 쉬운 꼴 */
const hostSalt = (n: number) =>
  `${n.toString(16).padStart(8, "0")}${"c3".repeat(28)}`;
const guestSalt = (n: number) =>
  `${n.toString(16).padStart(8, "0")}${"e7".repeat(28)}`;

/**
 * 방 시험은 약속·공개·판 끝 검증 진행만 보므로 말 두 개로 짧게 둔다(말 수만큼 판이 길어질 뿐 진행 논리는 같다)
 */
const ROOM_RULES: YutRules = { ...STANDARD_RULES, pieces: 2 };

async function setup(rules: YutRules = ROOM_RULES) {
  const clock = new ManualClock();
  const net = new MemoryNetwork();
  // 방장·참가자 비밀 값을 정해 공동 시드(컴퓨터 윷)가 실행마다 같다
  const random = roomRandom("yut");
  const host = new HostRoom({
    kit: yutKit,
    transport: net.join("host"),
    clock,
    hostName: "방장",
    rules,
    bot: yutBotFor(1),
    botLevel: 1,
    standInDelayMs: 1_000,
    testRandom: random.host,
  });
  // 방장 기기가 받은 모든 메시지
  const hostInbox: string[] = [];
  host.transport.onMessage((m) => hostInbox.push(JSON.stringify(m)));
  const guest = new GuestRoom({
    kit: yutKit,
    transport: net.join("guest"),
    clock,
    name: "철수",
    token: null,
    testRandom: random.guest(0),
  });
  await until(() => guest.seat !== null && guest.lobby !== null);
  const audits: AuditResult[] = [];
  guest.on("audit", (r) => audits.push(r));
  const rejected: string[] = [];
  guest.on("rejected", (e) => rejected.push(e));
  await host.start();
  await until(() => guest.match !== null);
  const hostDevice = new Device(HOST_SEED, hostSalt, () => host.match);
  const guestDevice = new Device(GUEST_SEED, guestSalt, () => guest.match);
  return {
    clock,
    net,
    host,
    guest,
    hostInbox,
    audits,
    rejected,
    hostDevice,
    guestDevice,
  };
}

type Room = Awaited<ReturnType<typeof setup>>;

/** 두 기기가 번갈아 할 일을 한다. `watch`는 걸음마다 부른다 */
async function play(room: Room, stopWhen: () => boolean, watch?: () => void) {
  for (let i = 0; i < 20_000 && !stopWhen(); i++) {
    room.hostDevice.act();
    room.guestDevice.act();
    await flush();
    watch?.();
  }
  if (!stopWhen()) throw new Error("끝나지 않았다");
}

const over = (room: Room) =>
  room.host.match?.current().phase === "gameOver" &&
  room.guest.match?.current().phase === "gameOver";

describe("윷놀이 온라인 방", () => {
  it("방장은 참가자 씨앗과 아직 공개하지 않은 다음 고리를 모르고, 판 끝 검증을 통과한다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    let checks = 0;
    await play(
      room,
      () => over(room),
      () => {
        const state = room.host.match?.rawState();
        if (!state || state.phase === "gameOver") return;
        const used = state.chains[seat]?.used ?? 0;
        const next = chainLink(GUEST_SEED, used + 1);
        const seen = `${JSON.stringify(state)}\n${room.hostInbox.join("\n")}`;
        checks++;
        // 방장 엔진 상태와 받은 메시지 어디에도 참가자 씨앗이 없고,
        // 참가자가 아직 공개하지 않은 다음 고리도 없다(방장이 다음 던지기를 미리 알 수 없다).
        expect(seen).not.toContain(GUEST_SEED);
        if (state.reveals[seat] === null) expect(seen).not.toContain(next);
      },
    );
    expect(checks).toBeGreaterThan(20);
    const end = room.host.match?.current();
    expect(end?.result?.kind).toBe("finish");
    room.host.finish();
    await until(() => room.audits.length === 1);
    expect(room.audits).toEqual([{ ok: true }]);
  });

  it("참가자가 몸짓을 봉인해 던지면 방장은 몸짓을 모르고, 고리가 다 공개된 뒤 열어 두 기기가 같은 결과를 본다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    // 참가자가 첫 몸짓을 열 차례까지(참가자 기기는 열기를 잠깐 미룬다).
    room.guestDevice.hold = (view) => view.decision?.kind === "open";
    await play(room, () => {
      const v = room.host.match?.current();
      return v?.phase === "open" && v.turn === seat;
    });
    const pending = room.guestDevice.kept.at(-1) as PendingThrow;
    const before = room.host.match?.rawState();
    const seen = `${JSON.stringify(before)}\n${room.hostInbox.join("\n")}`;
    // 방장 쪽에는 봉인만 있고 소금은 없다(몸짓을 미리 알 수 없다).
    expect(before?.seal).toBe(pending.seal);
    expect(seen).not.toContain(pending.salt);
    const links = before?.reveals as string[];
    const index = before?.throwCount as number;
    room.guestDevice.hold = null;
    await until(() => room.guestDevice.act());
    await until(
      () =>
        room.host.match?.current().throwCount === index + 1 &&
        room.guest.match?.current().throwCount === index + 1,
    );
    const hostThrow = room.host.match?.current().lastThrow;
    const guestThrow = room.guest.match?.current().lastThrow;
    expect(guestThrow).toEqual(hostThrow);
    expect(hostThrow?.gesture).toEqual(pending.gesture);
    expect(hostThrow?.sticks).toEqual(
      gestureThrow(index, pending.gesture, links, ROOM_RULES).sticks,
    );
  });

  it("던진 사람이 몸짓을 열지 않으면 방장 시계가 정해진 시간 뒤 그 던지기를 무효로 하고, 판 끝 검증을 통과한다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    room.guestDevice.hold = (view) => view.decision?.kind === "open";
    await play(room, () => {
      const v = room.host.match?.current();
      return v?.phase === "open" && v.turn === seat;
    });
    const index = room.host.match?.current().throwCount as number;
    // 시간이 되기 직전까지는 기다린다.
    room.clock.advance(OPEN_WAIT_MS - 1);
    await flush();
    expect(room.host.match?.current().phase).toBe("open");
    room.clock.advance(1);
    await until(() => room.guest.match?.current().throwCount === index + 1);
    expect(room.guest.match?.current().lastThrow).toMatchObject({
      seat,
      nak: "unopened",
    });
    expect(room.guest.match?.current().turn).not.toBe(seat);
    room.guestDevice.hold = null;
    room.hostDevice.act();
    const resign = room.host.match?.submit({ type: "resign" });
    expect(resign?.ok).toBe(true);
    room.host.finish();
    await until(() => room.audits.length === 1);
    expect(room.audits).toEqual([{ ok: true }]);
  });

  it("약속한 사슬에 없는 고리를 보내면 방장 엔진이 받지 않는다", async () => {
    const room = await setup();
    // 참가자는 결과를 바꿔 보려고 다른 씨앗의 고리를 보낸다.
    room.guestDevice.lie = (view) =>
      view.decision?.kind === "reveal"
        ? { type: "reveal", link: chainLink("ee".repeat(32), 1) }
        : null;
    await play(room, () => room.rejected.length > 0);
    expect(room.rejected).toContain("약속한 사슬의 다음 고리가 아니에요.");
  });

  it("참가자가 공개하지 않고 끊기면 컴퓨터가 대신 공개하지 못해 기다리고, 끝내기로 참가자 편이 진다", async () => {
    const room = await setup();
    const seat = room.guest.seat as number;
    // 참가자 기기는 첫 공개를 미룬다. 참가자 공개만 남을 때까지 진행한다.
    room.guestDevice.hold = (view) =>
      view.decision?.kind === "reveal" && view.throwCount === 0;
    await play(room, () => {
      const v = room.host.match?.current();
      return (
        v?.phase === "reveal" &&
        v.reveals[0] !== null &&
        v.reveals[seat] === null
      );
    });
    room.net.disconnect("guest");
    await until(() => room.host.lobby().seats[seat]?.connected === false);
    room.clock.advance(1_000);
    await flush();
    // 대신 두는 컴퓨터는 사람이 만든 씨앗을 모르니 공개하지 않는다.
    expect(room.host.match?.current().phase).toBe("reveal");
    room.host.abandon();
    expect(room.host.match?.current().result).toEqual({
      kind: "forfeit",
      seat,
      side: 0,
    });
  });

  it("빈자리를 컴퓨터가 맡은 3인 방도 끝까지 두고 검증을 통과한다", async () => {
    const room = await setup({ ...ROOM_RULES, players: 3 });
    await play(room, () => over(room));
    expect(room.host.match?.current().result?.kind).toBe("finish");
    room.host.finish();
    await until(() => room.audits.length === 1);
    expect(room.audits).toEqual([{ ok: true }]);
  });

  it("개인 시간: 방장 시계가 던지기에 쓴 시간을 깎고, 공개를 기다리는 시간은 재지 않으며, 참가자 시간패를 기록한다", async () => {
    const room = await setup({ ...ROOM_RULES, time: "fast" });
    const seat = room.guest.seat as number;
    // 시계가 가는 결정(던지기·움직이기)
    const guestDecides = (kinds = ["throw", "move"]) =>
      kinds.includes(room.guest.match?.current().decision?.kind ?? "");
    const guestClock = () => room.host.match?.rawState().clocks?.[seat];
    // 참가자가 던질 차례까지(다른 행동은 시계가 서 있는 채로 바로 낸다).
    await play(room, () => guestDecides(["throw"]));
    const before = guestClock()?.main as number;
    room.clock.advance(5_000);
    room.guestDevice.act();
    await until(() => guestClock()?.main === before - 5_000);
    // 방장 기기가 공개를 미루는 동안 시간이 한참 지나도 참가자 시계는 그대로다.
    room.hostDevice.hold = (view) => view.decision?.kind === "reveal";
    await play(room, () => {
      const v = room.host.match?.current();
      return v?.phase === "reveal" && v.reveals[seat] !== null;
    });
    room.clock.advance(400_000);
    await flush();
    expect(room.host.match?.current().result).toBeNull();
    room.hostDevice.hold = null;
    // 다시 참가자가 결정할 때 시간을 다 쓰게 한다.
    await play(room, () => guestDecides());
    expect(guestClock()?.main).toBe(before - 5_000);
    // 시간패가 걸리는 순간까지만 감는다(더 감으면 참가자 기기가 시간패 화면을 그만큼 늦게 받은 것이 된다).
    const left = guestClock();
    room.clock.advance((left?.main ?? 0) + (left?.periods ?? 0) * 30_000 + 1);
    await until(() => room.host.match?.current().result != null);
    expect(room.host.match?.current().result).toEqual({
      kind: "time",
      seat,
      side: 1 - seat,
    });
    room.host.finish();
    await until(() => room.audits.length === 1);
    expect(room.audits).toEqual([{ ok: true }]);
  });
});
