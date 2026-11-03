// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import {
  type Action,
  type GameEvent,
  type OnecardRules,
  type OnecardState,
  type OnecardView,
  STANDARD_ONECARD_RULES,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import type { ClaimsResolved } from "@/net/claim";
import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork, type Transport } from "@/net/transport";

import { onecardBotFor, toKitBot } from "./bots";
import { type OnecardExtra, onecardKit } from "./kit";

/**
 * 원카드 일반방(방장 시드): 방장 기기가 엔진·창 시계를 돌리고, "원카드!"는 청구 통로(`room.claims`)로 모두에게
 * 직접 간다. 시간은 `ManualClock`이라 창(P·T)과 청구 묶음 창이 시험이 옮길 때만 지난다.
 */

type Host = HostRoom<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardExtra
>;
type Guest = GuestRoom<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardExtra
>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 시계를 조금씩 옮기며 기다린다(입장·시작처럼 암호 계산이 낀 절차) */
async function pump(clock: ManualClock, condition: () => boolean) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 30_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    clock.advance(1);
    await flush();
  }
}

async function tick(clock: ManualClock, ms: number) {
  clock.advance(ms);
  await flush();
  await flush();
}

/** 청구가 망을 건너 방장에게 닿은 뒤 묶음 창(100ms)을 지나 발표가 모두에게 닿을 때까지 */
async function settleClaims(clock: ManualClock) {
  await flush();
  await tick(clock, 150);
  await tick(clock, 1);
}

/** 낼 수 있는 첫 카드를 내고 없으면 먹는다(컴퓨터 단계가 바뀌어도 시험 흐름이 같게) */
const firstMove = (view: OnecardView): Action =>
  view.moves.find((a) => a.type === "play") ?? { type: "draw" };

async function setup(
  players: number,
  hostTransport: (t: Transport) => Transport = (t) => t,
  /** 사람 수(나머지는 컴퓨터)와 컴퓨터 단계 */
  extra: { humans?: number; botLevel?: number } = {},
) {
  const clock = new ManualClock();
  const net = new MemoryNetwork();
  const rules: OnecardRules = {
    ...STANDARD_ONECARD_RULES,
    players,
    handSize: 5,
    endOnFirst: true,
  };
  const host: Host = new HostRoom({
    kit: onecardKit,
    transport: hostTransport(net.join("host")),
    clock,
    hostName: "방장",
    secret: "onecard-host-1",
    rules,
    revealTimeoutMs: 600_000,
    standInDelayMs: 600_000,
    ...(extra.botLevel !== undefined
      ? {
          bot: toKitBot(onecardBotFor(extra.botLevel), clock),
          botLevel: extra.botLevel,
        }
      : {}),
  });
  const guests: Guest[] = [];
  const humans = extra.humans ?? players;
  for (let i = 1; i < humans; i++) {
    const g: Guest = new GuestRoom({
      kit: onecardKit,
      transport: net.join(`g${i}`),
      clock,
      name: `손님${i}`,
      secret: `onecard-guest-${i}`,
      token: null,
    });
    await pump(clock, () => g.seat !== null);
    guests.push(g);
  }
  await pump(clock, () =>
    guests.every((g) => g.lobby?.seats.length === players),
  );
  const started = host.start();
  await pump(clock, () => guests.every((g) => g.match !== null));
  await started;
  const troubles: string[] = [];
  host.onIncident((n) => troubles.push(`host ${n.reason}`));
  for (const g of guests) {
    g.on("incident", (n) => troubles.push(`g${g.seat} ${n.reason}`));
    g.on("rejected", (e) => troubles.push(`g${g.seat} rejected ${e}`));
  }
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  return { clock, net, host, guests, match, troubles };
}

describe("원카드 일반방", () => {
  it("한 판: 참가자는 청구로 미리 외치고, 방장은 늦게 본 판을 가리킨 청구로 잊은 참가자를 잡으며, 판 끝 검증을 통과한다", async () => {
    const { clock, host, guests, match, troubles } = await setup(2);
    const guest = guests[0] as Guest;
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));
    const resolved: ClaimsResolved[] = [];
    guest.claims?.onResolved((r) => resolved.push(r));

    // 방장은 손패가 많을 때만 내고 나머지는 먹어(파산하지 않게), 참가자가 두 장·한 장을 지나 다 내게 한다.
    const hostMove = (hv: OnecardView): Action =>
      hv.hand.length > 10 ? firstMove(hv) : { type: "draw" };
    let preCalled = false;
    let caught = false;
    for (let i = 0; i < 400; i++) {
      const state = match.rawState();
      if (state.phase === "over") break;
      const gv = guest.match?.current();
      if (!gv) throw new Error("참가자 화면이 없다");
      const window = state.windows.find((w) => w.seat === 1);
      if (
        caught &&
        !preCalled &&
        gv.decision === "turn" &&
        gv.hand.length === 2 &&
        gv.turnNo === state.turnNo
      ) {
        // (잡혀서 두 장이 된 뒤) 참가자: 두 장일 때 더미를 친다 → 청구가 모두에게 가고, 방장 발표 뒤 엔진이 "미리 외침"으로 판정한다.
        expect(guest.claims?.claim({}, { seen: gv.turnNo })).not.toBeNull();
        await settleClaims(clock);
        expect(match.rawState().preCalled[1]).toBe(true);
        preCalled = true;
        continue;
      }
      if (!caught && window?.kind === "self") {
        // 참가자가 외치지 않고 한 장이 됐다: 본인 시간이 지나면 방장 시계가 잡기 창으로 바꾼다.
        await tick(clock, state.rules.selfWindowMs + 1);
        expect(match.rawState().windows.find((w) => w.seat === 1)?.kind).toBe(
          "catch",
        );
        continue;
      }
      if (!caught && window?.kind === "catch") {
        const seen = state.turnNo;
        // 방장이 한 수 둔 뒤(판 번호가 오른 뒤) 앞 판을 보고 친 청구가 닿는다: 그 판 기준으로 잡기다.
        const hv = match.current();
        if (hv.decision === "turn") {
          match.submit({ type: "draw" });
          await tick(clock, 1);
        }
        if (match.rawState().phase === "over") break;
        const before = match.rawState().hands[1]?.length ?? 0;
        expect(host.claims?.claim({}, { seen })).not.toBeNull();
        await settleClaims(clock);
        expect(match.rawState().hands[1]?.length).toBe(before + 1);
        caught = true;
        continue;
      }
      const hv = match.current();
      if (hv.decision === "turn") match.submit(hostMove(hv));
      else if (gv.decision === "turn") guest.match?.submit(firstMove(gv));
      await tick(clock, 50);
    }
    // 비밀 값을 정해 둔 판이라 늘 같다: 두 장면이 다 나왔다.
    expect(preCalled).toBe(true);
    expect(caught).toBe(true);
    // 기록에는 청구 원문(누가·어느 판)만 남는다. 판정은 판 끝 다시 계산에서 엔진이 다시 한다.
    const claimEntries = match
      .actionLog()
      .filter((e) => e.action.type === "claims");
    expect(claimEntries.length).toBeGreaterThanOrEqual(2);
    expect(claimEntries.every((e) => e.seat === 0)).toBe(true);
    expect(resolved.length).toBe(claimEntries.length);
    host.finish();
    await pump(clock, () => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
    expect(troubles).toEqual([]);
  });

  it("참가자는 외침을 행동으로 보내지 못한다(청구 통로로만)", async () => {
    const { clock, guests, troubles } = await setup(2);
    const guest = guests[0] as Guest;
    const seen = guest.match?.current().turnNo ?? 0;
    const sent = guest.match?.submit({ type: "shout", seen });
    await tick(clock, 10);
    expect(
      sent?.ok === false || troubles.some((t) => t.includes("rejected")),
    ).toBe(true);
  });

  it("방장이 참가자 청구를 빼고 발표하면 다른 참가자가 이의를 낸다", async () => {
    // 방장 기기가 발표에서 1번 자리의 청구를 뺀다
    const omitSeat1 = (t: Transport): Transport => ({
      ...t,
      send: (message, to) => {
        const m = message as Partial<ClaimsResolved>;
        t.send(
          m.kind === "claims-resolved"
            ? {
                ...m,
                entries: (m.entries ?? []).filter((e) => e.claim.seat !== 1),
              }
            : message,
          to,
        );
      },
    });
    const { clock, guests, troubles } = await setup(3, omitSeat1);
    const [a] = guests as [Guest, Guest];
    a.claims?.claim({});
    await settleClaims(clock);
    expect(troubles).toEqual([]);
    await tick(clock, 5_000);
    const omitted = "방장이 1번 자리의 청구(0번 판)를 발표하지 않았다";
    expect(troubles).toContain(`g2 ${omitted}`);
    expect(troubles).toContain(`g1 ${omitted}`);
  });

  it("고수 컴퓨터 자리(기억을 쓴다)가 낀 판도 참가자가 같은 사건을 들려주며 컴퓨터 수를 다시 세어 통과한다", async () => {
    const { clock, host, guests, match, troubles } = await setup(3, (t) => t, {
      humans: 2,
      botLevel: 2,
    });
    const guest = guests[0] as Guest;
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));
    for (let i = 0; i < 600; i++) {
      if (match.rawState().phase === "over") break;
      const hv = match.current();
      const gv = guest.match?.current();
      if (hv.decision === "turn") match.submit(firstMove(hv));
      else if (gv?.decision === "turn") guest.match?.submit(firstMove(gv));
      // 컴퓨터의 외침·잡기와 창 시간 끝이 시계로 돈다
      await tick(clock, 200);
    }
    expect(match.rawState().phase).toBe("over");
    expect(
      match.actionLog().filter((e) => e.seat === 2 && e.bot).length,
    ).toBeGreaterThan(0);
    host.finish();
    await pump(clock, () => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
    expect(troubles).toEqual([]);
  });
});

describe("원카드 일반방: 방장이 기록 속 외침을 고치면 판 끝 검증이 짚는다", () => {
  /** 몇 수 둔 뒤 `tamper`로 방장 기기를 고쳐 쓰고, 방장이 나가 기록을 공개하면 참가자 검증이 어떻게 되나 */
  async function audited(
    tamper: (ctx: Awaited<ReturnType<typeof setup>>) => Promise<void>,
  ): Promise<AuditResult> {
    const ctx = await setup(2);
    const { clock, host, guests, match } = ctx;
    const guest = guests[0] as Guest;
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));
    for (let moves = 0; moves < 4; ) {
      const hv = match.current();
      const gv = guest.match?.current();
      if (hv.decision === "turn") match.submit(firstMove(hv));
      else if (gv?.decision === "turn") guest.match?.submit(firstMove(gv));
      else throw new Error("둘 사람이 없다");
      moves++;
      await tick(clock, 1);
    }
    await tamper(ctx);
    host.finish();
    await pump(clock, () => audits.length === 1);
    return audits[0] as AuditResult;
  }

  it("정직한 방장: 청구가 낀 판도 통과한다", async () => {
    const result = await audited(async ({ clock, guests }) => {
      (guests[0] as Guest).claims?.claim({});
      await settleClaims(clock);
    });
    expect(result).toEqual({ ok: true });
  });

  it("사람 자리의 외침을 지어내 기록에 넣으면(청구 없이) 짚는다", async () => {
    const result = await audited(async ({ clock, match }) => {
      // 고친 방장 기기: 참가자 1의 손패가 여러 장일 때 그 자리로 외침을 넣어 헛외침 벌칙을 먹인다
      expect(
        match.submitAs(1, { type: "shout", seen: match.rawState().turnNo }).ok,
      ).toBe(true);
      await tick(clock, 1);
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toContain("청구 통로를 거치지 않고");
  });

  it("발표하지 않은 청구 묶음을 기록에 넣으면 짚는다", async () => {
    const result = await audited(async ({ clock, match }) => {
      const seen = match.rawState().turnNo;
      match.submitHost(0, {
        type: "claims",
        batch: 0,
        shouts: [{ seat: 1, seen, id: "fake" }],
      });
      await tick(clock, 1);
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("없던 청구");
  });

  it("발표는 바르게 하고 기록 속 청구 내용만 바꾸면(같은 개수, seen만 다르게) 짚는다", async () => {
    const result = await audited(async ({ clock, host, guests, match }) => {
      // 고친 방장 기기: 발표는 그대로 보내고, 엔진에는 같은 자리·아이디로 seen만 한 판 앞으로 바꿔 넣는다
      (
        host.claims as unknown as {
          options: { apply?: (r: ClaimsResolved) => void };
        }
      ).options.apply = (resolved) => {
        const action = onecardKit.claims?.action(resolved) as Action | null;
        if (action?.type !== "claims") return;
        match.submitHost(0, {
          ...action,
          shouts: action.shouts.map((s) => ({ ...s, seen: s.seen - 1 })),
        });
      };
      const seen = match.rawState().turnNo;
      expect(seen).toBeGreaterThan(0);
      (guests[0] as Guest).claims?.claim({}, { seen });
      await settleClaims(clock);
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("방장 발표와 다르다");
  });

  /** 참가자가 방장과 끊겼다 다시 이어질 때까지 */
  async function dropAndReturn(
    ctx: Awaited<ReturnType<typeof setup>>,
    meanwhile: () => Promise<void>,
  ) {
    const { clock, net, guests } = ctx;
    const guest = guests[0] as Guest;
    const states: string[] = [];
    const off = guest.on("connection", (s) => states.push(s));
    net.disconnect("g1");
    await pump(clock, () => states.includes("reconnecting"));
    await meanwhile();
    net.reconnect("g1");
    await pump(clock, () => states.includes("connected"));
    off();
  }

  it("정직한 방장: 끊긴 동안 받지 못한 발표의 청구가 기록에 있어도 통과한다", async () => {
    const result = await audited(async (ctx) => {
      const { clock, host, guests, match } = ctx;
      await dropAndReturn(ctx, async () => {
        // 끊긴 동안 방장이 친 청구: 발표가 참가자에게 가지 못한다
        host.claims?.claim({});
        await settleClaims(clock);
        expect(
          match.actionLog().filter((e) => e.action.type === "claims"),
        ).toHaveLength(1);
      });
      // 다시 이어진 뒤의 청구는 받아 맞춰 본다
      (guests[0] as Guest).claims?.claim({});
      await settleClaims(clock);
    });
    expect(result).toEqual({ ok: true });
  });

  it("끊긴 적이 있어도 끊긴 구간 밖에 지어낸 청구를 넣으면 짚는다", async () => {
    const result = await audited(async (ctx) => {
      const { clock, host, guests, match } = ctx;
      await dropAndReturn(ctx, async () => {
        host.claims?.claim({});
        await settleClaims(clock);
      });
      // 다시 이어진 뒤 받은 첫 발표가 끊긴 구간을 닫는다
      (guests[0] as Guest).claims?.claim({});
      await settleClaims(clock);
      // 고친 방장 기기: 그 뒤에 발표하지 않은 청구 묶음을 넣는다
      match.submitHost(0, {
        type: "claims",
        batch: 9,
        shouts: [{ seat: 1, seen: match.rawState().turnNo, id: "fake" }],
      });
      await tick(clock, 1);
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("끊긴 구간 밖");
  });

  it("발표는 바르게 하고 기록에서 청구를 빼면 짚는다", async () => {
    const result = await audited(async ({ clock, host, guests }) => {
      // 고친 방장 기기: 발표는 보내되 엔진에는 넣지 않는다
      (
        host.claims as unknown as { options: { apply?: unknown } }
      ).options.apply = () => {};
      (guests[0] as Guest).claims?.claim({});
      await settleClaims(clock);
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.reason).toContain("빠졌다");
  });
});
