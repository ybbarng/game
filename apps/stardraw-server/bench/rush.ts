/**
 * 마감 직전 몰림 측정(docs/36 11-30). 이 맥에서 회차 서버(엔진 + HTTP + 작업 스레드 Argon2id 16MB)를 띄우고,
 * 따로 띄운 응모 프로세스(blast.js)가 진짜 패스키 모양 서명을 단 응모를 HTTP로 쏟아붓는다.
 * 서버는 운영과 같은 확인 순서(형식 → 등록 → 서명 → 1인 1장 → Argon2 줄)를 그대로 돈다.
 * 다른 점: 시각 인증은 이 서버 시계(LocalRootLog, 네트워크 왕복 없음), drand는 가짜, IP 상한은 끈다(응모가 모두 127.0.0.1).
 * 시계는 실제 시각에 차이만 더한 것이라 줄의 5초 기다림·화면의 1·2·3·4초 다시 내기는 실제 시간으로 돈다.
 *
 * 실행(맥 자원을 아끼게 nice, 한 번에 하나만):
 *   pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.bench.mjs
 *   nice -n 15 node apps/stardraw-server/dist/bench/rush.js --n 1000 --mode returning --arrival uniform --window 120
 * 선택: --port 8766 --threads 2 --queue 32 --mode new(처음 응모: 등록 함께, Argon2 2번)
 *   --arrival spike(마감 window초 전에 한꺼번에) --policy jitter(제안한 다시 내기, blast.ts)
 */
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Clock } from "@mighty/fair-play";
import {
  drandRoundForClose,
  drandTime,
  encodeRegistration,
  encodeTicket,
  entrantId,
  POW_PARAMS,
  roundTimes,
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";
import { StardrawServer } from "../src/engine";
import { createHttpServer } from "../src/http";
import { LocalRootLog, noAnchor } from "../src/outside";
import { isPowWorker, runPowWorker, WorkerPowChecker } from "../src/pow-pool";
import { Publisher } from "../src/publish";
import { DEFAULT_RELAY_LIMITS, Relay } from "../src/relay";
import { newServerKeyPkcs8, serverKeyFromPkcs8 } from "../src/server-key";
import { Store } from "../src/store";
import { FakeDrand } from "../src/testing";
import {
  arg,
  benchSchedule,
  makePlayers,
  pickNumbers,
  registrationOf,
  seeded,
  ticketOf,
} from "./common";

/** 실제 시각 + 차이. 회차를 건너뛸 때 차이만 늘린다 */
class JumpClock implements Clock {
  offset = 0;
  now(): number {
    return Date.now() + this.offset;
  }
  after(ms: number, fn: () => void): () => void {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  }
  /** 서버 시각을 seconds(초)로 옮긴다 */
  jumpTo(seconds: number): void {
    this.offset = seconds * 1000 - Date.now();
  }
}

function dirSize(dir: string): number {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

async function main() {
  const n = Number(arg("n", "1000"));
  const mode = arg("mode", "returning") as "returning" | "new";
  const arrival = arg("arrival", "uniform");
  const window = Number(arg("window", "120"));
  const port = Number(arg("port", "8766"));
  const threads = Number(arg("threads", "2"));
  const queue = Number(arg("queue", "32"));
  const retryPolicy = arg("policy", "now");
  const policy = { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] };

  const dir = mkdtempSync(join(tmpdir(), "stardraw-rush-"));
  const clock = new JumpClock();
  const nowSec = Math.floor(Date.now() / 1000);
  const schedule = benchSchedule(nowSec - 30);
  const store = new Store(join(dir, "stardraw.sqlite"));
  const serverKey = await serverKeyFromPkcs8(await newServerKeyPkcs8());
  const logs: string[] = [];
  const powChecker = new WorkerPowChecker(new URL(import.meta.url), threads);
  const engine = new StardrawServer({
    store,
    publisher: new Publisher(join(dir, "ledger")),
    clock,
    schedule,
    pow: POW_PARAMS,
    policy,
    serverKey,
    drand: new FakeDrand(),
    rootLog: new LocalRootLog(() => Math.floor(clock.now() / 1000)),
    anchor: noAnchor,
    limits: {
      entriesPerPrefixPerRound: 1e9,
      registrationsPerPrefixPerDay: 1e9,
      argonConcurrency: threads,
      argonQueue: queue,
    },
    powChecker,
    sealDeadline: 180,
    log: (m) => logs.push(m),
  });
  await engine.ready();
  const relay = new Relay(store, clock, policy, DEFAULT_RELAY_LIMITS, (pub) =>
    engine.isActiveDirector(pub),
  );
  const http = createHttpServer(engine, relay, {
    basePath: "/stardraw-api",
    ledgerDir: join(dir, "ledger"),
    devOrigins: [],
    trustProxy: false,
  });
  await new Promise<void>((r) => http.listen(port, "127.0.0.1", r));

  // 응모할 사람: returning이면 1회차에 미리 등록해 두고 2회차에 몰린다(Argon2 1번), new면 1회차에 등록과 함께(2번)
  const g0 = performance.now();
  const players = await makePlayers(n);
  const rand = seeded(11);
  let round = 1;
  if (mode === "returning") {
    store.transaction(() => {
      for (const p of players)
        store.addRegistration(
          1,
          toHex(entrantId(p.publicKey)),
          toHex(p.credentialId),
          registrationOf(p),
        );
    });
    const t1 = roundTimes(schedule, 1);
    clock.jumpTo(t1.closesAt);
    await engine.tick();
    clock.jumpTo(drandTime(drandRoundForClose(t1.closesAt)));
    await engine.tick();
    if (store.recordCount() !== 1) throw new Error("1회차를 닫지 못했다");
    round = 2;
  }
  const load: { ticket: string; registration?: string }[] = [];
  for (const p of players) {
    const ticket = await ticketOf(p, round, pickNumbers(rand));
    load.push({
      ticket: toBase64Url(encodeTicket(ticket)),
      ...(mode === "new"
        ? { registration: toBase64Url(encodeRegistration(registrationOf(p))) }
        : {}),
    });
  }
  // 몰리는 순서를 섞는다
  for (let i = load.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [load[i], load[j]] = [
      load[j] as (typeof load)[0],
      load[i] as (typeof load)[0],
    ];
  }
  const loadFile = join(dir, "load.json");
  writeFileSync(loadFile, JSON.stringify(load));
  const prepareMs = performance.now() - g0;

  const times = roundTimes(schedule, round);
  const lead = 3;
  clock.jumpTo(times.closesAt - window - lead);
  const closeAtMs = times.closesAt * 1000 - clock.offset;

  // 메모리·이벤트 루프 지연
  // 몰리기 직전 메모리(준비한 응모 데이터도 이 프로세스에 들어 있다)
  const rssBefore = process.memoryUsage().rss;
  let peakRss = 0;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 100);
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();

  const child = spawn(
    process.execPath,
    [
      join(new URL(".", import.meta.url).pathname, "blast.js"),
      "--url",
      `http://127.0.0.1:${port}/stardraw-api`,
      "--load",
      loadFile,
      "--close-at-ms",
      String(closeAtMs),
      "--window",
      String(window),
      "--arrival",
      arrival,
      "--policy",
      retryPolicy,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  let childOut = "";
  child.stdout.on("data", (d) => {
    childOut += String(d);
  });
  const childDone = new Promise<void>((r) => child.on("exit", () => r()));

  // 1초마다 할 일(운영 main.ts와 같다). 봉인한 tick의 시간을 잰다
  let sealMs: number | null = null;
  let sealRss = 0;
  let ticking = true;
  const loop = async () => {
    while (ticking) {
      const before = store.lastSealed();
      const t0 = performance.now();
      await engine.tick();
      const ms = performance.now() - t0;
      if (before < round && store.lastSealed() >= round) {
        sealMs = ms;
        sealRss = process.memoryUsage().rss;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  const looping = loop();
  await childDone;
  // 봉인이 끝날 때까지
  while (sealMs === null) await new Promise((r) => setTimeout(r, 200));
  ticking = false;
  await looping;
  lag.disable();

  // 추첨: 회차 기록·회차 파일·head
  clock.jumpTo(drandTime(drandRoundForClose(times.closesAt)));
  const d0 = performance.now();
  await engine.tick();
  const drawMs = performance.now() - d0;
  clearInterval(sampler);
  const entries = store.entries(round).length;
  const roundFile = statSync(
    join(dir, "ledger", "rounds", `${String(round).padStart(6, "0")}.json`),
  ).size;
  const blast = JSON.parse(
    childOut
      .split("\n")
      .find((l) => l.startsWith("결과 "))
      ?.slice(3) ?? "{}",
  ) as Record<string, unknown>;
  const result = {
    n,
    mode,
    arrival,
    window,
    threads,
    queue,
    retryPolicy,
    prepareSec: Math.round(prepareMs / 1000),
    entries,
    sealMs: Math.round(sealMs ?? 0),
    drawMs: Math.round(drawMs),
    roundFileBytes: roundFile,
    // WAL 파일까지(아직 본 파일에 옮기지 않은 쪽)
    sqliteBytes: readdirSync(dir)
      .filter((f) => f.startsWith("stardraw.sqlite"))
      .reduce((t, f) => t + statSync(join(dir, f)).size, 0),
    ledgerBytes: dirSize(join(dir, "ledger")),
    rssBeforeMB: Math.round(rssBefore / 1048576),
    peakRssMB: Math.round(peakRss / 1048576),
    sealRssMB: Math.round(sealRss / 1048576),
    loopLagP99Ms: Math.round(lag.percentile(99) / 1e6),
    loopLagMaxMs: Math.round(lag.max / 1e6),
    blast,
  };
  console.log(`결과 ${JSON.stringify(result)}`);
  powChecker.close();
  http.closeAllConnections();
  http.close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
}

if (isPowWorker()) runPowWorker();
else
  void main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
