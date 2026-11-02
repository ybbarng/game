/**
 * 장부 크기 측정(docs/36 11-30): 응모 한 장·열쇠 등록 한 건의 바이트, 회차 파일·묶음 파일 크기와 쓰는 시간,
 * gzip 크기, 머클 포함 증명 크기. 실제 장부 사본(앵커 저장소 묶음 파일)을 주면 실제 봉인·응모권 크기도 잰다.
 *
 * 묶기: pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.bench.mjs
 * 실행: nice -n 15 node apps/stardraw-server/dist/bench/sizes.js [--real <bundles/100/000001.json>] [--counts 100,1000,3000,10000] [--bundle-max 3000]
 */
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  closeRound,
  drandRoundForClose,
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  fromBase64Url,
  genesisHash,
  inclusionProof,
  roundTimes,
  sortTickets,
  type Ticket,
  ticketId,
  toBase64Url,
} from "@game/stardraw-core";
import { Publisher, pad } from "../src/publish";
import { fakeBeacon } from "../src/testing";
import {
  arg,
  benchSchedule,
  fakeQual,
  kb,
  makePlayers,
  mb,
  pickNumbers,
  registrationOf,
  seeded,
  ticketOf,
} from "./common";

const gz = (text: string | Uint8Array) => gzipSync(text, { level: 6 }).length;

async function main() {
  const counts = arg("counts", "100,1000,3000,10000").split(",").map(Number);
  const bundleMax = Number(arg("bundle-max", "3000"));
  const realPath = arg("real", "");
  const rand = seeded(7);
  const schedule = benchSchedule(1_800_000_000);
  const out: Record<string, unknown> = {};

  // ── 1. 한 장 ──
  const [p] = await makePlayers(1);
  if (!p) throw new Error("열쇠를 만들지 못했다");
  const t1 = await ticketOf(p, 1, pickNumbers(rand));
  const t2 = await ticketOf(p, 1, pickNumbers(rand), fakeQual());
  const reg = registrationOf(p);
  const one = (bytes: Uint8Array) => ({
    bytes: bytes.length,
    base64url: toBase64Url(bytes).length,
    // 회차 파일 배열 안의 한 칸: "…", 따옴표 둘과 쉼표 하나
    inJson: toBase64Url(bytes).length + 3,
  });
  out.one = {
    ticket: one(encodeTicket(t1)),
    ticketQual: one(encodeTicket(t2)),
    registration: one(encodeRegistration(reg)),
    signature: {
      authenticatorData: t1.sig.authenticatorData?.length,
      clientDataJSON: t1.sig.clientDataJSON?.length,
      der: t1.sig.signature.length,
    },
  };
  console.log("한 장", JSON.stringify(out.one));

  // ── 2. 회차 파일 ──
  const maxN = Math.max(...counts);
  const players = await makePlayers(maxN);
  const tickets: Ticket[] = [];
  const qualTickets: Ticket[] = [];
  for (const [i, pl] of players.entries()) {
    tickets.push(await ticketOf(pl, 2, pickNumbers(rand)));
    // 소속 증서는 무작위 값이라 서명 확인은 하지 않는 크기 측정용
    if (i < Math.min(maxN, 3000))
      qualTickets.push(await ticketOf(pl, 2, pickNumbers(rand), fakeQual()));
  }
  const dir = mkdtempSync(join(tmpdir(), "stardraw-sizes-"));
  const publisher = new Publisher(dir);
  const recordFor = (round: number, ts: readonly Ticket[], regs = 0) =>
    closeRound({
      schedule,
      round,
      prev: genesisHash(schedule),
      tickets: ts,
      registrations: players.slice(0, regs).map(registrationOf),
      rootLoggedAt: roundTimes(schedule, round).closesAt + 1,
      beacon: fakeBeacon(
        drandRoundForClose(roundTimes(schedule, round).closesAt),
      ),
    });
  const rows: unknown[] = [];
  for (const n of [0, 1, ...counts]) {
    for (const kind of ["returning", "new", "qual"] as const) {
      if (kind === "qual" && n > qualTickets.length) continue;
      if (kind !== "returning" && n === 0) continue;
      const ts = (kind === "qual" ? qualTickets : tickets).slice(0, n);
      const regs = kind === "new" ? n : 0;
      const started = performance.now();
      const record = recordFor(2, ts, regs);
      const closeMs = performance.now() - started;
      const w0 = performance.now();
      publisher.round(record, ts, players.slice(0, regs).map(registrationOf));
      const writeMs = performance.now() - w0;
      const text = readFileSync(join(dir, "rounds", "000002.json"), "utf8");
      rows.push({
        n,
        kind,
        recordBytes: encodeRecord(record).length,
        fileBytes: text.length,
        gzipBytes: gz(text),
        perTicket: n > 0 ? Math.round(text.length / n) : null,
        perTicketGzip: n > 0 ? Math.round(gz(text) / n) : null,
        closeRoundMs: Math.round(closeMs),
        writeMs: Math.round(writeMs),
      });
      console.log("회차 파일", JSON.stringify(rows.at(-1)));
    }
  }
  out.roundFiles = rows;

  // ── 3. 머클 포함 증명 크기 ──
  out.merkle = counts.map((n) => {
    const ids = sortTickets(tickets.slice(0, n)).map(ticketId);
    const proof = inclusionProof(ids, Math.floor(n / 2));
    return { n, hashes: proof.length, bytes: proof.length * 32 };
  });
  console.log("머클 증명", JSON.stringify(out.merkle));

  // ── 4. 실제 장부 사본 ──
  let sealSample: unknown = {
    v: 1,
    round: 1,
    log: { pad: "x".repeat(17_000) },
  };
  if (realPath) {
    const bundle = JSON.parse(readFileSync(realPath, "utf8")) as {
      rounds: { record: string; tickets: string[]; registrations: string[] }[];
      seals: unknown[];
    };
    const sealSizes = bundle.seals.map((s) => JSON.stringify(s).length + 1);
    const roundSizes = bundle.rounds.map((r) => JSON.stringify(r).length + 1);
    const ticketBytes = bundle.rounds.flatMap((r) =>
      r.tickets.map((t) => fromBase64Url(t).length),
    );
    const regBytes = bundle.rounds.flatMap((r) =>
      r.registrations.map((t) => fromBase64Url(t).length),
    );
    const recordBytes = bundle.rounds.map(
      (r) => fromBase64Url(r.record).length,
    );
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
    const text = readFileSync(realPath, "utf8");
    const voidSeals = bundle.seals.filter(
      (s) => (s as { loggedAt: number }).loggedAt === 0,
    ).length;
    out.real = {
      rounds: bundle.rounds.length,
      bundleBytes: text.length,
      bundleGzip: gz(text),
      sealAvg: avg(sealSizes),
      sealMax: Math.max(...sealSizes),
      sealGzipAvg: avg(bundle.seals.map((s) => gz(JSON.stringify(s)))),
      voidSeals,
      roundFileAvg: avg(roundSizes),
      recordAvg: avg(recordBytes),
      tickets: ticketBytes.length,
      ticketAvg: avg(ticketBytes),
      ticketMin: Math.min(...ticketBytes),
      ticketMax: Math.max(...ticketBytes),
      registrations: regBytes.length,
      registrationAvg: avg(regBytes),
    };
    console.log("실제 장부", JSON.stringify(out.real));
    // 묶음 측정에는 실제 봉인 파일 중 시각 인증 토큰이 있는 것을 쓴다
    sealSample =
      bundle.seals.find((s) => (s as { loggedAt: number }).loggedAt > 0) ??
      sealSample;
  }

  // ── 5. 묶음 만들기(10·100회차): 같은 회차 파일을 회차마다 복사해 둔 뒤 묶는다 ──
  const bundleRows: unknown[] = [];
  for (const n of counts.filter((c) => c <= bundleMax)) {
    const bdir = mkdtempSync(join(tmpdir(), "stardraw-bundle-"));
    const pub = new Publisher(bdir);
    const record = recordFor(2, tickets.slice(0, n));
    pub.round(record, tickets.slice(0, n), []);
    const roundText = readFileSync(join(bdir, "rounds", "000002.json"));
    for (let r = 1; r <= 100; r++) {
      writeFileSync(join(bdir, "rounds", `${pad(r)}.json`), roundText);
      writeFileSync(
        join(bdir, "seals", `${pad(r)}.json`),
        `${JSON.stringify(sealSample)}\n`,
      );
    }
    const before = process.memoryUsage().rss;
    const b0 = performance.now();
    let error: string | null = null;
    try {
      pub.bundles(100);
    } catch (err) {
      error = String(err);
    }
    const ms = performance.now() - b0;
    const size = (p: string) => {
      try {
        return statSync(join(bdir, p)).size;
      } catch {
        return null;
      }
    };
    bundleRows.push({
      n,
      bundle10Bytes: size("bundles/10/000001.json"),
      bundle100Bytes: size("bundles/100/000001.json"),
      ms: Math.round(ms),
      rssGrowMB: Math.round((process.memoryUsage().rss - before) / 1048576),
      error,
    });
    console.log("묶음", JSON.stringify(bundleRows.at(-1)));
    rmSync(bdir, { recursive: true, force: true });
  }
  out.bundles = bundleRows;
  rmSync(dir, { recursive: true, force: true });
  console.log(`결과 ${JSON.stringify(out)}`);
  console.log(
    `요약: 응모 한 장 ${kb((out.one as { ticket: { inJson: number } }).ticket.inJson)}(JSON 안), 최대 회차 파일 ${mb(
      Math.max(...rows.map((r) => (r as { fileBytes: number }).fileBytes)),
    )}`,
  );
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
