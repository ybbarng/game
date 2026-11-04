import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import type { KitClaims } from "@/game/kit";
import type { ClaimMessage, ClaimsResolved } from "./claim";
import { ClaimHub, RACE_PING_MS } from "./claim-hub";
import {
  allowedRt,
  MAX_LATENCY_CREDIT_MS,
  type RaceItem,
  raceArrange,
} from "./claim-race";
import { DelayedNetwork, type DelayFn } from "./delayed-network";
import type { Transport } from "./transport";

/**
 * 2층(반응 시간 겨루기) 청구 통로(docs/43 7-2). 화면은 판 번호 하나(number). 판마다 한 장인 사람(본인)은 늘 2번 자리.
 * 판을 받는 시각은 시험이 기기마다 정한다(`showAt`). 누름에서 청구를 보내기까지는 `SEND`ms(누르고 있기 확인)다.
 */

const SEND = 150;
const OWNER = 2;

const spec: KitClaims<
  number,
  null,
  Record<string, never>,
  { ones: number[] }
> = {
  stimulusOf: (view) => view,
  board: () => ({ ones: [OWNER] }),
  isBody: (b): b is Record<string, never> =>
    typeof b === "object" && b !== null && Object.keys(b).length === 0,
  judge: () => "shout",
  action: () => null,
  recorded: () => false,
  rules: { windowMs: 100, staleBoards: 2, graceMs: 5_000 },
  race: {
    isOwner: (board, claim) => board.ones.includes(claim.seat),
    floorMs: 100,
    tieMs: 10,
    sendDelayMs: SEND,
  },
};

const seats: Record<string, number> = { host: 0, g1: 1, g2: 2 };
type Id = "host" | "g1" | "g2";

/** 한 방향 지연(ms): 방장↔g1 60, 방장↔g2 10, g1↔g2 50 */
const BASE: DelayFn = (from, to) => {
  const pair = [from, to].sort().join("-");
  return pair === "g1-host" ? 60 : pair === "g2-host" ? 10 : 50;
};

function setup(
  options: {
    delay?: DelayFn;
    tamper?: (r: ClaimsResolved) => ClaimsResolved;
    /** 이 기기는 핑 답만 늦춘다(망이 느린 척) */
    slowPong?: { id: Id; ms: number };
  } = {},
) {
  const clock = new ManualClock();
  const net = new DelayedNetwork(clock, options.delay ?? BASE);
  const objections: string[] = [];
  const resolved: ClaimsResolved[] = [];
  const hub = (id: Id) => {
    const raw = net.join(id);
    let transport: Transport = raw;
    if (id === "host" && options.tamper) {
      const tamper = options.tamper;
      transport = {
        ...raw,
        send: (m, to) =>
          raw.send(
            (m as { kind?: unknown }).kind === "claims-resolved"
              ? tamper(m as ClaimsResolved)
              : m,
            to,
          ),
      };
    }
    if (options.slowPong?.id === id) {
      const ms = options.slowPong.ms;
      transport = {
        ...raw,
        send: (m, to) => {
          if ((m as { kind?: unknown }).kind === "claim-pong")
            clock.after(ms, () => raw.send(m, to));
          else raw.send(m, to);
        },
      };
    }
    let n = 0;
    return new ClaimHub<number>({
      transport,
      game: "race",
      spec,
      role: id === "host" ? "host" : "guest",
      clock,
      mySeat: () => seats[id] ?? null,
      seatOfPeer: (peer) => seats[peer] ?? null,
      object: (seat, reason) => objections.push(`${id}:${seat}:${reason}`),
      newId: () => `${id}x${n++}`,
    });
  };
  const hubs = { host: hub("host"), g1: hub("g1"), g2: hub("g2") };
  hubs.host.onResolved((r) => resolved.push(r));
  for (const h of Object.values(hubs)) h.observe(0);
  /** 방장이 판을 낸 시각 기준으로 각 기기가 그 판을 받는(그리는) 때에 `observe` */
  const showAt = (board: number) => {
    hubs.host.observe(board);
    for (const id of ["g1", "g2"] as const) {
      const d = (options.delay ?? BASE)("host", id, 0, null);
      clock.after(d, () => hubs[id].observe(board));
    }
  };
  /** `id`가 판을 그린 뒤 rt에 누르고, 누르고 있기 확인 뒤 청구를 보낸다(지금이 그 기기가 판을 그린 때여야 한다) */
  const pressAt = (id: Id, board: number, rt: number, report = rt) => {
    clock.after(rt + SEND, () =>
      hubs[id].claim({}, { seen: board, rtMs: report }),
    );
  };
  const out = { clock, hubs, objections, resolved, showAt, pressAt };
  lastSetup = out;
  return out;
}

/** 함께 뽑기(해시)는 실제 비동기라 조건이 맞을 때까지 기다린다(시간 상한은 멈춤 막기용) */
let lastSetup: ReturnType<typeof setup> | null = null;
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !cond(); i++)
    await new Promise((r) => setTimeout(r, 1));
  expect(
    cond(),
    JSON.stringify({
      objections: lastSetup?.objections,
      resolved: lastSetup?.resolved,
    }),
  ).toBe(true);
}

/** 핑을 몇 번 돌려 왕복을 잰다 */
function warmUp(clock: ManualClock) {
  clock.advance(RACE_PING_MS * 3 + 1000);
}

/** 판 1을 내고, 기기마다 그 판을 받은 시각에 누름을 건다 */
function race(
  t: ReturnType<typeof setup>,
  presses: { id: Id; rt: number; report?: number }[],
  delay: DelayFn = BASE,
) {
  t.showAt(1);
  for (const p of presses) {
    const d = p.id === "host" ? 0 : delay("host", p.id, 0, null);
    t.clock.after(d, () => t.pressAt(p.id, 1, p.rt, p.report));
  }
}

const order = (r: ClaimsResolved | undefined) =>
  r?.entries.map((e) => e.claim.seat) ?? [];

describe("allowedRt: 인정 반응 시간", () => {
  it("하한 아래 보고는 100ms로 인정한다", () => {
    expect(
      allowedRt({
        rtMs: 30,
        elapsedMs: null,
        rttMinMs: null,
        spec: { floorMs: 100, sendDelayMs: SEND },
      }),
    ).toBe(100);
  });

  it(`왕복 최소를 보정 상한 C(${MAX_LATENCY_CREDIT_MS}ms)로 자른다: 부풀린 400ms 대신 150ms로 경계`, () => {
    // 판 받기 60 + 실제 반응 300 + 보냄 150 + 청구 60 = 570, 보고는 10
    const input = {
      rtMs: 10,
      elapsedMs: 570,
      spec: { floorMs: 100, sendDelayMs: SEND },
    };
    expect(allowedRt({ ...input, rttMinMs: 400 })).toBe(570 - 150 - 150 - 50);
    expect(allowedRt({ ...input, rttMinMs: 120 })).toBe(570 - 150 - 120 - 50);
  });
});

describe("ClaimHub 2층: 반응 시간 겨루기", () => {
  it("지연이 큰 손님이라도 rt가 더 짧으면 지연이 없는 방장을 이긴다(도착은 방장이 먼저)", async () => {
    const t = setup();
    warmUp(t.clock);
    expect(t.hubs.host.rttOf("g1")?.min).toBe(120);
    race(t, [
      { id: "host", rt: 250 },
      { id: "g1", rt: 200 },
    ]);
    t.clock.advance(1000);
    await until(() => t.resolved.length === 1);
    expect(order(t.resolved[0])).toEqual([1, 0]);
    expect(t.resolved[0]?.race?.rt).toEqual([200, 250]);
    t.clock.advance(6000);
    await new Promise((r) => setTimeout(r, 5));
    expect(t.objections).toEqual([]);
  });

  it("모으는 시간은 방장 시계로 잰다: 첫 청구 뒤 (최근 왕복 최대 + 여유)가 지나야 발표한다", async () => {
    const t = setup();
    warmUp(t.clock);
    t.showAt(1);
    t.hubs.host.claim({}, { seen: 1, rtMs: 300 });
    t.clock.advance(120 + 80 - 1);
    await new Promise((r) => setTimeout(r, 2));
    expect(t.resolved).toHaveLength(0);
    t.clock.advance(1);
    await until(() => t.resolved.length === 1);
  });

  it("경계를 어긴 청구는 버리지 않고 깎는다. 핑 답을 400ms 늦춘 손님도 상한 C로 경계를 잡는다", async () => {
    const t = setup({ slowPong: { id: "g1", ms: 400 } });
    warmUp(t.clock);
    expect(t.hubs.host.rttOf("g1")?.min).toBe(520);
    // 실제로는 300ms에 눌렀지만 10ms로 보고
    race(t, [{ id: "g1", rt: 300, report: 10 }]);
    t.clock.advance(1500);
    await until(() => t.resolved.length === 1);
    expect(t.resolved[0]?.race?.rt).toEqual([570 - 150 - 150 - 50]);
  });

  it("본인 rt 30 vs 잡는 사람 rt 20 → 둘 다 100ms로 동점, 본인이 이긴다", async () => {
    const t = setup();
    warmUp(t.clock);
    race(t, [
      { id: "g1", rt: 20 },
      { id: "g2", rt: 30 },
    ]);
    t.clock.advance(1000);
    await until(() => t.resolved.length === 1);
    expect(order(t.resolved[0])).toEqual([OWNER, 1]);
    expect(t.resolved[0]?.race?.rt).toEqual([100, 100]);
    t.clock.advance(6000);
    await new Promise((r) => setTimeout(r, 5));
    expect(t.objections).toEqual([]);
  });

  it("본인 300 vs 잡는 사람 150 → 잡는 사람이 앞(잡힘)", async () => {
    const t = setup();
    warmUp(t.clock);
    race(t, [
      { id: "g2", rt: 300 },
      { id: "g1", rt: 150 },
    ]);
    t.clock.advance(1000);
    await until(() => t.resolved.length === 1);
    expect(order(t.resolved[0])).toEqual([1, OWNER]);
  });

  it("잡는 사람 둘이 공정 창 안에서 비기면 함께 뽑기로 가른다(참가자도 같은 순서를 계산한다)", async () => {
    const t = setup();
    warmUp(t.clock);
    race(t, [
      { id: "host", rt: 125 },
      { id: "g1", rt: 120 },
    ]);
    t.clock.advance(1000);
    await until(() => t.resolved.length === 1);
    const r = t.resolved[0] as ClaimsResolved;
    const items: RaceItem[] = r.entries.map((e, i) => ({
      claim: e.claim as ClaimMessage,
      rt: r.race?.rt[i] as number,
      owner: false,
    }));
    const drawn = await raceArrange(items, 10, `b${r.batch}`);
    expect(drawn.map((i) => i.claim.seat)).toEqual(order(r));
    // 뽑기 재료가 다르면(다른 묶음 번호) 결과가 바뀔 수 있다: 같은 재료로는 늘 같다
    expect(
      (await raceArrange([...items].reverse(), 10, `b${r.batch}`)).map(
        (i) => i.claim.seat,
      ),
    ).toEqual(order(r));
    t.clock.advance(6000);
    await new Promise((r2) => setTimeout(r2, 5));
    expect(t.objections).toEqual([]);
  });

  it("방장이 순서를 바꿔 발표하면 참가자가 이의를 낸다", async () => {
    const t = setup({
      tamper: (r) => ({
        ...r,
        entries: [...r.entries].reverse(),
        ...(r.race ? { race: { rt: [...r.race.rt].reverse() } } : {}),
      }),
    });
    warmUp(t.clock);
    race(t, [
      { id: "host", rt: 300 },
      { id: "g1", rt: 200 },
    ]);
    t.clock.advance(1000);
    await until(() => t.resolved.length === 1);
    // 발표는 시계를 감은 뒤(마이크로태스크)에 나가므로 손님에게 닿을 시간을 더 준다
    t.clock.advance(500);
    await until(() =>
      t.objections.some((o) =>
        o.includes("방장 발표의 순서가 반응 시간 겨루기 순서와 다르다"),
      ),
    );
  });

  it("방장이 자기 반응 시간을 줄여 발표하면 참가자가 이의를 낸다", async () => {
    const t = setup({
      tamper: (r) => ({
        ...r,
        ...(r.race
          ? {
              race: {
                rt: r.race.rt.map((rt, i) =>
                  r.entries[i]?.claim.seat === 0 ? 100 : rt,
                ),
              },
            }
          : {}),
      }),
    });
    warmUp(t.clock);
    race(t, [{ id: "host", rt: 600 }]);
    t.clock.advance(1500);
    await until(() => t.resolved.length === 1);
    // 발표는 시계를 감은 뒤(마이크로태스크)에 나가므로 손님에게 닿을 시간을 더 준다
    t.clock.advance(500);
    await until(() =>
      t.objections.includes("g1:0:방장이 자기 반응 시간을 줄여 발표했다"),
    );
  });

  it("방장이 내 반응 시간을 부풀려 발표하면 내가 이의를 낸다", async () => {
    const t = setup({
      tamper: (r) => ({
        ...r,
        ...(r.race
          ? {
              race: {
                rt: r.race.rt.map((rt, i) =>
                  r.entries[i]?.claim.seat === 1 ? rt + 400 : rt,
                ),
              },
            }
          : {}),
      }),
    });
    warmUp(t.clock);
    race(t, [{ id: "g1", rt: 250 }]);
    t.clock.advance(1500);
    await until(() => t.resolved.length === 1);
    // 발표는 시계를 감은 뒤(마이크로태스크)에 나가므로 손님에게 닿을 시간을 더 준다
    t.clock.advance(500);
    await until(() =>
      t.objections.includes("g1:0:방장이 내 반응 시간을 늘려 발표했다"),
    );
    expect(t.objections.some((o) => o.startsWith("g2:"))).toBe(false);
  });

  it("발표에 반응 시간이 없으면(1층 순서로 몰래 돌아가면) 이의", async () => {
    const t = setup({
      tamper: (r) => {
        const { race: _race, ...rest } = r;
        return rest;
      },
    });
    warmUp(t.clock);
    race(t, [{ id: "g1", rt: 250 }]);
    t.clock.advance(1500);
    await until(() => t.resolved.length === 1);
    // 발표는 시계를 감은 뒤(마이크로태스크)에 나가므로 손님에게 닿을 시간을 더 준다
    t.clock.advance(500);
    await until(() =>
      t.objections.includes("g2:0:방장 발표에 반응 시간이 없다"),
    );
  });
});
