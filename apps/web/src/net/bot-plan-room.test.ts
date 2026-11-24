// @vitest-environment node

import { ManualClock } from "@game/fair-play";
import { beginnerBot, heuristicBot, intermediateBot } from "@game/mighty-ai";
import { type Action, presetRules } from "@game/mighty-engine";
import { beforeEach, describe, expect, it } from "vitest";

import { MIGHTY_BOT_PLAN } from "@/game/bots";
import { type MightyKit, mightyKit } from "@/game/mighty-kit";

import { type AuditResult, GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import type { AuditReport, HostMessage } from "./protocol";
import { roomRandom } from "./room-random-fixture";
import { MemoryNetwork } from "./transport";

/**
 * 컴퓨터 계획 판 번호(net/bot-plan.ts)를 온라인 방에서 본다. 배포 직후 옛 화면 방장과 새 화면 손님이 한 방에 있으면
 * 정직한 방장의 컴퓨터 수도 손님 컴퓨터와 다르게 나온다. 그때 부정으로 짚지 않고, 번호를 속여도 숨지 못한다
 */

let clock = new ManualClock();
beforeEach(() => {
  clock = new ManualClock();
});

const rules = presetRules("standard5");
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

/** 컴퓨터 판 번호가 `plan`인 마이티(없으면 번호를 싣기 전 화면처럼 1) */
const kitWithPlan = (plan?: number): MightyKit => {
  const { botPlan: _drop, ...rest } = mightyKit;
  return plan === undefined ? rest : { ...rest, botPlan: plan };
};

/** 판을 정하는 씨앗. 첫 판에 카드를 내고, 컴퓨터를 조종할 곳(고를 카드가 둘 이상인 수)이 생긴다 */
const random = roomRandom("bot-plan");

/** 방장 하나·참가자 하나·컴퓨터 셋(중수) */
async function botRoom(options: {
  hostKit: MightyKit;
  guestKit?: MightyKit;
  /** 방장이 방 상태에서 번호를 빼고 보낸다(번호를 싣기 전 화면의 방장) */
  dropPlan?: boolean;
  /**
   * 방장 기기의 중수 컴퓨터(없으면 지금 중수). 판이 다른 화면의 중수는 같은 화면에서도 다른 수를 둘 수 있다.
   * 시험은 입문 컴퓨터로 그 「다른 판의 중수」를 흉내 낸다
   */
  hostBot?: typeof intermediateBot;
}) {
  const net = new MemoryNetwork();
  const host = new HostRoom({
    kit: options.hostKit,
    transport: net.join("host"),
    clock,
    hostName: "방장",
    rules,
    revealTimeoutMs: 300,
    bot: options.hostBot ?? intermediateBot,
    botLevel: 1,
    testRandom: random.host,
  });
  if (options.dropPlan) {
    const send = host.transport.send.bind(host.transport);
    host.transport.send = (message, to) => {
      const m = message as HostMessage;
      if (m.t === "lobby") {
        const { botPlan: _drop, ...lobby } = m.lobby;
        send({ ...m, lobby }, to);
      } else send(message, to);
    };
  }
  const hostFingerprint = await host.fingerprint();
  const a = new GuestRoom({
    kit: options.guestKit ?? mightyKit,
    transport: net.join("a"),
    clock,
    name: "철수",
    token: null,
    hostFingerprint,
    testRandom: random.guest(0),
  });
  await until(() => a.seat !== null && a.lobby?.botLevel === 1);
  const audits: AuditResult[] = [];
  a.on("audit", (r) => audits.push(r));
  const reports: AuditReport[] = [];
  host.onReport((r) => reports.push(r));
  return { host, a, audits, reports };
}

/** 첫 판이 끝날 때까지 둔다(모두 포기해 다시 나누면 그 판도 센다) */
async function playRound(host: HostRoom, guest: GuestRoom) {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  for (let i = 0; i < 4000 && match.current().roundNumber <= 1; i++) {
    const hv = match.current();
    if (hv.decision) match.submit(heuristicBot.decide(hv, { seed: i }));
    const gv = guest.match?.current();
    if (gv?.decision) guest.match?.submit(heuristicBot.decide(gv, { seed: i }));
    await flush();
  }
}

/** 방장 기기의 컴퓨터를 알린 중수와 다르게 두는 것으로 바꾼다(고를 카드가 둘 이상이면 늘 다른 카드). 바꾼 수를 센다 */
function rigBots(host: HostRoom): { count: number } {
  const rigs = { count: 0 };
  (host.match as unknown as { bot: unknown }).bot = {
    name: "rigged",
    decide(
      view: Parameters<typeof intermediateBot.decide>[0],
      rng: { seed: number },
    ): Action {
      const action = intermediateBot.decide(view, rng);
      const d = view.decision;
      if (action.type === "play" && d?.kind === "play") {
        const other = d.cards.find((c) => c !== action.card && c !== "JK");
        if (other) {
          rigs.count++;
          return { type: "play", card: other };
        }
      }
      return action;
    },
  };
  return rigs;
}

async function finish(host: HostRoom, audits: AuditResult[]) {
  host.finish();
  await until(() => audits.length === 1);
  return audits[0];
}

describe("컴퓨터 계획 판 번호가 같으면", () => {
  it("방장은 방 상태에 단계와 번호를 싣는다", async () => {
    const { a } = await botRoom({ hostKit: mightyKit });
    expect({ level: a.lobby?.botLevel, plan: a.lobby?.botPlan }).toEqual({
      level: 1,
      plan: MIGHTY_BOT_PLAN,
    });
  });

  it("방장이 번호를 맞게 알리고 컴퓨터를 조종하면 잡힌다", async () => {
    const { host, a, audits } = await botRoom({ hostKit: mightyKit });
    await host.start();
    await until(() => a.match !== null);
    const rigs = rigBots(host);
    await playRound(host, a);
    expect(rigs.count).toBeGreaterThan(0);
    expect(await finish(host, audits)).toEqual({
      ok: false,
      reason: expect.stringContaining("컴퓨터가 둘 수와 달라요"),
    });
  });
});

describe("컴퓨터 계획 판 번호가 다르면", () => {
  it("내 화면이 옛 판이면 정직한 방장의 컴퓨터 수를 부정으로 짚지 않고 확인 못 함으로 알린다", async () => {
    const { host, a, audits, reports } = await botRoom({
      hostKit: kitWithPlan(MIGHTY_BOT_PLAN + 1),
      hostBot: beginnerBot,
    });
    await host.start();
    await until(() => a.match !== null);
    await playRound(host, a);
    const unchecked = `방장 화면의 컴퓨터가 내 화면보다 새 판(${MIGHTY_BOT_PLAN + 1}, 내 화면 ${MIGHTY_BOT_PLAN})이라 컴퓨터 수는 확인하지 못했어요. 새로고침하면 다음 게임부터 확인해요.`;
    expect(await finish(host, audits)).toEqual({ ok: true, unchecked });
    // 다른 사람에게 알리는 결과에도 「확인 못 함」이 실린다(숨기지 않는다).
    await until(() => reports.length === 1);
    expect(reports[0]).toMatchObject({ ok: true, unchecked });
  });

  it("번호 없는 옛 방장이면 새 번호 손님은 확인 못 함, 번호 1 손님은 지금처럼 맞춰 본다", async () => {
    // 지금 마이티는 번호 2라 번호 없는 방장(1)의 컴퓨터 수는 확인하지 못한다.
    const late = await botRoom({
      hostKit: kitWithPlan(),
      dropPlan: true,
      hostBot: beginnerBot,
    });
    expect(late.a.lobby?.botPlan).toBeUndefined();
    await late.host.start();
    await until(() => late.a.match !== null);
    await playRound(late.host, late.a);
    expect(await finish(late.host, late.audits)).toEqual({
      ok: true,
      unchecked: expect.stringContaining("옛 판(1, 내 화면 2)"),
    });
    // 번호 1인 손님(컴퓨터를 바꾸지 않은 게임과 같다)은 번호 없는 방장의 컴퓨터를 조종하면 잡는다.
    const same = await botRoom({
      hostKit: kitWithPlan(),
      guestKit: kitWithPlan(),
      dropPlan: true,
    });
    await same.host.start();
    await until(() => same.a.match !== null);
    const rigs = rigBots(same.host);
    await playRound(same.host, same.a);
    expect(rigs.count).toBeGreaterThan(0);
    expect((await finish(same.host, same.audits))?.ok).toBe(false);
  });

  it("번호 속임: 번호를 바꿔 알리고 컴퓨터를 조종하면 잡히지는 않지만 확인 못 함으로 드러나고, 내 수 바꿔치기는 그대로 잡힌다", async () => {
    const liar = await botRoom({ hostKit: kitWithPlan(MIGHTY_BOT_PLAN + 7) });
    await liar.host.start();
    await until(() => liar.a.match !== null);
    const rigs = rigBots(liar.host);
    await playRound(liar.host, liar.a);
    expect(rigs.count).toBeGreaterThan(0);
    expect(await finish(liar.host, liar.audits)).toEqual({
      ok: true,
      unchecked: expect.stringContaining("컴퓨터 수는 확인하지 못했어요."),
    });

    // 번호는 컴퓨터 수를 맞춰 볼지에만 쓰인다: 참가자가 낸 카드를 바꿔 넣으면 번호가 달라도 잡힌다(모의 침투 A3).
    const swap = await botRoom({ hostKit: kitWithPlan(MIGHTY_BOT_PLAN + 7) });
    await swap.host.start();
    await until(() => swap.a.match !== null);
    const match = swap.host.match;
    if (!match) throw new Error("시작하지 않았다");
    let swapped = false;
    const original = match.submitAs.bind(match);
    match.submitAs = (seat: number, action: Action) => {
      if (!swapped && seat === swap.a.seat && action.type === "play") {
        const view = match.viewFor(seat);
        const other =
          view.decision?.kind === "play"
            ? view.decision.cards.find((c) => c !== action.card)
            : undefined;
        if (other) {
          swapped = true;
          return original(seat, { type: "play", card: other });
        }
      }
      return original(seat, action);
    };
    await playRound(swap.host, swap.a);
    expect(swapped).toBe(true);
    expect((await finish(swap.host, swap.audits))?.ok).toBe(false);
  });
});
