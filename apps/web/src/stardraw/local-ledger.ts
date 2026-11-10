import type { Clock } from "@game/fair-play";
import {
  type AffiliationFields,
  acceptFrom,
  activeDirector,
  alignedEpoch,
  applyRecordOps,
  ByteWriter,
  checkPow,
  checkRegistration,
  checkTicketQualification,
  cloneOpsState,
  closedMessage,
  closeRound,
  concat,
  type DrandBeacon,
  type Draw,
  decodeOperation,
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  directorKeyConfig,
  drandRandomness,
  drandRoundForClose,
  drandTime,
  drawNumbers,
  drawSeed,
  encodeOperation,
  encodeRecord,
  encodeRegistration,
  encodeTicket,
  entrantId,
  everDirector,
  fromBase64Url,
  generateSigner,
  genesisHash,
  type KeyRegistration,
  makeRegistration,
  makeRegistrationProof,
  makeTicket,
  makeTicketProof,
  matureOps,
  newIssuerKey,
  newOpsState,
  OBSERVE_SECONDS,
  OP_NAMES,
  OP_VERSION,
  type OpBody,
  type Operation,
  type OpsContext,
  type OpsState,
  operationsView,
  opId,
  type PowParams,
  parseDirectorKeys,
  powTargetForTries,
  type QualInfo,
  qualInfoOf,
  type RegistrationProof,
  type RoundRecord,
  type RoundSummary,
  type RoundTimes,
  recordHash,
  registrationContent,
  registrationId,
  roundAt,
  roundSummary,
  roundTimes,
  type Schedule,
  type SignatureData,
  type Signer,
  STAMP_SCHEME_BLS,
  sealDesignations,
  selectOperations,
  signAsDirector,
  signAsSeal,
  signBlinded,
  signerFromKeyPair,
  softPasskeySigner,
  sortRegistrations,
  sortTickets,
  type Ticket,
  type TicketProof,
  taggedHash,
  ticketContent,
  ticketId,
  toBase64Url,
  toHex,
  type VerifyReport,
  verifyLedger,
  verifyRegistrationProof,
  verifyStamp,
  verifyTicketSignature,
  type WebAuthnPolicy,
} from "@game/stardraw-core";

import {
  type ClosedRound,
  type Ledger,
  RegisterLater,
  type RoundCheck,
} from "./ledger";

/**
 * 기기 안 연습 장부(docs/36 11-5 2번). 서버가 생기기 전까지 화면이 이것으로 응모 → 마감 → 추첨 →
 * 결과 → 이력 → 증명까지 돈다. 계산은 모두 규칙 패키지(`@game/stardraw-core`) 그대로이고,
 * 서버만 할 수 있는 일 둘을 흉내 낸다.
 * - drand: 진짜 공개 난수 대신 이 기기의 씨앗과 회차로 정한 값을 서명 자리에 넣는다(검사기는 서명 확인을 건너뛴다)
 * - 봉인 시각 증거(TSA): 마감 1분 뒤 받았다고 적는다
 * 연습 참가자(컴퓨터 24명)가 최근 회차마다 함께 응모해 등수별 당첨자 수가 비지 않게 한다.
 * 시각은 `Clock`으로 재고, 연습용 "건너뛰기"는 그 위에 더한 시간이다(시험은 ManualClock).
 */

/** 연습 장부의 작업 증명: 규칙(16MB)보다 훨씬 가볍게 해 기기에서 곧바로 풀린다 */
export const PRACTICE_POW: PowParams = { memorySize: 256, iterations: 1 };

/** 연습 참가자 수(최근 회차마다) */
export const PRACTICE_BOTS = 24;
/** 지금 회차에서 이만큼 앞 회차까지만 연습 참가자가 응모한다(오래 비운 뒤 따라잡기를 가볍게) */
const BOT_ROUNDS = 3;

/** 연습 장부 회차 길이: 매시 정각 추첨 · 55분 마감 */
export const PRACTICE_LENGTH = 3600;

export function practiceSchedule(epoch: number): Schedule {
  return {
    epoch,
    entries: [
      {
        fromRound: 1,
        length: PRACTICE_LENGTH,
        closeMargin: 5,
        powTarget: powTargetForTries(4),
        registerPowTarget: powTargetForTries(12),
      },
    ],
  };
}

/**
 * 최근 이만큼의 회차는 응모권·등록을 모두 둔다. 그보다 오래된 회차는 이 기기의 응모권·등록과 그 포함 증명,
 * 요약만 남기고 연습 참가자 것을 지운다(회차마다 약 14KB → 수백 바이트).
 * 48회차 = 매시 회차로 이틀: 다음 날 돌아와 어제 회차를 「이 회차 확인」해도 전부 다시 계산하고,
 * 데모의 건너뛰기(국장·소속·자격 기간을 차리며 약 25회차)도 모두 남는다. 저장은 약 0.7MB로 한도(약 5백만 자)의 1/7쯤이다
 */
export const PRACTICE_KEEP_ROUNDS = 48;

/** 저장소(기본은 localStorage). 시험은 메모리를 넣는다. 저장하지 못하면 `save`가 던진다 */
export interface LedgerStore {
  load(): string | null;
  save(text: string): void;
}

export interface LocalLedgerOptions {
  clock: Clock;
  store?: LedgerStore;
  policy: WebAuthnPolicy;
  /** 연습 drand 서명(48바이트)을 만드는 난수. 기본은 crypto */
  random?: (n: number) => Uint8Array;
  /** 연습 참가자 수(시험은 줄인다) */
  bots?: number;
  /** 응모권·등록을 모두 두는 최근 회차 수(기본 `PRACTICE_KEEP_ROUNDS`) */
  keepRounds?: number;
  /**
   * 이 기기 지갑의 열쇠(공개 열쇠). 판 2 장부를 옮길 때 내 것과 연습 참가자 것을 가르는 데 쓴다
   * (판 2는 둘을 가르지 않고 저장했다). 처음 `settle()` 때 한 번 부른다
   */
  ownKeys?: () => readonly Uint8Array[];
  /** 저장이 실패하면(한도 초과·저장소 막힘) 부른다. 다시 성공하기 전까지는 한 번만. 기본은 콘솔 오류 */
  onSaveError?: (err: unknown) => void;
}

/**
 * 저장 판. 2(2026-10-30): 원시 열쇠를 받지 않게 되며(docs/36 11-11) 컴퓨터 참가자가 원시 열쇠로
 * 등록했던 판 1 장부는 읽지 않고 새로 시작한다(새 epoch라 장부 표시도 바뀐다).
 * 3(2026-11-01): 이 기기의 열쇠(`own`)와 지운 회차(`light`)를 둔다. 판 2는 읽어서 옮긴다
 */
const SAVE_VERSION = 3;

/** 지운 회차에 남긴 것: 이 기기의 응모권·등록의 포함 증명(응모권·등록 바이트를 담는다)과 그 회차 요약 */
interface LightRound {
  tickets: TicketProof[];
  registrations: RegistrationProof[];
  summary: RoundSummary;
}

interface Saved {
  v: 2 | typeof SAVE_VERSION;
  /** 이 기기에서 응모·등록한 열쇠의 응모자 id(hex). 판 3부터 */
  own?: string[];
  /** 지운 회차(회차 순, 1회차부터 이어진다). 그 회차의 tickets·registrations 칸은 비운다. 판 3부터 */
  light?: {
    round: number;
    t: TicketProof[];
    r: RegistrationProof[];
    s: RoundSummary;
  }[];
  epoch: number;
  /** 건너뛴 시간(초) */
  skipped: number;
  /** 연습 drand 값의 씨앗(이 기기에만) */
  secret: string;
  records: string[];
  tickets: string[][];
  registrations: string[][];
  pending: { round: number; tickets: string[]; registrations: string[] };
  /** 데모 관인(이 기기 안 서버 서명 열쇠, JWK). 처음 국장을 지정할 때 만든다 */
  seal?: { priv: JsonWebKey; pub: JsonWebKey };
  /** 데모의 "서버 설정"(STARDRAW_DIRECTOR_KEYS와 같은 값 목록) */
  directorKeys?: string[];
  /** 받아 두고 다음 기록에 실을 국장 운영 기록 */
  directorOps?: string[];
  /** 데모 도장 열쇠(공개 열쇠 hex → 비밀 base64url)와 기간마다 찍은 도장 수(docs/36 11-13) */
  qualKeys?: Record<string, string>;
  qualIssued?: Record<string, number>;
  /** 데모 상품 자격을 차릴 때 쓰는 데모 국장(이 기기 안 흉내 패스키, JWK) */
  demoDirector?: { priv: JsonWebKey; pub: JsonWebKey };
}

/** 데모 소속: 데모 기관 계정으로 상품 자격을 받는 성단 */
export const DEMO_AFFILIATION: AffiliationFields = {
  name: "벌집 성단",
  badge: 2,
  method: "데모 기관 계정",
  issuerKey: new Uint8Array(),
  issued: 0,
};

const OP_NAME = OP_NAMES;

/** 관리 화면이 보는 상태(서버 GET /api/director/state와 같은 모양) */
export interface DirectorState {
  now: number;
  records: number;
  schedule: Schedule;
  view: ReturnType<typeof operationsView>;
  submitted: { id: string; summary: string; effectiveRound: number }[];
  /** 서버에 다음 관인 열쇠가 있으면 관인 교체 재료(docs/36 11-25). 연습 장부는 없다 */
  nextSeal?: { pub: string; fingerprint: string; proof: string } | null;
}

export type LedgerPhase =
  /** 응모를 받는다 */
  | "open"
  /** 화면 마감(마감 여유) 뒤, 서버 마감 전 */
  | "closing"
  /** 앞 회차 추첨이 끝나야 이번 회차 문제 값이 나온다(마감 5분 뒤) */
  | "waiting";

export interface LedgerStatus {
  /** 지금 응모받는(또는 곧 받을) 회차 */
  round: number;
  times: RoundTimes;
  phase: LedgerPhase;
  /** 지금 시각(초) */
  now: number;
  /** 다음 추첨(마감한 회차의 drand 시각) */
  nextDrawAt: number;
  nextDrawRound: number;
  /** 이번 회차에 들어온 응모 수 */
  entries: number;
}

const enc = (b: Uint8Array) => toBase64Url(b);
const dec = (s: string) => fromBase64Url(s);

export class LocalLedger implements Ledger {
  readonly schedule: Schedule;
  readonly powParams = PRACTICE_POW;
  readonly mode = "practice" as const;
  private skipped: number;
  /** 연습 drand 값의 씨앗. 회차마다 정해진 값이라 데모는 당첨 번호를 미리 볼 수 있다 */
  private readonly secret: Uint8Array;
  private records: RoundRecord[];
  private tickets: Ticket[][];
  private registrations: KeyRegistration[][];
  private pending: {
    round: number;
    tickets: Ticket[];
    registrations: KeyRegistration[];
  };
  /** 등록된 열쇠(응모자 id hex) */
  private keys = new Set<string>();
  /** 이 기기에서 응모·등록한 열쇠(응모자 id hex). 오래된 회차를 지울 때 남긴다 */
  private own = new Set<string>();
  /** 판 2에서 옮겨 와 아직 `own`을 채우지 않았으면 false */
  private ownReady: boolean;
  /** 지운 회차(1회차부터 이어진다) */
  private light = new Map<number, LightRound>();
  private readonly keepRounds: number;
  private readonly ownKeys: (() => readonly Uint8Array[]) | undefined;
  private readonly onSaveError: (err: unknown) => void;
  /** 마지막 저장이 실패했는지(실패를 거듭 알리지 않게) */
  private saveFailed = false;
  /** 운영 기록 상태(처음 쓸 때 기록을 다시 읽어 만든다) */
  private ops: OpsState | null = null;
  private seal: Saved["seal"];
  private directorKeys: string[];
  private directorOps: Operation[];
  private qualKeys: Record<string, string>;
  private qualIssued: Record<string, number>;
  private demoDirectorKey: Saved["demoDirector"];
  private busy: Promise<unknown> = Promise.resolve();
  private readonly clock: Clock;
  private readonly store: LedgerStore | undefined;
  private readonly random: (n: number) => Uint8Array;
  private readonly bots: number;
  readonly policy: WebAuthnPolicy;

  constructor(options: LocalLedgerOptions) {
    this.clock = options.clock;
    this.store = options.store;
    this.policy = options.policy;
    this.random =
      options.random ?? ((n) => crypto.getRandomValues(new Uint8Array(n)));
    this.bots = options.bots ?? PRACTICE_BOTS;
    this.keepRounds = options.keepRounds ?? PRACTICE_KEEP_ROUNDS;
    this.ownKeys = options.ownKeys;
    this.onSaveError =
      options.onSaveError ??
      ((err) =>
        console.error(
          "연습 장부를 이 기기에 저장하지 못했습니다. 다시 저장될 때까지 새 기록은 이 창을 닫으면 사라집니다.",
          err,
        ));
    const saved = this.read();
    // 처음 열면 다음 x:55가 1회차 마감(매시 정각 추첨)
    const epoch =
      saved?.epoch ??
      alignedEpoch(Math.floor(this.clock.now() / 1000), PRACTICE_LENGTH);
    this.schedule = practiceSchedule(epoch);
    this.skipped = saved?.skipped ?? 0;
    this.secret = saved?.secret ? dec(saved.secret) : this.random(32);
    this.records = (saved?.records ?? []).map((r) => decodeRecord(dec(r)));
    this.tickets = (saved?.tickets ?? []).map((l) =>
      l.map((t) => decodeTicket(dec(t))),
    );
    this.registrations = (saved?.registrations ?? []).map((l) =>
      l.map((r) => decodeRegistration(dec(r))),
    );
    this.pending = saved
      ? {
          round: saved.pending.round,
          tickets: saved.pending.tickets.map((t) => decodeTicket(dec(t))),
          registrations: saved.pending.registrations.map((r) =>
            decodeRegistration(dec(r)),
          ),
        }
      : { round: 1, tickets: [], registrations: [] };
    // 판 3: 지운 회차의 목록은 남긴 증명에서 되살린다(저장할 때 비워 둔 칸)
    for (const l of saved?.light ?? []) {
      this.light.set(l.round, {
        tickets: l.t,
        registrations: l.r,
        summary: l.s,
      });
      this.summaries.set(l.round, l.s);
      this.tickets[l.round - 1] = l.t.map((p) => decodeTicket(dec(p.ticket)));
      this.registrations[l.round - 1] = l.r.map((p) =>
        decodeRegistration(dec(p.registration)),
      );
    }
    this.own = new Set(saved?.own ?? []);
    this.ownReady = !saved || saved.v === SAVE_VERSION;
    for (const list of [...this.registrations, this.pending.registrations])
      for (const r of list) this.keys.add(toHex(entrantId(r.pub)));
    this.seal = saved?.seal;
    this.directorKeys = saved?.directorKeys ?? [];
    this.directorOps = (saved?.directorOps ?? []).map((o) =>
      decodeOperation(dec(o)),
    );
    this.qualKeys = saved?.qualKeys ?? {};
    this.qualIssued = saved?.qualIssued ?? {};
    this.demoDirectorKey = saved?.demoDirector;
  }

  id(): string {
    return `practice:${toHex(genesisHash(this.schedule))}`;
  }

  /** 지금 시각(초, 건너뛴 시간 포함) */
  now(): number {
    return Math.floor(this.clock.now() / 1000) + this.skipped;
  }

  /** 다음 회차 문제 값 = 마지막 기록 해시(1회차는 처음 일정표 해시) */
  head(): Uint8Array {
    const last = this.records.at(-1);
    return last ? recordHash(last) : genesisHash(this.schedule);
  }

  /** 마감했고 drand 시각이 지난 회차를 모두 추첨한다. 같은 일을 겹쳐 하지 않게 차례로 돈다 */
  settle(): Promise<void> {
    const run = this.busy.then(() => this.settleNow());
    this.busy = run.catch(() => undefined);
    return run;
  }

  private async settleNow(): Promise<void> {
    let changed = this.adoptOwners();
    for (;;) {
      const round = this.records.length + 1;
      const times = roundTimes(this.schedule, round);
      const drandRound = drandRoundForClose(times.closesAt);
      if (this.now() < drandTime(drandRound)) break;
      const prev = this.head();
      const mine =
        this.pending.round === round
          ? this.pending
          : { round, tickets: [], registrations: [] };
      const current = roundAt(this.schedule, this.now()) ?? round;
      const bots =
        current - round <= BOT_ROUNDS
          ? await this.botEntries(round, prev)
          : { tickets: [], registrations: [] };
      const tickets = [...mine.tickets, ...bots.tickets];
      const registrations = [...mine.registrations, ...bots.registrations];
      const beacon = this.beaconFor(round);
      // 서버처럼: 설정의 국장 열쇠 지정(데모 관인 서명)과 받아 둔 국장 요청을 같은 규칙으로 골라 싣는다
      const operations = await this.dueOperations(round, prev, registrations);
      const record = closeRound({
        schedule: this.schedule,
        round,
        prev,
        tickets,
        registrations,
        rootLoggedAt: times.closesAt + 60,
        beacon,
        operations,
      });
      this.records.push(record);
      // 장부의 목록은 id 순서(검사기가 정렬을 확인한다)
      this.tickets.push(sortTickets(tickets));
      this.registrations.push(sortRegistrations(registrations));
      for (const r of bots.registrations)
        this.keys.add(toHex(entrantId(r.pub)));
      if (this.pending.round <= round)
        this.pending = { round: round + 1, tickets: [], registrations: [] };
      if (this.ops) await applyRecordOps(this.ops, record, this.opsContext());
      if (operations.length > 0 || this.directorOps.length > 0)
        this.directorOps = [];
      changed = true;
    }
    if (this.prune()) changed = true;
    if (changed) this.write();
  }

  /**
   * 판 2 장부를 옮길 때 한 번: 내 열쇠를 가린다. 판 2는 내 것과 연습 참가자 것을 섞어 저장했다.
   * 연습 참가자는 회차마다 새 열쇠로 등록과 응모권 한 장을 같은 회차에 내고 다시 나오지 않으며 소속 증서를 쓰지 않는다.
   * 그래서 지갑의 열쇠, 아직 닫히지 않은 회차의 응모·등록, 두 회차 이상에 나온 열쇠, 응모 없이 등록만 한 열쇠,
   * 소속 증서를 쓴 열쇠를 내 것으로 본다. 바뀌었으면 true
   */
  private adoptOwners(): boolean {
    if (this.ownReady) return false;
    this.ownReady = true;
    const add = (pub: Uint8Array) => this.own.add(toHex(entrantId(pub)));
    for (const pub of this.walletKeys()) add(pub);
    for (const t of this.pending.tickets) add(t.pub);
    for (const r of this.pending.registrations) add(r.pub);
    const rounds = new Map<string, Set<number>>();
    const seen = (pub: Uint8Array, i: number) => {
      const who = toHex(entrantId(pub));
      const set = rounds.get(who) ?? new Set<number>();
      set.add(i);
      rounds.set(who, set);
    };
    this.tickets.forEach((list, i) => {
      for (const t of list) {
        seen(t.pub, i);
        if (t.qual) add(t.pub);
      }
    });
    this.registrations.forEach((list, i) => {
      const entered = new Set(
        (this.tickets[i] ?? []).map((t) => toHex(entrantId(t.pub))),
      );
      for (const r of list) {
        seen(r.pub, i);
        if (!entered.has(toHex(entrantId(r.pub)))) add(r.pub);
      }
    });
    for (const [who, set] of rounds) if (set.size >= 2) this.own.add(who);
    return true;
  }

  /** 지갑의 열쇠(못 읽으면 없음) */
  private walletKeys(): readonly Uint8Array[] {
    try {
      return this.ownKeys?.() ?? [];
    } catch {
      return [];
    }
  }

  /**
   * 최근 `keepRounds`보다 오래된 회차에서 연습 참가자의 응모권·등록을 지운다. 이 기기의 응모권·등록은
   * 기록의 머클 루트로 확인할 포함 증명과 함께, 그 회차 요약(지운 응모권도 센 값)과 함께 남긴다. 지웠으면 true
   */
  private prune(): boolean {
    const upto = this.records.length - this.keepRounds;
    if (this.light.size >= upto) return false;
    const wallet = new Set(
      this.walletKeys().map((pub) => toHex(entrantId(pub))),
    );
    const mine = (pub: Uint8Array) => {
      const who = toHex(entrantId(pub));
      return this.own.has(who) || wallet.has(who);
    };
    for (let round = this.light.size + 1; round <= upto; round++) {
      const i = round - 1;
      const record = this.records[i] as RoundRecord;
      const tickets = this.tickets[i] ?? [];
      const registrations = this.registrations[i] ?? [];
      const summary = this.summaries.get(round) ?? roundSummary(tickets);
      // 목록은 id 순서라 그대로 머클 잎이다
      const ids = tickets.map(ticketId);
      const regIds = registrations.map(registrationId);
      const keptTickets = tickets.filter((t) => mine(t.pub));
      const keptRegs = registrations.filter((r) => mine(r.pub));
      this.light.set(round, {
        tickets: keptTickets.flatMap(
          (t) => makeTicketProof(round, ids, t, record.merkleRoot) ?? [],
        ),
        registrations: keptRegs.flatMap(
          (r) =>
            makeRegistrationProof(round, regIds, r, record.registrationRoot) ??
            [],
        ),
        summary,
      });
      this.summaries.set(round, summary);
      this.tickets[i] = keptTickets;
      this.registrations[i] = keptRegs;
    }
    // 지운 연습 참가자 열쇠는 다시 응모하지 않는다
    this.keys = new Set(
      [...this.registrations, this.pending.registrations].flatMap((list) =>
        list.map((r) => toHex(entrantId(r.pub))),
      ),
    );
    return true;
  }

  /** 연습 참가자: 회차마다 새 흉내 패스키(UP·UV 켬)를 등록하고 무작위 번호로 한 장씩 낸다 */
  private async botEntries(round: number, challenge: Uint8Array) {
    const tickets: Ticket[] = [];
    const registrations: KeyRegistration[] = [];
    const entry = roundTimes(this.schedule, round).entry;
    for (let i = 0; i < this.bots; i++) {
      const signer = softPasskeySigner(await generateSigner(), {
        policy: this.policy,
      });
      const reg = await makeRegistration(
        signer,
        signer.credentialId,
        challenge,
        entry.registerPowTarget,
        { params: PRACTICE_POW },
      );
      const ticket = await makeTicket(
        signer,
        round,
        randomPick(this.random),
        challenge,
        entry.powTarget,
        { params: PRACTICE_POW },
      );
      if (reg && ticket) {
        registrations.push(reg);
        tickets.push(ticket);
      }
    }
    return { tickets, registrations };
  }

  status(): LedgerStatus {
    const now = this.now();
    const round = roundAt(this.schedule, now) ?? 1;
    const times = roundTimes(this.schedule, round);
    const ready =
      this.records.length >= round - 1 &&
      // 관측 1분은 모두의 의무 시간: 앞 회차 관측이 끝나야 이번 회차 예측을 받는다(서버도 그 전에는 거절한다)
      now >= acceptFrom(this.schedule, round);
    const phase: LedgerPhase = !ready
      ? "waiting"
      : now >= times.entryDeadline
        ? "closing"
        : "open";
    const drawRound = this.records.length + 1;
    const drawTimes = roundTimes(this.schedule, drawRound);
    return {
      round,
      times,
      phase,
      now,
      nextDrawRound: drawRound,
      nextDrawAt: drandTime(drandRoundForClose(drawTimes.closesAt)),
      entries: this.pending.round === round ? this.pending.tickets.length : 0,
    };
  }

  isRegistered(pub: Uint8Array): boolean {
    return this.keys.has(toHex(entrantId(pub)));
  }

  async passkeyPub(credentialId: Uint8Array): Promise<Uint8Array | null> {
    const id = toHex(credentialId);
    for (const list of [...this.registrations, this.pending.registrations])
      for (const r of list) if (toHex(r.credentialId) === id) return r.pub;
    if (everDirector(await this.opsState(), new Uint8Array(0), credentialId))
      throw new Error("국장 패스키로는 예측할 수 없습니다");
    return null;
  }

  async registeredRound(pub: Uint8Array): Promise<number | null> {
    const who = toHex(entrantId(pub));
    const found = this.registrations.findIndex((list) =>
      list.some((r) => toHex(entrantId(r.pub)) === who),
    );
    if (found >= 0) return found + 1;
    return this.pending.registrations.some(
      (r) => toHex(entrantId(r.pub)) === who,
    )
      ? this.pending.round
      : null;
  }

  /** 등록만 받기(서버 `POST /api/register`와 같은 확인). 등록 회차를 돌려준다 */
  async register(
    registration: KeyRegistration,
    proof: SignatureData,
    challenge: Uint8Array,
  ): Promise<{ round: number }> {
    await this.settle();
    const known = await this.registeredRound(registration.pub);
    if (known !== null) return { round: known };
    const now = this.now();
    const round = roundAt(this.schedule, now);
    if (round === null) throw new RegisterLater();
    const times = roundTimes(this.schedule, round);
    if (this.records.length < round - 1 || now >= times.closesAt)
      throw new RegisterLater();
    if (toHex(challenge) !== toHex(this.head()))
      throw new RegisterLater("회차가 바뀌었습니다. 다시 계산해 주세요");
    const problem = checkRegistration(registration);
    if (problem) throw new Error(problem);
    if (
      everDirector(
        await this.opsState(),
        registration.pub,
        registration.credentialId,
      )
    )
      throw new Error("국장 패스키로는 예측할 수 없습니다");
    if (await this.passkeyPub(registration.credentialId))
      throw new Error("이미 다른 열쇠로 등록된 패스키입니다");
    if (!(await verifyRegistrationProof(registration, proof, this.policy)))
      throw new Error("등록 서명이 맞지 않습니다");
    if (
      !(await checkPow(
        challenge,
        registrationContent(registration),
        registration.nonce,
        times.entry.registerPowTarget,
        PRACTICE_POW,
      ))
    )
      throw new Error("열쇠 등록 계산이 맞지 않습니다");
    if (this.pending.round !== round)
      this.pending = { round, tickets: [], registrations: [] };
    this.pending.registrations.push(registration);
    this.keys.add(toHex(entrantId(registration.pub)));
    this.own.add(toHex(entrantId(registration.pub)));
    this.write();
    return { round };
  }

  /** 응모권 받기(서버가 할 확인을 그대로 한다). 받은 시각(초)을 돌려준다 */
  async submit(
    ticket: Ticket,
    registration?: KeyRegistration,
  ): Promise<{ receivedAt: number }> {
    await this.settle();
    const now = this.now();
    const round = roundAt(this.schedule, now);
    if (round !== null && ticket.round < round)
      throw new Error(closedMessage(now));
    if (round === null || ticket.round !== round)
      throw new Error("이번 회차 예측서가 아닙니다");
    const times = roundTimes(this.schedule, round);
    if (this.records.length < round - 1)
      throw new Error("앞 회차 관측이 끝난 뒤에 예측할 수 있습니다");
    if (now >= times.closesAt) throw new Error(closedMessage(now));
    if (this.pending.round !== round)
      this.pending = { round, tickets: [], registrations: [] };
    const who = toHex(entrantId(ticket.pub));
    if (this.pending.tickets.some((t) => toHex(entrantId(t.pub)) === who))
      throw new Error("이번 회차에는 이미 예측했습니다");
    const challenge = this.head();
    if (registration) {
      if (toHex(entrantId(registration.pub)) !== who)
        throw new Error("예측서와 다른 열쇠의 등록입니다");
      const problem = checkRegistration(registration);
      if (problem) throw new Error(problem);
      if (
        everDirector(
          await this.opsState(),
          registration.pub,
          registration.credentialId,
        )
      )
        throw new Error("국장 패스키로는 예측할 수 없습니다");
      if (
        !this.keys.has(who) &&
        !(await checkPow(
          challenge,
          registrationContent(registration),
          registration.nonce,
          times.entry.registerPowTarget,
          PRACTICE_POW,
        ))
      )
        throw new Error("열쇠 등록 계산이 맞지 않습니다");
    } else if (!this.keys.has(who)) {
      throw new Error("등록되지 않은 열쇠입니다");
    }
    if (
      !(await checkPow(
        challenge,
        ticketContent(ticket),
        ticket.nonce,
        times.entry.powTarget,
        PRACTICE_POW,
      ))
    )
      throw new Error("예측 계산이 맞지 않습니다");
    if (!(await verifyTicketSignature(ticket, this.policy)))
      throw new Error("예측서 서명이 맞지 않습니다");
    if (ticket.qual) {
      const state = cloneOpsState(await this.opsState());
      matureOps(state, round);
      const problem = checkTicketQualification(state, ticket, times.closesAt);
      if (problem) throw new Error(`소속 증서: ${problem}`);
      const cert = ticket.qual.cert;
      const period = state.periods.find(
        (p) => toHex(p.id) === toHex(cert.periodId),
      );
      if (
        !period ||
        !verifyStamp(period.issuerKey, cert.periodId, cert.qualPub, cert.stamp)
      )
        throw new Error("소속 증서: 도장이 맞지 않습니다");
    }
    this.pending.tickets.push(ticket);
    this.own.add(who);
    if (registration && !this.keys.has(who)) {
      this.pending.registrations.push(registration);
      this.keys.add(who);
    }
    this.write();
    return { receivedAt: now };
  }

  /** 회차 → 요약(닫힌 회차는 바뀌지 않는다) */
  private summaries = new Map<number, RoundSummary>();

  /** 닫힌 회차 기록과 요약(연습 장부는 응모권을 들고 있어 기기에서 계산한다. 지운 회차는 지우기 전에 낸 요약) */
  closed(): ClosedRound[] {
    return this.records.map((record, i) => {
      let summary = this.summaries.get(record.round);
      if (!summary) {
        summary = roundSummary(this.tickets[i] ?? []);
        this.summaries.set(record.round, summary);
      }
      return { record, summary };
    });
  }

  record(round: number): RoundRecord | undefined {
    return this.records[round - 1];
  }

  /**
   * 닫힌 회차의 등록(등록증 공유본을 장부와 대조할 때, docs/36 11-66). 아직 닫히지 않았으면 null.
   * 지운 회차는 이 기기의 등록만 남아 있다
   */
  closedRegistrations(round: number): readonly KeyRegistration[] | null {
    if (!this.records[round - 1]) return null;
    return this.registrations[round - 1] ?? [];
  }

  /**
   * 그 회차 응모권(연습 장부는 들고 있다. 검증하기 페이지의 연습 장부 검사도 쓴다).
   * 지운 회차는 이 기기의 응모권만 남아 있다(연습 참가자는 소속 증서를 쓰지 않아 소속 판정은 그대로다)
   */
  ticketsOf(round: number): readonly Ticket[] {
    return this.tickets[round - 1] ?? [];
  }

  async roundTickets(round: number): Promise<readonly Ticket[]> {
    return this.ticketsOf(round);
  }

  async findTicket(round: number, idHex: string): Promise<Ticket | null> {
    return (
      this.ticketsOf(round).find((t) => toHex(ticketId(t)) === idHex) ?? null
    );
  }

  async keyTickets(pubs: readonly Uint8Array[]): Promise<Ticket[]> {
    const keys = new Set(pubs.map(toHex));
    return this.tickets.flatMap((list) =>
      list.filter((t) => keys.has(toHex(t.pub))),
    );
  }

  /** 연습 장부는 작아 장부 전체를 다시 계산하고 그 회차 문제만 보인다 */
  async verifyRound(
    round: number,
    mine: readonly Uint8Array[] = [],
  ): Promise<RoundCheck> {
    const report = await this.verify(mine);
    return {
      problems: report.problems.filter(
        (p) => p.round === round || p.round === 0,
      ),
      skipped: [],
    };
  }

  /**
   * 장부 전체를 처음부터 다시 계산한다(연습 drand는 서명 확인을 건너뛴다).
   * 지운 회차는 사슬·당첨 번호와, 남긴 내 응모권·등록이 그 회차 루트에 들어 있는지와 등수를 본다
   */
  verify(mine: readonly Uint8Array[] = []): Promise<VerifyReport> {
    return verifyLedger(
      this.schedule,
      this.records,
      this.tickets,
      this.registrations,
      {
        beaconVerifier: () => true,
        powParams: PRACTICE_POW,
        mine,
        webauthnPolicy: this.policy,
        partialRounds: this.light,
      },
    );
  }

  /** 응모권·등록을 지운 회차 수(1회차부터 이만큼) */
  prunedRounds(): number {
    return this.light.size;
  }

  /** 연습 drand 값: 씨앗과 회차로 정한 48바이트(진짜 drand 서명 자리) */
  private beaconFor(round: number): DrandBeacon {
    const { closesAt } = roundTimes(this.schedule, round);
    const tag = (i: number) =>
      taggedHash(
        "stardraw/practice-beacon",
        this.secret,
        new ByteWriter().u32(round).u8(i).done(),
      );
    return {
      round: drandRoundForClose(closesAt),
      signature: concat(tag(0), tag(1).slice(0, 16)),
    };
  }

  /** 데모 전용: 그 회차의 당첨 번호를 미리 본다(진짜 장부에는 없는 기능) */
  peekDraw(round: number): Draw {
    return drawNumbers(drawSeed(round, drandRandomness(this.beaconFor(round))));
  }

  // ── 국장(데모 국장 모드, docs/36 11-12) ──

  private opsContext(): OpsContext {
    return {
      policy: this.policy,
      isEntrant: (pub, credentialId) =>
        this.keys.has(toHex(entrantId(pub))) ||
        (credentialId !== null &&
          [...this.registrations, this.pending.registrations].some((l) =>
            l.some((r) => toHex(r.credentialId) === toHex(credentialId)),
          )),
    };
  }

  /** 운영 기록 상태. 처음 부르면 닫힌 기록을 검사기와 같은 규칙으로 다시 읽는다 */
  private async opsState(): Promise<OpsState> {
    if (!this.ops) {
      const state = newOpsState(this.schedule);
      for (const record of this.records)
        await applyRecordOps(state, record, this.opsContext());
      this.ops = state;
    }
    return this.ops;
  }

  private async sealSigner(): Promise<Signer> {
    const algorithm = { name: "ECDSA", namedCurve: "P-256" };
    if (!this.seal) {
      const pair = await crypto.subtle.generateKey(algorithm, true, [
        "sign",
        "verify",
      ]);
      this.seal = {
        priv: await crypto.subtle.exportKey("jwk", pair.privateKey),
        pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
      };
      this.write();
    }
    return signerFromKeyPair({
      privateKey: await crypto.subtle.importKey(
        "jwk",
        this.seal.priv,
        algorithm,
        false,
        ["sign"],
      ),
      publicKey: await crypto.subtle.importKey(
        "jwk",
        this.seal.pub,
        algorithm,
        true,
        ["verify"],
      ),
    });
  }

  private async dueOperations(
    round: number,
    prev: Uint8Array,
    registrations: readonly KeyRegistration[],
  ): Promise<Operation[]> {
    if (
      this.directorKeys.length === 0 &&
      this.directorOps.length === 0 &&
      Object.keys(this.qualIssued).length === 0 &&
      !this.ops?.ops.length
    )
      return [];
    const state = await this.opsState();
    const base = this.opsContext();
    // 이 회차에 함께 들어가는 등록도 우주인으로 친다
    const ctx: OpsContext = {
      ...base,
      isEntrant: (pub, cred) =>
        base.isEntrant(pub, cred) ||
        registrations.some(
          (r) => toHex(entrantId(r.pub)) === toHex(entrantId(pub)),
        ),
    };
    const designations = sealDesignations(
      state,
      round,
      prev,
      parseDirectorKeys(this.directorKeys.join(",")),
      ctx,
    );
    // 발급 수(kind 9): 서버처럼, 찍은 도장 수가 장부의 수보다 많으면 관인으로 싣는다
    const matured = cloneOpsState(state);
    matureOps(matured, round);
    const issuedBodies = matured.periods.flatMap((p) => {
      const count = this.qualIssued[toHex(p.id)] ?? 0;
      return count > p.issued
        ? [
            {
              v: OP_VERSION,
              kind: "qual-issued" as const,
              after: prev,
              effectiveRound: 0,
              period: p.id,
              issued: count,
            },
          ]
        : [];
    });
    const bodies = [...designations.bodies, ...issuedBodies];
    const seal = bodies.length > 0 ? await this.sealSigner() : null;
    const sealOps = seal
      ? await Promise.all(bodies.map((b) => signAsSeal(b, seal)))
      : [];
    const { accepted } = await selectOperations(
      state,
      round,
      prev,
      [...sealOps, ...this.directorOps],
      ctx,
    );
    return accepted;
  }

  // ── 상품 자격(데모 기관 계정, docs/36 11-13) ──

  /** 효력이 생긴 자격 기간. 연습 장부는 데모 기관 계정으로 받는다 */
  async qualInfo(): Promise<QualInfo> {
    await this.settle();
    const now = this.now();
    const round = roundAt(this.schedule, now) ?? 1;
    const state = cloneOpsState(await this.opsState());
    matureOps(state, round);
    return qualInfoOf(state, round, now, () => "demo");
  }

  /** 데모 발급: 신원 확인 없이(데모 기관 계정) 가린 값에 데모 도장 열쇠로 찍는다 */
  async issueStamp(
    periodId: string,
    _credential: string,
    blinded: Uint8Array,
  ): Promise<Uint8Array> {
    const info = (await this.qualInfo()).periods.find((p) => p.id === periodId);
    if (!info?.open) throw new Error("지금 받을 수 없는 소속입니다");
    const secret = this.qualKeys[toHex(fromBase64Url(info.issuerKey))];
    if (!secret) throw new Error("이 기간의 도장 열쇠가 이 기기에 없습니다");
    const stamp = signBlinded(dec(secret), blinded);
    this.qualIssued[periodId] = (this.qualIssued[periodId] ?? 0) + 1;
    this.write();
    return stamp;
  }

  /** 서버 POST /api/director/qual-key처럼 새 도장 열쇠를 만들어 비밀은 이 기기에 두고 공개 열쇠를 준다 */
  createIssuerKey(): Uint8Array {
    const key = newIssuerKey();
    this.qualKeys[toHex(key.publicKey)] = enc(key.secretKey);
    this.write();
    return key.publicKey;
  }

  private async demoDirector() {
    const algorithm = { name: "ECDSA", namedCurve: "P-256" };
    if (!this.demoDirectorKey) {
      const pair = await crypto.subtle.generateKey(algorithm, true, [
        "sign",
        "verify",
      ]);
      this.demoDirectorKey = {
        priv: await crypto.subtle.exportKey("jwk", pair.privateKey),
        pub: await crypto.subtle.exportKey("jwk", pair.publicKey),
      };
      this.write();
    }
    const signer = await signerFromKeyPair({
      privateKey: await crypto.subtle.importKey(
        "jwk",
        this.demoDirectorKey.priv,
        algorithm,
        false,
        ["sign"],
      ),
      publicKey: await crypto.subtle.importKey(
        "jwk",
        this.demoDirectorKey.pub,
        algorithm,
        true,
        ["verify"],
      ),
    });
    return softPasskeySigner(signer, { policy: this.policy });
  }

  /**
   * 데모: 데모 국장 지정 → 데모 소속(벌집 성단) 추가 → 1년 자격 기간 열기를 차례로 하고, 예고(3회차)마다
   * 시간을 건너뛴다. 이미 받을 수 있는 기간이 있으면 아무것도 하지 않는다. 실제 장부에서는 국장이 관리 화면에서 한다
   */
  async prepareDemoQualification(): Promise<void> {
    if ((await this.qualInfo()).periods.some((p) => p.open)) return;
    const director = await this.demoDirector();
    const next = () => this.records.length + 1;
    const directorActive = async () =>
      !!activeDirector(await this.opsState(), director.publicKey, next());
    if (!(await directorActive())) {
      this.designateDirector(
        directorKeyConfig(director.credentialId, director.publicKey),
      );
      for (let i = 0; i < 3 && !(await directorActive()); i++)
        await this.skipRounds(5);
    }
    const sign = async (body: OpBody) =>
      this.submitOperation(await signAsDirector(body, director));
    const affiliation = async () =>
      (await this.opsState()).affiliations.find(
        (a) => a.fields.name === DEMO_AFFILIATION.name && a.until === null,
      );
    if (!(await affiliation())) {
      await sign({
        v: OP_VERSION,
        kind: "affiliation-add",
        after: this.head(),
        effectiveRound: next() + 4,
        fields: DEMO_AFFILIATION,
      });
      await this.skipRounds(5);
    }
    const a = await affiliation();
    if (!a) throw new Error("데모 소속을 차리지 못했습니다");
    const issuerKey = this.createIssuerKey();
    const startsAt = this.now();
    await sign({
      v: OP_VERSION,
      kind: "qual-period",
      after: this.head(),
      effectiveRound: next() + 4,
      affiliation: a.id,
      number:
        (await this.opsState()).periods.filter(
          (p) => toHex(p.affiliation) === toHex(a.id),
        ).length + 1,
      startsAt,
      endsAt: startsAt + 365 * 24 * 3600,
      scheme: STAMP_SCHEME_BLS,
      issuerKey,
    });
    await this.skipRounds(5);
  }

  /** 데모의 "서버 설정에 넣기": 다음 기록에 데모 관인이 국장 열쇠 지정을 싣는다 */
  designateDirector(config: string): void {
    parseDirectorKeys(config);
    if (!this.directorKeys.includes(config)) this.directorKeys.push(config);
    this.write();
  }

  /** 관리 화면 상태(서버 /api/director/state와 같은 모양) */
  async directorState(): Promise<DirectorState> {
    await this.settle();
    const state = await this.opsState();
    return {
      now: this.now(),
      records: this.records.length,
      schedule: this.schedule,
      view: operationsView(state, this.records.length, this.head()),
      submitted: this.directorOps.map((op) => ({
        id: toHex(opId(op)),
        summary: OP_NAME[op.kind],
        effectiveRound: op.effectiveRound,
      })),
    };
  }

  /** 국장 운영 기록 받기(서버 POST /api/director/ops와 같은 확인) */
  async submitOperation(
    op: Operation,
  ): Promise<{ id: string; round: number; effectiveRound: number }> {
    await this.settle();
    const state = await this.opsState();
    const round = this.records.length + 1;
    const head = this.head();
    if (op.signer.role !== "director")
      throw new Error("국장 패스키로 서명한 요청만 받습니다");
    if (toHex(op.after) !== toHex(head))
      throw new Error(
        "그사이 장부에 기록이 하나 더 닫혔습니다. 다시 서명해 주세요",
      );
    const id = toHex(opId(op));
    if (this.directorOps.some((o) => toHex(opId(o)) === id))
      throw new Error("이미 받은 요청입니다");
    const { rejected } = await selectOperations(
      state,
      round,
      head,
      [...this.directorOps, op],
      this.opsContext(),
    );
    const mine = rejected.find((r) => toHex(opId(r.op)) === id);
    if (mine)
      throw new Error(
        /국장 패스키가 아닙니다/.test(mine.problem)
          ? "국장 패스키가 아닙니다. 우주국이 지정한 국장 패스키로 서명해 주세요"
          : mine.problem,
      );
    this.directorOps.push(op);
    this.write();
    return { id, round, effectiveRound: op.effectiveRound };
  }

  /** 데모용: n회차만큼 시간을 건너뛰고 추첨한다(「예고 건너뛰기」는 5회차) */
  async skipRounds(n: number): Promise<void> {
    await this.settle();
    const target = this.status().nextDrawAt + (n - 1) * PRACTICE_LENGTH + 1;
    if (target > this.now()) this.skipped += target - this.now();
    this.write();
    await this.settle();
  }

  /** 연습용: 이번 회차 마감 시각까지 건너뛴다 */
  async skipToClose(): Promise<void> {
    await this.settle();
    const target = this.status().times.closesAt;
    if (target > this.now()) this.skipped += target - this.now();
    this.write();
    await this.settle();
  }

  /** 연습용: 다음 추첨 시각까지 시간을 건너뛰고 추첨한다 */
  async skipToNextDraw(): Promise<void> {
    await this.settle();
    // 관측 1분이 끝난 때로(연습 장부에는 실시간 관측이 없어 기다릴 것이 없다). 다음 회차를 바로 받는다
    const target = this.status().nextDrawAt + OBSERVE_SECONDS;
    if (target > this.now()) this.skipped += target - this.now();
    this.write();
    await this.settle();
  }

  private read(): Saved | null {
    try {
      const text = this.store?.load();
      if (!text) return null;
      const saved = JSON.parse(text) as Saved;
      return saved.v === SAVE_VERSION || saved.v === 2 ? saved : null;
    } catch {
      return null;
    }
  }

  private write(): void {
    const saved: Saved = {
      v: SAVE_VERSION,
      epoch: this.schedule.epoch,
      skipped: this.skipped,
      secret: enc(this.secret),
      records: this.records.map((r) => enc(encodeRecord(r))),
      // 지운 회차의 칸은 비운다(남긴 것은 light의 증명에 담겨 있다)
      tickets: this.tickets.map((l, i) =>
        this.light.has(i + 1) ? [] : l.map((t) => enc(encodeTicket(t))),
      ),
      registrations: this.registrations.map((l, i) =>
        this.light.has(i + 1) ? [] : l.map((r) => enc(encodeRegistration(r))),
      ),
      own: [...this.own],
      ...(this.light.size > 0
        ? {
            light: [...this.light].map(([round, l]) => ({
              round,
              t: l.tickets,
              r: l.registrations,
              s: l.summary,
            })),
          }
        : {}),
      pending: {
        round: this.pending.round,
        tickets: this.pending.tickets.map((t) => enc(encodeTicket(t))),
        registrations: this.pending.registrations.map((r) =>
          enc(encodeRegistration(r)),
        ),
      },
      ...(this.seal ? { seal: this.seal } : {}),
      ...(this.directorKeys.length > 0
        ? { directorKeys: this.directorKeys }
        : {}),
      ...(this.directorOps.length > 0
        ? { directorOps: this.directorOps.map((o) => enc(encodeOperation(o))) }
        : {}),
      ...(Object.keys(this.qualKeys).length > 0
        ? { qualKeys: this.qualKeys }
        : {}),
      ...(Object.keys(this.qualIssued).length > 0
        ? { qualIssued: this.qualIssued }
        : {}),
      ...(this.demoDirectorKey ? { demoDirector: this.demoDirectorKey } : {}),
    };
    if (!this.store) return;
    try {
      this.store.save(JSON.stringify(saved));
      this.saveFailed = false;
    } catch (err) {
      if (!this.saveFailed) this.onSaveError(err);
      this.saveFailed = true;
    }
  }
}

/** 1~45에서 서로 다른 6개(거절 표본) */
export function randomPick(random: (n: number) => Uint8Array): number[] {
  const picked = new Set<number>();
  while (picked.size < 6) {
    for (const b of random(16)) {
      if (b >= 225) continue;
      picked.add((b % 45) + 1);
      if (picked.size === 6) break;
    }
  }
  return [...picked].sort((a, b) => a - b);
}
