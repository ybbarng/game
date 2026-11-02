/**
 * 스트레스 측정용 회차 서버(docs/36 11-30 「공개 전 권장 9번」). 운영 진입점(src/main.ts)과 같은 조각
 * (엔진 + 관측지 RoomHub + 증명 API ProofService + Relay + HTTP + 작업 스레드 Argon2)을 같은 설정 읽기(loadConfig,
 * 운영 compose의 환경 변수를 그대로 넣는다)로 **따로 띄운 프로세스**에서 돌린다. 그래서 바깥에서 `ps`로 잰 RSS가
 * 서버만의 메모리다(rush.ts는 응모 데이터를 든 측정 프로세스 안에서 서버를 돌렸다).
 *
 * 운영과 다른 점(바깥 왕복을 하지 않으려고): 시각 인증은 이 서버 시계(LocalRootLog), drand는 가짜, 앵커 없음,
 * 일정표는 측정용(작업 증명 목표값 최대, bench/common.ts). 시계는 실제 시각 + 차이(JumpClock)라 줄의 5초 기다림 등은
 * 실제 시간으로 돌고, 표준 입력 명령으로 회차 시각을 건너뛴다.
 *
 * 표준 입력 명령(한 줄씩, 답은 표준 출력 `ok <명령> <JSON>`):
 *   register <파일>   JSON 배열(base64url 열쇠 등록)을 1회차 등록으로 DB에 넣는다(1회차가 열려 있을 때)
 *   jump <초>         서버 시각을 그 유닉스 초로 옮긴다
 *   tick              engine.tick() 한 번(1초 순환을 시작하기 전 준비용)
 *   start             운영 main.ts처럼 1초마다 tick
 *   stop              끄기
 *
 * 띄우기: STRESS_EPOCH(1회차 시작 유닉스 초), STRESS_ROUND_SECONDS(기본 1200), PORT, STARDRAW_DATA_DIR와 운영 환경 변수.
 * stress.ts가 띄운다. 묶기는 bench/rolldown.stress.mjs.
 */

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Clock } from "@game/fair-play";
import {
  decodeRegistration,
  entrantId,
  fromBase64Url,
  toHex,
} from "@game/stardraw-core";
import { loadConfig } from "../src/config";
import { StardrawServer } from "../src/engine";
import { createHttpServer } from "../src/http";
import { LocalRootLog, noAnchor } from "../src/outside";
import { isPowWorker, runPowWorker, WorkerPowChecker } from "../src/pow-pool";
import { ProofService } from "../src/proof";
import { Publisher } from "../src/publish";
import { DEFAULT_RELAY_LIMITS, Relay } from "../src/relay";
import { RoomHub } from "../src/room";
import { newServerKeyPkcs8, serverKeyFromPkcs8 } from "../src/server-key";
import { Store } from "../src/store";
import { FakeDrand } from "../src/testing";
import { benchSchedule } from "./common";

class JumpClock implements Clock {
  offset = 0;
  now(): number {
    return Date.now() + this.offset;
  }
  after(ms: number, fn: () => void): () => void {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  }
  jumpTo(seconds: number): void {
    this.offset = seconds * 1000 - Date.now();
  }
}

async function main() {
  const config = loadConfig();
  const epoch = Number(process.env.STRESS_EPOCH);
  const length = Number(process.env.STRESS_ROUND_SECONDS ?? "1200");
  const schedule = benchSchedule(epoch, length);
  const clock = new JumpClock();
  mkdirSync(config.dataDir, { recursive: true });
  const store = new Store(join(config.dataDir, "stardraw.sqlite"));
  const serverKey = await serverKeyFromPkcs8(await newServerKeyPkcs8());
  const log = (m: string) => console.log(`[stardraw] ${m}`);
  const engine = new StardrawServer({
    store,
    publisher: new Publisher(config.ledgerDir),
    clock,
    schedule,
    pow: config.pow,
    policy: config.policy,
    serverKey,
    drand: new FakeDrand(),
    rootLog: new LocalRootLog(() => Math.floor(clock.now() / 1000)),
    anchor: noAnchor,
    limits: {
      entriesPerPrefixPerRound: config.entriesPerPrefixPerRound,
      registrationsPerPrefixPerDay: config.registrationsPerPrefixPerDay,
      argonConcurrency: config.argonConcurrency,
      argonQueue: config.argonQueue,
    },
    powChecker: new WorkerPowChecker(
      new URL(import.meta.url),
      config.argonConcurrency,
    ),
    ...(config.frontGate ? { frontGate: config.frontGate } : {}),
    sealDeadline: config.sealDeadline,
    directorKeys: config.directorKeys,
    directorRequestsPerPrefixPerDay: config.directorRequestsPerPrefixPerDay,
    log,
  });
  const relay = new Relay(
    store,
    clock,
    config.policy,
    {
      ...DEFAULT_RELAY_LIMITS,
      invitesPerPrefixPerDay: config.invitesPerPrefixPerDay,
      badLinksPerPrefixPerDay: config.badLinksPerPrefixPerDay,
    },
    (pub) => engine.isActiveDirector(pub),
  );
  const rooms = new RoomHub({
    clock,
    policy: config.policy,
    schedule: () => engine.schedule(),
    isRegistered: (pub) => engine.isRegistered(pub),
    isDirector: (pub) => engine.isActiveDirector(pub),
    sealed: (round) => store.seal(round) !== null,
    tickets: (round) => store.entries(round),
    entered: (round, pub) => store.hasEntry(round, toHex(entrantId(pub))),
    drawn: (round) => store.record(round) !== null,
  });
  const http = createHttpServer(engine, relay, {
    basePath: config.basePath,
    ledgerDir: config.ledgerDir,
    devOrigins: config.devOrigins,
    trustProxy: config.trustProxy,
    rooms,
    proofs: new ProofService(store, clock),
  });
  await engine.ready();
  await new Promise<void>((r) => http.listen(config.port, "127.0.0.1", r));

  let looping = false;
  let stopTick = () => {};
  const loop = () => {
    void engine.tick().finally(() => {
      if (looping) stopTick = clock.after(1000, loop);
    });
  };
  const reply = (cmd: string, value: unknown = {}) =>
    console.log(`ok ${cmd} ${JSON.stringify(value)}`);

  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const [cmd, arg] = line.trim().split(/\s+/);
    void (async () => {
      if (cmd === "register" && arg) {
        const regs = JSON.parse(readFileSync(arg, "utf8")) as string[];
        store.transaction(() => {
          for (const b of regs) {
            const reg = decodeRegistration(fromBase64Url(b));
            store.addRegistration(
              1,
              toHex(entrantId(reg.pub)),
              toHex(reg.credentialId),
              reg,
            );
          }
        });
        reply("register", { count: regs.length });
      } else if (cmd === "jump" && arg) {
        clock.jumpTo(Number(arg));
        reply("jump", { offset: clock.offset });
      } else if (cmd === "tick") {
        await engine.tick();
        reply("tick", { records: store.recordCount() });
      } else if (cmd === "start") {
        looping = true;
        loop();
        reply("start");
      } else if (cmd === "stop") {
        looping = false;
        stopTick();
        rooms.stop();
        http.closeAllConnections();
        http.close();
        store.close();
        reply("stop");
        process.exit(0);
      }
    })().catch((err) => {
      console.log(`err ${cmd} ${JSON.stringify(String(err))}`);
    });
  });
  rl.on("close", () => process.exit(0));
  console.log(
    `ready ${JSON.stringify({
      pid: process.pid,
      port: config.port,
      argonConcurrency: config.argonConcurrency,
      argonQueue: config.argonQueue,
      gateTarget: config.frontGate?.target ?? null,
      trustProxy: config.trustProxy,
      heapLimitMB: Math.round(
        (await import("node:v8")).getHeapStatistics().heap_size_limit / 1048576,
      ),
    })}`,
  );
}

if (isPowWorker()) runPowWorker();
else
  void main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
