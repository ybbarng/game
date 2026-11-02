/**
 * 스트레스 측정(docs/36 11-30 「공개 전 권장 9번」, 2026-11-03). 측정용 서버(stress-server.js)를 **따로 띄운 프로세스**로
 * 운영 compose와 같은 환경 변수로 띄우고, 바깥에서 몰림을 건다. 운영 서버에는 요청을 보내지 않는다(127.0.0.1만).
 *
 * 재는 것: 서버 RSS(`ps`, 250ms마다, 컨테이너 상한 320MiB와 비교), `/api/state` 응답 시간(이벤트 루프가 멈췄는지 바깥에서 어림),
 * 봉인·추첨이 늦지 않았는지(sealed·records가 바뀐 때, behind·sealOverdueSeconds), 예측 몰림 숫자(entryBusyRecent 등).
 *
 * 장면(--scene):
 *   entry  마감 전 예측 몰림(--n, --new-ratio 처음 예측 비율, --arrival spike|uniform, --window 초)
 *   room   관측지 몰림: 보는 연결 --watchers, 표 가진 사람 --passes, 마감 2분 전부터 관측 1분 끝까지 말·응원을 상한 바로 아래로
 *          (예측 --n 장은 마감 전 60초 동안 고르게, 봉인·추첨이 그 사이에 돈다)
 *   both   room + 마감 30초 전 예측 몰림(--n, spike)
 *   어느 장면이든 끝나면(추첨 뒤) --proof 대수의 새 기기가 가벼운 기록·열쇠별 증명·응모권 증명을 동시에 받는다(두 번: 처음·다시)
 *
 * 묶기: pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.stress.mjs
 * 실행: nice -n 15 node apps/stardraw-server/dist/bench/stress.js --scene entry --n 1000 --new-ratio 0.7 --arrival spike --window 30
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { Agent, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  drandRoundForClose,
  drandTime,
  encodeRegistration,
  encodeSignatureData,
  encodeTicket,
  fromBase64Url,
  roomPassMessage,
  roundTimes,
  type SoftPasskey,
  ticketId,
  toBase64Url,
  toHex,
} from "@game/stardraw-core";
import {
  arg,
  benchSchedule,
  makePlayers,
  pickNumbers,
  registrationOf,
  seeded,
  ticketOf,
} from "./common";

const here = new URL(".", import.meta.url).pathname;
const scene = arg("scene", "entry");
const n = Number(arg("n", "1000"));
const newRatio = Number(arg("new-ratio", "0.7"));
const arrival = arg("arrival", scene === "entry" ? "spike" : "uniform");
const window = Number(arg("window", scene === "both" ? "30" : "60"));
const watchersN = Number(arg("watchers", scene === "entry" ? "0" : "1000"));
const passesN = Number(arg("passes", scene === "entry" ? "0" : "300"));
const watcherProcs = Number(arg("watcher-procs", "4"));
const proofN = Number(arg("proof", "0"));
const port = Number(arg("port", "8790"));
const heap = arg("heap", "");
const length = 1200;
const base = `http://127.0.0.1:${port}/stardraw-api`;

/** 운영 compose(servers 저장소 byb.kr/apps/stardraw/compose.yaml)의 environment 그대로 + 바깥 왕복만 끔 */
const OPS_ENV: Record<string, string> = {
  NODE_ENV: "production",
  STARDRAW_ROUND_SECONDS: "1200",
  STARDRAW_TRUST_PROXY: "1",
  STARDRAW_REGISTRATIONS_PER_PREFIX: "1000000",
  STARDRAW_ENTRIES_PER_PREFIX: "1000000",
  STARDRAW_INVITES_PER_PREFIX: "1000000",
  STARDRAW_DIRECTOR_REQUESTS_PER_PREFIX: "1000000",
  STARDRAW_QUAL_ISSUES_PER_PREFIX: "1000000",
  STARDRAW_BAD_LINKS_PER_PREFIX: "1000000",
  STARDRAW_BASE_PATH: "/stardraw-api",
  STARDRAW_RP_ID: "game.byb.kr",
  STARDRAW_ORIGINS: "https://game.byb.kr",
  // 측정용: 시각 인증 왕복 없음, 앞단 작업 증명은 켜 두되 평균 1번(nonce 0이 맞는다. 서버 확인 비용은 그대로)
  STARDRAW_TSA: "off",
  STARDRAW_GATE_TRIES: "1",
};

const sleep = (ms: number) =>
  new Promise((r) => setTimeout(r, Math.max(0, ms)));
const q = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0);
};
const log = (m: string) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const agent = new Agent({ keepAlive: true, maxSockets: 64 });
function http(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string; ms: number }> {
  const data = body === undefined ? undefined : JSON.stringify(body);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const req = request(
      `${base}${path}`,
      {
        agent,
        method,
        headers: {
          ...(data
            ? {
                "content-type": "application/json",
                "content-length": String(Buffer.byteLength(data)),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          text += c;
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            text,
            ms: performance.now() - t0,
          }),
        );
      },
    );
    req.on("error", (err) =>
      resolve({ status: 0, text: String(err), ms: performance.now() - t0 }),
    );
    req.end(data);
  });
}

// ---- 서버 띄우기와 명령 ----
const dir = mkdtempSync(join(tmpdir(), "stardraw-stress-"));
const children: ChildProcess[] = [];
let server: ChildProcess;
let serverPid = 0;
const waiters = new Map<string, (v: unknown) => void>();
let offset = 0;
const pressureLines: unknown[] = [];
let stopping = false;

function killAll() {
  for (const c of children) if (c.exitCode === null) c.kill("SIGKILL");
  if (server && server.exitCode === null) server.kill("SIGKILL");
}
process.on("SIGINT", () => {
  killAll();
  rmSync(dir, { recursive: true, force: true });
  process.exit(130);
});

function command(line: string): Promise<unknown> {
  const cmd = line.split(" ")[0] as string;
  return new Promise((resolve) => {
    waiters.set(cmd, resolve);
    server.stdin?.write(`${line}\n`);
  });
}

async function jump(seconds: number) {
  const r = (await command(`jump ${seconds}`)) as { offset: number };
  offset = r.offset;
}
/** 서버 시각(초) */
const serverNow = () => (Date.now() + offset) / 1000;

async function startServer(epoch: number) {
  const nodeArgs = [
    ...(heap ? [`--max-old-space-size=${heap}`] : []),
    "--disable-warning=ExperimentalWarning",
    join(here, "stress-server.js"),
  ];
  server = spawn("nice", ["-n", "15", process.execPath, ...nodeArgs], {
    env: {
      PATH: process.env.PATH ?? "",
      ...OPS_ENV,
      PORT: String(port),
      STARDRAW_DATA_DIR: join(dir, "data"),
      STRESS_EPOCH: String(epoch),
      STRESS_ROUND_SECONDS: String(length),
      // STRESS_ARGON=wasm이면 측정 서버가 예전 hash-wasm으로 계산한다(비교용)
      ...(process.env.STRESS_ARGON
        ? { STRESS_ARGON: process.env.STRESS_ARGON }
        : {}),
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  server.on("exit", (code, signal) => {
    if (!stopping) {
      log(`측정용 서버가 꺼졌다(code ${code}, signal ${signal}) — 측정 중단`);
      killAll();
      rmSync(dir, { recursive: true, force: true });
      process.exit(2);
    }
  });
  const ready = new Promise<Record<string, unknown>>((resolve) => {
    createInterface({ input: server.stdout as NodeJS.ReadableStream }).on(
      "line",
      (line) => {
        if (line.startsWith("ready ")) resolve(JSON.parse(line.slice(6)));
        else if (line.startsWith("ok ")) {
          const [, cmd, ...rest] = line.split(" ");
          const w = waiters.get(cmd as string);
          waiters.delete(cmd as string);
          w?.(JSON.parse(rest.join(" ")));
        } else if (line.startsWith("err ")) {
          log(`서버 명령 오류: ${line}`);
        } else if (line.includes("예측 몰림")) {
          pressureLines.push(JSON.parse(line.slice(line.indexOf("{"))));
          log(`서버: ${line}`);
        } else if (
          line.includes("못") ||
          line.includes("실패") ||
          line.includes("늦")
        )
          log(`서버: ${line}`);
      },
    );
  });
  const info = await ready;
  serverPid = info.pid as number;
  return info;
}

// ---- 바깥 관찰: RSS·상태 응답 시간·봉인/추첨 시각 ----
interface Mark {
  phase: string;
  peakRssMB: number;
  stateMs: number[];
  stateFail: number;
}
const marks: Mark[] = [];
let mark: Mark = { phase: "준비", peakRssMB: 0, stateMs: [], stateFail: 0 };
marks.push(mark);
function phase(name: string) {
  mark = { phase: name, peakRssMB: 0, stateMs: [], stateFail: 0 };
  marks.push(mark);
  log(`== ${name}`);
}
let overallPeak = 0;
let lastState: Record<string, unknown> = {};
const events: { what: string; serverAt: number }[] = [];
let seenSealed = 0;
let seenRecords = 0;
let sampling = true;
async function sampleRss() {
  while (sampling) {
    await new Promise<void>((resolve) => {
      execFile("ps", ["-o", "rss=", "-p", String(serverPid)], (err, out) => {
        if (!err) {
          const mb = Number(out.trim()) / 1024;
          mark.peakRssMB = Math.max(mark.peakRssMB, mb);
          overallPeak = Math.max(overallPeak, mb);
        }
        resolve();
      });
    });
    await sleep(250);
  }
}
async function probeState() {
  while (sampling) {
    const r = await http("GET", "/api/state");
    if (r.status === 200) {
      mark.stateMs.push(r.ms);
      lastState = JSON.parse(r.text);
      const sealed = Number(lastState.sealed ?? 0);
      const records = Number(lastState.records ?? lastState.closed ?? 0);
      if (sealed > seenSealed) {
        seenSealed = sealed;
        events.push({ what: `sealed ${sealed}`, serverAt: serverNow() });
      }
      if (records > seenRecords) {
        seenRecords = records;
        events.push({ what: `records ${records}`, serverAt: serverNow() });
      }
    } else mark.stateFail++;
    await sleep(500);
  }
}
async function until(cond: () => boolean, maxMs: number, what: string) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > maxMs) {
      log(`기다림 시간 넘김: ${what}`);
      return false;
    }
    await sleep(200);
  }
  return true;
}

// ---- 관측지 ----
async function issuePasses(players: SoftPasskey[], round: number) {
  const tokens: string[] = [];
  const ms: number[] = [];
  const fails: Record<string, number> = {};
  let i = 0;
  const worker = async () => {
    while (i < players.length) {
      const p = players[i++] as SoftPasskey;
      const t0 = performance.now();
      const c = await http("POST", `/api/room/${round}/challenge`, {});
      if (c.status !== 200) {
        fails[`challenge ${c.status}`] =
          (fails[`challenge ${c.status}`] ?? 0) + 1;
        continue;
      }
      const { nonce } = JSON.parse(c.text) as { nonce: string };
      const sig = await p.sign(roomPassMessage(round, fromBase64Url(nonce)));
      const r = await http("POST", `/api/room/${round}/pass`, {
        pub: toBase64Url(p.publicKey),
        signature: encodeSignatureData(sig),
        nonce,
      });
      if (r.status !== 200) {
        const k = `pass ${r.status} ${r.text.slice(0, 40)}`;
        fails[k] = (fails[k] ?? 0) + 1;
        continue;
      }
      tokens.push((JSON.parse(r.text) as { pass: string }).pass);
      ms.push(performance.now() - t0);
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  return { tokens, p50: q(ms, 0.5), p95: q(ms, 0.95), fails };
}

interface WatcherProc {
  child: ChildProcess;
  last: Record<string, unknown> | null;
  final: Promise<Record<string, unknown>>;
}
function startWatchers(round: number, tokens: string[]): WatcherProc[] {
  const procs: WatcherProc[] = [];
  for (let k = 0; k < watcherProcs; k++) {
    const myTokens = tokens.filter((_, i) => i % watcherProcs === k);
    const file = join(dir, `passes-${k}.json`);
    writeFileSync(file, JSON.stringify(myTokens));
    const nw =
      Math.floor(watchersN / watcherProcs) +
      (k < watchersN % watcherProcs ? 1 : 0);
    const child = spawn(
      "nice",
      [
        "-n",
        "15",
        process.execPath,
        join(here, "watchers.js"),
        "--url",
        base,
        "--round",
        String(round),
        "--n",
        String(nw),
        "--passes",
        file,
        "--ramp-ms",
        "10000",
        "--label",
        `w${k}`,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    children.push(child);
    const wp: WatcherProc = { child, last: null, final: Promise.resolve({}) };
    wp.final = new Promise((resolve) => {
      createInterface({ input: child.stdout as NodeJS.ReadableStream }).on(
        "line",
        (line) => {
          if (line.startsWith("중간 ")) wp.last = JSON.parse(line.slice(3));
          if (line.startsWith("결과 ")) resolve(JSON.parse(line.slice(3)));
        },
      );
    });
    procs.push(wp);
  }
  return procs;
}

/** 표마다 말은 2.6초에 한 번(상한 2.5초), 응원은 0.85초에 한 번(상한 0.8초). 시작은 흩뜨린다 */
function talk(round: number, tokens: string[]) {
  let on = true;
  const counts: Record<string, number> = {};
  const sayMs: number[] = [];
  const add = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const loops = tokens.map(async (pass, i) => {
    await sleep(Math.random() * 2600);
    let nextSay = Date.now();
    let nextCheer = Date.now() + Math.random() * 850;
    while (on) {
      const now = Date.now();
      if (now >= nextSay) {
        nextSay = now + 2600;
        const r = await http("POST", `/api/room/${round}/say`, {
          pass,
          text: `t${Date.now()} 별이 보여요`,
        });
        add(`say ${r.status}`);
        if (r.status === 200) sayMs.push(r.ms);
      } else if (Date.now() >= nextCheer) {
        nextCheer = Date.now() + 850;
        const r = await http("POST", `/api/room/${round}/cheer`, {
          pass,
          kind: i % 2 ? "twinkle" : "meteor",
          to: null,
        });
        add(`cheer ${r.status}`);
      }
      await sleep(Math.min(nextSay, nextCheer) - Date.now());
    }
  });
  return {
    stop: async () => {
      on = false;
      await Promise.all(loops);
      return { counts, sayP50: q(sayMs, 0.5), sayP95: q(sayMs, 0.95) };
    },
  };
}

// ---- 새 기기 동시 받기 ----
async function proofWave(
  devices: { pub: string; ticketHex: string; ip: string }[],
  round: number,
) {
  const ms: number[] = [];
  const statuses: Record<string, number> = {};
  let retries = 0;
  const get = async (path: string, ip: string) => {
    for (let k = 0; ; k++) {
      const r = await http("GET", path, undefined, { "x-real-ip": ip });
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (r.status !== 503 || k >= 5) return r;
      retries++;
      await sleep(1000 + Math.random() * 1000);
    }
  };
  const t0 = performance.now();
  await Promise.all(
    devices.map(async (d) => {
      const s = performance.now();
      await get("/ledger/light/000001.json", d.ip);
      await get(`/ledger/light/${String(round).padStart(6, "0")}.json`, d.ip);
      await get(`/api/keys/${d.pub}/tickets?from=1`, d.ip);
      await get(`/api/proof/${round}/${d.ticketHex}`, d.ip);
      ms.push(performance.now() - s);
    }),
  );
  return {
    devices: devices.length,
    totalMs: Math.round(performance.now() - t0),
    deviceP50: q(ms, 0.5),
    deviceP95: q(ms, 0.95),
    statuses,
    retries503: retries,
  };
}

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  const epoch = nowSec - 60;
  const schedule = benchSchedule(epoch, length);
  const info = await startServer(epoch);
  log(`측정용 서버 ${JSON.stringify(info)}`);
  void sampleRss();
  void probeState();
  await sleep(1500);
  phase("준비(사람 만들기·서명)");

  // 사람: 예측하는 n명(앞쪽 (1-newRatio)는 1회차에 등록해 둔 다시 오는 사람) + 표만 받을 사람(모자라면 더)
  const returning = Math.round(n * (1 - newRatio));
  const extraPass = Math.max(0, passesN - returning);
  const players = await makePlayers(n + extraPass);
  const entrants = players.slice(0, n);
  const passHolders = [
    ...players.slice(0, Math.min(passesN, returning)),
    ...players.slice(n, n + extraPass),
  ];
  const preRegistered = [...players.slice(0, returning), ...players.slice(n)];
  const regFile = join(dir, "regs.json");
  writeFileSync(
    regFile,
    JSON.stringify(
      preRegistered.map((p) =>
        toBase64Url(encodeRegistration(registrationOf(p))),
      ),
    ),
  );
  await command(`register ${regFile}`);
  // 1회차를 닫는다(마감 → 봉인 → 추첨)
  const t1 = roundTimes(schedule, 1);
  await jump(t1.closesAt);
  await command("tick");
  await jump(drandTime(drandRoundForClose(t1.closesAt)));
  const closed1 = (await command("tick")) as { records: number };
  if (closed1.records !== 1) throw new Error("1회차를 닫지 못했다");
  const round = 2;
  const t2 = roundTimes(schedule, round);
  const drawAt = drandTime(drandRoundForClose(t2.closesAt));

  const rand = seeded(11);
  const load: Record<string, unknown>[] = [];
  const devices: { pub: string; ticketHex: string; ip: string }[] = [];
  for (const [i, p] of entrants.entries()) {
    const ticket = await ticketOf(p, round, pickNumbers(rand));
    load.push({
      ticket: toBase64Url(encodeTicket(ticket)),
      ...(i >= returning
        ? { registration: toBase64Url(encodeRegistration(registrationOf(p))) }
        : {}),
      gate: 0,
    });
    devices.push({
      pub: toBase64Url(p.publicKey),
      ticketHex: toHex(ticketId(ticket)),
      ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
    });
  }
  for (let i = load.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [load[i], load[j]] = [
      load[j] as (typeof load)[0],
      load[i] as (typeof load)[0],
    ];
  }
  const loadFile = join(dir, "load.json");
  writeFileSync(loadFile, JSON.stringify(load));

  const result: Record<string, unknown> = {
    scene,
    n,
    newRatio,
    arrival,
    window,
    watchers: watchersN,
    passes: passesN,
    server: info,
  };

  // 장면 시작 시각: entry는 마감 window+5초 전, room·both는 마감 2분 전
  const lead = scene === "entry" ? window + 5 : 120;
  await jump(t2.closesAt - lead);
  await command("start");
  await sleep(2000);
  phase("평상(몰림 전)");
  await sleep(3000);
  const closeAtMs = () => t2.closesAt * 1000 - offset;

  let watchers: WatcherProc[] = [];
  let talker: ReturnType<typeof talk> | null = null;
  if (scene !== "entry") {
    phase("관측지 들어오기(표 받기·연결)");
    const passes = await issuePasses(passHolders, round);
    result.passIssue = {
      issued: passes.tokens.length,
      p50: passes.p50,
      p95: passes.p95,
      fails: passes.fails,
    };
    log(`표 ${passes.tokens.length}장 받음`);
    watchers = startWatchers(round, passes.tokens);
    await sleep(12000);
    phase("관측지 말·응원(마감 전)");
    talker = talk(round, passes.tokens);
  }

  let entriesDone: Promise<Record<string, unknown>> = Promise.resolve({});
  if (n > 0) {
    const startEntriesAt = closeAtMs() - window * 1000 - 1000;
    await sleep(startEntriesAt - Date.now());
    if (scene === "entry") phase(`예측 몰림(${arrival})`);
    else log(`예측 ${n}장(${arrival}) 시작`);
    const child = spawn(
      "nice",
      [
        "-n",
        "15",
        process.execPath,
        join(here, "entries.js"),
        "--url",
        base,
        "--load",
        loadFile,
        "--close-at-ms",
        String(closeAtMs()),
        "--window",
        String(window),
        "--arrival",
        arrival,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    children.push(child);
    entriesDone = new Promise((resolve) => {
      let out = "";
      child.stdout?.on("data", (d) => {
        out += String(d);
      });
      child.on("exit", () => {
        const line = out.split("\n").find((l) => l.startsWith("결과 "));
        resolve(
          line ? JSON.parse(line.slice(3)) : { error: out.slice(0, 200) },
        );
      });
    });
  }
  // 마감 → 봉인
  await sleep(closeAtMs() - Date.now());
  if (scene !== "entry") phase("마감·봉인(관측지 말 계속)");
  result.entries = await entriesDone;
  const sealedOk = await until(() => seenSealed >= round, 120_000, "봉인");
  const sealEv = events.find((e) => e.what === `sealed ${round}`);
  result.sealAfterCloseSec = sealEv
    ? +(sealEv.serverAt - t2.closesAt).toFixed(1)
    : null;
  result.stateAfterSeal = pick(lastState);
  log(
    `봉인 ${sealedOk ? "끝" : "안 됨"}: 마감 뒤 ${result.sealAfterCloseSec}초`,
  );

  // 관측 기다림(5분)은 건너뛴다: 관측 20초 전으로
  await sleep(3000);
  await jump(drawAt - 20);
  if (scene !== "entry") phase("관측 1분(말·응원 계속)");
  else phase("추첨");
  const drawnOk = await until(() => seenRecords >= round, 90_000, "추첨");
  const drawEv = events.find((e) => e.what === `records ${round}`);
  result.drawAfterDrawAtSec = drawEv
    ? +(drawEv.serverAt - drawAt).toFixed(1)
    : null;
  log(
    `추첨 ${drawnOk ? "끝" : "안 됨"}: 관측 시각 뒤 ${result.drawAfterDrawAtSec}초`,
  );
  if (talker) {
    // 관측 1분이 끝날 때까지
    await sleep(drawAt * 1000 - offset + 60_000 - Date.now());
    result.talk = await talker.stop();
    for (const w of watchers) w.child.kill("SIGTERM");
    result.watchersResult = await Promise.all(watchers.map((w) => w.final));
  }
  result.stateAfterDraw = pick(lastState);
  result.pressureLog = pressureLines;

  if (proofN > 0) {
    phase(`새 기기 ${proofN}대 동시 받기(처음)`);
    const ds = devices.slice(0, proofN);
    result.proofFirst = await proofWave(ds, round);
    log(`처음 ${JSON.stringify(result.proofFirst)}`);
    phase(`새 기기 ${proofN}대 동시 받기(다시, 기억)`);
    result.proofAgain = await proofWave(ds, round);
    log(`다시 ${JSON.stringify(result.proofAgain)}`);
  }

  phase("끝");
  await sleep(1500);
  const healthy = await http("GET", "/api/state");
  result.aliveAtEnd = healthy.status === 200;
  result.finalState = pick(lastState);
  sampling = false;
  result.overallPeakRssMB = Math.round(overallPeak);
  result.phases = marks.map((m) => ({
    phase: m.phase,
    peakRssMB: Math.round(m.peakRssMB),
    stateP50: q(m.stateMs, 0.5),
    stateP99: q(m.stateMs, 0.99),
    stateMax: m.stateMs.length ? Math.round(Math.max(...m.stateMs)) : null,
    stateFail: m.stateFail,
  }));
  result.events = events.map((e) => ({
    what: e.what,
    fromClose: +(e.serverAt - t2.closesAt).toFixed(1),
  }));
  console.log(`결과 ${JSON.stringify(result)}`);
  stopping = true;
  await command("stop").catch(() => {});
  await sleep(300);
  killAll();
  rmSync(dir, { recursive: true, force: true });
}

function pick(s: Record<string, unknown>) {
  const keys = [
    "round",
    "sealed",
    "records",
    "behind",
    "sealOverdueSeconds",
    "entries",
    "entryBusyRecent",
    "entryPrefixRecent",
    "entryLateRecent",
    "entryMaxWaitMsRecent",
    "entryMaxQueueRecent",
    "pressure",
  ];
  return Object.fromEntries(keys.filter((k) => k in s).map((k) => [k, s[k]]));
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    killAll();
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  });
