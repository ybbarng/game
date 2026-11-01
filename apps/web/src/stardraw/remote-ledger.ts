import type { Clock } from "@mighty/fair-play";
import {
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  drandRoundForClose,
  drandTime,
  encodeRegistration,
  encodeRegistrationProof,
  encodeTicket,
  fetchFailure,
  findGitHubLedger,
  fromBase64Url,
  fromHex,
  type GitHubLedgerSource,
  genesisHash,
  type KeyRegistration,
  type LoadedRoundFile,
  ledgerId,
  loadRoundFiles,
  POW_PARAMS,
  type PowParams,
  phaseOf,
  politeFetch,
  type QualInfo,
  type RoundRecord,
  roundAt,
  roundTimes,
  type Schedule,
  type SignatureData,
  STARDRAW_ANCHOR_REPO,
  scheduleFromRecords,
  type Ticket,
  toBase64Url,
  toHex,
  type VerifyOptions,
  type VerifyReport,
  verifyLedger,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";
import { HttpError } from "./errors";
import { type GateSolver, inlineGateSolver } from "./gate-solver";
import { type Ledger, RegisterLater } from "./ledger";
import type { LedgerPhase, LedgerStatus } from "./local-ledger";

/**
 * 서버 장부(docs/36 11-5 3번). 같은 출처 `/stardraw-api`(apps/stardraw-server)를 부른다.
 * - 상태(`/api/state`)는 10초마다, 추첨 시각 무렵에는 3초마다 묻는다(1초마다 부르는 화면이 서버를 두드리지 않게)
 * - 닫힌 회차 파일(`/ledger/rounds/…`)은 바뀌지 않으므로 한 번만, 브라우저 캐시로 받는다.
 *   처음 열 때는 다 찬 묶음 파일(10·100회차)로 받아 요청이 몇 개뿐이다(docs/36 7절 「장부 받기」)
 * - 읽기(GET)는 한꺼번에 4개까지, 서버가 막으면(429·503) 기다렸다 다시 받는다. 응모·등록(POST)은
 *   503(작업 증명 줄이 가득 참)일 때만 몇 번 다시 내고, 상한 거절(429) 등은 다시 보내지 않는다
 * - 기기 시계가 틀려도 되게 서버 시각과의 차이를 재 둔다(마감은 서버가 받은 시각으로 정한다)
 * - 우리 서버가 응답하지 않으면(네트워크 오류·5xx) 지난 회차는 앵커 저장소의 장부 사본(GitHub raw)에서 받는다
 *   (docs/36 11-16). 사본은 회차가 닫힌 뒤 오르고 raw 주소는 약 5분 캐시돼 최근 회차가 늦을 수 있다.
 *   서버는 10초마다 다시 묻고, 닿으면 서버로 돌아온다
 * 장부 검사는 받은 파일만으로 처음부터 다시 한다(drand 서명도 실제로 확인한다).
 */

interface StateJson {
  now: number;
  round: number;
  records: number;
  sealed: number;
  head: string;
  entries: number;
  serverKey: string;
  mode?: "trial" | "live";
  /** 응모 앞단 작업 증명 목표값(docs/36 11-31). 옛 서버나 앞단을 끈 서버는 없다 */
  gateTarget?: number;
}

/** 앞단 답을 들고 있는 수(열쇠·문제 값마다 하나. 회차가 바뀌면 옛것은 쓸모없다) */
const GATE_KEEP = 4;
const noop = () => {};

export interface RemoteLedgerOptions {
  /** 예: "/stardraw-api" */
  base: string;
  clock: Clock;
  policy: WebAuthnPolicy;
  fetch?: typeof fetch;
  /** 작업 증명 세기(기본은 규칙의 16MB. 시험 서버는 가볍게 돈다) */
  powParams?: PowParams;
  /** 장부 검사 옵션 덧붙이기(시험은 가짜 drand 서명을 받는다) */
  verifyOptions?: Partial<VerifyOptions>;
  /** 서버가 응답하지 않을 때 장부 사본을 받을 앵커 저장소(기본 STARDRAW_ANCHOR_REPO). null이면 받지 않는다 */
  anchorRepo?: string | null;
  /** 앞단 작업 증명 풀기(기본 같은 스레드. 화면은 웹 워커, gate-solver.ts) */
  gateSolver?: GateSolver;
}

/** 서버가 응답하지 않는다(네트워크 오류는 fetch가 TypeError로 던진다) */
class Unreachable extends Error {}
const unreachable = (err: unknown) =>
  err instanceof Unreachable || err instanceof TypeError;

/** 앵커 저장소에서 사본 위치(브랜치·head)를 다시 찾는 간격(초). raw 주소도 약 5분 캐시된다 */
const GITHUB_EVERY = 60;

const STATE_EVERY = 10;
const STATE_EVERY_NEAR_DRAW = 3;

export class RemoteLedger implements Ledger {
  readonly powParams: PowParams;
  private genesis: Schedule | null = null;
  /** 기록의 일정 바꾸기를 반영한 일정표(기록 수가 바뀔 때만 다시 계산) */
  private effective: { records: number; schedule: Schedule } | null = null;
  private state: StateJson | null = null;
  /** 서버 시각 - 기기 시각(초) */
  private offset = 0;
  private lastState = -Infinity;
  private records: RoundRecord[] = [];
  private tickets: Ticket[][] = [];
  private registrations: KeyRegistration[][] = [];
  private registered = new Set<string>();
  /** 공개 열쇠(base64url) → 등록 회차. 닫힌 회차 파일에서 채우고, 없으면 서버에 묻는다 */
  private registeredAt = new Map<string, number>();
  private busy: Promise<unknown> = Promise.resolve();
  private readonly f: typeof fetch;
  /** 읽기 전용(GET): 한꺼번에 받는 수를 묶고 429·503이면 기다렸다 다시 */
  private readonly read: typeof fetch;
  /** 서버 읽기: 5xx면 Unreachable로 던진다(앵커 저장소로 넘어간다) */
  private readonly serverRead: typeof fetch;
  private github: { source: GitHubLedgerSource; at: number } | null = null;
  /** 앞단 답(문제 값|공개 열쇠|목표값 → 푸는 중이거나 푼 n). 응모 화면에 들어올 때 미리 풀어 둔다 */
  private readonly gates = new Map<string, Promise<number>>();

  constructor(private readonly o: RemoteLedgerOptions) {
    this.f = o.fetch ?? ((...args) => fetch(...args));
    this.read = politeFetch(this.f);
    this.serverRead = (async (input, init) => {
      const res = await this.read(input, init);
      if (res.status >= 500)
        throw new Unreachable(fetchFailure("장부", res.status));
      return res;
    }) as typeof fetch;
    this.powParams = o.powParams ?? POW_PARAMS;
  }

  /** 처음 일정표에 닫힌 기록의 일정 바꾸기(옛 칸과 국장 운영 기록, 취소 반영)를 모두 반영한 일정표 */
  get schedule(): Schedule {
    if (!this.genesis) throw new Error("장부를 아직 받지 못했습니다");
    if (this.effective?.records !== this.records.length) {
      const schedule = scheduleFromRecords(this.genesis, this.records);
      this.effective = { records: this.records.length, schedule };
    }
    return this.effective.schedule;
  }

  /** 지금 회차의 단계(시험이면 화면이 띠를 띄운다). 서버가 알려 준 값, 없으면 일정표로 */
  get mode(): "trial" | "live" {
    if (this.state?.mode) return this.state.mode;
    if (!this.genesis) return "live";
    const round = roundAt(this.schedule, this.now()) ?? 1;
    return phaseOf(this.schedule, round) === "trial" ? "trial" : "live";
  }

  id(): string | null {
    return this.genesis ? `server:${toHex(genesisHash(this.genesis))}` : null;
  }

  now(): number {
    return Math.floor(this.o.clock.now() / 1000) + this.offset;
  }

  head(): Uint8Array {
    if (!this.state) throw new Error("장부를 아직 받지 못했습니다");
    return fromHex(this.state.head);
  }

  private async get<T>(
    path: string,
    init: RequestInit = { cache: "no-store" },
  ): Promise<T> {
    const res = await this.serverRead(`${this.o.base}${path}`, init);
    if (!res.ok) throw new Error(fetchFailure("장부", res.status));
    return (await res.json()) as T;
  }

  /**
   * 응모·등록(POST). 서버가 503(작업 증명 줄이 가득 참)이면 아무것도 기록하지 않은 것이라 잠시 뒤 다시 낸다
   * (1·2·3·4초 간격으로 네 번까지, D2). 다른 거절(상한 429, 형식 400, 마감 409)은 다시 내지 않는다
   */
  private async post(path: string, body: unknown): Promise<Response> {
    const send = () =>
      this.f(`${this.o.base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    let res = await send();
    for (let i = 1; res.status === 503 && i <= 4; i++) {
      await new Promise<void>((resolve) =>
        this.o.clock.after(i * 1000, resolve),
      );
      res = await send();
    }
    return res;
  }

  settle(force = false): Promise<void> {
    const run = this.busy.then(() => this.settleNow(force));
    this.busy = run.catch(() => undefined);
    return run;
  }

  private async settleNow(force: boolean): Promise<void> {
    const local = Math.floor(this.o.clock.now() / 1000);
    if (!this.genesis) {
      // 처음 일정표는 바뀌지 않는다(캐시)
      try {
        const g = await this.get<{ schedule: Schedule }>(
          "/ledger/genesis.json",
          {},
        );
        this.genesis = g.schedule;
      } catch (err) {
        this.lastState = local; // 서버는 다음 간격에 다시 묻는다
        await this.fromGitHub(err, local);
        return;
      }
    }
    const nearDraw = this.state && this.now() >= this.status().nextDrawAt;
    const every = nearDraw ? STATE_EVERY_NEAR_DRAW : STATE_EVERY;
    if (force || local - this.lastState >= every) {
      try {
        this.state = await this.get<StateJson>("/api/state");
        this.offset = this.state.now - local;
        this.lastState = local;
      } catch (err) {
        this.lastState = local; // 서버는 다음 간격에 다시 묻는다
        await this.fromGitHub(err, local);
        return;
      }
    }
    if (!this.state) {
      // 서버에 아직 닿지 못했다: 앵커 저장소 사본으로 지난 회차만
      await this.fromGitHub(
        new Unreachable("서버 상태를 받지 못했습니다"),
        local,
      );
      return;
    }
    // 새로 닫힌 회차 파일(맞는 묶음이 있으면 묶음으로)
    const from = this.records.length + 1;
    if (this.state.records < from) return;
    try {
      this.addFiles(
        from,
        await loadRoundFiles(
          this.o.base,
          this.serverRead,
          from,
          this.state.records,
        ),
      );
    } catch (err) {
      await this.fromGitHub(err, local);
    }
  }

  /**
   * 서버가 응답하지 않을 때: 앵커 저장소 사본에서 처음 일정표와 지난 회차를 받는다.
   * 서버가 응답했는데 틀린 경우(4xx 등)나 사본도 받지 못하면 서버 오류를 그대로 던진다
   */
  private async fromGitHub(err: unknown, local: number): Promise<void> {
    const repo =
      this.o.anchorRepo === undefined
        ? STARDRAW_ANCHOR_REPO
        : this.o.anchorRepo;
    if (!repo || !unreachable(err)) throw err;
    try {
      if (!this.github || local - this.github.at >= GITHUB_EVERY)
        this.github = {
          source: await findGitHubLedger({
            repo,
            fetch: this.read,
            ...(this.genesis ? { ledger: ledgerId(this.genesis) } : {}),
          }),
          at: local,
        };
      const { base, head } = this.github.source;
      if (!this.genesis) {
        const res = await this.read(`${base}/ledger/genesis.json`);
        if (!res.ok) throw new Error(fetchFailure("장부", res.status));
        this.genesis = ((await res.json()) as { schedule: Schedule }).schedule;
      }
      const from = this.records.length + 1;
      if (head.rounds >= from)
        this.addFiles(
          from,
          await loadRoundFiles(base, this.read, from, head.rounds),
        );
    } catch {
      throw err;
    }
  }

  private addFiles(from: number, files: readonly LoadedRoundFile[]): void {
    for (const [i, { round: file }] of files.entries()) {
      const round = from + i;
      this.records.push(decodeRecord(fromBase64Url(file.record)));
      this.tickets.push(
        file.tickets.map((t) => decodeTicket(fromBase64Url(t))),
      );
      const regs = file.registrations.map((r) =>
        decodeRegistration(fromBase64Url(r)),
      );
      this.registrations.push(regs);
      for (const r of regs) {
        this.registered.add(toBase64Url(r.pub));
        this.registeredAt.set(toBase64Url(r.pub), round);
      }
    }
  }

  status(): LedgerStatus {
    const now = this.now();
    const schedule = this.schedule;
    const round = roundAt(schedule, now) ?? 1;
    const times = roundTimes(schedule, round);
    // 서버가 응답하지 않는 동안에는 앵커 저장소 사본에서 받은 회차가 더 많을 수 있다
    const closedCount = Math.max(this.state?.records ?? 0, this.records.length);
    const ready = closedCount >= round - 1;
    const phase: LedgerPhase = !ready
      ? "waiting"
      : now >= times.entryDeadline
        ? "closing"
        : "open";
    const drawRound = closedCount + 1;
    const drawTimes = roundTimes(schedule, drawRound);
    return {
      round,
      times,
      phase,
      now,
      nextDrawRound: drawRound,
      nextDrawAt: drandTime(drandRoundForClose(drawTimes.closesAt)),
      entries: this.state?.round === round ? this.state.entries : 0,
    };
  }

  async isRegistered(pub: Uint8Array): Promise<boolean> {
    const key = toBase64Url(pub);
    if (this.registered.has(key)) return true;
    const { registered } = await this.get<{ registered: boolean }>(
      `/api/keys/${key}`,
    );
    if (registered) this.registered.add(key);
    return registered;
  }

  async registeredRound(pub: Uint8Array): Promise<number | null> {
    const key = toBase64Url(pub);
    const known = this.registeredAt.get(key);
    if (known !== undefined) return known;
    const { round } = await this.get<{ round?: number | null }>(
      `/api/keys/${key}`,
    );
    if (typeof round !== "number") return null;
    this.registeredAt.set(key, round);
    return round;
  }

  async passkeyPub(credentialId: Uint8Array): Promise<Uint8Array | null> {
    const res = await this.read(
      `${this.o.base}/api/passkeys/${toBase64Url(credentialId)}`,
      { cache: "no-store" },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      // 국장 패스키면 서버가 그렇다고 알린다(403)
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new HttpError(
        body.error ?? `장부에 묻지 못했습니다(${res.status})`,
        res.status,
      );
    }
    const { pub } = (await res.json()) as { pub: string };
    return fromBase64Url(pub);
  }

  /**
   * 응모 앞단 작업 증명을 미리 풀기 시작한다(docs/36 11-31). 응모 화면에 들어오면 부른다.
   * 서버가 앞단을 알리지 않으면(옛 서버, 상태를 아직 못 받음) 아무것도 하지 않는다.
   * 다 풀리면 끝나는 약속을 돌려준다(실패해도 거절하지 않는다. 보낼 때 다시 푼다)
   */
  prepare(pub: Uint8Array): Promise<void> {
    const gate = this.gateFor(pub, this.head());
    return gate ? gate.then(noop, noop) : Promise.resolve();
  }

  /** 앞단 답(같은 열쇠·같은 문제 값이면 한 번만 푼다). 서버가 앞단을 쓰지 않으면 null */
  private gateFor(pub: Uint8Array, head: Uint8Array): Promise<number> | null {
    const target = this.state?.gateTarget;
    if (!target) return null;
    const key = `${toHex(head)}|${toBase64Url(pub)}|${target}`;
    let gate = this.gates.get(key);
    if (!gate) {
      gate = (this.o.gateSolver ?? inlineGateSolver)(head, pub, target);
      // 실패한 풀이는 다음에 다시 푼다
      gate.catch(() => this.gates.delete(key));
      this.gates.set(key, gate);
      for (const old of this.gates.keys()) {
        if (this.gates.size <= GATE_KEEP) break;
        this.gates.delete(old);
      }
    }
    return gate;
  }

  /** 요청에 붙일 앞단 칸 */
  private async gateField(
    pub: Uint8Array,
    head: Uint8Array,
  ): Promise<{ gate?: number }> {
    const gate = this.gateFor(pub, head);
    return gate ? { gate: await gate } : {};
  }

  async register(
    registration: KeyRegistration,
    proof: SignatureData,
    challenge: Uint8Array,
  ): Promise<{ round: number }> {
    const res = await this.post("/api/register", {
      registration: toBase64Url(encodeRegistration(registration)),
      proof: toBase64Url(encodeRegistrationProof(proof)),
      head: toHex(challenge),
      ...(await this.gateField(registration.pub, challenge)),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      round?: number;
    };
    if (res.status === 409) throw new RegisterLater(body.error);
    if (!res.ok || typeof body.round !== "number")
      throw new HttpError(
        body.error ?? `등록하지 못했습니다(${res.status})`,
        res.status,
      );
    const key = toBase64Url(registration.pub);
    this.registered.add(key);
    this.registeredAt.set(key, body.round);
    return { round: body.round };
  }

  async submit(
    ticket: Ticket,
    registration?: KeyRegistration,
  ): Promise<{ receivedAt: number }> {
    const res = await this.post("/api/enter", {
      ticket: toBase64Url(encodeTicket(ticket)),
      ...(registration
        ? { registration: toBase64Url(encodeRegistration(registration)) }
        : {}),
      ...(await this.gateField(ticket.pub, this.head())),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      receivedAt?: number;
    };
    if (!res.ok || body.receivedAt === undefined)
      throw new HttpError(
        body.error ?? `응모를 내지 못했습니다(${res.status})`,
        res.status,
      );
    this.registered.add(toBase64Url(ticket.pub));
    await this.settle(true);
    return { receivedAt: body.receivedAt };
  }

  closed(): { record: RoundRecord; tickets: readonly Ticket[] }[] {
    return this.records.map((record, i) => ({
      record,
      tickets: this.tickets[i] ?? [],
    }));
  }

  record(round: number): RoundRecord | undefined {
    return this.records[round - 1];
  }

  ticketsOf(round: number): readonly Ticket[] {
    return this.tickets[round - 1] ?? [];
  }

  async qualInfo(): Promise<QualInfo> {
    return this.get<QualInfo>("/api/qual");
  }

  async issueStamp(
    periodId: string,
    credential: string,
    blinded: Uint8Array,
  ): Promise<Uint8Array> {
    const res = await this.f(`${this.o.base}/api/qual/${periodId}/blind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idToken: credential,
        blinded: toBase64Url(blinded),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      blindStamp?: string;
    };
    if (!res.ok || !body.blindStamp)
      throw new HttpError(
        body.error ?? `소속을 받지 못했습니다(${res.status})`,
        res.status,
      );
    return fromBase64Url(body.blindStamp);
  }

  verify(mine: readonly Uint8Array[] = []): Promise<VerifyReport> {
    if (!this.genesis) throw new Error("장부를 아직 받지 못했습니다");
    // 검사는 처음 일정표에서 시작한다(바뀐 일정표를 넘기면 genesis 해시가 달라진다)
    return verifyLedger(
      this.genesis,
      this.records,
      this.tickets,
      this.registrations,
      {
        powParams: this.powParams,
        mine,
        webauthnPolicy: this.o.policy,
        ...this.o.verifyOptions,
      },
    );
  }
}
