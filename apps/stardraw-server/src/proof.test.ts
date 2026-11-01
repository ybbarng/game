import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  checkRegistrationProof,
  checkTicketProof,
  type KeyTicketsResponse,
  type TicketProof,
  ticketId,
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";
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
} from "./testing";

/**
 * 증명 API(docs/36 11-30): 내 응모권이 그 회차 기록의 머클 루트에 있다는 증명, 열쇠별 응모권 증명과 등록 증명.
 * 남용 안전장치는 서버 전체 토큰 통(IP와 상관없다)
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
    close = () => new Promise((r) => server.close(() => r()));
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

  it("서버 전체 요청이 통을 넘으면 503과 Retry-After, 시간이 지나면 다시 받는다(IP와 상관없다)", async () => {
    const { rig } = await rigWithEntries(1);
    const base = await api(rig, { perSecond: 2, burst: 2, pageSize: 10 });
    const id = toHex(ticketId(readLedger(rig.dir).tickets[0]?.[0] as never));
    const url = `${base}/api/proof/1/${id}`;
    expect((await fetch(url)).status).toBe(200);
    expect((await fetch(url)).status).toBe(200);
    const busy = await fetch(url);
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("1");
    rig.clock.advance(500);
    expect((await fetch(url)).status).toBe(200);
  });
});
