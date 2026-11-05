// @vitest-environment node

import { ManualClock } from "@game/fair-play";
import { galaxyBotFor } from "@game/galaxy-ai";
import {
  type Action,
  bidCommitment,
  bidSalt,
  boardOfSky,
  createGalaxyScenario,
  type GalaxyRules,
  type GalaxyView,
  SHORT_RULES,
  step,
} from "@game/galaxy-engine";
import { createRng } from "@game/mighty-engine";
import { chainLink } from "@game/yut-engine";
import { describe, expect, it } from "vitest";

import type { MatchHost } from "@/game/host";
import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import {
  bidAction,
  commitAction,
  type GalaxySecrets,
  revealFor,
} from "./chain";
import {
  DECISION_MS,
  galaxyOnlineKit,
  isLate,
  standInAction,
  verifyLate,
} from "./online";

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

/** 봉투 값(10 단위, 가진 별빛까지) */
const BID = 50;

/**
 * 한 사람의 기기: 주사위 사슬 씨앗과 봉투 소금은 이 안에만 있다. 약속·공개는 화면 저장소처럼 자동으로,
 * 봉투는 늘 50, 나머지는 중수 컴퓨터처럼. `passBuy`면 별을 사지 않고 넘겨 봉투 입찰을 연다
 */
class Device {
  readonly secrets: GalaxySecrets;
  private readonly rng = createRng(7);
  /** 시험이 일부러 다르게 행동하게 할 때. null을 돌려주면 평소대로 한다 */
  lie: ((view: GalaxyView) => Action | null) | null = null;
  /** true를 돌려주면 이번에는 아무것도 하지 않는다(자리를 비운 기기) */
  hold: ((view: GalaxyView) => boolean) | null = null;
  passBuy = false;
  constructor(
    readonly seed: string,
    private readonly host: () => MatchHost<GalaxyView, Action, unknown> | null,
  ) {
    this.secrets = { seeds: { 0: seed }, bids: {} };
  }
  /** 이 기기가 낸 봉투 소금(입찰 번호마다 다르게) */
  saltOf(index: number): string {
    return `${this.seed.slice(0, 30)}${index.toString(16).padStart(2, "0")}`;
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
      case "reveal":
      case "bidReveal":
        action = revealFor(view, this.secrets);
        break;
      case "bid": {
        const index = view.decision.index;
        const value = view.decision.max >= BID ? BID : 0;
        const salt = this.saltOf(index);
        this.secrets.bids[index] = { value, salt };
        action = bidAction(index, value, salt);
        break;
      }
      case "buy":
        action = this.passBuy
          ? { type: "pass" }
          : galaxyBotFor(1).decide(view, this.rng);
        break;
      default:
        action = galaxyBotFor(1).decide(view, this.rng);
    }
    return action ? match.submit(action).ok : false;
  }
}

const HOST_SEED = "1a".repeat(32);
const GUEST_SEED = "9f".repeat(32);

/** 방 시험은 약속·공개·입찰·대신 두기·판 끝 검증만 보므로 짧은 판 2인(필요하면 3인)으로 확인할 지점까지만 둔다 */
const ROOM_RULES: GalaxyRules = { ...SHORT_RULES, players: 2 };

async function setup(rules: GalaxyRules = ROOM_RULES) {
  const clock = new ManualClock();
  const net = new MemoryNetwork();
  const host = new HostRoom({
    kit: galaxyOnlineKit,
    transport: net.join("host"),
    clock,
    hostName: "방장",
    rules,
    bot: galaxyBotFor(1),
    botLevel: 1,
    standInDelayMs: 1_000,
  });
  // 방장 기기가 받은 모든 메시지
  const hostInbox: string[] = [];
  host.transport.onMessage((m) => hostInbox.push(JSON.stringify(m)));
  const guest = new GuestRoom({
    kit: galaxyOnlineKit,
    transport: net.join("guest"),
    clock,
    name: "철수",
    token: null,
  });
  await until(() => guest.seat !== null && guest.lobby !== null);
  const audits: AuditResult[] = [];
  guest.on("audit", (r) => audits.push(r));
  const rejected: string[] = [];
  guest.on("rejected", (e) => rejected.push(e));
  await host.start();
  await until(() => guest.match !== null);
  const hostDevice = new Device(HOST_SEED, () => host.match);
  const guestDevice = new Device(GUEST_SEED, () => guest.match);
  return {
    clock,
    net,
    host,
    guest,
    seat: guest.seat as number,
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
  if (!stopWhen()) throw new Error("멈출 자리에 닿지 않았다");
}

const hostView = (room: Room) => room.host.match?.current();
const hostState = (room: Room) => room.host.match?.rawState();

/**
 * 방장 기기가 아무 자리에나 행동을 넣는다(못된 방장 흉내). 방장 엔진의 안쪽 `apply`를 직접 부른다
 */
function injectFromHost(room: Room, seat: number, action: Action): boolean {
  const match = room.host.match as unknown as {
    apply(seat: number, action: Action): { ok: boolean };
  };
  return match.apply(seat, action).ok;
}

/** 참가자가 기권해 판을 끝내고 판 끝 검증을 기다린다 */
async function resignAndAudit(room: Room): Promise<AuditResult[]> {
  await until(() => room.guest.match?.awaiting() === false);
  expect(room.guest.match?.submit({ type: "resign" }).ok).toBe(true);
  await until(
    () =>
      room.host.match?.current().phase === "gameOver" &&
      room.guest.match?.current().phase === "gameOver",
  );
  room.host.finish();
  await until(() => room.audits.length === 1);
  return room.audits;
}

describe("은하 한 바퀴 온라인 방", () => {
  it("방장은 참가자 씨앗·아직 공개하지 않은 고리·공개 전 봉투를 모르고, 기권으로 끝낸 판이 검증을 통과한다", async () => {
    const room = await setup();
    const { seat } = room;
    // 참가자는 별을 사지 않고 넘겨 봉투 입찰을 연다.
    room.guestDevice.passBuy = true;
    let checks = 0;
    let sealedChecks = 0;
    await play(
      room,
      () => {
        const s = hostState(room);
        return !!s && s.auctionCount >= 2 && s.revealCount >= 12;
      },
      () => {
        const state = hostState(room);
        if (!state || state.phase === "gameOver") return;
        const used = state.chains[seat]?.used ?? 0;
        const next = chainLink(GUEST_SEED, used + 1);
        const seen = `${JSON.stringify(state)}\n${room.hostInbox.join("\n")}`;
        checks++;
        // 방장 엔진 상태와 받은 메시지 어디에도 참가자 씨앗이 없고, 아직 공개하지 않은 다음 고리도 없다.
        expect(seen).not.toContain(GUEST_SEED);
        if (state.reveals[seat] === null) expect(seen).not.toContain(next);
        // 봉투를 냈지만 공개하기 전에는 참가자 소금(과 값)이 방장에게 없다.
        const auction = state.auction;
        if (
          auction &&
          auction.commits[seat] !== null &&
          auction.reveals[seat] === null
        ) {
          sealedChecks++;
          expect(seen).not.toContain(room.guestDevice.saltOf(auction.index));
        }
      },
    );
    expect(checks).toBeGreaterThan(20);
    expect(sealedChecks).toBeGreaterThan(0);
    // 공개한 봉투는 약속대로 들어갔다.
    expect(hostState(room)?.lastAuction?.bids[seat]).toBe(BID);
    expect(await resignAndAudit(room)).toEqual([{ ok: true }]);
    expect(hostView(room)?.result?.kind).toBe("resign");
  });

  it("약속한 사슬에 없는 고리, 약속과 다른 봉투 공개는 방장 엔진이 받지 않는다", async () => {
    const room = await setup();
    room.guestDevice.lie = (view) =>
      view.decision?.kind === "reveal"
        ? { type: "reveal", link: chainLink("ee".repeat(32), 1) }
        : null;
    await play(room, () => room.rejected.length > 0);
    expect(room.rejected).toContain("약속한 사슬의 다음 고리가 아니에요");

    // 봉투: 낸 값과 다른 값으로 공개하면 받지 않는다.
    room.guestDevice.lie = (view) => {
      if (view.decision?.kind !== "bidReveal") return null;
      const bid = room.guestDevice.secrets.bids[view.decision.index];
      return bid
        ? { type: "bidReveal", value: bid.value + 10, salt: bid.salt }
        : null;
    };
    room.guestDevice.passBuy = true;
    room.rejected.length = 0;
    await play(room, () => room.rejected.length > 0);
    expect(room.rejected).toContain("약속한 입찰 값과 달라요");
  });

  it("결정 시간을 넘기면 방장이 대신 정한다: 봉투는 「내지 않음」, 차례는 굴리기, 같은 차례 남은 결정은 바로", async () => {
    const room = await setup();
    const { seat } = room;
    room.guestDevice.passBuy = true;
    // 방장이 넘겨 봉투 입찰이 열릴 때까지(참가자는 봉투를 내지 않고 기다린다).
    room.hostDevice.passBuy = true;
    room.guestDevice.hold = (view) => view.decision?.kind === "bid";
    await play(room, () => {
      const v = room.guest.match?.current();
      return v?.decision?.kind === "bid";
    });
    const index = hostState(room)?.auction?.index as number;
    room.clock.advance(DECISION_MS - 1);
    await flush();
    expect(hostState(room)?.auction?.commits[seat]).toBeNull();
    room.clock.advance(1);
    await until(() => hostState(room)?.auction?.commits[seat] !== null);
    // 참가자 기기는 대신 낸 봉투(자리 재료 소금의 0)를 알아보고 스스로 공개한다.
    room.guestDevice.hold = null;
    await play(room, () => hostState(room)?.lastAuction?.index === index);
    expect(hostState(room)?.lastAuction?.bids[seat]).toBe(0);

    // 참가자 차례를 비운다: 굴리기를 기다리다 넘기면 방장이 굴린다(지금 차례는 마저 두고 다음 굴리기부터).
    room.guestDevice.hold = (view) => view.decision?.kind === "roll";
    await play(
      room,
      () => room.guest.match?.current().decision?.kind === "roll",
    );
    room.guestDevice.hold = (view) =>
      view.decision?.kind === "roll" ||
      view.decision?.kind === "buy" ||
      view.decision?.kind === "end";
    const before = room.host.match?.actionLog().length ?? 0;
    room.clock.advance(DECISION_MS);
    await until(() =>
      (room.host.match?.actionLog() ?? [])
        .slice(before)
        .some((e) => e.seat === seat && e.action.type === "roll"),
    );
    const lateRoll = room.host.match
      ?.actionLog()
      .slice(before)
      .find((e) => e.seat === seat && e.action.type === "roll");
    expect(lateRoll && isLate(lateRoll.action)).toBe(true);
    // 같은 차례에 남은 결정(사기·차례 마치기)은 기다리지 않고 대신 정해 차례가 넘어간다.
    await play(room, () => {
      const s = hostState(room);
      if (s?.phase === "reveal") return false;
      room.clock.advance(0);
      return s?.turn.seat !== seat || s.phase === "gameOver";
    });
    // 대신 정한 수가 끼어도 판 끝 검증을 통과한다.
    room.guestDevice.hold = null;
    expect(await resignAndAudit(room)).toEqual([{ ok: true }]);
  });

  it("거래 제안에 답하지 않으면 거절로 대신 정한다", () => {
    const board = boardOfSky("seasons");
    const scene = createGalaxyScenario({
      board,
      rules: ROOM_RULES,
      stars: [
        { square: 1, owner: 0 },
        { square: 14, owner: 1 },
      ],
    });
    const offered = step(scene, 0, {
      type: "offer",
      to: 1,
      give: { stars: [1], cash: 0 },
      get: { stars: [14], cash: 0 },
    });
    if (!offered.ok) throw new Error(offered.error);
    expect(standInAction(offered.state, 1)).toEqual({ type: "rejectTrade" });
  });

  it("참가자가 고리를 공개하지 않고 끊기면 컴퓨터가 대신 공개하지 못해 기다리고, 끝내기로 그 사람이 진다", async () => {
    const room = await setup();
    const { seat } = room;
    // 참가자 기기는 첫 굴림 공개를 미룬다. 참가자 공개만 남을 때까지 진행한다.
    room.guestDevice.hold = (view) =>
      view.decision?.kind === "reveal" && view.revealCount >= 1;
    await play(room, () => {
      const v = hostView(room);
      return (
        v?.phase === "reveal" &&
        v.revealCount >= 1 &&
        v.reveals[0] !== null &&
        v.reveals[seat] === null
      );
    });
    room.net.disconnect("guest");
    await until(() => room.host.lobby().seats[seat]?.connected === false);
    room.clock.advance(DECISION_MS * 3);
    await flush();
    // 대신 두는 컴퓨터는 사람이 만든 씨앗을 모르니 공개하지 않는다(방 시계도 사슬 공개는 대신하지 않는다).
    expect(hostView(room)?.phase).toBe("reveal");
    room.host.abandon();
    expect(hostView(room)?.result?.kind).toBe("forfeit");
    expect(hostView(room)?.result?.seat).toBe(seat);
  });

  it("참가자가 자기 소금으로 낸 봉투를 공개하지 않고 끊겨도 끝내기로 그 사람이 진다", async () => {
    const room = await setup();
    const { seat } = room;
    room.guestDevice.passBuy = true;
    room.guestDevice.hold = (view) => view.decision?.kind === "bidReveal";
    await play(room, () => {
      const s = hostState(room);
      return (
        s?.phase === "bidReveal" &&
        s.auction?.reveals[0] !== null &&
        s.auction?.reveals[seat] === null
      );
    });
    room.net.disconnect("guest");
    await until(() => room.host.lobby().seats[seat]?.connected === false);
    room.clock.advance(DECISION_MS * 3);
    await flush();
    expect(hostView(room)?.phase).toBe("bidReveal");
    room.host.abandon();
    expect(hostView(room)?.result).toMatchObject({ kind: "forfeit", seat });
  });

  it("빈자리를 컴퓨터가 맡은 3인 방도 기권으로 끝낸 판이 검증을 통과한다(컴퓨터 수를 다시 셈한다)", async () => {
    const room = await setup({ ...ROOM_RULES, players: 3 });
    room.guestDevice.passBuy = true;
    await play(room, () => {
      const s = hostState(room);
      return !!s && s.auctionCount >= 1 && s.revealCount >= 10;
    });
    const botSeat = room.host.lobby().seats.find((s) => s.kind === "bot")?.seat;
    expect(botSeat).toBeDefined();
    expect(
      room.host.match?.actionLog().some((e) => e.seat === botSeat && e.bot),
    ).toBe(true);
    expect(await resignAndAudit(room)).toEqual([{ ok: true }]);
  });

  it("방장이 꼬리표를 달아 참가자 봉투를 지어 넣으면(가진 별빛 전부) 참가자 기기가 공개하지 않고 판 끝 검증이 잡는다", async () => {
    const room = await setup();
    const { seat } = room;
    room.guestDevice.passBuy = true;
    room.hostDevice.passBuy = true;
    room.guestDevice.hold = (view) => view.decision?.kind === "bid";
    await play(
      room,
      () => room.guest.match?.current().decision?.kind === "bid",
    );
    const state = hostState(room) as NonNullable<ReturnType<typeof hostState>>;
    const index = state.auction?.index as number;
    // 방장이 시간 넘김인 척 참가자 자리에 별빛 전부를 건 봉투를 넣는다(자리 재료 소금은 방장이 안다).
    const forged = {
      type: "bid",
      hash: bidCommitment(
        index,
        state.cash[seat] as number,
        bidSalt(state.keys[seat] as string, index),
      ),
      late: true,
    } as Action;
    expect(injectFromHost(room, seat, forged)).toBe(true);
    room.guestDevice.hold = null;
    await play(room, () => hostState(room)?.phase === "bidReveal");
    for (let i = 0; i < 20; i++) {
      room.guestDevice.act();
      await flush();
    }
    // 참가자 기기는 「내지 않음」이 아닌 대신 낸 봉투를 제 것으로 받지 않는다.
    expect(hostState(room)?.auction?.reveals[seat]).toBeNull();
    const audits = await resignAndAudit(room);
    expect(audits[0]?.ok).toBe(false);
    expect(audits[0]?.ok === false && audits[0].reason).toContain(
      "정해진 대신 두기와 다르다",
    );
  });

  it("방장이 꼬리표를 달아 참가자 굴리기 차례에 다른 행동(맡기기)을 넣으면 판 끝 검증이 잡는다", async () => {
    const room = await setup();
    const { seat } = room;
    room.guestDevice.hold = (view) => view.decision?.kind === "roll";
    await play(
      room,
      () => room.guest.match?.current().decision?.kind === "roll",
    );
    const state = hostState(room) as NonNullable<ReturnType<typeof hostState>>;
    const square = state.owners.findIndex(
      (o, sq) => o === seat && !state.mortgaged[sq],
    );
    expect(square).toBeGreaterThan(-1);
    expect(
      injectFromHost(room, seat, {
        type: "mortgage",
        square,
        late: true,
      } as Action),
    ).toBe(true);
    expect(hostState(room)?.mortgaged[square]).toBe(true);
    room.guestDevice.hold = null;
    const audits = await resignAndAudit(room);
    expect(audits[0]?.ok).toBe(false);
    expect(audits[0]?.ok === false && audits[0].reason).toContain(
      "정해진 대신 두기와 다르다",
    );
  });

  it("방장이 꼬리표를 달아 컴퓨터 자리를 두면 판 끝 검증이 잡는다", () => {
    const board = boardOfSky("seasons");
    const before = createGalaxyScenario({ board, rules: ROOM_RULES });
    const late = { type: "roll", late: true } as Action;
    expect(verifyLate(before, 0, late)).toBeNull();
    expect(verifyLate(before, 0, late, new Set([0]))).toContain("컴퓨터 자리");
    expect(verifyLate(before, 1, late)).toContain("정할 때가 아닌");
  });

  it("개인 시간: 굴리기에 쓴 시간을 깎고, 공개·봉투를 기다리는 시간은 재지 않는다", async () => {
    const room = await setup({ ...ROOM_RULES, time: "fast" });
    const { seat } = room;
    const guestClock = () => hostState(room)?.clocks?.[seat];
    await play(
      room,
      () => room.guest.match?.current().decision?.kind === "roll",
    );
    const before = guestClock()?.main as number;
    room.clock.advance(5_000);
    room.guestDevice.act();
    await until(() => guestClock()?.main === before - 5_000);
    // 방장 기기가 공개를 미루는 동안 시간이 지나도 참가자 시계는 그대로다.
    room.hostDevice.hold = (view) => view.decision?.kind === "reveal";
    await play(room, () => {
      const v = hostView(room);
      return v?.phase === "reveal" && v.reveals[seat] !== null;
    });
    room.clock.advance(60_000);
    await flush();
    expect(guestClock()?.main).toBe(before - 5_000);
    expect(hostView(room)?.result).toBeNull();
  });
});
