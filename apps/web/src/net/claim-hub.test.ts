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
  rules: { windowMs: 50, staleBoards: 1, graceMs: 1_000 },
};

const seats: Record<string, number> = { host: 0, g1: 1, g2: 2 };

function setup(
  delay: DelayFn = () => 10,
  tamper: (r: ClaimsResolved) => ClaimsResolved = (r) => r,
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
      spec,
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
