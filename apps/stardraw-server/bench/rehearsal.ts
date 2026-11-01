/**
 * 정식 전환 리허설(docs/36 11-32, docs/39 4절). 운영 장부를 GET으로만 받아 이 맥에서 다시 세우고,
 * 시계를 빨리 감으며 일정 바꾸기 경계 넷을 지나 본다: 시험 20분 → 시험 1시간(schedule-change) → 정식 1시간(schedule-live,
 * 25회차 넘게, 100회차 묶음 경계) → 정식 30분 → 정식 2시간. 경계마다 예약(3회차 예고) → 예고 기간 → 경계 직전에 미리 푼 앞단 →
 * 마감~추첨 사이 → 새 일정 첫 회차(문제 값, 회차 시각, 회차 방 열림·닫힘)를 보고, 응모·등록·확인 링크·회차 방 입장을 섞는다.
 * 끝에 장부 전체 검사(터미널 검사기와 같은 `checkPublicLedger`)와 경계마다 가벼운 기록·묶음·증명 API, 앵커 브랜치를 대조한다.
 *
 * 운영 서버에는 GET만 보낸다(공개 장부 파일). 바깥은 모두 가짜다:
 * - drand: 회차마다 정해진 가짜 서명(`fakeBeacon`). 검사는 지난 회차는 진짜 quicknet BLS로, 리허설 회차는 가짜 값으로 본다.
 * - 시각 인증: 가짜 기관 둘(`FakeTsa`, 서버와 같은 `TsaRootLog`로 두 곳 받기). 검사기에 그 두 기관을 더해 넣는다.
 * - 앵커: 가짜 GitHub(`FakeGitHub`)에 서버와 같은 `GitHubAnchor`로 올린다. 실제 저장소에는 아무것도 올리지 않는다.
 * - 관인: 새로 만든다(운영 관인은 쓰지 않는다). 그래서 검사 항목 「관인 열쇠」만은 늘 실패한다(장부의 관인 ≠ 리허설 관인).
 * - 이 프로세스의 시계(Date)는 `ManualClock`을 따른다. 서버의 `/api/time`과 화면 보정도 같은 가짜 시각을 본다.
 *
 * 묶기: pnpm -C apps/stardraw-server exec rolldown -c bench/rolldown.bench.mjs
 * 실행(자동, 결과는 <work>/rehearsal-report.json):
 *   nice -n 15 node apps/stardraw-server/dist/bench/rehearsal.js --work <빈 폴더>
 * 화면 확인용(시험 회차에서 멈춰 실제 시간으로 흐르며 /rehearsal/… 제어를 받는다. 화면 스크립트 rehearsal-screens.mjs가 조종):
 *   nice -n 15 node apps/stardraw-server/dist/bench/rehearsal.js --work <빈 폴더> --screens
 *
 * 선택: --base <운영 서버>(기본 https://game.byb.kr/stardraw-api) --port 8855 --dev-origin http://localhost:4855
 *       --trial-rounds 2(예약 전 시험 회차) --live-rounds 26(정식 회차, 100회차 묶음 경계까지는 늘 간다)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ManualClock } from "@mighty/fair-play";
import {
  anchorBranch,
  checkPublicLedger,
  checkRegistrationProof,
  checkTicketProof,
  type DrandBeacon,
  decodeTicket,
  displayRound,
  drandRandomness,
  drandRoundForClose,
  drandTime,
  drawNumbers,
  drawSeed,
  encodeInvite,
  encodeRegistration,
  encodeRegistrationProof,
  encodeSignatureData,
  encodeTicket,
  equalBytes,
  fromBase64Url,
  fromHex,
  generateSigner,
  type KeyRegistration,
  ledgerId,
  lightBundleName,
  lightFileName,
  liveStart,
  loadRoundFiles,
  makeRegistration,
  makeTicket,
  newInviteToken,
  POW_PARAMS,
  phaseOf,
  type RoundRecord,
  roomPassMessage,
  roundSummary,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  type SoftPasskey,
  sha256,
  signInvite,
  signRegistrationProof,
  softPasskeySigner,
  solveGate,
  type Ticket,
  TSA_AUTHORITIES,
  ticketId,
  toBase64Url,
  toHex,
  verifyQuicknetBeacon,
} from "@mighty/stardraw-core";
import { FakeTsa } from "@mighty/stardraw-core/testing";
import {
  compareLedgers,
  folderFetch,
} from "../../../packages/stardraw-cli/src/source";
import { DEFAULT_PREFIX_LIMITS, frontGateConfig } from "../src/config";
import { StardrawServer } from "../src/engine";
import { createHttpServer } from "../src/http";
import { type DrandSource, GitHubAnchor, TsaRootLog } from "../src/outside";
import { ProofService } from "../src/proof";
import { Publisher, pad } from "../src/publish";
import { DEFAULT_RELAY_LIMITS, Relay } from "../src/relay";
import { restoreFromAnchor } from "../src/restore";
import { RoomHub } from "../src/room";
import { scheduleChange, scheduleLive } from "../src/schedule-live";
import { newServerKeyPkcs8, serverKeyFromPkcs8 } from "../src/server-key";
import { Store } from "../src/store";
import { FakeGitHub, fakeBeacon } from "../src/testing";
import { arg } from "./common";

/**
 * 이 프로세스 안의 요청은 node:http로(가짜 시계로 Date가 크게 뛰면 내장 fetch의 연결 재사용 시간 계산이 어긋나 끊긴다).
 * 운영 서버에서 받는 처음 단계는 시계를 바꾸기 전이라 내장 fetch를 쓴다
 */

const localFetch = ((input: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body = init?.body ? String(init.body) : undefined;
    const req = httpRequest(
      url,
      {
        method: init?.method ?? "GET",
        agent: false,
        headers: {
          ...(body
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
            }),
          ),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  })) as typeof fetch;

const REPO = "ybbarng/stardraw-ledger";
const RAW = `https://raw.githubusercontent.com/${REPO}/`;

// ── 설정 ──
const base = arg("base", "https://game.byb.kr/stardraw-api");
const work = arg("work", "");
const port = Number(arg("port", "8855"));
const devOrigin = arg("dev-origin", "http://localhost:4855");
const trialRounds = Number(arg("trial-rounds", "2"));
const liveRoundsMin = Number(arg("live-rounds", "26"));
const screens = process.argv.includes("--screens");
if (!work) throw new Error("--work <빈 폴더>를 주세요");
if (existsSync(join(work, "data")))
  throw new Error(`${work}/data가 이미 있다. 빈 폴더를 주세요`);

const logLines: string[] = [];
const say = (m: string) => {
  const line = `[리허설 ${iso(Math.floor(Date.now() / 1000))}] ${m}`;
  logLines.push(line);
  console.log(line);
};
const kst = (sec: number) =>
  new Date(sec * 1000 + 9 * 3600_000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
function iso(sec: number) {
  return `${kst(sec)} KST`;
}

/** 확인 결과(보고서) */
interface Finding {
  ok: boolean;
  what: string;
  detail?: string;
}
const findings: Finding[] = [];
const expect = (ok: boolean, what: string, detail?: string) => {
  findings.push({ ok, what, ...(detail ? { detail } : {}) });
  say(`${ok ? "통과" : "실패"} · ${what}${detail ? ` — ${detail}` : ""}`);
};

// ── 1. 운영 장부 받기(GET만) ──
async function download(): Promise<{ dir: string; rounds: number }> {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  const genesis = await get<{ v: 1; schedule: Schedule }>(
    "/ledger/genesis.json",
  );
  const head = await get<{ rounds: number }>("/ledger/head.json");
  const dir = join(work, "source", "ledger");
  for (const sub of ["rounds", "seals"])
    mkdirSync(join(dir, sub), { recursive: true });
  const files = await loadRoundFiles(base, fetch, 1, head.rounds, {
    seals: true,
  });
  const text = (v: unknown) => `${JSON.stringify(v)}\n`;
  writeFileSync(join(dir, "genesis.json"), text(genesis));
  writeFileSync(join(dir, "head.json"), text(head));
  for (const [i, f] of files.entries()) {
    writeFileSync(join(dir, "rounds", `${pad(i + 1)}.json`), text(f.round));
    writeFileSync(join(dir, "seals", `${pad(i + 1)}.json`), text(f.seal));
  }
  return { dir, rounds: head.rounds };
}

// ── 시계: 이 프로세스의 Date를 ManualClock에 묶는다 ──
function bindDate(clock: ManualClock): void {
  const Real = Date;
  class RehearsalDate extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(clock.now());
      else super(...(args as [number]));
    }
    static override now() {
      return clock.now();
    }
  }
  globalThis.Date = RehearsalDate as DateConstructor;
}

/** 지난 회차는 진짜 quicknet BLS, 리허설 회차는 가짜 값 */
const beaconOk = (b: DrandBeacon) =>
  verifyQuicknetBeacon(b) ||
  equalBytes(b.signature, fakeBeacon(b.round).signature);

class RehearsalDrand implements DrandSource {
  async get(round: number): Promise<DrandBeacon | null> {
    return fakeBeacon(round);
  }
}

/** 회차 k에 나올 당첨 번호(가짜 drand라 미리 안다) */
function drawOf(schedule: Schedule, round: number) {
  const { closesAt } = roundTimes(schedule, round);
  return drawNumbers(
    drawSeed(round, drandRandomness(fakeBeacon(drandRoundForClose(closesAt)))),
  ).numbers;
}

function entryOf(schedule: Schedule, round: number): ScheduleEntry {
  return roundTimes(schedule, round).entry;
}

async function main() {
  mkdirSync(work, { recursive: true });
  say(`운영 장부를 받는다(GET): ${base}`);
  const src = await download();
  say(`받음: ${src.rounds}회차`);

  const dataDir = join(work, "data");
  const ledgerDir = join(dataDir, "ledger");
  mkdirSync(dataDir, { recursive: true });
  const policy = {
    rpId: "game.byb.kr",
    origins: ["https://game.byb.kr", devOrigin],
  };
  const restored = await restoreFromAnchor({
    from: src.dir,
    out: join(dataDir, "stardraw.sqlite"),
    ledgerDir,
    policy: { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
    pow: POW_PARAMS,
    log: (m) => say(`restore: ${m}`),
  } as Parameters<typeof restoreFromAnchor>[0]);
  say(
    `다시 세움: ${restored.rounds}회차, 끝 해시 ${restored.head.slice(0, 16)}…`,
  );

  // 여기서부터 시계는 가짜(지금 시각에서 출발)
  const clock = new ManualClock();
  clock.advance(Math.floor(Date.now() / 1000) * 1000);
  bindDate(clock);
  globalThis.fetch = localFetch;

  const store = new Store(join(dataDir, "stardraw.sqlite"));
  const serverKey = await serverKeyFromPkcs8(await newServerKeyPkcs8());
  const nowSec = () => Math.floor(clock.now() / 1000);
  const tsaA = new FakeTsa("rehearsal-tsa-a", nowSec);
  const tsaB = new FakeTsa("rehearsal-tsa-b", nowSec);
  tsaB.shift = 1;
  const tsaFetch: typeof fetch = (input, init) => {
    const fake = [tsaA, tsaB].find((f) => String(input) === f.authority.url);
    return fake
      ? fake.fetch(input, init)
      : Promise.reject(new Error("모르는 기관"));
  };
  const github = new FakeGitHub();
  const serverLog: string[] = [];
  const engine = new StardrawServer({
    store,
    publisher: new Publisher(ledgerDir),
    clock,
    schedule: { epoch: 0, entries: [] }, // 장부가 이미 있어 쓰이지 않는다
    pow: POW_PARAMS,
    policy,
    serverKey,
    drand: new RehearsalDrand(),
    rootLog: new TsaRootLog(
      [tsaA.authority, tsaB.authority],
      2,
      tsaFetch,
      (m) => serverLog.push(m),
      () => clock.now(),
    ),
    anchor: new GitHubAnchor(REPO, "rehearsal-no-token", github.fetch),
    limits: {
      entriesPerPrefixPerRound: DEFAULT_PREFIX_LIMITS.entriesPerPrefixPerRound,
      registrationsPerPrefixPerDay:
        DEFAULT_PREFIX_LIMITS.registrationsPerPrefixPerDay,
      argonConcurrency: 2,
      argonQueue: 400,
    },
    frontGate: frontGateConfig(() => undefined) ?? undefined,
    sealDeadline: 180,
    log: (m) => {
      serverLog.push(`${iso(nowSec())} ${m}`);
    },
  } as ConstructorParameters<typeof StardrawServer>[0]);
  await engine.ready();
  const relay = new Relay(store, clock, policy, DEFAULT_RELAY_LIMITS, (pub) =>
    engine.isActiveDirector(pub),
  );
  const rooms = new RoomHub({
    clock,
    policy,
    schedule: () => engine.schedule(),
    isRegistered: (pub) => engine.isRegistered(pub),
    isDirector: (pub) => engine.isActiveDirector(pub),
    sealed: (round) => store.seal(round) !== null,
    tickets: (round) => store.entries(round),
    drawn: (round) => store.record(round) !== null,
  });
  const inner = createHttpServer(engine, relay, {
    basePath: "/stardraw-api",
    ledgerDir,
    devOrigins: [devOrigin],
    trustProxy: false,
    rooms,
    proofs: new ProofService(store, clock),
  });
  const innerHandler = inner.listeners("request")[0] as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;

  // ── 시계 옮기기 ──
  let busy: Promise<void> = Promise.resolve();
  const step = async (toSec: number) => {
    while (nowSec() < toSec) {
      const before = store.recordCount();
      clock.advance(Math.min(5, toSec - nowSec()) * 1000);
      await engine.tick();
      if (store.recordCount() !== before) {
        await engine.earlySealIdle();
        await engine.anchorIdle();
      }
    }
    await engine.tick();
    await engine.earlySealIdle();
    await engine.anchorIdle();
  };
  const advanceTo = (toSec: number) => {
    const run = busy.then(() => step(toSec));
    busy = run.catch(() => undefined);
    return run;
  };

  const api = `http://127.0.0.1:${port}/stardraw-api`;
  const getJson = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${api}${path}`);
    if (!res.ok)
      throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${api}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json };
  };
  type State = ReturnType<StardrawServer["state"]>;
  const state = () => getJson<State>("/api/state");

  // ── 응모하는 사람(흉내 패스키, 화면과 같은 요청) ──
  interface Bot {
    name: string;
    signer: SoftPasskey;
    registered: boolean;
    tickets: { round: number; ticket: Ticket; winner: boolean }[];
  }
  const bots: Bot[] = [];
  const newBot = async (): Promise<Bot> => {
    const b: Bot = {
      name: `우주인${bots.length + 1}`,
      signer: softPasskeySigner(await generateSigner()),
      registered: false,
      tickets: [],
    };
    bots.push(b);
    return b;
  };
  const gateFor = async (s: State, pub: Uint8Array, head = s.head) => {
    if (s.gateTarget === undefined) return {};
    const n = await solveGate(fromHex(head), pub, s.gateTarget);
    if (n === null) throw new Error("앞단을 풀지 못했다");
    return { gate: n };
  };
  let lastEnterError = "";
  const enter = async (
    b: Bot,
    numbers?: number[],
    opts: { gate?: number; quiet?: boolean } = {},
  ) => {
    const s = await state();
    const schedule = engine.schedule();
    const entry = entryOf(schedule, s.round);
    const challenge = fromHex(s.head);
    const winning = drawOf(schedule, s.round);
    const nums =
      numbers ?? (Math.random() < 0.5 ? winning : [40, 41, 42, 43, 44, 45]);
    const ticket = await makeTicket(
      b.signer,
      s.round,
      nums,
      challenge,
      entry.powTarget,
      { params: POW_PARAMS },
    );
    if (!ticket) throw new Error("응모권을 만들지 못했다");
    let registration: KeyRegistration | null = null;
    if (!b.registered) {
      registration = await makeRegistration(
        b.signer,
        b.signer.credentialId,
        challenge,
        entry.registerPowTarget,
        {
          params: POW_PARAMS,
        },
      );
      if (!registration) throw new Error("등록을 만들지 못했다");
    }
    const gate =
      opts.gate !== undefined
        ? { gate: opts.gate }
        : await gateFor(s, ticket.pub);
    const res = await post("/api/enter", {
      ticket: toBase64Url(encodeTicket(ticket)),
      ...(registration
        ? { registration: toBase64Url(encodeRegistration(registration)) }
        : {}),
      ...gate,
    });
    if (res.status !== 200) {
      lastEnterError = `${res.status} ${String(res.json.error)}`;
      if (!opts.quiet)
        say(`${b.name} 응모 실패(${s.round}회차): ${lastEnterError}`);
      return null;
    }
    b.registered = true;
    const won = nums.join() === winning.join();
    b.tickets.push({ round: s.round, ticket, winner: won });
    return { round: s.round, ticket, won };
  };
  const registerOnly = async (b: Bot) => {
    const s = await state();
    const entry = entryOf(engine.schedule(), s.round);
    const registration = await makeRegistration(
      b.signer,
      b.signer.credentialId,
      fromHex(s.head),
      entry.registerPowTarget,
      {
        params: POW_PARAMS,
      },
    );
    if (!registration) throw new Error("등록을 만들지 못했다");
    const proof = await signRegistrationProof(b.signer, registration);
    const res = await post("/api/register", {
      registration: toBase64Url(encodeRegistration(registration)),
      proof: toBase64Url(encodeRegistrationProof(proof)),
      head: s.head,
      ...(await gateFor(s, registration.pub)),
    });
    if (res.status === 200) b.registered = true;
    return res;
  };
  const roomPass = async (b: Bot, round: number) => {
    const ch = await post(`/api/room/${round}/challenge`, {});
    if (ch.status !== 200) return ch.status;
    const nonce = String(ch.json.nonce);
    const signature = await b.signer.sign(
      roomPassMessage(round, fromBase64Url(nonce)),
    );
    const got = await post(`/api/room/${round}/pass`, {
      pub: toBase64Url(b.signer.publicKey),
      signature: encodeSignatureData(signature),
      nonce,
    });
    return got.status;
  };
  const invite = async (b: Bot, ticket: Ticket) => {
    const signed = await signInvite(b.signer, ticket, newInviteToken());
    return post("/api/confirm/invites", {
      invite: encodeInvite(signed),
      inboxHash: toBase64Url(sha256(new Uint8Array(16).fill(7))),
    });
  };

  // ── 서버 띄우기(리허설 제어 /rehearsal/… 을 앞에 둔다) ──
  const control = async (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ) => {
    const body = await new Promise<Record<string, unknown>>((resolve) => {
      let t = "";
      req.on("data", (c) => (t += c));
      req.on("end", () => {
        try {
          resolve(t ? JSON.parse(t) : {});
        } catch {
          resolve({});
        }
      });
    });
    const send = (status: number, v: unknown) => {
      res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify(v));
    };
    try {
      if (path === "/rehearsal/info") return send(200, await info());
      if (path === "/rehearsal/jump") {
        await advanceTo(Number(body.to));
        return send(200, await info());
      }
      if (path === "/rehearsal/schedule")
        return send(
          200,
          await reserve(
            Number(body.length ?? 3600),
            body.phase === "trial" ? "trial" : "live",
          ),
        );
      if (path === "/rehearsal/bots") {
        const n = Number(body.count ?? 2);
        const out = [];
        for (let i = 0; i < n; i++)
          out.push(
            await enter(bots[i] ?? (await newBot()), undefined, {
              quiet: true,
            }),
          );
        return send(200, { entered: out.filter(Boolean).length });
      }
      if (path === "/rehearsal/check") return send(200, await fullCheck());
      if (path === "/rehearsal/times") {
        const k = Number(body.round);
        const t = roundTimes(engine.schedule(), k);
        return send(200, {
          round: k,
          label: displayRound(engine.schedule(), k).label,
          opensAt: t.opensAt,
          closesAt: t.closesAt,
          entryDeadline: t.entryDeadline,
          drawAt: drandTime(drandRoundForClose(t.closesAt)),
          length: t.entry.length,
        });
      }
      return send(404, { error: "없는 제어" });
    } catch (err) {
      return send(500, { error: String(err) });
    }
  };
  const http = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://local").pathname;
    if (path.startsWith("/rehearsal/")) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET, POST",
        });
        return res.end();
      }
      void control(req, res, path);
      return;
    }
    innerHandler(req, res);
  });
  await new Promise<void>((r) => http.listen(port, r));
  say(
    `리허설 서버: http://localhost:${port}/stardraw-api (화면 출처 ${devOrigin})`,
  );

  async function info() {
    const s = engine.state();
    const schedule = engine.schedule();
    const t = roundTimes(schedule, Math.max(1, s.round));
    return {
      now: s.now,
      nowKst: iso(s.now),
      round: s.round,
      label: displayRound(schedule, Math.max(1, s.round)),
      records: s.records,
      mode: s.mode,
      liveFrom: s.liveFrom,
      opensAt: t.opensAt,
      closesAt: t.closesAt,
      drawAt: drandTime(drandRoundForClose(t.closesAt)),
      pendingChange: store.pendingChange(),
    };
  }

  const lengthName = (l: number) =>
    l % 3600 === 0 ? `${l / 3600}시간` : `${l / 60}분`;
  const phaseName = (p: string | null | undefined) =>
    p === "live" ? "정식" : "시험";

  /**
   * 일정 바꾸기를 가장 이른 시작 회차로 예약한다(3회차 예고, 새 길이로 추첨이 배수 시각에 오는 회차).
   * 서버 컨테이너의 schedule-change·schedule-live 명령과 같은 함수를 부른다
   */
  const reserve = async (length: number, phase: "trial" | "live") => {
    await busy;
    const schedule = engine.schedule();
    const toLive = phase === "live" && liveStart(schedule) === null;
    let lastErr = "";
    for (let k = store.recordCount() + 5; k < store.recordCount() + 400; k++) {
      const from = roundTimes(schedule, k).opensAt;
      if ((from + 300) % length !== 0) continue;
      try {
        const res = toLive
          ? scheduleLive(store, from, length)
          : scheduleChange(store, from, length, phase);
        const cmd = toLive
          ? `schedule-live --from ${new Date(from * 1000).toISOString()}`
          : `schedule-change --from ${new Date(from * 1000).toISOString()} --round-seconds ${length}`;
        say(
          `${cmd} → 사슬 ${res.change.fromRound}회차부터 ${phaseName(phase)} ${lengthName(length)}, ${res.decidedIn}회차 기록에 실린다`,
        );
        return { cmd, from, fromKst: iso(from), ...res };
      } catch (err) {
        lastErr = String(err instanceof Error ? err.message : err);
      }
    }
    throw new Error(`예약하지 못했다: ${lastErr}`);
  };

  /** 장부 전체 검사(터미널 검사기와 같은 함수, 가짜 drand·기관·앵커만 바꿔 끼움) */
  const rawFetch: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(RAW)) {
      const rest = url.slice(RAW.length);
      const slash = rest.indexOf("/");
      const text = github.text(
        rest.slice(0, slash),
        decodeURIComponent(rest.slice(slash + 1)),
      );
      return text === undefined
        ? new Response("404", { status: 404 })
        : new Response(text);
    }
    if (url.startsWith("https://"))
      return new Response("리허설은 바깥에 묻지 않는다", { status: 404 });
    return fetch(input, init);
  };
  async function fullCheck() {
    await busy;
    const opts = {
      powSample: 8,
      beaconVerifier: beaconOk,
      tsaAuthorities: [...TSA_AUTHORITIES, tsaA.authority, tsaB.authority],
      voidBeacon: async (r: number) => fakeBeacon(r),
      anchorRepo: REPO,
    };
    const server = await checkPublicLedger({
      base: api,
      fetch: rawFetch,
      ...opts,
    });
    // 앵커 사본(main 브랜치) 폴더: `git clone --branch main`과 같은 모양으로 꺼내 --source <폴더>처럼 검사
    const folder = join(work, "anchor-main");
    for (const [path, text] of github.files("main")) {
      mkdirSync(join(folder, path, ".."), { recursive: true });
      writeFileSync(join(folder, path), text);
    }
    const id = ledgerId(server.ledger.genesis);
    const folderBase = pathToFileURL(join(folder, "ledgers", id)).href;
    const ff = folderFetch(rawFetch);
    const copy = await checkPublicLedger({
      base: folderBase,
      fetch: ff,
      ...opts,
    });
    const diff = compareLedgers(server.ledger, copy.ledger);
    const view = (r: typeof server) =>
      r.items.map((i) => ({
        id: i.id,
        label: i.label,
        status: i.status,
        ...(i.detail ? { detail: i.detail } : {}),
      }));
    return {
      server: {
        rounds: server.rounds,
        mode: server.mode,
        items: view(server),
        problems: server.problems.slice(0, 20),
      },
      anchorMain: {
        rounds: copy.rounds,
        items: view(copy),
        problems: copy.problems.slice(0, 20),
      },
      compare: diff.slice(0, 20),
    };
  }

  // ── 화면 확인 모드: 시험 회차 몇 개만 돌리고 실제 시간으로 흐르며 제어를 받는다 ──
  await advanceTo(nowSec() + 1);
  if (screens) {
    say(
      "화면 모드: 실제 시간으로 흐른다. 제어는 /rehearsal/info · jump · schedule-live · bots · check",
    );
    let last = performance.now();
    setInterval(() => {
      const t = performance.now();
      const dt = Math.floor(t - last);
      last += dt;
      busy = busy.then(async () => {
        clock.advance(dt);
        await engine.tick();
      });
    }, 250);
    return;
  }

  // ── 자동 리허설 ──
  const closeOf = (r: number) => roundTimes(engine.schedule(), r).closesAt;
  const drawOfRound = (r: number) => drandTime(drandRoundForClose(closeOf(r)));
  /** 회차 r의 응모가 열린 직후(앞 회차 추첨 + 10초)로 */
  const toOpen = async (r: number) => {
    const t =
      Math.max(
        roundTimes(engine.schedule(), r).opensAt,
        r > 1 ? drawOfRound(r - 1) : 0,
      ) + 10;
    await advanceTo(t);
  };

  const roundsSeen: {
    round: number;
    label: string;
    phase: string;
    opensAt: string;
    closesAt: string;
    length: number;
    entries: number;
    void: boolean;
  }[] = [];
  const boundaries: {
    name: string;
    first: number;
    decidedIn: number;
    cmd: string;
    from: string;
  }[] = [];

  const startRecords = store.recordCount();
  say(
    `시작: 닫힌 기록 ${startRecords}회차, 지금 ${(await info()).round}회차(${(await info()).label.label})`,
  );
  for (let i = 0; i < 4; i++) await newBot();

  // 1) 시험 회차 몇 개(지금 열린 회차는 운영에서 받던 응모를 잃었으니 다음 회차부터 응모를 섞는다)
  let r = startRecords + 2;
  await advanceTo(drawOfRound(startRecords + 1) + 10);
  for (let k = 0; k < trialRounds; k++, r++) {
    await toOpen(r);
    for (const b of bots.slice(0, 4)) await enter(b);
    await roomPass(bots[0] as Bot, r).then((s) =>
      expect(s === 200, `시험 ${r}회차 방 입장`, `HTTP ${s}`),
    );
  }

  /**
   * 경계 하나를 지난다: 예약 → 예고 기간(응모·등록·방) → 경계 직전 앞단 미리 풀기 → 마감~추첨 사이 →
   * 새 일정 첫 회차(문제 값·앞단·응모·방 열림과 닫힘) → 새 일정 회차 몇 개
   */
  const cross = async (
    length: number,
    phase: "trial" | "live",
    roundsAfter: (first: number) => number,
  ) => {
    const before = engine.schedule().entries.at(-1) as ScheduleEntry;
    const name = `${phaseName(before.phase)} ${lengthName(before.length)} → ${phaseName(phase)} ${lengthName(length)}`;
    say(`── 경계: ${name} ──`);
    await toOpen(r);
    const res = await reserve(length, phase);
    const B = res.change.fromRound;
    const K = res.decidedIn;
    boundaries.push({
      name,
      first: B,
      decidedIn: K,
      cmd: res.cmd,
      from: res.fromKst,
    });
    expect(
      B >= K + 4,
      `[${name}] 새 일정 첫 회차 ≥ 실리는 기록 + 4(3회차 예고)`,
      `실림 ${K}, 첫 회차 ${B}`,
    );
    // 예고 기간
    for (; r < B; r++) {
      await toOpen(r);
      await enter(await newBot());
      await enter(bots[1] as Bot, drawOf(engine.schedule(), r));
      await registerOnly(await newBot()).then((x) =>
        expect(
          x.status === 200,
          `[${name}] 예고 중 ${r}회차 등록만`,
          `HTTP ${x.status}`,
        ),
      );
      if (r === K + 1) {
        const s = engine.state();
        const known = roundTimes(engine.schedule(), B);
        expect(
          known.entry.length === length &&
            known.entry.phase === phase &&
            s.mode === (before.phase === "live" ? "live" : "trial"),
          `[${name}] ${K}회차 기록 뒤: 일정표에 새 줄(예고 중), 지금 단계 그대로`,
          JSON.stringify({
            liveFrom: s.liveFrom,
            mode: s.mode,
            pending: s.pending,
          }),
        );
        const again = await (async () => {
          try {
            scheduleChange(
              store,
              roundTimes(engine.schedule(), B + 8).opensAt,
              3600,
              phase,
            );
            return "받음";
          } catch (err) {
            return String(err instanceof Error ? err.message : err);
          }
        })();
        expect(
          again.includes("예고 중"),
          `[${name}] 예고 중에는 다른 일정 바꾸기를 받지 않는다`,
          again,
        );
      }
    }
    // 경계 직전: B-1 응모 창에서 앞단을 미리 풀어 둔다(화면이 응모 화면에 들어오면 미리 푸는 것과 같다)
    const early = bots[2] as Bot;
    const sBefore = await state();
    expect(
      sBefore.round === B - 1,
      `[${name}] 경계 직전 회차`,
      `${sBefore.round}`,
    );
    const preGate = await gateFor(sBefore, early.signer.publicKey);
    // B-1 마감 직후~추첨 전: B는 열렸지만 앞 회차 기록이 없다
    await advanceTo(closeOf(B - 1) + 30);
    const sGap = await state();
    expect(
      sGap.round === B && sGap.mode === phase,
      `[${name}] 마감 직후 상태: 새 일정 첫 회차, mode ${phase}`,
      JSON.stringify({
        round: sGap.round,
        mode: sGap.mode,
        records: sGap.records,
      }),
    );
    const gapTry = await enter(early, undefined, { quiet: true, ...preGate });
    expect(
      gapTry === null && lastEnterError.startsWith("409"),
      `[${name}] 마감~추첨 사이 응모는 「앞 회차 추첨 뒤」로 409`,
      lastEnterError,
    );
    await advanceTo(drawOfRound(B - 1) + 10);
    const sNew = await state();
    expect(
      sNew.head !== sBefore.head && sNew.records === B - 1,
      `[${name}] 첫 회차 문제 값 = 앞 회차 기록 해시`,
      `${sBefore.head.slice(0, 12)} → ${sNew.head.slice(0, 12)}`,
    );
    const stale = await enter(early, undefined, { quiet: true, ...preGate });
    expect(
      stale === null && lastEnterError.startsWith("400"),
      `[${name}] 경계 전에 풀어 둔 앞단 답은 400(화면은 새 문제 값으로 다시 푼다)`,
      lastEnterError,
    );
    const fresh = await enter(early, drawOf(engine.schedule(), B));
    expect(
      fresh !== null,
      `[${name}] 새 문제 값으로 다시 풀면 받는다(1등 번호)`,
      fresh ? `사슬 ${fresh.round}` : lastEnterError,
    );
    for (const b of [bots[0], bots[1], bots[3]] as Bot[]) await enter(b);
    // 회차 시각
    const t0 = roundTimes(engine.schedule(), B - 1);
    const t1 = roundTimes(engine.schedule(), B);
    const t2 = roundTimes(engine.schedule(), B + 1);
    const draw1 = drandTime(drandRoundForClose(t1.closesAt));
    expect(
      t1.opensAt === t0.closesAt &&
        t1.closesAt - t1.opensAt === length &&
        t2.opensAt === t1.closesAt &&
        draw1 % length === 0 &&
        draw1 - t1.closesAt === 300,
      `[${name}] 회차 시각: 빈틈 없이 이어지고 추첨은 마감 5분 뒤, ${lengthName(length)}의 배수 시각`,
      `${B - 1}: ~${kst(t0.closesAt)} / ${B}: ${kst(t1.opensAt)}~${kst(t1.closesAt)} 추첨 ${kst(draw1)} / ${B + 1}: ~${kst(t2.closesAt)}`,
    );
    // 회차 방: 응모 창 내내 들어오고, 추첨 뒤 새로 못 들어오고, 추첨 7분 뒤 닫힌다
    await roomPass(bots[0] as Bot, B).then((s) =>
      expect(s === 200, `[${name}] 첫 회차 방 입장(열린 직후)`, `HTTP ${s}`),
    );
    await advanceTo(closeOf(B) - 60);
    await roomPass(bots[1] as Bot, B).then((s) =>
      expect(s === 200, `[${name}] 첫 회차 방: 마감 1분 전 입장`, `HTTP ${s}`),
    );
    await advanceTo(drawOfRound(B) + 60);
    await roomPass(bots[3] as Bot, B).then((s) =>
      expect(
        s === 409,
        `[${name}] 첫 회차 방: 추첨 뒤 새로 못 들어옴`,
        `HTTP ${s}`,
      ),
    );
    await advanceTo(drawOfRound(B) + 7 * 60 + 5);
    await roomPass(bots[3] as Bot, B).then((s) =>
      expect(s === 410, `[${name}] 첫 회차 방: 추첨 7분 뒤 닫힘`, `HTTP ${s}`),
    );
    // 새 일정 회차 몇 개
    for (r = B + 1; r < B + roundsAfter(B); r++) {
      await toOpen(r);
      if (r % 3 === 0) await enter(await newBot());
      if (r % 2 === 0) await enter(bots[r % 4] as Bot);
      if (r % 5 === 0)
        await enter(bots[1] as Bot, drawOf(engine.schedule(), r));
      if (r % 7 === 0)
        await roomPass(bots[0] as Bot, r).then((s) =>
          expect(s === 200, `[${name}] ${r}회차 방 입장`, `HTTP ${s}`),
        );
    }
    return B;
  };

  // 2) 경계들: 시험 20분 → 시험 1시간 → 정식 1시간(25회차 넘게, 100회차 묶음 경계) → 정식 30분 → 정식 2시간
  await cross(3600, "trial", () => 3);
  // 정식 1시간은 25회차 넘게, 그리고 100회차 묶음 경계를 넘을 때까지
  const L = await cross(3600, "live", (first) =>
    Math.max(liveRoundsMin, Math.ceil(first / 100) * 100 + 2 - first),
  );
  await cross(1800, "live", () => 4);
  await cross(7200, "live", () => 4);
  const lastRound = r - 1;
  await advanceTo(drawOfRound(lastRound) + 30);

  // ── 확인 ──
  const schedule = engine.schedule();
  const n = store.recordCount();
  for (let k = startRecords + 1; k <= n; k++) {
    const rec = store.record(k) as RoundRecord;
    const t = roundTimes(schedule, k);
    roundsSeen.push({
      round: k,
      label: displayRound(schedule, k).label,
      phase: phaseOf(schedule, k) ?? "-",
      opensAt: kst(t.opensAt),
      closesAt: kst(t.closesAt),
      length: t.entry.length,
      entries: rec.count,
      void: rec.void,
    });
  }
  const voids = roundsSeen.filter((x) => x.void).map((x) => x.round);
  expect(voids.length === 0, "무효 회차 없음", voids.join(",") || "-");
  expect(
    n >= lastRound &&
      roundsSeen.every(
        (x, i) => i === 0 || x.round === (roundsSeen[i - 1]?.round ?? 0) + 1,
      ),
    "추첨이 끊기지 않음",
    `${startRecords + 1}~${n}회차`,
  );
  const liveCount = n - L + 1;
  expect(
    liveStart(schedule) === L && liveCount >= 25,
    "일정표의 정식 시작과 정식 회차 수",
    `사슬 ${L}회차 = ${displayRound(schedule, L).label}, 정식 ${liveCount}회차 닫힘`,
  );
  expect(
    true,
    "일정표",
    schedule.entries
      .map(
        (e) => `${e.fromRound}~ ${phaseName(e.phase)} ${lengthName(e.length)}`,
      )
      .join(" / "),
  );

  // 앵커 브랜치
  const anchorBranches = new Map<number, string[]>();
  for (const branch of ["trial", "main"])
    for (const [path] of github.files(branch)) {
      const m = /\/(\d{6})\.txt$/.exec(path);
      if (
        m &&
        path.startsWith("ledgers/") &&
        !path.includes("/ledger/") &&
        !path.includes("early-seals")
      ) {
        const k = Number(m[1]);
        anchorBranches.set(k, [...(anchorBranches.get(k) ?? []), branch]);
      }
    }
  const wrongBranch: string[] = [];
  for (let k = 1; k <= n; k++) {
    const want = anchorBranch(schedule, k);
    const got = anchorBranches.get(k) ?? [];
    if (!got.includes(want))
      wrongBranch.push(`${k}:${got.join("+") || "없음"}≠${want}`);
  }
  expect(
    wrongBranch.length === 0,
    "앵커: 시험 회차 trial, 정식 회차 main",
    wrongBranch.slice(0, 5).join(" ") || `1~${n}`,
  );
  const id = ledgerId(store.storedGenesis() as Schedule);
  const missingOn = (path: (k: number) => string) =>
    Array.from({ length: n }, (_, i) => i + 1).filter(
      (k) => github.text("main", path(k)) === undefined,
    );
  const mainMissing = missingOn(
    (k) => `ledgers/${id}/ledger/rounds/${pad(k)}.json`,
  );
  expect(
    mainMissing.length === 0,
    "앵커 main 브랜치에 1회차부터 전체 장부 사본(정식 뒤 main만 받아도 다시 세울 수 있다)",
    mainMissing.length
      ? `빠진 회차 ${mainMissing.slice(0, 5).join(",")}… (${mainMissing.length}개)`
      : `1~${n}`,
  );
  const lightMain = missingOn(
    (k) => `ledgers/${id}/ledger/${lightFileName(k)}`,
  );
  expect(
    lightMain.length === 0,
    "앵커 main 브랜치에 가벼운 기록 파일 전체",
    lightMain.length
      ? `빠진 회차 ${lightMain.slice(0, 5).join(",")}… (${lightMain.length}개)`
      : `1~${n}`,
  );

  // 경계마다: 가벼운 기록·묶음, 증명 API, 확인 링크
  const roundFile = (k: number) =>
    JSON.parse(
      readFileSync(join(ledgerDir, "rounds", `${pad(k)}.json`), "utf8"),
    );
  for (const bd of boundaries) {
    const B = bd.first;
    const lightBad: string[] = [];
    for (let k = Math.max(1, B - 5); k <= Math.min(n, B + 5); k++) {
      const light = await getJson<{
        round: number;
        record: string;
        summary: unknown;
      }>(`/ledger/${lightFileName(k)}`);
      const rf = roundFile(k);
      const tickets = (rf.tickets as string[]).map((t) =>
        decodeTicket(fromBase64Url(t)),
      );
      if (light.record !== rf.record)
        lightBad.push(`${k}: 기록이 회차 파일과 다르다`);
      if (
        JSON.stringify(light.summary) !==
        JSON.stringify(JSON.parse(JSON.stringify(roundSummary(tickets))))
      )
        lightBad.push(`${k}: 요약이 다르다`);
    }
    expect(
      lightBad.length === 0,
      `[${bd.name}] 가벼운 기록 ${B - 5}~${Math.min(n, B + 5)}회차가 회차 파일과 같다`,
      lightBad.join(" / ") || undefined,
    );
    const bundleChecks: string[] = [];
    for (const size of [10, 100]) {
      const first = Math.floor((B - 1) / size) * size + 1;
      if (first + size - 1 > n) {
        bundleChecks.push(`${size}회차 묶음 ${first}~: 아직 덜 참`);
        continue;
      }
      const bundle = await getJson<{
        items: { round: number; record: string }[];
      }>(`/ledger/${lightBundleName(size, first)}`);
      const okItems =
        bundle.items.length === size &&
        bundle.items.every(
          (it, i) =>
            it.round === first + i && it.record === roundFile(first + i).record,
        );
      bundleChecks.push(
        `가벼운 기록 ${size}회차 묶음 ${first}~${first + size - 1}: ${okItems ? "맞음" : "다름"}`,
      );
      const rb = await fetch(
        `${api}/ledger/bundles/${size}/${pad(first)}.json`,
      );
      bundleChecks.push(
        `회차 파일 ${size}회차 묶음 ${first}~: HTTP ${rb.status}`,
      );
    }
    expect(
      bundleChecks.every(
        (x) => x.includes("맞음") || x.includes("200") || x.includes("덜 참"),
      ),
      `[${bd.name}] 경계를 품은 묶음(10·100)`,
      bundleChecks.join(" / "),
    );
    const proofBad: string[] = [];
    let proofCount = 0;
    for (const b of bots)
      for (const t of b.tickets.filter(
        (x) => x.round >= B - 3 && x.round <= B + 3,
      )) {
        const rec = store.record(t.round) as RoundRecord;
        const p = await getJson<Parameters<typeof checkTicketProof>[0]>(
          `/api/proof/${t.round}/${toHex(ticketId(t.ticket))}`,
        );
        if (!checkTicketProof(p, rec))
          proofBad.push(`${t.round}회차 ${b.name}`);
        proofCount++;
      }
    expect(
      proofBad.length === 0 && proofCount > 0,
      `[${bd.name}] 증명 API: 경계 전후 응모권 ${proofCount}장`,
      proofBad.join(" / ") || undefined,
    );
    const winners = bots.flatMap((b) =>
      b.tickets
        .filter((t) => t.winner && t.round >= B - 1 && t.round <= B + 1)
        .map((t) => ({ b, t })),
    );
    const invited: string[] = [];
    for (const { b, t } of winners.slice(0, 3))
      invited.push(`${t.round}회차 ${(await invite(b, t.ticket)).status}`);
    expect(
      winners.length > 0 && invited.every((x) => x.endsWith("200")),
      `[${bd.name}] 경계 전후 1등 응모권의 확인 링크 만들기`,
      invited.join(", ") || "당첨 없음",
    );
  }
  const keyBad: string[] = [];
  for (const b of bots.slice(0, 4)) {
    const res = await getJson<{
      tickets: Parameters<typeof checkTicketProof>[0][];
      registration: Parameters<typeof checkRegistrationProof>[0] | null;
    }>(`/api/keys/${toBase64Url(b.signer.publicKey)}/tickets?from=1`);
    for (const p of res.tickets)
      if (!checkTicketProof(p, store.record(p.round) as RoundRecord))
        keyBad.push(`열쇠별 ${p.round}회차 ${b.name}`);
    if (res.tickets.length !== b.tickets.length)
      keyBad.push(
        `${b.name} 열쇠별 응모권 ${res.tickets.length}/${b.tickets.length}`,
      );
    if (
      !res.registration ||
      !checkRegistrationProof(
        res.registration,
        store.record(res.registration.round) as RoundRecord,
      )
    )
      keyBad.push(`${b.name} 등록 증명`);
  }
  expect(
    keyBad.length === 0,
    "증명 API: 열쇠별 응모권(모든 경계에 걸친)·등록 증명",
    keyBad.join(" / ") || undefined,
  );

  // 장부 전체 검사
  const check = await fullCheck();
  const failsOf = (items: { id: string; status: string }[]) =>
    items.filter((i) => i.status === "fail").map((i) => i.id);
  const serverFails = failsOf(check.server.items);
  const copyFails = failsOf(check.anchorMain.items);
  expect(
    serverFails.every((x) => x === "seal-key"),
    "장부 전체 검사(리허설 서버): 관인 열쇠 말고 모두 통과",
    `실패 ${serverFails.join(",") || "없음"}`,
  );
  expect(
    copyFails.every((x) => x === "seal-key"),
    "장부 전체 검사(앵커 main 사본 폴더): 관인 열쇠 말고 모두 통과",
    `실패 ${copyFails.join(",") || "없음"}`,
  );
  expect(
    check.compare.length === 0,
    "서버 장부와 앵커 사본이 같다",
    check.compare.join(" / ") || undefined,
  );
  const light = check.server.items.find((i) => i.id === "light");
  expect(
    light?.status === "pass",
    "검사 항목 「가벼운 기록」",
    light?.detail ?? light?.status,
  );
  const reserved = boundaries;

  const report = {
    base,
    startRecords,
    reserved,
    liveFrom: L,
    lastRound: n,
    bots: bots.length,
    tickets: bots.reduce((k, b) => k + b.tickets.length, 0),
    findings,
    rounds: roundsSeen,
    check,
    serverLog: serverLog
      .filter((l) => !l.includes("앵커 저장소") || l.includes("못"))
      .slice(-200),
  };
  writeFileSync(
    join(work, "rehearsal-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(
    join(work, "rehearsal-server.log"),
    `${serverLog.join("\n")}\n`,
  );
  writeFileSync(join(work, "rehearsal.log"), `${logLines.join("\n")}\n`);
  const failed = findings.filter((f) => !f.ok);
  say(
    `끝: 확인 ${findings.length}개 중 실패 ${failed.length}개. 보고서 ${join(work, "rehearsal-report.json")}`,
  );
  http.close();
  store.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

await main();
