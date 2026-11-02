import type { Clock } from "@mighty/fair-play";
import {
  checkRegistrationProof,
  checkRound,
  checkTicketProof,
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  drandRoundForClose,
  drandTime,
  encodeRegistration,
  encodeRegistrationProof,
  encodeTicket,
  equalBytes,
  fetchFailure,
  findGitHubLedger,
  fromBase64Url,
  fromHex,
  type GitHubLedgerSource,
  genesisHash,
  type KeyRegistration,
  type KeyTicketsResponse,
  LightMissing,
  ledgerId,
  loadLightFiles,
  loadRoundFiles,
  POW_PARAMS,
  type PowParams,
  type PublicRoundFile,
  type PublicSealFile,
  phaseOf,
  politeFetch,
  type QualInfo,
  type RoundCheckOptions,
  type RoundRecord,
  type RoundSummary,
  recordHash,
  roundAt,
  roundFilePath,
  roundSummary,
  roundTimes,
  type Schedule,
  type SignatureData,
  STARDRAW_ANCHOR_REPO,
  scheduleFromRecords,
  sealFilePath,
  sealRoot,
  type Ticket,
  type TicketProof,
  ticketProofFromList,
  toBase64Url,
  toHex,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";
import { HttpError } from "./errors";
import { type GateSolver, inlineGateSolver } from "./gate-solver";
import {
  type ClosedRound,
  type Ledger,
  RegisterLater,
  type RoundCheck,
} from "./ledger";
import type { LedgerPhase, LedgerStatus } from "./local-ledger";

/**
 * 서버 장부(docs/36 11-5 3번). 같은 출처 `/stardraw-api`(apps/stardraw-server)를 부른다.
 * - 상태(`/api/state`)는 10초마다, 추첨 시각 무렵에는 3초마다 묻는다(1초마다 부르는 화면이 서버를 두드리지 않게)
 * - 가벼운 확인(docs/36 11-30): 처음 열 때 응모권 전체 대신 가벼운 기록(회차 기록 + 요약, `/ledger/light/…`)만
 *   다 찬 묶음(1000·100·10회차)으로 받고, 기록 사슬(prev)이 처음 일정표부터 이어지는지 본다.
 *   응모권은 필요한 만큼만: 내 응모권은 증명 API(`/api/keys/…/tickets`), 응모권 하나는 `/api/proof/…`,
 *   회차 상세는 그 회차 파일 하나. 받은 증명·목록은 기기가 가진 기록의 머클 루트로 확인한다.
 *   가벼운 기록을 내지 않는 옛 서버면 예전처럼 회차 파일을 받아 요약을 기기에서 계산한다
 * - 읽기(GET)는 한꺼번에 4개까지, 서버가 막으면(429·503) 기다렸다 다시 받는다. 응모·등록(POST)은
 *   503(작업 증명 줄이 가득 참)일 때만 기기마다 흔든 간격으로 마감 5초 전까지 다시 내고, 상한 거절(429) 등은 다시 보내지 않는다
 * - 기기 시계가 틀려도 되게 서버 시각과의 차이를 재 둔다(마감은 서버가 받은 시각으로 정한다)
 * - 우리 서버가 응답하지 않으면(네트워크 오류·5xx) 지난 회차는 앵커 저장소의 장부 사본(GitHub raw)에서 받는다
 *   (docs/36 11-16). 사본은 회차가 닫힌 뒤 오르고 raw 주소는 약 5분 캐시돼 최근 회차가 늦을 수 있다.
 *   서버는 10초마다 다시 묻고, 닿으면 서버로 돌아온다
 * 「이 회차 확인」은 기록 사슬과 그 회차 파일·봉인 파일로(core `checkRound`, drand 서명도 실제로 확인한다).
 * 장부 전체 검사는 검증하기 페이지와 터미널 검사기가 한다.
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

/** 503 뒤 다시 내기를 그만두는 때: 회차 마감 이만큼 전(ms) */
export const RETRY_STOP_BEFORE_CLOSE_MS = 5000;

/**
 * 503 뒤 k번째 다시 내기 전 기다림(ms): 1~4초 무작위에 차례로 0.5초씩 더한다(4번째부터는 그대로).
 * 그래서 1~4초, 1.5~4.5초, 2~5초, 그 뒤로는 2.5~5.5초. 몰릴수록 다시 내는 간격이 벌어져 줄이 숨을 돌린다.
 * `r`은 0 이상 1 미만의 무작위 값(시험은 정해 넣는다)
 */
export function retryDelay(k: number, r: number): number {
  return Math.round(1000 + r * 3000 + 500 * (Math.min(k, 4) - 1));
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
  /** 「이 회차 확인」 옵션 덧붙이기(시험은 가짜 drand 서명·시각 인증 기관을 받는다) */
  verifyOptions?: Partial<RoundCheckOptions>;
  /** 서버가 응답하지 않을 때 장부 사본을 받을 앵커 저장소(기본 STARDRAW_ANCHOR_REPO). null이면 받지 않는다 */
  anchorRepo?: string | null;
  /** 앞단 작업 증명 풀기(기본 같은 스레드. 화면은 웹 워커, gate-solver.ts) */
  gateSolver?: GateSolver;
  /** 다시 내기 흔들림에 쓰는 무작위 값(기본 Math.random. 시험은 정해 넣는다) */
  random?: () => number;
}

/** 서버가 응답하지 않는다(네트워크 오류는 fetch가 TypeError로 던진다) */
class Unreachable extends Error {}
const unreachable = (err: unknown) =>
  err instanceof Unreachable || err instanceof TypeError;

/** 앵커 저장소에서 사본 위치(브랜치·head)를 다시 찾는 간격(초). raw 주소도 약 5분 캐시된다 */
const GITHUB_EVERY = 60;

const STATE_EVERY = 10;
/** 회차 상세에서 받은 회차 파일을 기억하는 수 */
const ROUND_CACHE = 8;
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
  private summaries: RoundSummary[] = [];
  /** 마지막 기록 해시(다음 기록의 prev, 사슬 확인) */
  private chainHead: Uint8Array | null = null;
  private registered = new Set<string>();
  /** 공개 열쇠(base64url) → 등록 회차. 증명 API의 등록 증명에서 채우고, 없으면 서버에 묻는다 */
  private registeredAt = new Map<string, number>();
  /** 받아 둔 회차 파일(확인한 것, 최근 ROUND_CACHE개) */
  private roundFiles = new Map<number, RoundFileData>();
  /** 공개 열쇠(hex) → 확인한 응모권과 어디까지 물었는지 */
  private keyCache = new Map<string, { through: number; tickets: Ticket[] }>();
  private keyLoading = new Map<string, Promise<Ticket[]>>();
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
   * 응모·등록(POST). 서버가 503(작업 증명 줄이 가득 참)이면 아무것도 기록하지 않은 것이라 잠시 뒤 다시 낸다(D2).
   * 기다림은 기기마다 흔든다(`retryDelay`): 모두 같은 순간에 다시 내면 줄이 매번 바로 차서, 1천 장이 한꺼번에 오면
   * 290장만 들어갔다(docs/36 11-30). 회차 마감 5초 전까지만 다시 낸다(그 뒤에 내면 마감에 걸린다).
   * 다른 거절(상한 429, 형식 400, 마감 409)은 다시 내지 않는다
   */
  private async post(
    path: string,
    body: unknown,
    closesAt: number,
  ): Promise<Response> {
    const send = () =>
      this.f(`${this.o.base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const random = this.o.random ?? Math.random;
    const lastSend = closesAt * 1000 - RETRY_STOP_BEFORE_CLOSE_MS;
    let res = await send();
    for (let k = 1; res.status === 503; k++) {
      const wait = retryDelay(k, random());
      if (this.nowMs() + wait > lastSend) break;
      await new Promise<void>((resolve) => this.o.clock.after(wait, resolve));
      res = await send();
    }
    return res;
  }

  /** 지금 시각(ms, 서버 기준) */
  private nowMs(): number {
    return this.o.clock.now() + this.offset * 1000;
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
      this.addClosed(
        from,
        await loadClosed(
          this.o.base,
          this.serverRead,
          from,
          this.state.records,
        ),
      );
    } catch (err) {
      if (err instanceof ChainBroken || err instanceof RootMismatch) throw err;
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
        this.addClosed(
          from,
          await loadClosed(base, this.read, from, head.rounds),
        );
    } catch (e) {
      if (e instanceof ChainBroken || e instanceof RootMismatch) throw e;
      throw err;
    }
  }

  /** 받은 기록을 붙인다. 기록 사슬이 처음 일정표부터 이어지지 않으면 던진다(서버가 장부를 바꿨다) */
  private addClosed(from: number, loaded: LoadedClosed): void {
    if (!this.genesis) throw new Error("장부를 아직 받지 못했습니다");
    const { list, legacy } = loaded;
    let head = this.chainHead ?? genesisHash(this.genesis);
    for (const [i, { record }] of list.entries()) {
      if (record.round !== from + i || !equalBytes(record.prev, head))
        throw new ChainBroken(from + i);
      head = recordHash(record);
    }
    // 옛 서버(가벼운 기록·증명 API 없음): 받은 회차 파일을 들고 있다가 증명·내 응모권을 기기에서 계산한다
    if (legacy)
      for (const data of legacy)
        if (!equalBytes(sealRoot(data.tickets), data.record.merkleRoot))
          throw new RootMismatch(data.record.round);
    if (!legacy) this.legacy = null;
    else if (this.legacy || this.records.length === 0) {
      this.legacy = [...(this.legacy ?? []), ...legacy];
      for (const data of legacy)
        for (const r of data.registrations) {
          this.registered.add(toBase64Url(r.pub));
          this.registeredAt.set(toBase64Url(r.pub), data.record.round);
        }
    }
    for (const { record, summary } of list) {
      this.records.push(record);
      this.summaries.push(summary);
    }
    this.chainHead = head;
  }

  /**
   * 옛 서버(가벼운 기록을 내지 않는 판)에서 받은 회차 파일 전체(1회차부터). 새 화면이 서버보다 먼저 나가도
   * 확인 링크·응모권 보기·내 기록·불러오기가 증명 API 없이 돌게 한다. 가벼운 기록을 받으면 null(증명 API를 쓴다)
   */
  private legacy: RoundFileData[] | null = null;

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
    const res = await this.post(
      "/api/register",
      {
        registration: toBase64Url(encodeRegistration(registration)),
        proof: toBase64Url(encodeRegistrationProof(proof)),
        head: toHex(challenge),
        ...(await this.gateField(registration.pub, challenge)),
      },
      this.status().times.closesAt,
    );
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
    const res = await this.post(
      "/api/enter",
      {
        ticket: toBase64Url(encodeTicket(ticket)),
        ...(registration
          ? { registration: toBase64Url(encodeRegistration(registration)) }
          : {}),
        ...(await this.gateField(ticket.pub, this.head())),
      },
      roundTimes(this.schedule, ticket.round).closesAt,
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      receivedAt?: number;
    };
    if (!res.ok || body.receivedAt === undefined)
      throw new HttpError(
        body.error ?? `예측을 내지 못했습니다(${res.status})`,
        res.status,
      );
    this.registered.add(toBase64Url(ticket.pub));
    await this.settle(true);
    return { receivedAt: body.receivedAt };
  }

  closed(): ClosedRound[] {
    return this.records.map((record, i) => ({
      record,
      summary: this.summaries[i] as RoundSummary,
    }));
  }

  record(round: number): RoundRecord | undefined {
    return this.records[round - 1];
  }

  /** 장부 파일 하나(서버, 응답하지 않으면 앵커 저장소 사본). 없으면 null */
  private async ledgerFile<T>(path: string): Promise<T | null> {
    let res: Response;
    try {
      res = await this.serverRead(`${this.o.base}${path}`);
    } catch (err) {
      const source = await this.githubSource(err);
      res = await this.read(`${source.base}${path}`);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(fetchFailure("장부", res.status));
    return (await res.json()) as T;
  }

  /** 서버가 응답하지 않을 때 앵커 저장소 사본 위치. 사본을 쓸 수 없으면 원래 오류를 던진다 */
  private async githubSource(err: unknown): Promise<GitHubLedgerSource> {
    const repo =
      this.o.anchorRepo === undefined
        ? STARDRAW_ANCHOR_REPO
        : this.o.anchorRepo;
    if (!repo || !unreachable(err)) throw err;
    const local = Math.floor(this.o.clock.now() / 1000);
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
      return this.github.source;
    } catch {
      throw err;
    }
  }

  /** 그 회차 파일(확인한 것): 응모권 목록이 기록의 머클 루트와 맞아야 한다 */
  private async roundFile(round: number): Promise<RoundFileData> {
    const hit = this.roundFiles.get(round) ?? this.legacy?.[round - 1];
    if (hit) return hit;
    const record = this.record(round);
    if (!record) throw new Error(`${round}회차는 아직 닫히지 않았습니다`);
    const file = await this.ledgerFile<PublicRoundFile>(roundFilePath(round));
    if (!file) throw new Error(fetchFailure(`${round}회차 파일`, 404));
    const data: RoundFileData = {
      record: decodeRecord(fromBase64Url(file.record)),
      tickets: file.tickets.map((t) => decodeTicket(fromBase64Url(t))),
      registrations: file.registrations.map((r) =>
        decodeRegistration(fromBase64Url(r)),
      ),
    };
    if (!equalBytes(sealRoot(data.tickets), record.merkleRoot))
      throw new RootMismatch(round);
    this.roundFiles.set(round, data);
    while (this.roundFiles.size > ROUND_CACHE) {
      const oldest = this.roundFiles.keys().next().value;
      if (oldest === undefined) break;
      this.roundFiles.delete(oldest);
    }
    return data;
  }

  async roundTickets(round: number): Promise<readonly Ticket[]> {
    return (await this.roundFile(round)).tickets;
  }

  async findTicket(round: number, idHex: string): Promise<Ticket | null> {
    const record = this.record(round);
    if (!record || !/^[0-9a-f]{64}$/.test(idHex)) return null;
    // 회차 파일 하나로 기기에서 같은 증명을 만든다(서버가 응답하지 않거나 증명 API가 없는 옛 서버)
    const fromFile = async () => {
      const { tickets } = await this.roundFile(round);
      return ticketProofFromList(record, tickets, idHex);
    };
    let proof: TicketProof | null;
    if (this.legacy) proof = await fromFile();
    else
      try {
        const res = await this.serverRead(
          `${this.o.base}/api/proof/${round}/${idHex}`,
        );
        // 404는 없는 응모권이거나 증명 API가 없는 옛 서버다. 회차 파일로 다시 본다(없는 응모권이면 거기서도 없다)
        if (res.status === 404) proof = await fromFile();
        else if (!res.ok)
          throw new Error(fetchFailure("예측서 증명", res.status));
        else proof = (await res.json()) as TicketProof;
      } catch (err) {
        if (!unreachable(err)) throw err;
        proof = await fromFile();
      }
    return proof && checkTicketProof(proof, record);
  }

  async keyTickets(
    pubs: readonly Uint8Array[],
    known: readonly Ticket[],
  ): Promise<Ticket[]> {
    const found = new Map<string, Ticket>();
    const slot = (t: Ticket) => `${toHex(t.pub)}:${t.round}`;
    // 옛 서버: 받아 둔 회차 파일에서 내 열쇠의 응모권을 찾는다(예전과 같다)
    if (this.legacy) {
      const keys = new Set(pubs.map(toHex));
      return this.legacy.flatMap((d) =>
        d.tickets.filter((t) => keys.has(toHex(t.pub))),
      );
    }
    let offline = false;
    for (const pub of pubs) {
      try {
        for (const t of await this.keyTicketsOf(pub)) found.set(slot(t), t);
      } catch (err) {
        if (!unreachable(err) && !(err instanceof NoKeyApi)) throw err;
        offline = true;
      }
    }
    // 서버가 응답하지 않거나 열쇠별 응모권 API가 없으면 지갑의 응모권(내가 낸 바이트)으로
    if (offline)
      for (const t of known)
        if (this.record(t.round) && !found.has(slot(t))) found.set(slot(t), t);
    return [...found.values()].sort((a, b) => a.round - b.round);
  }

  /** 한 열쇠의 닫힌 회차 응모권(증명으로 확인). 물어본 회차 뒤로 닫힌 회차만 새로 묻는다 */
  private keyTicketsOf(pub: Uint8Array): Promise<Ticket[]> {
    const hex = toHex(pub);
    const cached = this.keyCache.get(hex);
    if (cached && cached.through >= this.records.length)
      return Promise.resolve(cached.tickets);
    const loading = this.keyLoading.get(hex);
    if (loading) return loading;
    const run = this.fetchKeyTickets(pub, cached).finally(() =>
      this.keyLoading.delete(hex),
    );
    this.keyLoading.set(hex, run);
    return run;
  }

  private async fetchKeyTickets(
    pub: Uint8Array,
    cached: { through: number; tickets: Ticket[] } | undefined,
  ): Promise<Ticket[]> {
    const key = toBase64Url(pub);
    const tickets = [...(cached?.tickets ?? [])];
    let through = cached?.through ?? 0;
    const closed = this.records.length;
    while (through < closed) {
      const res = await this.serverRead(
        `${this.o.base}/api/keys/${key}/tickets?from=${through + 1}`,
        { cache: "no-store" },
      );
      // 열쇠별 응모권 API가 없는 옛 서버(가벼운 기록 사본은 받았는데 서버가 옛 판인 틈)
      if (res.status === 404) throw new NoKeyApi();
      if (!res.ok) throw new Error(fetchFailure("내 예측서", res.status));
      const body = (await res.json()) as KeyTicketsResponse;
      for (const proof of body.tickets) {
        const record = this.record(proof.round);
        // 서버가 이 기기보다 더 닫았으면 그 회차는 다음에 묻는다
        if (!record || proof.round > closed) continue;
        const ticket = checkTicketProof(proof, record);
        if (!ticket || !equalBytes(ticket.pub, pub))
          throw new Error(`${proof.round}회차 예측서 증명이 맞지 않습니다`);
        tickets.push(ticket);
      }
      const reg = body.registration;
      const regRecord = reg ? this.record(reg.round) : undefined;
      if (reg && regRecord) {
        const r = checkRegistrationProof(reg, regRecord);
        if (!r || !equalBytes(r.pub, pub))
          throw new Error(`${reg.round}회차 등록 증명이 맞지 않습니다`);
        this.registered.add(key);
        this.registeredAt.set(key, reg.round);
      }
      through = Math.min(body.through, closed);
      if (body.next === undefined) break;
    }
    this.keyCache.set(toHex(pub), { through, tickets });
    return tickets;
  }

  async verifyRound(
    round: number,
    mine: readonly Uint8Array[] = [],
  ): Promise<RoundCheck> {
    if (!this.genesis) throw new Error("장부를 아직 받지 못했습니다");
    if (!this.record(round))
      throw new Error(`${round}회차는 아직 닫히지 않았습니다`);
    let file: RoundFileData;
    try {
      file = await this.roundFile(round);
    } catch (err) {
      if (!(err instanceof RootMismatch)) throw err;
      return { problems: [{ round, message: err.message }], skipped: [] };
    }
    const seal = await this.ledgerFile<PublicSealFile>(
      sealFilePath(round),
    ).catch(() => null);
    const report = await checkRound(
      {
        genesis: this.genesis,
        records: this.records,
        round,
        fileRecord: file.record,
        tickets: file.tickets,
        registrations: file.registrations,
        seal,
        summary: this.summaries[round - 1] as RoundSummary,
      },
      {
        powParams: this.powParams,
        mine,
        webauthnPolicy: this.o.policy,
        ...this.o.verifyOptions,
      },
    );
    return { problems: report.problems, skipped: report.skipped };
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
}

interface RoundFileData {
  record: RoundRecord;
  tickets: Ticket[];
  registrations: KeyRegistration[];
}

/** 받은 기록 사슬이 처음 일정표부터 이어지지 않는다 */
class ChainBroken extends Error {
  constructor(round: number) {
    super(
      `${round}회차 기록이 앞 기록과 이어지지 않습니다(장부가 바뀌었습니다)`,
    );
    this.name = "ChainBroken";
  }
}

/** 서버에 열쇠별 응모권 API가 없다(옛 판) */
class NoKeyApi extends Error {
  constructor() {
    super("서버에 열쇠별 예측서 API가 없습니다");
    this.name = "NoKeyApi";
  }
}

/** 받은 회차 파일의 응모권 목록이 기록의 머클 루트와 다르다 */
class RootMismatch extends Error {
  constructor(round: number) {
    super(`${round}회차 파일의 예측서 목록이 기록의 머클 루트와 다르다`);
    this.name = "RootMismatch";
  }
}

/**
 * from~to 닫힌 회차의 기록과 요약: 가벼운 기록으로 받고, 내지 않는 서버(옛 판)면 회차 파일을 받아 요약을 계산한다
 */
interface LoadedClosed {
  list: ClosedRound[];
  /** 옛 서버라 회차 파일로 받았으면 그 내용(아니면 null) */
  legacy: RoundFileData[] | null;
}

async function loadClosed(
  base: string,
  fetchFn: typeof fetch,
  from: number,
  to: number,
): Promise<LoadedClosed> {
  try {
    const list = (await loadLightFiles(base, fetchFn, from, to)).map((l) => ({
      record: l.record,
      summary: l.summary,
    }));
    return { list, legacy: null };
  } catch (err) {
    if (!(err instanceof LightMissing)) throw err;
    const legacy = (await loadRoundFiles(base, fetchFn, from, to)).map(
      ({ round: f }): RoundFileData => ({
        record: decodeRecord(fromBase64Url(f.record)),
        tickets: f.tickets.map((t) => decodeTicket(fromBase64Url(t))),
        registrations: f.registrations.map((r) =>
          decodeRegistration(fromBase64Url(r)),
        ),
      }),
    );
    return {
      list: legacy.map((d) => ({
        record: d.record,
        summary: roundSummary(d.tickets),
      })),
      legacy,
    };
  }
}
