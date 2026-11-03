import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import type { KitClaims } from "@/game/kit";
import type { ClaimsResolved } from "./claim";
import { targetOf } from "./claim-fixture";
import { ClaimHub } from "./claim-hub";
import { DelayedNetwork, type DelayFn } from "./delayed-network";
import type { Transport } from "./transport";

/**
 * 청구 통로 하나하나의 확인(방 없이). 화면은 판 번호 하나(number)이고, 시험이 `observe`로 판을 넘긴다.
 * 방장 기기의 속임은 방장 통로에서 나가는 발표를 고쳐 흉내 낸다.
 */

const spec: KitClaims<
  number,
  null,
  { button: number },
  { target: number },
  string
> = {
  stimulusOf: (view) => view,
  board: (view) => ({ target: targetOf(view) }),
  isBody: (b): b is { button: number } =>
    typeof b === "object" &&
    b !== null &&
    Number.isInteger((b as { button?: unknown }).button),
  judge: (board, claim) =>
    claim.body.button === board.target ? "hit" : "miss",
  action: () => null,
  recorded: () => false,
  rules: { windowMs: 50, staleBoards: 1, graceMs: 1_000, staleSlackMs: 300 },
};

const seats: Record<string, number> = { host: 0, g1: 1, g2: 2 };

function setup(
  delay: DelayFn = () => 10,
  tamper: (r: ClaimsResolved) => ClaimsResolved = (r) => r,
  extra: {
    /** 방장 기기만 다른 규칙으로(예: 묶음을 늦게 닫는 방장) */
    hostRules?: typeof spec.rules;
    /** 새로고침 뒤 다시 들어온 참가자 */
    resumed?: string[];
  } = {},
) {
  const clock = new ManualClock();
  const net = new DelayedNetwork(clock, delay);
  const objections: string[] = [];
  const raws: Record<string, Transport> = {};
  const hub = (id: string, wrap?: (t: Transport) => Transport) => {
    const raw = net.join(id);
    raws[id] = raw;
    const transport = wrap ? wrap(raw) : raw;
    let n = 0;
    return new ClaimHub<number>({
      transport,
      game: "buttons",
      spec:
        id === "host" && extra.hostRules
          ? { ...spec, rules: { ...spec.rules, ...extra.hostRules } }
          : spec,
      resumed: extra.resumed?.includes(id) ?? false,
      role: id === "host" ? "host" : "guest",
      clock,
      mySeat: () => seats[id] ?? null,
      seatOfPeer: (peer) => seats[peer] ?? null,
      object: (seat, reason) => objections.push(`${id}:${seat}:${reason}`),
      newId: () => `${id}x${n++}`,
    });
  };
  const host = hub("host", (t) => ({
    ...t,
    send: (m, to) =>
      t.send(
        (m as { kind?: unknown }).kind === "claims-resolved"
          ? tamper(m as ClaimsResolved)
          : m,
        to,
      ),
  }));
  const g1 = hub("g1");
  const g2 = hub("g2");
  /** 판을 모두에게 보인다(화면 전달 대신) */
  const show = (board: number) => {
    for (const h of [host, g1, g2]) h.observe(board);
  };
  show(0);
  return { clock, host, g1, g2, show, objections, raws };
}

describe("ClaimHub", () => {
  it("발표가 직접 받은 청구보다 먼저 와도, 나중에 같으면 이의가 없다", () => {
    const { clock, g1, g2, objections } = setup((from, to) =>
      from === "g1" && to === "g2" ? 500 : 10,
    );
    const got: ClaimsResolved[] = [];
    g2.onResolved((r) => got.push(r));
    g1.claim({ button: targetOf(0) });
    clock.advance(100);
    expect(got).toHaveLength(1);
    clock.advance(2_000);
    expect(objections).toEqual([]);
  });

  it("방장이 판정을 바꾸면 이의", () => {
    const { clock, g1, objections } = setup(undefined, (r) => ({
      ...r,
      entries: r.entries.map((e) => ({
        ...e,
        outcome: { status: "judged", verdict: "miss" },
      })),
    }));
    g1.claim({ button: targetOf(0) });
    clock.advance(200);
    expect(objections).toEqual([
      "g1:0:방장이 1번 자리의 청구(0번 판)를 다르게 판정했다",
      "g2:0:방장이 1번 자리의 청구(0번 판)를 다르게 판정했다",
    ]);
  });

  it("방장이 내 자리로 가짜 청구를 넣으면 내가 이의를 낸다", () => {
    const { clock, host, objections } = setup(undefined, (r) => ({
      ...r,
      entries: [
        ...r.entries,
        {
          claim: {
            ...(r.entries[0]?.claim as ClaimsResolved["entries"][0]["claim"]),
            claimId: "zzfake",
            seat: 1,
          },
          // 판정은 맞게 적어 "가짜 청구"만 드러나는지 본다
          outcome: { status: "judged", verdict: "hit" },
        },
      ],
    }));
    host.claim({ button: targetOf(0) });
    clock.advance(200);
    expect(objections).toEqual([
      "g1:0:방장 발표에 내가 보내지 않은 내 청구가 있다",
    ]);
  });

  it("방장이 판 번호를 줄여 옛 판 청구를 받아 주면 이의", () => {
    const { clock, g1, show, objections } = setup(undefined, (r) => ({
      ...r,
      at: 0,
      entries: r.entries.map((e) => ({
        ...e,
        outcome: { status: "judged", verdict: "hit" },
      })),
    }));
    g1.claim({ button: targetOf(0) });
    show(1);
    show(2);
    clock.advance(200);
    expect(objections).toEqual([
      "g1:0:방장 발표의 판 번호(0)가 내가 받은 판(2)과 다르다",
      "g2:0:방장 발표의 판 번호(0)가 내가 받은 판(2)과 다르다",
    ]);
  });

  it("방장 발표 속 청구 내용이 직접 받은 것과 다르면 이의(누구 탓인지는 가리지 못함)", () => {
    const { clock, g1, objections } = setup(undefined, (r) => ({
      ...r,
      entries: r.entries.map((e) => ({
        ...e,
        claim: { ...e.claim, body: { button: targetOf(1) } },
        outcome: { status: "judged", verdict: "miss" },
      })),
    }));
    g1.claim({ button: targetOf(0) });
    clock.advance(200);
    expect(objections).toContain(
      "g2:null:방장 발표 속 1번 자리 청구가 내가 직접 받은 것과 다르다",
    );
  });

  it("방장이 처리 순서를 바꿔 발표하면 이의", () => {
    const { clock, g1, g2, objections } = setup(undefined, (r) => ({
      ...r,
      entries: [...r.entries].reverse(),
    }));
    g1.claim({ button: targetOf(0) });
    g2.claim({ button: targetOf(0) });
    clock.advance(200);
    expect(objections).toEqual([
      "g1:0:방장 발표의 처리 순서가 정해진 순서와 다르다",
      "g2:0:방장 발표의 처리 순서가 정해진 순서와 다르다",
    ]);
  });

  it("방장이 유예 안에서 발표를 미뤄 판을 두 번 넘기면, 정직한 청구를 늦음으로 버린 것이 이의로 드러난다", () => {
    // 이 방장은 묶음 창을 900ms로 늘려(이의 유예 1초 안이라 "빠뜨림"으로는 안 잡힌다) 발표를 미룬다.
    const { clock, g1, show, objections } = setup(undefined, undefined, {
      hostRules: { windowMs: 900 },
    });
    const got: ClaimsResolved[] = [];
    g1.onResolved((r) => got.push(r));
    g1.claim({ button: targetOf(0) });
    clock.advance(100);
    show(1);
    clock.advance(500);
    show(2);
    clock.advance(2_000);
    expect(got[0]?.entries[0]?.outcome).toEqual({
      status: "ignored",
      reason: "stale",
    });
    expect(objections).toEqual([
      "g1:0:방장이 1번 자리의 청구(0번 판)를 늦게 발표해 늦음으로 버렸다",
      "g2:0:방장이 1번 자리의 청구(0번 판)를 늦게 발표해 늦음으로 버렸다",
    ]);
  });

  it("청구가 방장에게 늦게 닿아 정직하게 늦음이 된 것은 이의가 없다", () => {
    const { clock, g1, show, objections } = setup((from, to) =>
      from === "g1" && to === "host" ? 300 : 10,
    );
    const got: ClaimsResolved[] = [];
    g1.onResolved((r) => got.push(r));
    g1.claim({ button: targetOf(0) });
    clock.advance(100);
    show(1);
    clock.advance(100);
    show(2);
    clock.advance(3_000);
    expect(got[0]?.entries[0]?.outcome).toEqual({
      status: "ignored",
      reason: "stale",
    });
    expect(objections).toEqual([]);
  });

  it("새로고침 뒤 다시 들어온 기기는 그 전 판의 내 청구를 모름으로 보고, 그 뒤 판의 가짜 청구만 이의한다", () => {
    const fake =
      (seen: number) =>
      (r: ClaimsResolved): ClaimsResolved => ({
        ...r,
        entries: [
          ...r.entries,
          {
            claim: {
              ...(r.entries[0]?.claim as ClaimsResolved["entries"][0]["claim"]),
              claimId: `zzold${seen}`,
              seat: 1,
              seen,
            },
            outcome: r.entries[0]
              ?.outcome as ClaimsResolved["entries"][0]["outcome"],
          },
        ],
      });
    // 0번 판: 새로고침 전에 g1이 냈을 수 있는 청구(아이디를 모른다)
    const before = setup(undefined, fake(0), { resumed: ["g1"] });
    before.host.claim({ button: targetOf(0) });
    before.clock.advance(200);
    expect(before.objections).toEqual([]);
    // 1번 판: 새로고침 뒤에 처음 본 판(0)보다 뒤라 이 통로가 낸 것만 있을 수 있다
    const after = setup(undefined, fake(1), { resumed: ["g1"] });
    after.show(1);
    after.host.claim({ button: targetOf(1) });
    after.clock.advance(200);
    expect(after.objections).toEqual([
      "g1:0:방장 발표에 내가 보내지 않은 내 청구가 있다",
    ]);
  });

  it("받은 청구 기억은 발표로 정리되고 옛 판이면 지워져 쌓이지 않는다", () => {
    const { clock, host, g1, g2, show, objections } = setup();
    for (let board = 1; board <= 40; board++) {
      show(board);
      g1.claim({ button: targetOf(board) });
      g2.claim({ button: 0 });
      clock.advance(200);
    }
    // 발표로 정리된 청구는 받은 목록·발표 사본에서 빠지고, 아이디는 판정에 쓸 판 근처 것만 남는다
    for (const h of [g1, g2]) expect(h.memorySize()).toBeLessThanOrEqual(40);
    expect(host.memorySize()).toBeLessThanOrEqual(20);
    // 지운 옛 판의 청구가 늦게 다시 와도 이의(빠뜨림)를 내지 않는다
    g1.claim({ button: 0 }, { seen: 2 });
    clock.advance(6_000);
    expect(objections).toEqual([]);
  });

  it("남의 자리를 사칭한 청구는 모두가 버린다(발표에도 없고 이의도 없다)", () => {
    const { clock, host, raws, objections } = setup();
    const got: ClaimsResolved[] = [];
    host.onResolved((r) => got.push(r));
    // 1번 자리 기기가 2번 자리 청구라고 보낸다
    raws.g1?.send({
      v: 1,
      kind: "claim",
      game: "buttons",
      claimId: "spoof1",
      seat: 2,
      seen: 0,
      body: { button: targetOf(0) },
    });
    clock.advance(2_000);
    expect(got).toEqual([]);
    expect(objections).toEqual([]);
  });
});
