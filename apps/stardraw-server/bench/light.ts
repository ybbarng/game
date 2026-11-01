/**
 * 가벼운 확인의 처음 받는 양과 시간(docs/36 11-30 구현 6단계).
 * 회차 n개(회차당 응모 k장, 소속 응모 비율 q)의 가벼운 기록 파일을 서버와 같은 모양으로 만들고,
 * 화면이 처음 열 때 받는 것(가벼운 기록 묶음·낱개)의 크기와 gzip 크기, 받은 뒤 푸는 시간(JSON 읽기 + 기록 풀기 + 사슬 확인)을 잰다.
 * 같은 장부를 지금 구조(회차·봉인 파일 전체)로 받았다면의 크기도 어림한다(봉인 17.25KB·응모권 440자는 11-30 측정값).
 *
 * 응모권은 서명이 크기에 들어가지 않아(가벼운 기록에는 기록과 요약만) 서명 없는 고정 바이트로 만든다.
 * 당첨 응모권 수는 실제 추첨 규칙(가짜 drand)으로 정해진다.
 *
 * 묶기: pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.bench.mjs
 * 실행: nice -n 15 node apps/stardraw-server/dist/bench/light.js [--rounds 8760] [--per-round 100] [--qual 0] [--runs 5]
 */
import { gzipSync } from "node:zlib";
import {
  closeRound,
  drandRoundForClose,
  encodeRecord,
  genesisHash,
  LIGHT_BUNDLE_SIZES,
  type LightFile,
  lightBundlePath,
  lightFilePath,
  lightPieces,
  loadLightFiles,
  makeLightFile,
  type RoundRecord,
  recordHash,
  roundTimes,
  type Ticket,
  toBase64Url,
  utf8,
} from "@mighty/stardraw-core";
import { fakeBeacon } from "../src/testing";
import { arg, benchSchedule, kb, mb, pickNumbers, seeded } from "./common";

const SIG = {
  kind: "webauthn" as const,
  authenticatorData: new Uint8Array(37),
  clientDataJSON: utf8("{}"),
  signature: new Uint8Array(8),
};

const fileText = (value: unknown) => `${JSON.stringify(value)}\n`;
const gz = (text: string) => gzipSync(text, { level: 6 }).length;

async function main() {
  const rounds = Number(arg("rounds", "8760"));
  const perRound = Number(arg("per-round", "100"));
  const qualShare = Number(arg("qual", "0"));
  const runs = Number(arg("runs", "5"));
  const rand = seeded(11);
  const schedule = benchSchedule(1_800_000_000, 3600);

  // ── 장부 만들기(서버가 쓰는 것과 같은 파일 글) ──
  const files = new Map<string, string>();
  const lights: LightFile[] = [];
  let prev = genesisHash(schedule);
  let winners = 0;
  for (let round = 1; round <= rounds; round++) {
    const tickets: Ticket[] = [];
    for (let i = 0; i < perRound; i++) {
      const pub = new Uint8Array(65);
      pub[0] = 4;
      for (let b = 1; b < 9; b++) pub[b] = Math.floor(rand() * 256);
      const base = {
        round,
        numbers: pickNumbers(rand),
        pub,
        nonce: i,
        sig: SIG,
      };
      if (rand() < qualShare) {
        const qualPub = new Uint8Array(33);
        qualPub[0] = 2;
        for (let b = 1; b < 33; b++) qualPub[b] = Math.floor(rand() * 256);
        tickets.push({
          v: 2,
          ...base,
          qual: {
            cert: {
              periodId: new Uint8Array(32),
              qualPub,
              stamp: new Uint8Array(48),
            },
            sig: new Uint8Array(64),
          },
        });
      } else tickets.push({ v: 1, ...base });
    }
    const { closesAt } = roundTimes(schedule, round);
    const record: RoundRecord = closeRound({
      schedule,
      round,
      prev,
      tickets,
      rootLoggedAt: closesAt + 5,
      beacon: fakeBeacon(drandRoundForClose(closesAt)),
    });
    for (const r of [1, 2, 3, 4, 5] as const)
      winners += record.winners[r].length;
    prev = recordHash(record);
    const light = makeLightFile(toBase64Url(encodeRecord(record)), tickets);
    lights.push(light);
    files.set(lightFilePath(round), fileText(light));
  }
  for (const size of LIGHT_BUNDLE_SIZES)
    for (let first = 1; first + size - 1 <= rounds; first += size)
      files.set(
        lightBundlePath(size, first),
        fileText({
          v: 1,
          first,
          size,
          items: lights.slice(first - 1, first - 1 + size),
        }),
      );

  // ── 처음 열 때 받는 것: 큰 묶음부터 ──
  const pieces = lightPieces(1, rounds);
  const fetched = pieces.map((p) =>
    p.size === 1
      ? (files.get(lightFilePath(p.first)) as string)
      : (files.get(lightBundlePath(p.size, p.first)) as string),
  );
  const bytes = fetched.reduce((n, t) => n + Buffer.byteLength(t), 0);
  const gzBytes = fetched.reduce((n, t) => n + gz(t), 0);

  // ── 받은 뒤 푸는 시간: loadLightFiles(JSON 읽기, 기록 풀기) + 사슬 확인 ──
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    const text = files.get(url.slice(url.indexOf("/ledger/")));
    return text === undefined
      ? new Response("없음", { status: 404 })
      : new Response(text);
  }) as typeof fetch;
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const t0 = performance.now();
    const got = await loadLightFiles("http://bench", fakeFetch, 1, rounds);
    let head = genesisHash(schedule);
    for (const g of got) {
      if (Buffer.compare(g.record.prev, head) !== 0)
        throw new Error(`${g.record.round}회차 사슬이 끊겼다`);
      head = recordHash(g.record);
    }
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);

  // ── 지금 구조로 받았다면(11-30 측정값으로 어림) ──
  const before = rounds * (17.25 * 1024 + 300 + perRound * 440);

  const report = {
    rounds,
    perRound,
    qualShare,
    winnersPerRound: (winners / rounds).toFixed(2),
    requests: pieces.length,
    firstOpen: mb(bytes),
    firstOpenGzip: mb(gzBytes),
    perRoundLight: kb(bytes / rounds),
    decodeAndChainMs: {
      median: times[Math.floor(times.length / 2)]?.toFixed(0),
      min: times[0]?.toFixed(0),
    },
    beforeEstimate: mb(before),
  };
  console.log(JSON.stringify(report, null, 2));
}

await main();
