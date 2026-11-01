import { ManualClock } from "@mighty/fair-play";
import {
  closeRound,
  drandRoundForClose,
  encodeRecord,
  encodeTicket,
  genesisAnchorFile,
  genesisHash,
  githubLedgerBase,
  type KeyTicketsResponse,
  ledgerId,
  lightFileName,
  makeLightFile,
  makeTicketProof,
  type RoundRecord,
  recordHash,
  roundSummary,
  roundTimes,
  type Schedule,
  sortTickets,
  type Ticket,
  ticketId,
  toBase64Url,
  toHex,
  utf8,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { RemoteLedger } from "./remote-ledger";

/**
 * 서버 장부의 가벼운 확인(docs/36 11-30): 처음 열 때 가벼운 기록만 받고 사슬을 확인한다.
 * 내 응모권은 증명 API로 받아 기록의 머클 루트로 확인하고, 회차 상세는 그 회차 파일 하나만 받는다
 */

const SCHEDULE: Schedule = {
  epoch: 1793321700,
  entries: [
    {
      fromRound: 1,
      length: 3600,
      closeMargin: 5,
      powTarget: 2 ** 31,
      registerPowTarget: 2 ** 31,
      phase: "trial",
    },
  ],
};
const SERVER = "https://game.byb.kr/stardraw-api";
const REPO = "ybbarng/stardraw-ledger";
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const ID = ledgerId(SCHEDULE);

// 증명·요약은 서명과 상관없어 고정 바이트 가짜 응모권을 쓴다(결정적)
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
const ME = pubOf(1);
const ticket = (n: number, round: number, numbers: number[]): Ticket => ({
  v: 1,
  round,
  numbers,
  pub: pubOf(n),
  nonce: n,
  sig: SIG,
});

/** 3회차: 회차마다 셋(나, 둘). 2·3회차는 둘이 같은 번호 */
function ledger3() {
  const records: RoundRecord[] = [];
  const tickets: Ticket[][] = [];
  let prev = genesisHash(SCHEDULE);
  for (let round = 1; round <= 3; round++) {
    const same = [10, 11, 12, 13, 14, round + 20];
    const list = sortTickets([
      ticket(1, round, [1, 2, 3, 4, 5, round + 6]),
      ticket(2, round, same),
      ticket(3, round, round === 1 ? [30, 31, 32, 33, 34, 35] : same),
    ]);
    const { closesAt } = roundTimes(SCHEDULE, round);
    const record = closeRound({
      schedule: SCHEDULE,
      round,
      prev,
      tickets: list,
      rootLoggedAt: closesAt + 10,
      beacon: {
        round: drandRoundForClose(closesAt),
        signature: new Uint8Array(48).fill(round),
      },
    });
    records.push(record);
    tickets.push(list);
    prev = recordHash(record);
  }
  return { records, tickets };
}

const pad = (n: number) => String(n).padStart(6, "0");

function world(clock: ManualClock) {
  const l = ledger3();
  const files: Record<string, unknown> = {
    [`${RAW}/main/genesis.txt`]: genesisAnchorFile(SCHEDULE),
  };
  for (const base of [SERVER, githubLedgerBase(REPO, "trial", ID)]) {
    files[`${base}/ledger/genesis.json`] = { v: 1, schedule: SCHEDULE };
    files[`${base}/ledger/head.json`] = {
      v: 1,
      rounds: 3,
      head: toHex(recordHash(l.records[2] as RoundRecord)),
      sealed: 3,
    };
    for (const [i, r] of l.records.entries()) {
      const record = toBase64Url(encodeRecord(r));
      const list = l.tickets[i] as Ticket[];
      files[`${base}/ledger/rounds/${pad(r.round)}.json`] = {
        v: 1,
        record,
        tickets: list.map((t) => toBase64Url(encodeTicket(t))),
        registrations: [],
      };
      files[`${base}/ledger/${lightFileName(r.round)}`] = makeLightFile(
        record,
        list,
      );
    }
  }
  const proofOf = (round: number, t: Ticket) => {
    const list = l.tickets[round - 1] as Ticket[];
    return makeTicketProof(
      round,
      list.map(ticketId),
      t,
      (l.records[round - 1] as RoundRecord).merkleRoot,
    );
  };
  const w = {
    ...l,
    files,
    server: "up" as "up" | "down",
    /** 증명 API가 없는 서버(404) */
    noApi: false,
    asked: [] as string[],
    /** 열쇠별 응답을 바꿔 끼운다(위조 시험) */
    tamper: null as ((body: KeyTicketsResponse) => KeyTicketsResponse) | null,
    fetch: (async (input: string | URL | Request) => {
      const url = String(input);
      w.asked.push(url);
      if (url.startsWith(SERVER)) {
        if (w.server === "down") throw new TypeError("Failed to fetch");
        const path = url.slice(SERVER.length);
        if (path === "/api/state")
          return Response.json({
            now: Math.floor(clock.now() / 1000),
            round: 4,
            records: 3,
            sealed: 3,
            head: toHex(recordHash(l.records[2] as RoundRecord)),
            entries: 0,
            serverKey: "",
            mode: "trial",
          });
        if (
          w.noApi &&
          (path.startsWith("/api/proof/") || path.includes("/tickets?"))
        )
          return Response.json({ error: "없는 주소입니다" }, { status: 404 });
        const proof = /^\/api\/proof\/(\d+)\/([0-9a-f]{64})$/.exec(path);
        if (proof) {
          const round = Number(proof[1]);
          const t = l.tickets[round - 1]?.find(
            (x) => toHex(ticketId(x)) === proof[2],
          );
          return t
            ? Response.json(proofOf(round, t))
            : new Response("없음", { status: 404 });
        }
        const keys =
          /^\/api\/keys\/([A-Za-z0-9_-]+)\/tickets\?from=(\d+)$/.exec(path);
        if (keys) {
          const from = Number(keys[2]);
          const body: KeyTicketsResponse = {
            v: 1,
            tickets: l.tickets
              .flat()
              .filter((t) => t.round >= from && toBase64Url(t.pub) === keys[1])
              .map((t) => proofOf(t.round, t) as never),
            registration: null,
            through: 3,
          };
          return Response.json(w.tamper ? w.tamper(body) : body);
        }
      }
      const body = files[url];
      if (body === undefined) return new Response("없음", { status: 404 });
      return typeof body === "string"
        ? new Response(body)
        : Response.json(body);
    }) as typeof fetch,
  };
  clock.advance((roundTimes(SCHEDULE, 4).closesAt - 600) * 1000);
  return w;
}

const ledgerIn = (w: ReturnType<typeof world>, clock: ManualClock) =>
  new RemoteLedger({
    base: SERVER,
    clock,
    policy: { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
    fetch: w.fetch,
  });

describe("서버 장부: 가벼운 확인", () => {
  it("처음 열 때 가벼운 기록만 받고(회차 파일 없음) 요약을 그대로 쓴다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    expect(ledger.closed().map((c) => c.record.round)).toEqual([1, 2, 3]);
    expect(ledger.closed()[1]?.summary).toEqual(
      roundSummary(w.tickets[1] as Ticket[]),
    );
    expect(w.asked.some((u) => u.includes("/ledger/rounds/"))).toBe(false);
    expect(w.asked.some((u) => u.includes("/ledger/seals/"))).toBe(false);
  });

  it("기록 사슬이 이어지지 않으면 받지 않고 던진다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    const second = w.records[1] as RoundRecord;
    const bad = { ...second, prev: new Uint8Array(32) };
    w.files[`${SERVER}/ledger/${lightFileName(2)}`] = makeLightFile(
      toBase64Url(encodeRecord(bad)),
      w.tickets[1] as Ticket[],
    );
    await expect(ledgerIn(w, clock).settle()).rejects.toThrow(
      "2회차 기록이 앞 기록과 이어지지 않습니다",
    );
  });

  it("내 응모권은 증명 API로 받아 확인하고, 새 회차가 없으면 다시 묻지 않는다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    const mine = await ledger.keyTickets([ME], []);
    expect(mine.map((t) => [t.round, toHex(t.pub)])).toEqual(
      [1, 2, 3].map((r) => [r, toHex(ME)]),
    );
    const asked = w.asked.length;
    await ledger.keyTickets([ME], []);
    expect(w.asked).toHaveLength(asked);
  });

  it("증명이 기록의 루트와 맞지 않으면 던진다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    // 2회차 증명에 남의 응모권을 넣는다
    w.tamper = (body) => ({
      ...body,
      tickets: body.tickets.map((p) =>
        p.round === 2 ? { ...p, index: (p.index + 1) % p.size } : p,
      ),
    });
    await expect(ledger.keyTickets([ME], [])).rejects.toThrow(
      "2회차 응모권 증명이 맞지 않습니다",
    );
  });

  it("서버가 응답하지 않으면 내 응모권은 지갑 것으로, 응모권 하나는 사본의 회차 파일로 같은 증명을 만든다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    const target = (w.tickets[2] as Ticket[])[1] as Ticket;
    const id = toHex(ticketId(target));
    expect(toHex(ticketId((await ledger.findTicket(3, id)) as Ticket))).toBe(
      id,
    );
    w.server = "down";
    const fresh = ledgerIn(w, clock);
    await fresh.settle();
    expect(toHex(ticketId((await fresh.findTicket(3, id)) as Ticket))).toBe(id);
    expect(w.asked).toContain(
      `${githubLedgerBase(REPO, "trial", ID)}/ledger/rounds/000003.json`,
    );
    expect(await fresh.findTicket(3, "00".repeat(32))).toBeNull();
    const wallet = (w.tickets[0] as Ticket[]).filter(
      (t) => toHex(t.pub) === toHex(ME),
    );
    expect((await fresh.keyTickets([ME], wallet)).map((t) => t.round)).toEqual([
      1,
    ]);
  });

  it("증명 API가 404면(옛 서버) 응모권 하나는 회차 파일로, 내 응모권은 지갑 것으로", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    w.noApi = true;
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    const target = (w.tickets[1] as Ticket[])[0] as Ticket;
    const id = toHex(ticketId(target));
    expect(toHex(ticketId((await ledger.findTicket(2, id)) as Ticket))).toBe(
      id,
    );
    expect(w.asked).toContain(`${SERVER}/ledger/rounds/000002.json`);
    expect(await ledger.findTicket(2, "00".repeat(32))).toBeNull();
    const wallet = (w.tickets[0] as Ticket[]).filter(
      (t) => toHex(t.pub) === toHex(ME),
    );
    expect((await ledger.keyTickets([ME], wallet)).map((t) => t.round)).toEqual(
      [1],
    );
  });

  it("회차 상세는 그 회차 파일 하나만 받고, 목록이 기록의 루트와 다르면 던진다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    expect(await ledger.roundTickets(2)).toHaveLength(3);
    expect(w.asked.filter((u) => u.includes("/ledger/rounds/"))).toEqual([
      `${SERVER}/ledger/rounds/000002.json`,
    ]);
    const file = w.files[`${SERVER}/ledger/rounds/000001.json`] as {
      tickets: string[];
    };
    file.tickets = file.tickets.slice(1);
    await expect(ledger.roundTickets(1)).rejects.toThrow("머클 루트");
    expect((await ledger.verifyRound(1)).problems).toEqual([
      {
        round: 1,
        message: "1회차 파일의 응모권 목록이 기록의 머클 루트와 다르다",
      },
    ]);
  });
});
