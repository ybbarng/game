/**
 * 경주 한 판(docs/46 3절, docs/47 9-2). 그물 연결의 모든 기기가 같은 일을 한다(방장은 판정에 끼지 않는다).
 *
 * 1. 섞기 씨앗: 모두 약속 → 모두 모이면 공개 → 씨앗 = sha256(정렬된 공개값).
 * 2. 씨앗을 안 순간부터 살펴보기, 끝나면 풀림. 풀림 전 수는 거절한다.
 * 3. 수마다 `{i, m, t}`(t = 풀림 기준 ms)를 모두에게 보낸다(50ms 묶음). 맞추면 `{n, t}`.
 * 4. 각 기기가 모든 상대의 수를 다시 적용해 맞춤을 확인하고, 도착 시각 하한을 계산해 모두에게 보낸다.
 *    최종 시간 = max(보고, 그 사람을 뺀 다른 사람들 하한의 가운데 값).
 *
 * ## 기권과 섞기 다시 정하기
 * 약속을 시간 안에 안 내거나, 공개를 안 하거나, 공개가 약속과 다르거나, 기기마다 받은 약속이 다르면
 * (섞기 어긋남) 그 사람을 그 판 **기권**으로 하고 **남은 사람끼리 약속부터 다시 한다**(시도 번호 +1).
 * 남은 공개값으로 바로 씨앗을 정하지 않는 까닭:
 * - 마지막에 공개하는 사람은 남의 공개값을 다 본 뒤 "낼지 말지"로 섞기 두 개 가운데 하나를 고를 수 있다.
 *   본인은 기권이라 이득이 없지만 짜고 한 친구에게는 고른 섞기를 줄 수 있다. 다시 약속하면 이 1비트도 없다.
 * - 공개가 기한 바로 앞뒤로 닿으면 기기마다 기권자가 달라져 씨앗이 갈린다. 시도를 넘길 때 기권 목록을
 *   약속 메시지에 실어 보내고, 더 높은 시도 번호를 받은 기기가 그 목록을 합쳐 따라오게 하면 갈린 것이
 *   한 번의 다시 약속으로 모인다(기권 목록은 커지기만 하므로 시도는 사람 수보다 많이 늘지 않는다).
 * - 대가: 왕복 두 번(1초 안쪽)이 더 든다. 정직하게 끊긴 사람이 있을 때만 생긴다.
 * 남은 일: 누군가 "저 사람은 기권"이라는 목록을 거짓으로 보내면 그대로 따른다(막을 증인이 없다).
 * 친구끼리 판이라 받아들이고, 기권 까닭은 결과에 남겨 복기에서 보이게 한다.
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
  /** 이 사람에 대해 관측자들이 본 하한 */
  bounds: Map<string, number | null>;
  lateMoves: number;
}

interface Attempt<State> {
  spectator: boolean;
  members: string[];
  nonce?: string;
  salt?: string;
  commits: Map<string, string>;
  repliedTo: Set<string>;
  nonces: Map<string, string>;
  /** 내 공개값을 보낸 시각 s */
  revealedAt?: number;
  seed?: string;
  releaseAt?: number;
  released: boolean;
  /** 다른 기기가 알린 씨앗 재료 */
  seedCommits: Map<string, Record<string, string>>;
  /** 다른 기기가 알린 시작 상태 지문 */
  seedStarts: Map<string, string>;
  /** 다른 기기가 알린 판정 설정 지문(안 실었으면 빈 글) */
  seedRules: Map<string, string>;
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
}

export class RaceSession<Move, State> {
  private readonly game: RaceGame<Move, State>;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly race: string;
  private readonly self: string;
  private readonly roster: string[];
  private readonly random: () => string;
  private readonly inspectionMs: number;
  private readonly timeLimitMs: number;
  private readonly capMs: number;
  private readonly batchMs: number;
  private readonly commitTimeoutMs: number;
  private readonly revealTimeoutMs: number;
  private readonly resultGraceMs: number;
  private readonly options: RaceOptions;
  /** 판정에 끼는 설정의 지문. `race-seed`에 실어 서로 맞춰 본다 */
  private readonly rules: string;

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
    const o = init.options;
    this.options = o;
    this.inspectionMs = o.inspectionMs ?? 15_000;
    this.timeLimitMs = o.timeLimitMs;
    this.capMs = o.capMs ?? 200;
    this.batchMs = o.batchMs ?? 50;
    this.commitTimeoutMs = o.commitTimeoutMs ?? 5_000;
    this.revealTimeoutMs = o.revealTimeoutMs ?? 5_000;
    this.resultGraceMs = o.resultGraceMs ?? 3_000;
    this.rules = JSON.stringify([
      this.inspectionMs,
      this.timeLimitMs,
      this.capMs,
      this.resultGraceMs,
      o.suspicion ?? null,
      o.gameOptions ?? null,
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
    a.batch.push({ i, m, t });
    const solved = this.game.isSolved(next);
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
      released: false,
      seedCommits: new Map(),
      seedStarts: new Map(),
      seedRules: new Map(),
      records: new Map(),
      batch: [],
      log: [],
      timers: [],
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
      this.finalize("남은 사람이 둘보다 적어 경주를 열지 못함");
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
        this.forfeit(missing.map((id) => ({ id, reason: "약속 안 함" })));
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

  /** 기권을 더하고, 새로 생겼으면 남은 사람끼리 약속부터 다시 한다 */
  private forfeit(entries: OutEntry[]): boolean {
    let added = false;
    for (const e of entries) {
      if (this.out.has(e.id) || !this.roster.includes(e.id)) continue;
      this.out.set(e.id, e.reason);
      added = true;
    }
    if (added && !this.result) this.startAttempt(this.attemptNo + 1);
    return added;
  }

  private handle(msg: RaceMessage, from: string): void {
    if (this.result) return;
    if (this.out.has(from)) return;
    if (msg.type === "race-commit") {
      this.onCommit(msg, from);
      return;
    }
    if (msg.attempt > this.attemptNo) {
      this.future.push({ msg, from });
      return;
    }
    if (msg.attempt < this.attemptNo) return;
    if (!this.a.members.includes(from)) return;
    switch (msg.type) {
      case "race-reveal":
        this.onReveal(msg, from);
        break;
      case "race-seed":
        this.a.seedCommits.set(from, msg.commits);
        if (msg.start !== undefined) this.a.seedStarts.set(from, msg.start);
        this.a.seedRules.set(from, msg.rules ?? "");
        this.checkSeedCommits();
        break;
      case "race-moves": {
        const rec = this.a.records.get(from);
        const now = this.clock.now();
        for (const mv of msg.moves) {
          if (rec) {
            if (!rec.raw.has(mv.i) && mv.i >= rec.applied)
              rec.raw.set(mv.i, { m: mv.m, t: mv.t, arrivedAt: now });
          } else {
            // 씨앗을 아직 모른다: 정해지면 다시 처리한다
            this.future.push({ msg, from });
            return;
          }
        }
        if (rec) this.drain(rec);
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
      case "race-bound": {
        if (msg.of === from || !this.a.members.includes(msg.of)) return;
        const rec = this.a.records.get(msg.of);
        if (!rec) {
          this.future.push({ msg, from });
          return;
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
    const newOut = msg.out.filter((e) => !this.out.has(e.id));
    if (msg.attempt > this.attemptNo) {
      for (const e of newOut)
        if (this.roster.includes(e.id)) this.out.set(e.id, e.reason);
      this.startAttempt(msg.attempt);
      if (this.result || this.out.has(from)) return;
    } else if (newOut.length > 0) {
      // 같은 시도인데 기권 목록이 다르다: 합쳐 다시 약속한다
      this.forfeit(newOut);
      return;
    }
    const a = this.a;
    if (!a.members.includes(from)) return;
    const known = a.commits.get(from);
    if (known !== undefined && known !== msg.commit) {
      this.forfeit([{ id: from, reason: "약속을 바꿈" }]);
      return;
    }
    if (a.revealedAt !== undefined && known === undefined) return;
    a.commits.set(from, msg.commit);
    // 내 약속을 보낼 때 상대가 아직 판을 열지 않았을 수 있다: 처음 받은 사람에게 한 번 더 직접 보낸다
    const mine = a.commits.get(this.self);
    if (!a.repliedTo.has(from) && mine !== undefined) {
      a.repliedTo.add(from);
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
    }
    this.maybeReveal();
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
      const missing = this.a.members.filter((id) => !this.a.nonces.has(id));
      this.forfeit(missing.map((id) => ({ id, reason: "공개 안 함" })));
    });
    this.maybeFixSeed();
  }

  private onReveal(
    msg: Extract<RaceMessage, { type: "race-reveal" }>,
    from: string,
  ): void {
    const a = this.a;
    if (a.nonces.has(from)) return;
    const commit = a.commits.get(from);
    if (commit === undefined) {
      if (a.spectator) {
        // 보기만 하는 기기는 약속을 직접 못 받았을 수 있다: 공개를 믿고 씨앗만 따라간다
        a.commits.set(
          from,
          raceCommitment(this.race, msg.attempt, from, msg.nonce, msg.salt),
        );
      } else return;
    } else if (
      raceCommitment(this.race, msg.attempt, from, msg.nonce, msg.salt) !==
      commit
    ) {
      this.forfeit([{ id: from, reason: "공개가 약속과 다름" }]);
      return;
    }
    a.nonces.set(from, msg.nonce);
    this.maybeFixSeed();
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

  /** 시작 상태를 만들지 못했다: 이 기기가 그 판 기권(남은 사람끼리 다시 약속) */
  private cannotPrepare(): void {
    if (!this.forfeit([{ id: this.self, reason: "섞기를 만들지 못함" }]))
      return;
    // 보기만 하는 기기는 약속을 보내지 않으므로, 남은 사람이 나를 기다리지 않게 기권 목록을 직접 알린다
    // (받는 쪽은 기권 목록을 합쳐 다음 시도로 넘어가고, 기권한 사람이 보낸 약속 값은 쓰지 않는다)
    this.broadcast({
      type: "race-commit",
      race: this.race,
      attempt: this.attemptNo,
      commit: "-",
      out: this.outList(),
    });
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
    const k = this.attemptNo;
    const pending = this.future.filter((f) => f.msg.attempt === k);
    this.future = this.future.filter((f) => f.msg.attempt !== k);
    for (const f of pending) {
      if (this.attemptNo !== k || this.result) return;
      this.handle(f.msg, f.from);
    }
    this.checkSeedCommits();
  }

  /** 다른 기기가 다른 약속으로 씨앗을 만들었으면(한 사람이 기기마다 다른 약속을 보냄 등) 그 사람을 기권으로 */
  private checkSeedCommits(): void {
    const a = this.a;
    if (a.seed === undefined) return;
    const blamed = new Set<string>();
    for (const [from, theirs] of a.seedCommits) {
      const ids = new Set([...a.members, ...Object.keys(theirs)]);
      for (const id of ids)
        if (a.commits.get(id) !== theirs[id])
          blamed.add(id === this.self ? from : id);
    }
    // 같은 씨앗인데 시작 상태가 다르다: 그 기기의 섞기를 믿지 않는다.
    // 서로를 탓하므로 둘뿐이면 판이 열리지 않고, 셋 이상이면 다르게 만든 기기만 빠진다
    if (a.start !== undefined)
      for (const [from, theirs] of a.seedStarts)
        if (theirs !== a.start) blamed.add(from);
    // 판정 설정(살펴보기·제한 시간 등)이 다르다: 방장이 기기마다 다른 설정을 줬거나 기기가 고쳐 썼다. 같은 길로 뺀다
    for (const [from, theirs] of a.seedRules)
      if (theirs !== this.rules) blamed.add(from);
    if (blamed.size > 0)
      this.forfeit([...blamed].map((id) => ({ id, reason: "섞기 어긋남" })));
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
    if (!a.spectator && a.revealedAt !== undefined) {
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
    }
    const done = rec.done;
    if (!done || rec.applied < done.n) return null;
    if (rec.applied !== done.n) return "수 수가 맞지 않음";
    if (!this.game.isSolved(rec.state as State)) return "맞추지 못함";
    if (done.t < (rec.moveTimes.at(-1) ?? 0) || done.t < 0)
      return "시각이 거꾸로 감";
    if (done.t > this.timeLimitMs) return "시간 안에 맞추지 못함";
    return null;
  }

  /** 내가 본 하한. 공개값을 보낸 뒤 그 사람이 끊긴 적이 있으면 확인 약함(null) */
  private boundAt(id: string, arrivedAt: number): number | null {
    const s = this.a.revealedAt;
    if (s === undefined || this.a.spectator) return null;
    const left = this.leaves.get(id) ?? [];
    if (left.some((t) => t >= s && t <= arrivedAt)) return null;
    return arrivalBound(s, arrivedAt, this.inspectionMs, this.capMs);
  }

  private maybeFinalize(): void {
    const a = this.a;
    if (this.result || a.seed === undefined) return;
    for (const id of a.members) {
      const rec = a.records.get(id) as Record_<State>;
      if (rec.status === "playing") return;
      if (rec.status !== "done") continue;
      for (const obs of a.members) {
        if (obs === id || rec.bounds.has(obs)) continue;
        if (obs === this.self || this.connected.has(obs)) return;
      }
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
          reason: cancelled ?? "경주를 열지 못함",
          moveTimes: [],
        };
      return {
        id,
        status: rec.status,
        moveTimes: rec.moveTimes,
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
