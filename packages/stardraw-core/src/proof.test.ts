import { describe, expect, it } from "vitest";
import { toHex, utf8 } from "./bytes";
import {
  checkRegistrationProof,
  checkTicketProof,
  makeRegistrationProof,
  makeTicketProof,
  ticketProofFromList,
} from "./proof";
import { emptyWinners, type RoundRecord } from "./record";
import {
  type KeyRegistration,
  registrationId,
  sortRegistrations,
} from "./registration";
import { registrationRoot, sealRoot, sortTickets } from "./round";
import { type Ticket, ticketId } from "./ticket";

// 서명·작업 증명은 요약·증명과 상관없어 고정 바이트로 만든 가짜 응모권을 쓴다(결정적)
const SIG = {
  kind: "webauthn" as const,
  authenticatorData: new Uint8Array(37),
  clientDataJSON: utf8("{}"),
  signature: new Uint8Array(8),
};
const pubOf = (n: number) => {
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub[1] = n;
  return pub;
};
function ticket(
  n: number,
  numbers: number[],
  qualPub?: number,
  round = 7,
): Ticket {
  const base = { round, numbers, pub: pubOf(n), nonce: n, sig: SIG };
  if (qualPub === undefined) return { v: 1, ...base };
  const q = new Uint8Array(33);
  q[0] = 2;
  q[1] = qualPub;
  return {
    v: 2,
    ...base,
    qual: {
      cert: {
        periodId: new Uint8Array(32),
        qualPub: q,
        stamp: new Uint8Array(48),
      },
      sig: new Uint8Array(64),
    },
  };
}
function registration(n: number): KeyRegistration {
  return {
    v: 1,
    credentialId: Uint8Array.of(n, 1, 2),
    pub: pubOf(n),
    nonce: n,
  };
}
function record(
  round: number,
  tickets: readonly Ticket[],
  regs: readonly KeyRegistration[] = [],
): RoundRecord {
  return {
    v: 1,
    round,
    prev: new Uint8Array(32),
    count: tickets.length,
    merkleRoot: sealRoot(tickets),
    registrationCount: regs.length,
    registrationRoot: registrationRoot(regs),
    rootLoggedAt: 0,
    void: true,
    drandRound: 1,
    drandSignature: new Uint8Array(0),
    numbers: [],
    bonus: 0,
    winners: emptyWinners(),
    scheduleChanges: [],
    nicknames: [],
  };
}

const TICKETS = [
  ticket(1, [1, 2, 3, 4, 5, 6]),
  ticket(2, [7, 8, 9, 10, 11, 12], 9),
  ticket(3, [1, 2, 3, 4, 5, 6], 9),
  ticket(4, [40, 41, 42, 43, 44, 45], 5),
  ticket(5, [1, 2, 3, 4, 5, 6]),
  ticket(6, [7, 8, 9, 10, 11, 12]),
];

describe("머클 포함 증명", () => {
  const sorted = sortTickets(TICKETS);
  const ids = sorted.map(ticketId);
  const r = record(7, TICKETS);

  it("모든 응모권의 증명이 기록의 루트로 맞는다", () => {
    for (const t of TICKETS) {
      const proof = makeTicketProof(7, ids, t, r.merkleRoot);
      expect(proof).not.toBeNull();
      const back = checkTicketProof(proof as never, r);
      expect(back && toHex(ticketId(back))).toBe(toHex(ticketId(t)));
    }
  });

  it("서버가 없을 때 회차 파일 목록(순서 상관없이)으로 만든 증명이 서버 증명과 같다", () => {
    for (const t of TICKETS) {
      const id = toHex(ticketId(t));
      expect(ticketProofFromList(r, [...TICKETS].reverse(), id)).toEqual(
        makeTicketProof(7, ids, t, r.merkleRoot),
      );
    }
    expect(ticketProofFromList(r, TICKETS, "00".repeat(32))).toBeNull();
  });

  it("목록에 없는 응모권은 증명이 없다", () => {
    expect(
      makeTicketProof(7, ids, ticket(99, [1, 2, 3, 4, 5, 7]), r.merkleRoot),
    ).toBeNull();
  });

  it("다른 루트·회차·바꾼 경로·다른 응모권이면 거절", () => {
    const t = TICKETS[2] as Ticket;
    const proof = makeTicketProof(7, ids, t, r.merkleRoot);
    if (!proof) throw new Error("증명이 없다");
    const other = record(7, TICKETS.slice(1));
    expect(checkTicketProof(proof, other)).toBeNull();
    expect(checkTicketProof({ ...proof, round: 8 }, r)).toBeNull();
    const path = [...proof.path];
    path[0] = (path[0] as string).replace(/^./, (c) => (c === "0" ? "1" : "0"));
    expect(checkTicketProof({ ...proof, path }, r)).toBeNull();
    const swapped = makeTicketProof(7, ids, TICKETS[0] as Ticket, r.merkleRoot);
    expect(
      checkTicketProof(
        { ...proof, ticket: (swapped as never as { ticket: string }).ticket },
        r,
      ),
    ).toBeNull();
    expect(checkTicketProof({ ...proof, path: ["zz"] }, r)).toBeNull();
    // 실린 root는 믿지 않는다: 루트를 같이 바꿔도 기록의 루트로 확인한다
    expect(
      checkTicketProof({ ...proof, root: "00".repeat(32) }, r),
    ).not.toBeNull();
  });

  it("다른 회차 응모권을 그 회차 증명으로 내밀면 거절", () => {
    const t8 = ticket(1, [1, 2, 3, 4, 5, 6], undefined, 8);
    const list = [t8];
    const r8 = record(7, list);
    const proof = makeTicketProof(7, list.map(ticketId), t8, r8.merkleRoot);
    expect(checkTicketProof(proof as never, r8)).toBeNull();
  });

  it("등록 증명", () => {
    const regs = [registration(1), registration(2), registration(3)];
    const rr = record(3, [], regs);
    const regIds = sortRegistrations(regs).map(registrationId);
    const proof = makeRegistrationProof(
      3,
      regIds,
      regs[1] as KeyRegistration,
      rr.registrationRoot,
    );
    const back = checkRegistrationProof(proof as never, rr);
    expect(back && toHex(back.pub)).toBe(toHex(pubOf(2)));
    expect(
      checkRegistrationProof(proof as never, record(3, [], regs.slice(0, 2))),
    ).toBeNull();
  });
});
