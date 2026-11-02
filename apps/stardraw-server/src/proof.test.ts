import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  checkRegistrationProof,
  checkTicketProof,
  compareBytes,
  type KeyTicketsResponse,
  makeRegistrationProof,
  makeTicketProof,
  registrationId,
  sortRegistrations,
  type TicketProof,
  ticketId,
  toBase64Url,
  toHex,
} from "@game/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpServer } from "./http";
import { DEFAULT_PROOF_LIMITS, ProofService } from "./proof";
import {
  drawOf,
  EPOCH,
  enter,
  makeRig,
  type Player,
  player,
  type Rig,
  readLedger,
  stopServer,
} from "./testing";

/**
 * 증명 API(docs/36 11-30): 내 응모권이 그 회차 기록의 머클 루트에 있다는 증명, 열쇠별 응모권 증명과 등록 증명.
 * 남용 안전장치는 서버 전체 토큰 통, 바뀌지 않는 응답의 기억(통을 쓰지 않는다), 넉넉한 보조인 접속 주소별 몫
 */

let rigs: Rig[] = [];
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  const open = rigs;
  rigs = [];
  for (const r of open) r.close();
});

/** 사람 셋이 1·2회차에 응모하고(둘은 같은 번호) n회차까지 닫는다 */
async function rigWithEntries(
  n: number,
  options: Parameters<typeof makeRig>[0] = {},
): Promise<{ rig: Rig; players: Player[] }> {
  const rig = await makeRig(options);
  rigs.push(rig);
  await rig.at(EPOCH + 10);
  const players = [await player(), await player(), await player()];
  for (let round = 1; round <= n; round++) {
    if (round <= 2) {
      const same = drawOf(round + 5).numbers;
      await enter(rig, players[0] as Player, same);
      await enter(rig, players[1] as Player, same);
      await enter(rig, players[2] as Player, drawOf(round + 9).numbers);
    }
    await rig.finish(round);
  }
  return { rig, players };
}

describe("증명 API", () => {
  async function api(rig: Rig, limits = DEFAULT_PROOF_LIMITS) {
    const server = createHttpServer(rig.engine, rig.relay, {
      basePath: "/stardraw-api",
      ledgerDir: join(rig.dir, "ledger"),
      devOrigins: [],
      trustProxy: false,
      proofs: new ProofService(rig.store, rig.clock, limits),
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    close = () => stopServer(server);
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/stardraw-api`;
  }

  it("응모권 증명: 기기가 가진 그 회차 기록의 루트로 맞고, 오래 캐시된다", async () => {
    const { rig } = await rigWithEntries(3);
    const base = await api(rig);
    const l = readLedger(rig.dir);
    for (const [i, list] of l.tickets.entries())
      for (const t of list) {
        const id = toHex(ticketId(t));
        const res = await fetch(`${base}/api/proof/${i + 1}/${id}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toContain("immutable");
        const proof = (await res.json()) as TicketProof;
        expect(proof.root).toBe(toHex(l.records[i]?.merkleRoot as never));
        const back = checkTicketProof(proof, l.records[i] as never);
        expect(back && toHex(ticketId(back))).toBe(id);
        // 다른 회차 기록으로는 맞지 않는다
        expect(checkTicketProof(proof, l.records[2] as never)).toBeNull();
      }
  });

  it("기억한 트리 층으로 낸 증명이 core makeTicketProof·makeRegistrationProof와 같은 바이트", async () => {
    const { rig, players } = await rigWithEntries(3);
    const proofs = new ProofService(rig.store, rig.clock);
    const l = readLedger(rig.dir);
    for (const [i, list] of l.tickets.entries()) {
      const record = l.records[i] as never as { merkleRoot: Uint8Array };
      const ids = list.map(ticketId).sort(compareBytes);
      for (const t of list)
        expect(JSON.stringify(proofs.ticket(i + 1, toHex(ticketId(t))))).toBe(
          JSON.stringify(makeTicketProof(i + 1, ids, t, record.merkleRoot)),
        );
    }
    const regs = rig.store.registrations(1);
    const regIds = sortRegistrations(regs).map(registrationId);
    const root = (l.records[0] as never as { registrationRoot: Uint8Array })
      .registrationRoot;
    for (const p of players) {
      const reg = regs.find((r) => toHex(r.pub) === toHex(p.signer.publicKey));
      expect(reg).toBeDefined();
      const got = proofs.keyTickets(p.signer.publicKey).registration;
      expect(JSON.stringify(got)).toBe(
        JSON.stringify(makeRegistrationProof(1, regIds, reg as never, root)),
      );
    }
  });

  it("없는 응모권·다른 회차·열린 회차는 404, 모양이 틀리면 400", async () => {
    const { rig, players } = await rigWithEntries(2);
    const base = await api(rig);
    const l = readLedger(rig.dir);
    const id = toHex(ticketId(l.tickets[0]?.[0] as never));
    expect((await fetch(`${base}/api/proof/2/${id}`)).status).toBe(404);
    expect((await fetch(`${base}/api/proof/1/${"0".repeat(64)}`)).status).toBe(
      404,
    );
    // 열린 3회차에 낸 응모권
    const { ticket } = await enter(
      rig,
      players[0] as Player,
      drawOf(3).numbers,
    );
    expect(
      (await fetch(`${base}/api/proof/3/${toHex(ticketId(ticket))}`)).status,
    ).toBe(404);
    expect((await fetch(`${base}/api/proof/1/abc`)).status).toBe(404);
    expect(
      (
        await fetch(
          `${base}/api/keys/${toBase64Url(players[0]?.signer.publicKey as never)}/tickets?from=x`,
        )
      ).status,
    ).toBe(400);
  });

  it("열쇠별 응모권: 닫힌 회차의 내 응모권 증명과 등록 증명, from부터", async () => {
    const { rig, players } = await rigWithEntries(3);
    const p = players[0] as Player;
    // 열린 4회차 응모는 아직 내지 않는다
    await enter(rig, p, drawOf(4).numbers);
    const base = await api(rig);
    const l = readLedger(rig.dir);
    const key = toBase64Url(p.signer.publicKey);
    const body = (await (
      await fetch(`${base}/api/keys/${key}/tickets`)
    ).json()) as KeyTicketsResponse;
    expect(body.through).toBe(3);
    expect(body.next).toBeUndefined();
    expect(body.tickets.map((t) => t.round)).toEqual([1, 2]);
    for (const proof of body.tickets) {
      const t = checkTicketProof(proof, l.records[proof.round - 1] as never);
      expect(t && toHex(t.pub)).toBe(toHex(p.signer.publicKey));
    }
    expect(body.registration?.round).toBe(1);
    const reg = checkRegistrationProof(
      body.registration as never,
      l.records[0] as never,
    );
    expect(reg && toHex(reg.pub)).toBe(toHex(p.signer.publicKey));

    const later = (await (
      await fetch(`${base}/api/keys/${key}/tickets?from=2`)
    ).json()) as KeyTicketsResponse;
    expect(later.tickets.map((t) => t.round)).toEqual([2]);
    // 응모하지 않은 열쇠
    const stranger = await player();
    const none = (await (
      await fetch(
        `${base}/api/keys/${toBase64Url(stranger.signer.publicKey)}/tickets`,
      )
    ).json()) as KeyTicketsResponse;
    expect(none).toEqual({ v: 1, tickets: [], registration: null, through: 3 });
  });

  it("한 응답 상한을 넘으면 잘라 next를 준다", async () => {
    const { rig, players } = await rigWithEntries(3);
    const base = await api(rig, { ...DEFAULT_PROOF_LIMITS, pageSize: 1 });
    const key = toBase64Url(players[2]?.signer.publicKey as never);
    const first = (await (
      await fetch(`${base}/api/keys/${key}/tickets`)
    ).json()) as KeyTicketsResponse;
    expect(first.tickets.map((t) => t.round)).toEqual([1]);
    expect(first.next).toBe(2);
    expect(first.through).toBe(1);
    const second = (await (
      await fetch(`${base}/api/keys/${key}/tickets?from=${first.next}`)
    ).json()) as KeyTicketsResponse;
    expect(second.tickets.map((t) => t.round)).toEqual([2]);
    expect(second.next).toBeUndefined();
  });

  /** 응모하지 않은 열쇠 n개(열쇠마다 다른 요청이라 기억에서 나오지 않는다) */
  const strangers = async (n: number) =>
    Promise.all(
      Array.from({ length: n }, async () =>
        toBase64Url((await player()).signer.publicKey),
      ),
    );
  const from = (ip: string) => ({ headers: { "x-real-ip": ip } });

  it("서버 전체 요청이 통을 넘으면 503과 Retry-After, 시간이 지나면 다시 받는다", async () => {
    const { rig } = await rigWithEntries(1);
    const base = await api(rig, {
      ...DEFAULT_PROOF_LIMITS,
      perSecond: 2,
      burst: 2,
      clientShare: 1,
    });
    const keys = await strangers(4);
    const url = (k: string) => `${base}/api/keys/${k}/tickets`;
    expect((await fetch(url(keys[0] as string))).status).toBe(200);
    expect((await fetch(url(keys[1] as string))).status).toBe(200);
    const busy = await fetch(url(keys[2] as string));
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("1");
    rig.clock.advance(500);
    expect((await fetch(url(keys[3] as string))).status).toBe(200);
  });

  it("닫힌 회차의 같은 응답은 기억에서 내주어 통을 쓰지 않는다", async () => {
    const { rig, players } = await rigWithEntries(1);
    const base = await api(rig, {
      ...DEFAULT_PROOF_LIMITS,
      perSecond: 1,
      burst: 2,
      clientShare: 1,
    });
    const id = toHex(ticketId(readLedger(rig.dir).tickets[0]?.[0] as never));
    const proofUrl = `${base}/api/proof/1/${id}`;
    const keyUrl = `${base}/api/keys/${toBase64Url(players[0]?.signer.publicKey as never)}/tickets`;
    const first = await (await fetch(proofUrl)).json();
    const firstKey = await (await fetch(keyUrl)).json();
    // 통은 비었지만 같은 요청은 몇 번이고 그대로
    for (let i = 0; i < 5; i++) {
      const again = await fetch(proofUrl);
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual(first);
      expect(await (await fetch(keyUrl)).json()).toEqual(firstKey);
    }
    // 새 요청은 통을 쓴다
    const [other] = await strangers(1);
    expect((await fetch(`${base}/api/keys/${other}/tickets`)).status).toBe(503);
  });

  it("새 회차가 닫히면 열쇠별 응답을 새로 만든다", async () => {
    const { rig, players } = await rigWithEntries(1);
    const base = await api(rig);
    const p = players[0] as Player;
    const keyUrl = `${base}/api/keys/${toBase64Url(p.signer.publicKey)}/tickets`;
    const before = (await (await fetch(keyUrl)).json()) as KeyTicketsResponse;
    expect(before.through).toBe(1);
    await enter(rig, p, drawOf(2).numbers);
    await rig.finish(2);
    const after = (await (await fetch(keyUrl)).json()) as KeyTicketsResponse;
    expect(after.through).toBe(2);
    expect(after.tickets.map((t) => t.round)).toEqual([1, 2]);
  });

  it("넉넉한 보조: 접속 주소 하나는 통의 몫까지만 쓰고, 나머지는 다른 주소에 남는다", async () => {
    const { rig } = await rigWithEntries(1);
    const server = createHttpServer(rig.engine, rig.relay, {
      basePath: "/stardraw-api",
      ledgerDir: join(rig.dir, "ledger"),
      devOrigins: [],
      trustProxy: true,
      proofs: new ProofService(rig.store, rig.clock, {
        ...DEFAULT_PROOF_LIMITS,
        perSecond: 2,
        burst: 4,
        clientShare: 0.5,
      }),
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    close = () => stopServer(server);
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/stardraw-api`;
    const keys = await strangers(6);
    const ask = (i: number, ip: string) =>
      fetch(`${base}/api/keys/${keys[i]}/tickets`, from(ip)).then(
        (r) => r.status,
      );
    expect(await ask(0, "203.0.113.7")).toBe(200);
    expect(await ask(1, "203.0.113.7")).toBe(200);
    expect(await ask(2, "203.0.113.7")).toBe(503);
    expect(await ask(3, "198.51.100.9")).toBe(200);
    expect(await ask(4, "198.51.100.9")).toBe(200);
    // 서버 전체 통이 비면 누구든 기다린다
    expect(await ask(5, "192.0.2.1")).toBe(503);
  });
});
