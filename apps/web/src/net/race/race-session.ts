/**
 * 대결 한 판(docs/46 3절, docs/47 9-2). 그물 연결의 모든 기기가 같은 일을 한다(방장은 판정에 끼지 않는다).
 *
 * 1. 섞기 씨앗: 모두 약속 → 모두 모이면 공개 → 씨앗 = sha256(정렬된 공개값).
 * 2. 씨앗을 안 순간부터 살펴보기, 끝나면 풀림. 풀림 전 수는 거절한다.
 * 3. 수마다 `{i, m, t}`(t = 풀림 기준 ms)를 모두에게 보낸다(50ms 묶음). 맞추면 `{n, t}`.
 * 4. 각 기기가 모든 상대의 수를 다시 적용해 맞춤을 확인하고, 도착 시각 하한을 계산해 모두에게 보낸다.
 *    최종 시간 = max(보고, 그 사람을 뺀 다른 기기들 하한의 가운데 값). 하한을 낸 기기가 하나뿐이고
 *    보고와 폭(`disputeMs`) 넘게 다르면 가르지 않고 「확인 안 됨」으로 둔다(judge.ts).
 *
 * ## 기권과 섞기 다시 정하기
 * 남이 보낸 말은 이 기기가 직접 확인한 만큼만 따른다(고친 클라이언트가 판을 엎거나 남을 빼지 못하게, README).
 * - **섞기를 정하기 전**: 약속·공개를 기한(이 기기 시계) 안에 안 냄, 공개가 약속과 다름이면 그 사람을 기권으로 하고
 *   남은 사람끼리 약속부터 다시 한다. 시도 번호는 기권한 사람 수다(같은 기권 목록이면 기기마다 같은 번호).
 *   남은 공개값으로 바로 씨앗을 정하지 않는 까닭: 마지막에 공개하는 사람이 "낼지 말지"로 섞기 둘 가운데 하나를
 *   골라 짜고 한 친구에게 줄 수 있다. 다시 약속하면 이 1비트도 없다. 대가는 왕복 두 번.
 * - 공개값은 받은 기기가 모두에게 다시 전한다(`of`). 약속으로 확인되니 전한 사람을 믿을 필요가 없다.
 *   그래서 한 기기에만 공개하지 않아도 판단이 갈리지 않는다.
 * - **섞기를 정한 뒤**에는 다시 섞지 않는다. 빠질 사람(섞기 어긋남, 판을 떠남)은 그 사람만 기권으로 빼고 판은 그대로 간다.
 * - 남이 더 높은 시도의 약속을 보내면 따르지 않는다. 이 기기도 같은 판단(자기 기한)으로 그 시도에 닿으면 그때 받는다.
 *   닿지 않으면 보낸 사람이 이 판을 떠난 것으로 본다(`LEFT_RACE`). 단 그 목록에 내가 있고 다른 사람 모두(둘 이상)가
 *   같은 말을 하면 내가 빠진다(내 공개가 아무에게도 닿지 않았다).
 * - 섞기 어긋남(기기마다 받은 약속·시작 상태·판정 설정이 다름)은 `race-seed`로 모은 목록의 다수와 다른 기기를 뺀다.
 *   다수가 없으면(2명) 나와 다른 기기를 빼고, 살펴보기 동안이면 판을 연 셈 치지 않는다(둘 다 판이 열리지 않음).
 *
 * 스스로 그만두기(`retire`)는 섞기를 정한 뒤면 그 사람만 DNF(`race-retire`), 정하기 전이면 기권을 알리고 이 기기는 판을 닫는다.
 *
 * ## 끊김
 * 상대가 나갔다 돌아오면 그 판에 보냈던 메시지를 그 사람에게 다시 보낸다(받는 쪽은 겹친 것을 버린다).
 * 공개값을 보낸 뒤 그 상대가 한 번이라도 끊겼으면 그 상대의 하한은 "확인 약함"(null)으로 보내
 * 가운데 값 계산에서 뺀다. 남은 하한이 없으면 보고 시간을 쓴다(정직한 사람을 벌하지 않는 쪽).
 * 약속·공개 단계의 재연결 유예는 각 단계의 기다리는 시간(기본 5초)이 맡는다.
 */
import { type Clock, realClock } from "@game/fair-play";
import { randomId, type Transport } from "../transport";
import { arrivalBound, judge, type PlayerRecord } from "./judge";
import { type OutEntry, parseRaceMessage, type RaceMessage } from "./messages";
import { raceCommitment, raceSeed } from "./seed";
import type {
  CheckpointLog,
  CheckpointMark,
  PeerView,
  PlayResult,
  RaceGame,
  RaceOptions,
  RaceResult,
  RaceSnapshot,
} from "./types";

/** 제품용 시계: 길이는 `performance.now`(사용자가 시계를 바꿔도 뒤로 가지 않는다), 제한 시간은 setTimeout */
export const raceClock: Clock = {
  now: () => performance.now(),
  after: realClock.after,
};

/**
 * 대결 틀 판. `race-seed`의 `v`로 맞춰 본다. 판정 규칙이 바뀌면 올린다(배포 직후 옛 판 화면과 섞이면 `다른 판 화면`).
 * 2: 남의 기권 목록·시도 올리기를 직접 확인한 만큼만 받음, 공개값 전하기, 하한 다툼(2026-11-04)
 */
export const RACE_PROTOCOL = 2;

/** 기권 까닭: 판정 설정 지문이나 대결 틀 판을 모르는 옛 판 화면(배포 직후 판이 섞인 때) */
export const DIFFERENT_VERSION = "다른 판 화면";

/** 기권 까닭: 이 기기가 확인할 수 없는 까닭으로 시도를 올리자고 했다(판 엎기, 거짓 기권 목록 등) */
export const LEFT_RACE = "확인 안 되는 다시 섞기 요청";

/** 받은 까닭 글이 정한 목록 밖일 때 */
export const OTHER_REASON = "기타";

const COMMIT_MISSING = "약속 안 함";
const REVEAL_MISSING = "공개 안 함";
const REVEAL_MISMATCH = "공개가 약속과 다름";
const SEED_MISMATCH = "섞기 어긋남";
export const CANNOT_PREPARE = "섞기를 만들지 못함";

/** 남이 보낸 기권·DNF 까닭으로 받는 글. 그 밖은 `OTHER_REASON`(게임이 `RaceGame.retireReasons`로 더한다) */
export const RACE_REASONS: readonly string[] = [
  COMMIT_MISSING,
  REVEAL_MISSING,
  REVEAL_MISMATCH,
  "약속을 바꿈",
  SEED_MISMATCH,
  DIFFERENT_VERSION,
  CANNOT_PREPARE,
  LEFT_RACE,
];

/** 받은 수 순서 번호는 이미 적용한 수 + 이만큼까지만 받아 둔다(앞 수가 빠진 채 쌓이는 메모리) */
export const MOVES_AHEAD = 512;

/** 아직 적용하지 않은 수에 대한 중간 지점 하한은 한 사람마다 이만큼만 받아 둔다(엉뚱한 수 번호로 쌓아 두는 메모리) */
const MARK_BOUNDS_AHEAD = 64;

/**
 * 나를 기권으로 넣은 약속을 받은 뒤 다른 사람의 같은 말을 기다리는 시간(ms). 기한이 기기마다 지연만큼 다르게 끝나서
 * 정직한 기기들의 말은 몇백 ms 안에 모인다. 지나도 모두가 같은 말을 하지 않으면 말한 사람이 판을 떠난 것으로 본다
 */
const CLAIM_GRACE_MS = 2_000;

/**
 * 2명 판에서 섞기 어긋남을 알아채도 판을 열지 않은 것으로 칠 수 있는 때: 살펴보기 끝 + 이만큼(ms).
 * 정직하게 늦은 `race-seed`(시작 상태를 늦게 만든 기기)는 이 안에 닿는다. 그 뒤로는 다르게 보낸 상대만 뺀다
 * (상대가 질 것 같을 때 거짓 race-seed로 판을 무르지 못하게)
 */
const SEED_CHECK_GRACE_MS = 2_000;

export interface RaceSessionInit<Move, State> {
  game: RaceGame<Move, State>;
  transport: Transport;
  clock: Clock;
  /** 판 아이디. 같은 판의 모든 기기가 같은 값 */
  race: string;
  /** 판에 든 사람(나 포함) */
  players: string[];
  options: RaceOptions;
  /** 공개값 만들기. 시험은 정해진 값을 넣는다 */
  random?: () => string;
  /**
   * `observer`가 잰 하한을 `of`의 시간 판정에 쓰나(증인인가). 기본은 서로 다른 사람이면 모두.
   * 한 기기가 여러 참가자를 맡으면(방장 기기의 컴퓨터) 기기 하나에 하나만 세도록 게임이 넘긴다.
   * 모든 기기가 같은 답을 내야 한다(판을 열 때 고정한 표로)
   */
  witness?: (observer: string, of: string) => boolean;
}

interface Record_<State> {
  id: string;
  status: "playing" | "done" | "dnf";
  reason?: string;
  state?: State;
  /** 다시 적용한(또는 내가 둔) 수 */
  applied: number;
  moveTimes: number[];
  /** 적용한 수(글)와 시각. 판 끝 다시 보기에 쓴다 */
  log: { m: string; t: number }[];
  /** 받았지만 앞 수가 모자라 아직 못 적용한 수 */
  raw: Map<number, { m: string; t: number; arrivedAt: number }>;
  done?: { n: number; t: number; arrivedAt: number };
  /** 이 사람에 대해 증인들이 본 하한 */
  bounds: Map<string, number | null>;
  lateMoves: number;
  /** 중간 지점(켠 판만): 처음 지난 수 번호(1부터) → 단 시각·지점 */
  marks: Map<number, { t: number; ids: string[] }>;
  /** 이미 지난 지점 */
  passed: Set<string>;
  /** 중간 지점 하한: 수 번호 → 증인 → 하한 */
  markBounds: Map<number, Map<string, number | null>>;
}

/** 한 기기가 `race-seed`로 알린 것 */
interface SeedInfo {
  commits: Record<string, string>;
  start?: string;
  rules?: string;
  v?: number;
}

interface Attempt<State> {
  spectator: boolean;
  members: string[];
  nonce?: string;
  salt?: string;
  commits: Map<string, string>;
  repliedTo: Set<string>;
  nonces: Map<string, string>;
  /** 받았지만 이 기기가 받은 약속과 맞지 않는 공개값. 다수 기기의 약속 목록과 맞으면 받는다 */
  /** (`direct`: 주인이 직접 보낸 것. 남이 전한 엉터리 값이 주인 것을 가리지 않게 직접 받은 것이 덮는다) */
  mismatched: Map<string, { nonce: string; salt: string; direct: boolean }>;
  /** 내 공개값을 보낸 시각 s */
  revealedAt?: number;
  seed?: string;
  releaseAt?: number;
  released: boolean;
  /** 다른 기기가 알린 씨앗 재료(처음 받은 것만) */
  seedInfo: Map<string, SeedInfo>;
  /** 내가 만든 시작 상태 지문 */
  start?: string;
  /** 씨앗은 정했고 시작 상태를 만드는 중 */
  preparing?: string;
  records: Map<string, Record_<State>>;
  batch: { i: number; m: string; t: number }[];
  /** 끊겼다 돌아온 사람에게 다시 보낼, 이 시도에서 모두에게 보낸 메시지 */
  log: RaceMessage[];
  timers: (() => void)[];
  batchTimer?: () => void;
  /** 더 높은 시도로 간 사람. 그 사람이 이 시도에 보내는 것(남의 공개값 전하기 빼고)은 더 받지 않는다 */
  abandoned: Set<string>;
  /** 섞기를 정하면 기권으로 뺄 사람과 까닭(섞기 전에 판을 떠남) */
  pendingOut: Map<string, string>;
  /** 나를 기권 목록에 넣어 보낸 사람 → 그 약속 */
  claims: Map<string, Extract<RaceMessage, { type: "race-commit" }>>;
  claimTimer?: boolean;
}

export class RaceSession<Move, State> {
  private readonly game: RaceGame<Move, State>;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly race: string;
  private readonly self: string;
  private readonly roster: string[];
  private readonly random: () => string;
  private readonly witness: (observer: string, of: string) => boolean;
  private readonly reasons: Set<string>;
  private readonly inspectionMs: number;
  private readonly timeLimitMs: number;
  private readonly capMs: number;
  private readonly disputeMs: number;
  private readonly batchMs: number;
  private readonly commitTimeoutMs: number;
  private readonly revealTimeoutMs: number;
  private readonly resultGraceMs: number;
  private readonly options: RaceOptions;
  /** 판정에 끼는 설정의 지문. `race-seed`에 실어 서로 맞춰 본다 */
  private readonly rules: string;
  /** 사람마다 출발 늦추기(ms, 0보다 큰 것만) */
  private readonly startDelay: Map<string, number>;
  /** 중간 지점 시각 확인(`RaceOptions.checkpoints`) */
  private readonly checkpoints: boolean;

  private readonly out = new Map<string, string>();
  private readonly connected: Set<string>;
  private readonly leaves = new Map<string, number[]>();
  private attemptNo = -1;
  private a: Attempt<State>;
  private future: { msg: RaceMessage; from: string }[] = [];
  private result?: RaceResult;
  private disposed = false;
  private readonly listeners = new Set<(s: RaceSnapshot) => void>();

  constructor(init: RaceSessionInit<Move, State>) {
    this.game = init.game;
    this.transport = init.transport;
    this.clock = init.clock;
    this.race = init.race;
    this.self = init.transport.selfId;
    this.roster = [...new Set(init.players)].sort();
    if (!this.roster.includes(this.self))
      throw new Error("판에 든 사람에 내가 없다");
    this.random = init.random ?? (() => randomId(24));
    this.witness = init.witness ?? ((observer, of) => observer !== of);
    this.reasons = new Set([
      ...RACE_REASONS,
      ...(init.game.retireReasons ?? []),
    ]);
    const o = init.options;
    this.options = o;
    this.inspectionMs = o.inspectionMs ?? 15_000;
    this.timeLimitMs = o.timeLimitMs;
    this.capMs = o.capMs ?? 200;
    this.disputeMs = o.disputeMs ?? 1_000;
    this.batchMs = o.batchMs ?? 50;
    this.commitTimeoutMs = o.commitTimeoutMs ?? 5_000;
    this.revealTimeoutMs = o.revealTimeoutMs ?? 5_000;
    this.resultGraceMs = o.resultGraceMs ?? 3_000;
    this.startDelay = new Map(
      Object.entries(o.startDelayMs ?? {}).filter(
        ([id, ms]) => this.roster.includes(id) && ms > 0,
      ),
    );
    const delays = [...this.startDelay].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    this.checkpoints = o.checkpoints === true && !!init.game.checkpointsOf;
    this.rules = JSON.stringify([
      this.inspectionMs,
      this.timeLimitMs,
      this.capMs,
      this.resultGraceMs,
      o.suspicion ?? null,
      o.gameOptions ?? null,
      this.disputeMs,
      // 출발 늦추기가 없으면 예전 지문 그대로(옛 판 화면과 함께 간다)
      ...(delays.length > 0 ? [delays] : []),
      // 중간 지점도 켠 판만(끄면 예전 지문 그대로)
      ...(this.checkpoints ? ["checkpoints"] : []),
    ]);
    this.connected = new Set(this.roster.filter((id) => id !== this.self));
    this.a = this.emptyAttempt([]);

    this.transport.onMessage((raw, from) => {
      if (this.disposed) return;
      const msg = parseRaceMessage(raw);
      if (!msg || msg.race !== this.race || !this.roster.includes(from)) return;
      if (from === this.self) return;
      this.handle(msg, from);
      this.emit();
    });
    this.transport.onPeerLeave((id) => {
      if (this.disposed || !this.roster.includes(id)) return;
      this.connected.delete(id);
      const list = this.leaves.get(id) ?? [];
      list.push(this.clock.now());
      this.leaves.set(id, list);
      this.emit();
    });
    this.transport.onPeerJoin((id) => {
      if (this.disposed || !this.roster.includes(id)) return;
      this.connected.add(id);
      // 끊긴 동안 못 받은 것을 다시 보낸다. 받는 쪽은 겹친 것을 버린다
      for (const msg of this.a.log) this.transport.send(msg, id);
      this.maybeFinalize();
      this.emit();
    });
  }

  /** 판을 시작한다(약속을 보낸다) */
  start(): void {
    if (this.attemptNo < 0) this.startAttempt(0);
    this.emit();
  }

  /**
   * 내 수. 살펴보기 중이거나 둘 수 없으면 거절.
   * `at`(풀림 기준 ms)은 시각을 미리 정해 둔 참가자(컴퓨터)가 계획 시각으로 적을 때 쓴다.
   * 타이머가 늦게 불려도 계획 시각이 남는다. 지금보다 늦게, 앞 수보다 이르게는 적지 않는다
   */
  play(move: Move, at?: number): PlayResult {
    const a = this.a;
    if (a.spectator) return { ok: false, reason: "관전" };
    if (a.seed === undefined || a.releaseAt === undefined)
      return { ok: false, reason: "섞기 전" };
    if (!a.released) return { ok: false, reason: "살펴보기 중" };
    const rec = a.records.get(this.self) as Record_<State>;
    const now = this.clock.now() - a.releaseAt;
    const t =
      at === undefined
        ? now
        : Math.min(now, Math.max(at, rec.moveTimes.at(-1) ?? 0));
    if (rec.status !== "playing" || now > this.timeLimitMs || this.result)
      return { ok: false, reason: "끝남" };
    if (t < (this.startDelay.get(this.self) ?? 0))
      return { ok: false, reason: "출발 전" };
    let next: State;
    try {
      next = this.game.apply(rec.state as State, move);
    } catch {
      return { ok: false, reason: "둘 수 없는 수" };
    }
    const i = rec.applied;
    rec.state = next;
    rec.applied++;
    rec.moveTimes.push(t);
    const m = this.game.encodeMove(move);
    rec.log.push({ m, t });
    this.noteMark(rec, t);
    a.batch.push({ i, m, t });
    const solved = this.game.isSolved(next, this.self);
    if (solved) {
      rec.status = "done";
      rec.done = { n: rec.applied, t, arrivedAt: this.clock.now() };
      this.flush();
      this.broadcast({
        type: "race-done",
        race: this.race,
        attempt: this.attemptNo,
        n: rec.applied,
        t,
      });
      this.maybeFinalize();
    } else if (!a.batchTimer) {
      a.batchTimer = this.clock.after(this.batchMs, () => this.flush());
    }
    this.emit();
    return { ok: true, solved };
  }

  /** 지금 상태. 같은 판의 상대 진행·결과 */
  snapshot(): RaceSnapshot {
    const a = this.a;
    const now = this.clock.now();
    const self = a.records.get(this.self);
    let phase: RaceSnapshot["phase"];
    if (this.result) phase = "finished";
    else if (a.seed === undefined)
      phase = a.revealedAt === undefined ? "commit" : "reveal";
    else if (!a.released) phase = "inspect";
    else if (
      self?.status === "playing" &&
      !this.out.has(this.self) &&
      now - (a.releaseAt as number) <= this.timeLimitMs
    )
      phase = "race";
    else phase = "waiting";
    const peers: PeerView[] = this.roster.map((id) => {
      const rec = a.records.get(id);
      return {
        id,
        connected: id === this.self || this.connected.has(id),
        out: this.out.has(id),
        moves: rec?.applied ?? 0,
        progress: rec?.state !== undefined ? this.game.progress(rec.state) : 0,
        status: this.out.has(id) ? "forfeit" : (rec?.status ?? "playing"),
        ...(rec?.status === "done" && rec.done ? { reported: rec.done.t } : {}),
      };
    });
    const lateMoves: Record<string, number> = {};
    for (const [id, rec] of a.records)
      if (id !== this.self) lateMoves[id] = rec.lateMoves;
    return {
      phase,
      attempt: this.attemptNo,
      spectator: a.spectator,
      ...(a.preparing !== undefined && a.seed === undefined
        ? { preparing: true }
        : {}),
      peers,
      lateMoves,
      ...(a.seed !== undefined ? { seed: a.seed } : {}),
      ...(phase === "inspect" && a.releaseAt !== undefined
        ? { inspectionLeft: a.releaseAt - now }
        : {}),
      ...(a.released && a.releaseAt !== undefined
        ? { elapsed: now - a.releaseAt }
        : {}),
      ...(this.result ? { result: this.result } : {}),
    };
  }

  /** 지금 섞인 시작 상태(씨앗이 정해진 뒤). 화면이 살펴보기에 그린다 */
  startState(): State | undefined {
    return this.a.seed === undefined
      ? undefined
      : this.game.startState(this.a.seed, this.options.gameOptions);
  }

  /** 한 사람의 지금 상태(이 기기가 다시 적용한 데까지). 진행 단계·작은 큐브를 그릴 때 쓴다 */
  stateOf(id: string): State | undefined {
    return this.a.records.get(id)?.state;
  }

  /** 한 사람이 둔 수(글)와 시각(풀림 기준 ms). 이 기기가 다시 적용한 것까지 */
  moveLog(id: string): readonly { m: string; t: number }[] {
    return this.a.records.get(id)?.log ?? [];
  }

  onChange(fn: (s: RaceSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.listeners.clear();
  }

  // ---- 안쪽 ----

  private emptyAttempt(members: string[]): Attempt<State> {
    return {
      spectator: !members.includes(this.self),
      members,
      commits: new Map(),
      repliedTo: new Set(),
      nonces: new Map(),
      mismatched: new Map(),
      released: false,
      seedInfo: new Map(),
      records: new Map(),
      batch: [],
      log: [],
      timers: [],
      abandoned: new Set(),
      pendingOut: new Map(),
      claims: new Map(),
    };
  }

  private clearTimers(): void {
    for (const cancel of this.a.timers) cancel();
    this.a.timers = [];
    this.a.batchTimer?.();
    delete this.a.batchTimer;
  }

  private after(ms: number, fn: () => void): void {
    this.a.timers.push(
      this.clock.after(ms, () => {
        if (this.disposed) return;
        fn();
        this.emit();
      }),
    );
  }

  private outList(): OutEntry[] {
    return [...this.out.entries()]
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([id, reason]) => ({ id, reason }));
  }

  /** 남이 보낸 까닭 글은 정한 목록 안에서만 */
  private cleanReason(reason: string): string {
    return this.reasons.has(reason) ? reason : OTHER_REASON;
  }

  private broadcast(msg: RaceMessage): void {
    this.a.log.push(msg);
    this.transport.send(msg);
  }

  private startAttempt(k: number): void {
    this.clearTimers();
    this.attemptNo = k;
    const members = this.roster.filter((id) => !this.out.has(id));
    this.a = this.emptyAttempt(members);
    if (members.length < 2) {
      this.finalize("남은 사람이 둘보다 적어 대결을 열지 못함");
      return;
    }
    if (!this.a.spectator) {
      const nonce = this.random();
      const salt = this.random();
      const commit = raceCommitment(this.race, k, this.self, nonce, salt);
      this.a.nonce = nonce;
      this.a.salt = salt;
      this.a.commits.set(this.self, commit);
      this.broadcast({
        type: "race-commit",
        race: this.race,
        attempt: k,
        commit,
        out: this.outList(),
      });
      this.after(this.commitTimeoutMs, () => {
        if (this.a.revealedAt !== undefined) return;
        const missing = this.a.members.filter((id) => !this.a.commits.has(id));
        this.forfeit(
          missing.map((id) => ({
            id,
            reason: this.a.pendingOut.get(id) ?? COMMIT_MISSING,
          })),
        );
      });
    }
    const pending = this.future.filter((f) => f.msg.attempt === k);
    this.future = this.future.filter((f) => f.msg.attempt > k);
    for (const f of pending) {
      if (this.attemptNo !== k) return;
      this.handle(f.msg, f.from);
    }
    this.maybeReveal();
  }

  /**
   * 섞기를 정하기 전, 이 기기가 직접 본 까닭(기한·공개 어긋남)으로 기권을 더하고 남은 사람끼리 약속부터 다시 한다.
   * 시도 번호는 기권한 사람 수라 같은 판단을 한 기기들은 같은 번호로 모인다
   */
  private forfeit(entries: OutEntry[]): boolean {
    let added = false;
    for (const e of entries) {
      if (this.out.has(e.id) || !this.roster.includes(e.id)) continue;
      this.out.set(e.id, e.reason);
      added = true;
    }
    if (added && !this.result)
      this.startAttempt(Math.max(this.attemptNo + 1, this.out.size));
    return added;
  }

  /**
   * 다시 섞지 않고 한 사람을 뺀다(섞기 어긋남, 판을 떠남). 섞기를 정하기 전이면 정할 때 뺀다
   * (그 전에 그 사람 공개가 끝내 오지 않으면 기한이 그 까닭으로 기권시킨다)
   */
  private exclude(id: string, reason: string): void {
    const a = this.a;
    if (this.out.has(id) || !a.members.includes(id) || id === this.self) return;
    if (a.seed === undefined) {
      if (!a.pendingOut.has(id)) a.pendingOut.set(id, reason);
      return;
    }
    this.out.set(id, reason);
    const rec = a.records.get(id);
    if (rec && rec.status === "playing") {
      rec.status = "dnf";
      rec.reason = reason;
      rec.raw.clear();
    }
    this.maybeFinalize();
  }

  private handle(msg: RaceMessage, from: string): void {
    if (this.result) return;
    if (this.out.has(from)) return;
    // 시도 번호는 기권한 사람 수를 넘지 못한다(엉뚱한 번호로 쌓아 두는 메모리)
    if (msg.attempt > this.roster.length) return;
    if (msg.type === "race-commit") {
      this.onCommit(msg, from);
      return;
    }
    if (msg.attempt > this.attemptNo) {
      if (this.future.length < 4_096) this.future.push({ msg, from });
      return;
    }
    if (msg.attempt < this.attemptNo) return;
    if (!this.a.members.includes(from)) return;
    // 더 높은 시도로 간 사람의 이 시도 메시지는 받지 않는다. 남의 공개값 전하기는 약속으로 확인되므로 받는다
    if (
      this.a.abandoned.has(from) &&
      !(msg.type === "race-reveal" && msg.of !== undefined && msg.of !== from)
    )
      return;
    switch (msg.type) {
      case "race-reveal":
        this.onReveal(msg, from);
        break;
      case "race-seed":
        if (!this.a.seedInfo.has(from))
          this.a.seedInfo.set(from, {
            commits: msg.commits,
            ...(msg.start !== undefined ? { start: msg.start } : {}),
            ...(msg.rules !== undefined ? { rules: msg.rules } : {}),
            ...(msg.v !== undefined ? { v: msg.v } : {}),
          });
        this.adoptMajorityCommits();
        this.checkSeedCommits();
        break;
      case "race-moves": {
        const rec = this.a.records.get(from);
        const now = this.clock.now();
        if (!rec) {
          // 씨앗을 아직 모른다: 정해지면 다시 처리한다
          if (this.future.length < 4_096) this.future.push({ msg, from });
          return;
        }
        for (const mv of msg.moves)
          if (
            !rec.raw.has(mv.i) &&
            mv.i >= rec.applied &&
            mv.i < rec.applied + MOVES_AHEAD
          )
            rec.raw.set(mv.i, { m: mv.m, t: mv.t, arrivedAt: now });
        this.drain(rec);
        break;
      }
      case "race-done": {
        const rec = this.a.records.get(from);
        if (!rec) {
          this.future.push({ msg, from });
          return;
        }
        if (!rec.done)
          rec.done = { n: msg.n, t: msg.t, arrivedAt: this.clock.now() };
        this.drain(rec);
        break;
      }
      case "race-retire": {
        const rec = this.a.records.get(from);
        if (!rec) {
          this.future.push({ msg, from });
          return;
        }
        // 먼저 받은 수는 적용해 두고(진행 표시), 그 판에서만 뺀다
        this.drain(rec);
        if (rec.status !== "playing") return;
        rec.status = "dnf";
        rec.reason = this.cleanReason(msg.reason);
        rec.raw.clear();
        this.maybeFinalize();
        break;
      }
      case "race-bound": {
        if (msg.of === from || !this.a.members.includes(msg.of)) return;
        // 증인이 아닌 참가자(같은 기기의 다른 참가자, 컴퓨터)가 잰 하한은 쓰지 않는다
        if (!this.witness(from, msg.of)) return;
        const rec = this.a.records.get(msg.of);
        if (!rec) {
          this.future.push({ msg, from });
          return;
        }
        if (msg.at !== undefined) {
          // 중간 지점 하한(켠 판만). 이미 지난 지점이거나, 아직 못 받은 수(앞쪽 몇 개)만 받아 둔다
          if (!this.checkpoints) return;
          let got = rec.markBounds.get(msg.at);
          if (!got) {
            const ahead =
              msg.at > rec.applied && msg.at <= rec.applied + MOVES_AHEAD;
            const pending = [...rec.markBounds.keys()].filter(
              (k) => !rec.marks.has(k),
            ).length;
            if (
              !rec.marks.has(msg.at) &&
              !(ahead && pending < MARK_BOUNDS_AHEAD)
            )
              return;
            got = new Map();
            rec.markBounds.set(msg.at, got);
          }
          if (!got.has(from)) got.set(from, msg.bound);
          this.maybeFinalize();
          break;
        }
        if (!rec.bounds.has(from)) rec.bounds.set(from, msg.bound);
        this.maybeFinalize();
        break;
      }
    }
  }

  private onCommit(
    msg: Extract<RaceMessage, { type: "race-commit" }>,
    from: string,
  ): void {
    if (msg.attempt < this.attemptNo) {
      // 뒤처진 사람: 내 약속(기권 목록이 실림)을 보내 따라오게 한다
      const mine = this.a.commits.get(this.self);
      if (mine !== undefined)
        this.transport.send(
          {
            type: "race-commit",
            race: this.race,
            attempt: this.attemptNo,
            commit: mine,
            out: this.outList(),
          },
          from,
        );
      return;
    }
    const newOut = msg.out.filter(
      (e) => !this.out.has(e.id) && this.roster.includes(e.id),
    );
    if (msg.attempt > this.attemptNo) {
      if (this.a.spectator) {
        // 보기만 하는 기기: 판단이 남의 결과에 끼지 않으므로 앞선 시도를 그대로 따라간다
        for (const e of newOut) this.out.set(e.id, this.cleanReason(e.reason));
        this.startAttempt(msg.attempt);
        if (!this.result && this.attemptNo === msg.attempt)
          this.handle(msg, from);
        return;
      }
      this.onAhead(msg, from, newOut);
      return;
    }
    // 같은 시도 번호인데 기권 목록이 다르다: 이 기기가 직접 본 것으로만 정한다(따르지 않는다)
    if (newOut.length > 0) return;
    const a = this.a;
    if (!a.members.includes(from) || a.abandoned.has(from)) return;
    // 약속은 처음 받은 것만 쓴다. 나중에 바꿔 보내면 공개가 첫 약속과 맞는지로 가린다(기기마다 다르게 보냈으면 다수 목록)
    if (a.commits.has(from)) {
      this.replyOnce(from);
      return;
    }
    if (a.revealedAt !== undefined) return;
    a.commits.set(from, msg.commit);
    this.replyOnce(from);
    this.maybeReveal();
  }

  /** 내 약속을 보낼 때 상대가 아직 판을 열지 않았을 수 있다: 처음 받은 사람에게 한 번 더 직접 보낸다 */
  private replyOnce(to: string): void {
    const a = this.a;
    const mine = a.commits.get(this.self);
    if (a.repliedTo.has(to) || mine === undefined) return;
    a.repliedTo.add(to);
    this.transport.send(
      {
        type: "race-commit",
        race: this.race,
        attempt: this.attemptNo,
        commit: mine,
        out: this.outList(),
      },
      to,
    );
  }

  /**
   * 더 높은 시도의 약속(남이 기권을 더했다). 따르지 않고 맡아 둔다: 이 기기도 같은 판단으로 그 시도에 닿으면 그때 받는다.
   * 그동안 보낸 사람은 이 시도를 떠난 것으로 본다(섞기를 정하면 뺀다). 스스로 그만둔다는 말이면 그 까닭으로 뺀다.
   * 나를 넣은 말이면 다른 사람 모두(둘 이상)가 같은 말을 할 때만 내가 빠진다
   */
  private onAhead(
    msg: Extract<RaceMessage, { type: "race-commit" }>,
    from: string,
    newOut: OutEntry[],
  ): void {
    const a = this.a;
    if (this.future.length < 4_096) this.future.push({ msg, from });
    if (!a.members.includes(from) || a.abandoned.has(from)) return;
    a.abandoned.add(from);
    if (newOut.some((e) => e.id === this.self)) {
      a.claims.set(from, msg);
      if (!a.claimTimer) {
        a.claimTimer = true;
        this.after(CLAIM_GRACE_MS, () => this.settleClaims(true));
      }
      this.settleClaims(false);
      return;
    }
    const own = newOut.find((e) => e.id === from);
    this.exclude(from, own ? this.cleanReason(own.reason) : LEFT_RACE);
  }

  /** 나를 기권으로 넣은 말을 정리한다. 다른 사람 모두(둘 이상)가 말했으면 내가 빠지고, 기다림이 끝났으면 말한 사람을 뺀다 */
  private settleClaims(timeUp: boolean): void {
    const a = this.a;
    if (a.claims.size === 0 || this.result) return;
    const others = a.members.filter(
      (id) => id !== this.self && !this.out.has(id),
    );
    const all = others.length >= 2 && others.every((id) => a.claims.has(id));
    if (all) {
      const claims = [...a.claims.values()];
      for (const c of claims)
        for (const e of c.out)
          if (!this.out.has(e.id) && this.roster.includes(e.id))
            this.out.set(e.id, this.cleanReason(e.reason));
      if (!this.out.has(this.self)) this.out.set(this.self, REVEAL_MISSING);
      this.startAttempt(Math.max(...claims.map((c) => c.attempt)));
      return;
    }
    if (!timeUp) return;
    const claimants = [...a.claims.keys()];
    a.claims.clear();
    for (const id of claimants) this.exclude(id, LEFT_RACE);
  }

  private maybeReveal(): void {
    const a = this.a;
    if (this.result || a.spectator || a.revealedAt !== undefined) return;
    if (!a.members.every((id) => a.commits.has(id))) return;
    a.revealedAt = this.clock.now();
    a.nonces.set(this.self, a.nonce as string);
    this.broadcast({
      type: "race-reveal",
      race: this.race,
      attempt: this.attemptNo,
      nonce: a.nonce as string,
      salt: a.salt as string,
    });
    const k = this.attemptNo;
    this.after(this.revealTimeoutMs, () => {
      if (this.attemptNo !== k || this.a.seed !== undefined) return;
      if (this.a.preparing !== undefined) return;
      const missing = this.a.members.filter((id) => !this.a.nonces.has(id));
      this.forfeit(
        missing.map((id) => ({
          id,
          reason: this.a.mismatched.get(id)?.direct
            ? REVEAL_MISMATCH
            : (this.a.pendingOut.get(id) ?? REVEAL_MISSING),
        })),
      );
    });
    this.maybeFixSeed();
  }

  private onReveal(
    msg: Extract<RaceMessage, { type: "race-reveal" }>,
    from: string,
  ): void {
    const a = this.a;
    const who = msg.of ?? from;
    const relayed = who !== from;
    if (!a.members.includes(who) || a.nonces.has(who)) return;
    const made = raceCommitment(
      this.race,
      msg.attempt,
      who,
      msg.nonce,
      msg.salt,
    );
    const commit = a.commits.get(who);
    if (commit === undefined) {
      // 보기만 하는 기기는 약속을 직접 못 받았을 수 있다: 본인 공개를 믿고 씨앗만 따라간다
      if (!a.spectator || relayed) return;
      a.commits.set(who, made);
    } else if (made !== commit) {
      // 이 기기가 받은 약속과 다르다. 바로 기권시키지 않는다: 그 사람이 기기마다 다른 약속을 보냈다면
      // 다수 기기의 약속 목록(race-seed)과 맞을 수 있다. 끝내 안 맞으면 공개 기한이 「공개가 약속과 다름」으로 뺀다
      if (!relayed || !a.mismatched.has(who))
        a.mismatched.set(who, {
          nonce: msg.nonce,
          salt: msg.salt,
          direct: !relayed,
        });
      this.adoptMajorityCommits();
      return;
    }
    a.nonces.set(who, msg.nonce);
    // 받은 공개값을 모두에게 전한다(한 기기에만 공개하지 않아도 판단이 갈리지 않게)
    if (!relayed && !a.spectator)
      this.broadcast({
        type: "race-reveal",
        race: this.race,
        attempt: this.attemptNo,
        nonce: msg.nonce,
        salt: msg.salt,
        of: who,
      });
    this.maybeFixSeed();
  }

  /**
   * 내가 받은 약속과 다른 공개값이, 다른 기기 과반이 알린 약속(race-seed)과 맞으면 그 약속을 쓴다.
   * 한 사람이 나에게만 다른 약속을 보냈을 때 내가 빠지지 않게 한다(공개값은 그 약속의 주인만 만들 수 있다)
   */
  private adoptMajorityCommits(): void {
    const a = this.a;
    if (a.seed !== undefined || a.preparing !== undefined) return;
    let adopted = false;
    for (const [id, rv] of a.mismatched) {
      if (a.nonces.has(id)) continue;
      const made = raceCommitment(
        this.race,
        this.attemptNo,
        id,
        rv.nonce,
        rv.salt,
      );
      let votes = 0;
      for (const [from, info] of a.seedInfo)
        if (a.members.includes(from) && info.commits[id] === made) votes++;
      if (votes * 2 <= a.members.length) continue;
      a.commits.set(id, made);
      a.nonces.set(id, rv.nonce);
      a.mismatched.delete(id);
      adopted = true;
    }
    if (adopted) this.maybeFixSeed();
  }

  private maybeFixSeed(): void {
    const a = this.a;
    if (this.result || a.seed !== undefined || a.preparing !== undefined)
      return;
    if (!a.spectator && a.revealedAt === undefined) return;
    if (!a.members.every((id) => a.nonces.has(id))) return;
    const nonces: Record<string, string> = {};
    for (const id of a.members) nonces[id] = a.nonces.get(id) as string;
    const seed = raceSeed(this.race, this.attemptNo, nonces);
    // 살펴보기는 씨앗을 안 지금부터 잰다. 시작 상태를 늦게 만든 기기도 풀림 시각은 같다
    const releaseAt = this.clock.now() + this.inspectionMs;
    let pending: Promise<void> | void;
    try {
      pending = this.game.prepare?.(seed, this.options.gameOptions);
    } catch {
      this.cannotPrepare();
      return;
    }
    if (pending && typeof pending.then === "function") {
      a.preparing = seed;
      pending.then(
        () => {
          if (this.disposed || this.a !== a || this.result) return;
          this.fixSeed(seed, releaseAt);
          this.emit();
        },
        () => {
          if (this.disposed || this.a !== a || this.result) return;
          this.cannotPrepare();
          this.emit();
        },
      );
      return;
    }
    this.fixSeed(seed, releaseAt);
  }

  /** 시작 상태를 만들지 못했다: 이 기기가 그 판 기권(다른 기기는 섞기를 다시 정하지 않고 나만 뺀다) */
  private cannotPrepare(): void {
    this.retire(CANNOT_PREPARE);
  }

  /**
   * 나(이 세션의 참가자)가 그 판을 그만둔다. 까닭은 결과에 남는다. 대결 컴퓨터가 계획을 만들지 못했을 때 쓴다.
   * - 섞기(씨앗)를 정한 뒤: 나만 DNF로 빠지고 판은 그대로 간다(`race-retire`). 이미 맞췄거나 빠졌으면 하지 않는다.
   * - 정하기 전(시작 상태를 못 만듦 등): 스스로 기권한다고 알린다. 받는 쪽은 섞기를 다시 정하지 않고 나만 뺀다
   *   (그만두는 기기가 섞기를 이미 보았을 수 있다). 이 기기는 남의 수를 확인할 수 없으니 판을 닫는다.
   */
  retire(reason: string): void {
    if (this.disposed || this.result) return;
    const a = this.a;
    if (a.spectator) return;
    if (a.seed !== undefined) {
      const rec = a.records.get(this.self);
      if (rec?.status !== "playing") return;
      this.flush();
      rec.status = "dnf";
      rec.reason = reason;
      this.broadcast({
        type: "race-retire",
        race: this.race,
        attempt: this.attemptNo,
        reason,
      });
      this.maybeFinalize();
      this.emit();
      return;
    }
    this.out.set(this.self, reason);
    // 받는 쪽은 더 높은 시도의 약속에 실린 「보낸 사람 자신」의 기권으로 받는다(옛 판 화면도 알아듣는 모양)
    this.broadcast({
      type: "race-commit",
      race: this.race,
      attempt: Math.max(this.attemptNo + 1, this.out.size),
      commit: "-",
      out: this.outList(),
    });
    a.spectator = true;
    this.finalize(reason);
    this.emit();
  }

  private fixSeed(seed: string, releaseAt: number): void {
    const a = this.a;
    a.seed = seed;
    a.releaseAt = releaseAt;
    delete a.preparing;
    const start = this.game.startState(a.seed, this.options.gameOptions);
    if (this.game.startFingerprint)
      a.start = this.game.startFingerprint(a.seed, this.options.gameOptions);
    for (const id of a.members)
      a.records.set(id, {
        id,
        status: "playing",
        state: start,
        applied: 0,
        moveTimes: [],
        log: [],
        raw: new Map(),
        bounds: new Map(),
        lateMoves: 0,
        marks: new Map(),
        passed: new Set(),
        markBounds: new Map(),
      });
    if (!a.spectator) {
      const commits: Record<string, string> = {};
      for (const id of a.members) commits[id] = a.commits.get(id) as string;
      this.broadcast({
        type: "race-seed",
        race: this.race,
        attempt: this.attemptNo,
        commits,
        ...(a.start !== undefined ? { start: a.start } : {}),
        rules: this.rules,
        v: RACE_PROTOCOL,
      });
    }
    const toRelease = Math.max(0, releaseAt - this.clock.now());
    this.after(toRelease, () => {
      this.a.released = true;
    });
    this.after(toRelease + this.timeLimitMs, () => {
      // 내 제한 시간: 더는 둘 수 없다(맞추지 못한 것은 판 끝에 정한다)
      this.maybeFinalize();
    });
    this.after(toRelease + this.timeLimitMs + this.resultGraceMs, () =>
      this.finalize(),
    );
    // 섞기 전에 판을 떠난 사람(더 높은 시도로 감, 스스로 그만둠)은 섞기를 다시 정하지 않고 뺀다
    for (const [id, reason] of a.pendingOut) this.exclude(id, reason);
    const k = this.attemptNo;
    const pending = this.future.filter((f) => f.msg.attempt === k);
    this.future = this.future.filter((f) => f.msg.attempt !== k);
    for (const f of pending) {
      if (this.attemptNo !== k || this.result) return;
      this.handle(f.msg, f.from);
    }
    this.checkSeedCommits();
  }

  /** 내가 알릴(알린) 씨앗 재료 */
  private mySeedInfo(): SeedInfo {
    const a = this.a;
    const commits: Record<string, string> = {};
    for (const id of a.members) commits[id] = a.commits.get(id) as string;
    return {
      commits,
      ...(a.start !== undefined ? { start: a.start } : {}),
      rules: this.rules,
      v: RACE_PROTOCOL,
    };
  }

  /**
   * 기기마다 씨앗 재료(받은 약속·시작 상태·판정 설정·판)가 다른지 본다. 이 기기가 직접 받은 `race-seed`만 쓴다.
   * - 과반이 같은 재료면 그와 다른 기기를 뺀다(섞기를 다시 정하지 않는다). 내가 다르면 내가 빠진다.
   * - 과반이 없고 모두의 재료가 모였으면(2명 등) 나와 다른 기기를 뺀다. 그래서 남이 거짓 race-seed로 제3자를
   *   「섞기 어긋남」으로 만들 수 없다(다르게 말한 보낸 사람이 빠진다)
   */
  private checkSeedCommits(): void {
    const a = this.a;
    if (a.seed === undefined || this.result) return;
    const live = a.members.filter((id) => !this.out.has(id));
    const keyOf = (s: SeedInfo) =>
      JSON.stringify([
        Object.keys(s.commits)
          .sort()
          .map((id) => [id, s.commits[id]]),
        s.start ?? null,
        s.rules ?? null,
        s.v ?? null,
      ]);
    const keys = new Map<string, string>();
    if (!a.spectator) keys.set(this.self, keyOf(this.mySeedInfo()));
    for (const [from, info] of a.seedInfo)
      if (live.includes(from)) keys.set(from, keyOf(info));
    const counts = new Map<string, number>();
    for (const k of keys.values()) counts.set(k, (counts.get(k) ?? 0) + 1);
    let major: string | undefined;
    for (const [k, c] of counts) if (c * 2 > live.length) major = k;
    const reasonOf = (id: string) => {
      const info = a.seedInfo.get(id);
      return info && (info.rules === undefined || info.v !== RACE_PROTOCOL)
        ? DIFFERENT_VERSION
        : SEED_MISMATCH;
    };
    const mine = keys.get(this.self);
    if (major === undefined) {
      if (keys.size < live.length || mine === undefined) return;
      major = mine;
    }
    if (mine !== undefined && mine !== major) {
      // 내가 다수와 다르다: 다른 기기들이 나를 뺀다. 내 섞기로는 남의 수를 확인할 수 없으니 판을 닫는다
      this.out.set(this.self, SEED_MISMATCH);
      a.spectator = true;
      this.finalize(SEED_MISMATCH);
      return;
    }
    const odd = [...keys]
      .filter(([, k]) => k !== major)
      .map(([id]) => id)
      .sort();
    if (odd.length === 0) return;
    const earlyEnough =
      !a.released ||
      this.clock.now() - (a.releaseAt as number) <= SEED_CHECK_GRACE_MS;
    if (live.length - odd.length < 2 && earlyEnough) {
      // 2명(다수가 없음): 누가 다른지 가릴 수 없다. 살펴보기 동안이면 판이 열리지 않은 것으로 한다
      for (const id of odd) this.out.set(id, reasonOf(id));
      this.finalize("남은 사람이 둘보다 적어 대결을 열지 못함");
      return;
    }
    for (const id of odd) this.exclude(id, reasonOf(id));
  }

  private flush(): void {
    const a = this.a;
    a.batchTimer?.();
    delete a.batchTimer;
    if (a.batch.length === 0) return;
    const moves = a.batch;
    a.batch = [];
    this.broadcast({
      type: "race-moves",
      race: this.race,
      attempt: this.attemptNo,
      moves,
    });
  }

  /** 받은 수를 순서대로 다시 적용하고 "맞췄다"를 확인한다. 어긋나면 그 사람은 DNF */
  private drain(rec: Record_<State>): void {
    if (rec.status !== "playing") return;
    const failure = this.replay(rec);
    if (failure !== null) {
      rec.status = "dnf";
      rec.reason = failure;
      rec.raw.clear();
      this.maybeFinalize();
      return;
    }
    const a = this.a;
    const done = rec.done;
    if (!done || rec.applied < done.n) return;
    rec.status = "done";
    if (
      !a.spectator &&
      a.revealedAt !== undefined &&
      this.witness(this.self, rec.id)
    ) {
      const bound = this.boundAt(rec.id, done.arrivedAt);
      rec.bounds.set(this.self, bound);
      this.broadcast({
        type: "race-bound",
        race: this.race,
        attempt: this.attemptNo,
        of: rec.id,
        bound,
      });
    }
    this.maybeFinalize();
  }

  /** 이어서 적용할 수 있는 수를 적용한다. 틀린 곳이 있으면 그 까닭, 없으면 null */
  private replay(rec: Record_<State>): string | null {
    for (;;) {
      if (rec.done && rec.applied >= rec.done.n) break;
      const mv = rec.raw.get(rec.applied);
      if (!mv) break;
      rec.raw.delete(rec.applied);
      const nth = rec.applied + 1;
      if (mv.t < 0) return `살펴보기 중에 둔 수(${nth}번째)`;
      if (mv.t < (rec.moveTimes.at(-1) ?? 0))
        return `시각이 거꾸로 감(${nth}번째)`;
      if (mv.t > this.timeLimitMs) return "제한 시간 뒤에 둔 수";
      if (this.beforeStart(rec.id, mv)) return `출발 전에 둔 수(${nth}번째)`;
      try {
        rec.state = this.game.apply(
          rec.state as State,
          this.game.decodeMove(mv.m),
        );
      } catch {
        return `둘 수 없는 수(${nth}번째)`;
      }
      rec.applied++;
      rec.moveTimes.push(mv.t);
      rec.log.push({ m: mv.m, t: mv.t });
      // 수마다 같은 하한: 몰아서 보낸 수는 보고 시각이 하한보다 이르다(표시만, docs/46 3-3)
      const lb = this.boundAt(rec.id, mv.arrivedAt);
      if (lb !== null && mv.t < lb) rec.lateMoves++;
      // 중간 지점을 처음 지난 수: 증인이면 이 수가 닿은 시각으로 하한을 재어 모두에게 알린다(맞춘 시각과 같은 규칙)
      if (
        this.noteMark(rec, mv.t) &&
        !this.a.spectator &&
        this.a.revealedAt !== undefined &&
        this.witness(this.self, rec.id)
      ) {
        const at = rec.applied;
        let got = rec.markBounds.get(at);
        if (!got) {
          got = new Map();
          rec.markBounds.set(at, got);
        }
        got.set(this.self, lb);
        this.broadcast({
          type: "race-bound",
          race: this.race,
          attempt: this.attemptNo,
          of: rec.id,
          bound: lb,
          at,
        });
      }
    }
    const done = rec.done;
    if (!done || rec.applied < done.n) return null;
    if (rec.applied !== done.n) return "수 수가 맞지 않음";
    if (!this.game.isSolved(rec.state as State, rec.id)) return "맞추지 못함";
    if (done.t < (rec.moveTimes.at(-1) ?? 0) || done.t < 0)
      return "시각이 거꾸로 감";
    if (done.t > this.timeLimitMs) return "시간 안에 맞추지 못함";
    return null;
  }

  /**
   * 출발 늦추기(`startDelayMs`)보다 먼저 둔 수인가. 남이 단 시각(t)은 그대로 믿지 않고, 이 기기가 직접 확인한 만큼 본다:
   * - 단 시각이 출발 전이면 그렇다.
   * - 도착 시각으로도 본다. 그 사람의 풀림은 씨앗을 안 때 + 살펴보기이고, 씨앗에는 내 공개값이 들어가므로 그 사람의 풀림은
   *   (절대 시각으로) 내 공개 시각 s + 살펴보기보다 늦다. 그래서 수가 s + 살펴보기 + 출발 늦추기보다 먼저 닿았으면 그 수는
   *   출발 전에 둔 것이 증명된다(시각을 늦게 적어 보낸 고친 클라이언트). 정직한 수는 지연만큼 늦게 닿아 걸리지 않는다
   */
  private beforeStart(
    id: string,
    mv: { t: number; arrivedAt: number },
  ): boolean {
    const delay = this.startDelay.get(id);
    if (delay === undefined) return false;
    if (mv.t < delay) return true;
    const s = this.a.revealedAt;
    if (s === undefined || this.a.spectator) return false;
    return mv.arrivedAt - s - this.inspectionMs < delay;
  }

  /** 내가 본 하한. 공개값을 보낸 뒤 그 사람이 끊긴 적이 있으면 확인 약함(null) */
  private boundAt(id: string, arrivedAt: number): number | null {
    const s = this.a.revealedAt;
    if (s === undefined || this.a.spectator) return null;
    const left = this.leaves.get(id) ?? [];
    if (left.some((t) => t >= s && t <= arrivedAt)) return null;
    return arrivalBound(s, arrivedAt, this.inspectionMs, this.capMs);
  }

  /**
   * 중간 지점(켠 판만)을 처음 지났나 본다. 처음 지난 지점이 있으면 그 수(지금 `applied`번째)에 적어 두고 true.
   * 지점 판정은 게임이 상태만 보고 하므로 같은 수 기록을 받은 기기는 같은 지점·같은 수 번호를 적는다
   */
  private noteMark(rec: Record_<State>, t: number): boolean {
    if (!this.checkpoints || rec.state === undefined) return false;
    const ids = (this.game.checkpointsOf?.(rec.state, rec.id) ?? []).filter(
      (x) => !rec.passed.has(x),
    );
    if (ids.length === 0) return false;
    for (const x of ids) rec.passed.add(x);
    rec.marks.set(rec.applied, { t, ids: [...ids] });
    return true;
  }

  /** 이 사람의 시각에 대해 기다릴 증인 하한을 다 받았나(빠진·끊긴 증인은 기다리지 않는다) */
  private boundsSettled(
    id: string,
    bounds: Map<string, number | null> | undefined,
  ): boolean {
    for (const obs of this.a.members) {
      if (obs === id || bounds?.has(obs)) continue;
      if (this.out.has(obs) || !this.witness(obs, id)) continue;
      if (obs === this.self || this.connected.has(obs)) return false;
    }
    return true;
  }

  /**
   * 중간 지점을 쓰는 게임(`RaceOptions.checkpoints`)이 판정에 쓰는 한 사람의 기록. 이 기기가 받은 만큼이다.
   * 시각은 그 사람이 단 시각과 증인 하한을 함께 준다(인정 시각은 `judge.ts`의 `checkTime`으로 맞춘 시각과 같은 규칙).
   * 판 끝(결과)에는 모든 기기가 기다릴 하한을 다 받은 뒤라, 같은 메시지를 받은 기기는 같은 기록을 낸다
   */
  checkpointLog(id: string): CheckpointLog | undefined {
    const a = this.a;
    const rec = a.records.get(id);
    if (!rec) return undefined;
    const out = this.out.get(id);
    const status: CheckpointLog["status"] =
      out !== undefined ? "forfeit" : rec.status;
    const last = rec.moveTimes.at(-1) ?? 0;
    let horizon: number;
    if (status !== "playing" || this.result) horizon = Number.POSITIVE_INFINITY;
    else if (id === this.self)
      horizon =
        a.released && a.releaseAt !== undefined
          ? this.clock.now() - a.releaseAt
          : 0;
    else horizon = last;
    const marks: CheckpointMark[] = [...rec.marks]
      .sort(([x], [y]) => x - y)
      .map(([at, m]) => {
        const got = rec.markBounds.get(at);
        return {
          at,
          t: m.t,
          ids: m.ids,
          bounds: Object.fromEntries(got ?? []),
          settled: this.boundsSettled(id, got),
        };
      });
    const reason = out ?? rec.reason;
    return {
      status,
      ...(reason !== undefined ? { reason } : {}),
      horizon,
      last,
      marks,
      ...(rec.status === "done" && rec.done && out === undefined
        ? {
            done: {
              t: rec.done.t,
              bounds: Object.fromEntries(rec.bounds),
              settled: this.boundsSettled(id, rec.bounds),
            },
          }
        : {}),
    };
  }

  private maybeFinalize(): void {
    const a = this.a;
    if (this.result || a.seed === undefined) return;
    for (const id of a.members) {
      const rec = a.records.get(id) as Record_<State>;
      if (rec.status === "playing") return;
      if (this.out.has(id)) continue;
      // 중간 지점 하한도 기다린다(그 시각을 판정에 쓰는 게임이 기기마다 같은 값을 갖게)
      for (const at of rec.marks.keys())
        if (!this.boundsSettled(id, rec.markBounds.get(at))) return;
      if (rec.status !== "done") continue;
      if (!this.boundsSettled(id, rec.bounds)) return;
    }
    this.finalize();
  }

  private finalize(cancelled?: string): void {
    if (this.result) return;
    this.flush();
    const a = this.a;
    const records: PlayerRecord[] = this.roster.map((id) => {
      const reason = this.out.get(id);
      if (reason !== undefined)
        return { id, status: "forfeit", reason, moveTimes: [] };
      const rec = a.records.get(id);
      if (!rec || cancelled !== undefined)
        return {
          id,
          status: "dnf",
          reason: cancelled ?? "대결을 열지 못함",
          moveTimes: [],
        };
      const isTurn = this.game.isTurn;
      return {
        id,
        status: rec.status,
        moveTimes: rec.moveTimes,
        ...(isTurn
          ? {
              turnTimes: rec.log.filter((x) => isTurn(x.m)).map((x) => x.t),
            }
          : {}),
        ...(rec.reason !== undefined ? { reason: rec.reason } : {}),
        ...(rec.status === "done" && rec.done ? { reported: rec.done.t } : {}),
      };
    });
    const bounds: Record<string, Record<string, number | null>> = {};
    for (const [id, rec] of a.records)
      bounds[id] = Object.fromEntries(rec.bounds);
    this.result = judge({
      records,
      bounds,
      disputeMs: this.disputeMs,
      ...(this.options.suspicion ? { suspicion: this.options.suspicion } : {}),
      ...(cancelled !== undefined ? { cancelled } : {}),
    });
    this.clearTimers();
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }
}
