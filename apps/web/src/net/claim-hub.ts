import type { Clock } from "@game/fair-play";

import type { KitClaims } from "@/game/kit";
import {
  CLAIM_RULES,
  type ClaimMessage,
  type ClaimRules,
  type ClaimsResolved,
  compareClaims,
  isClaimWire,
  parseClaim,
  parseResolved,
  type ResolvedClaim,
  resolveClaimBatch,
} from "./claim";
import {
  allowedRt,
  type ClaimRaceSpec,
  MAX_LATENCY_CREDIT_MS,
  RACE_CHECK_MARGIN_MS,
  RACE_GATHER,
  RACE_GATHER_DEFAULT_MS,
  RACE_SLACK_MS,
  type RaceItem,
  raceArrange,
} from "./claim-race";
import { randomId, type Transport } from "./transport";

/** 청구 기억(아이디 목록 등)의 상한. 넘치면 오래된 것부터 지운다 */
const MAX_REMEMBERED = 512;

/** 2층 앱 핑 간격(ms)과 상대마다 남기는 왕복 표본 수 */
export const RACE_PING_MS = 2_000;
const RTT_SAMPLES = 20;
/** "최근 최대"를 볼 표본 수 */
const RTT_RECENT = 5;

/** 넣은 순서가 오래된 것부터 지워 크기를 맞춘다 */
function trim(items: Map<string, unknown> | Set<string>, max: number): void {
  while (items.size > max) {
    const oldest = items.keys().next().value as string;
    items.delete(oldest);
  }
}

export interface ClaimHubOptions<View> {
  transport: Transport;
  /** 게임 키트 id(`ClaimMessage.game`) */
  game: string;
  // biome-ignore lint/suspicious/noExplicitAny: 행동·청구 모양은 게임마다 다르다
  spec: KitClaims<View, any, any, any, any>;
  /** 방장은 묶음을 닫아 판정해 발표하고, 참가자는 발표를 맞춰 본다 */
  role: "host" | "guest";
  /** 묶음 창·이의 유예를 재는 시계. 시험은 ManualClock */
  clock: Clock;
  /** 내 자리(아직 없으면 null) */
  mySeat(): number | null;
  /** 연결 아이디 → 자리(방장 연결은 0). 모르면 null */
  seatOfPeer(peerId: string): number | null;
  /** 방장: 발표한 묶음을 엔진에 넣는다 */
  apply?(resolved: ClaimsResolved): void;
  /** 참가자: 발표가 내가 받은 청구·내 계산과 다르다(부정 알림으로 이어진다) */
  object(seat: number | null, reason: string): void;
  /**
   * 참가자: 발표의 판 번호(`at`)가 내 마지막 판과 정확히 같아야 하나. 일반 방은 화면이 바로 오므로 true.
   * 화면을 미루는 방(멘탈 포커)은 false로 두고, 방장이 판 번호를 줄여 말한 것(`at` < 내 판)만 잡는다
   */
  strictAt?(): boolean;
  /**
   * 참가자: 새로고침 뒤 다시 들어온 기기다(방 토큰이 있었다). 그러면 새로고침 전에 낸 내 청구 아이디를 모르므로,
   * 이 통로가 처음 본 판까지의 "내 자리 청구"는 모름으로 보고 가짜 청구 이의를 내지 않는다
   */
  resumed?: boolean;
  /** 청구 아이디 만들기(시험이 정한 값으로) */
  newId?(): string;
}

/** 받은 청구 하나(참가자가 이의 판단에 쓴다) */
interface Received {
  claim: ClaimMessage;
  /** 받은(내 것은 보낸) 시각(`Clock.now`). 늦은 발표를 가리는 데 쓴다 */
  at: number;
  /** 발표에서 보았다 */
  announced: boolean;
  /** 이의 유예 타이머를 끄는 함수 */
  cancel: (() => void) | null;
}

/**
 * 청구 통로(docs/43 4-1 `ClaimHub`, 모든 게임 공통). 서버 없이 방 안에서 합의한다(0-1).
 *
 * - 청구는 **모두에게 직접**(`transport.send` 대상 없이) 보낸다. 방장만 받으면 방장이 빼도 아무도 모른다.
 * - 방장은 첫 청구를 받은 뒤 `windowMs`가 지나면 묶음을 닫고 `resolveClaimBatch`로 판정해 발표한 뒤 엔진에 넣는다.
 * - 참가자는 발표를 자기가 받은 청구와 자기가 본 판으로 다시 계산해 맞춰 본다. 다르면 이의(`object`):
 *   직접 받은 청구가 `graceMs` 안에 어느 발표에도 없음, 내용이 다름, 내가 보내지 않은 내 청구, 순서·판정이 다름,
 *   판 번호(`at`)를 줄여 말함, 발표를 미뤄 정직한 청구를 "늦음"으로 만듦(`staleSlackMs`).
 * - 기억(받은 청구·발표 사본·내 청구)은 발표로 정리되면 지우고, 판정에 쓸 판보다 한참 옛 판(`keepBoards`)이면 지운다.
 * - 각 기기는 판 번호마다 공개 판(`KitClaims.board`)을 남긴다(`observe`). 판정은 늘 청구의 `seen` 판 기준이다.
 */
export class ClaimHub<View = unknown> {
  readonly rules: ClaimRules;
  private readonly options: ClaimHubOptions<View>;
  /** 판 번호 → 공개 판(최근 몇 판만) */
  private readonly boards = new Map<number, unknown>();
  /** 판 번호 → 이 기기가 그 판을 처음 받은 시각(`Clock.now`) */
  private readonly shownAt = new Map<number, number>();
  private latest: number | null = null;
  /** 이 통로가 처음 본 판 번호(새로고침 뒤 "모름"의 경계) */
  private first: number | null = null;
  /** 이미 본 청구 아이디 → 그 청구의 판 번호(같은 청구를 두 번 세지 않는다, 옛 판이면 지운다) */
  private readonly seenIds = new Map<string, number>();
  /** 방장: 닫지 않은 묶음 */
  private pending: ClaimMessage[] = [];
  private windowTimer: (() => void) | null = null;
  private batch = 0;
  /** 참가자: 받은 청구 중 아직 발표에서 보지 못한 것(아이디 → 청구). 발표에서 보거나 유예가 끝나면 지운다 */
  private readonly received = new Map<string, Received>();
  /**
   * 참가자: 발표에서 보았지만 직접은 아직 받지 못한 청구(아이디 → 발표 속 사본). 청구가 발표보다 늦게 오면
   * 이것과 견주고 지운다
   */
  private readonly announced = new Map<string, ClaimMessage>();
  /** 내가 낸 청구 아이디 → 판 번호 */
  private readonly mine = new Map<string, number>();
  /** 같은 이의를 되풀이하지 않는다 */
  private readonly objected = new Set<string>();
  private readonly resolvedListeners = new Set<
    (resolved: ClaimsResolved) => void
  >();
  private closed = false;
  /** 2층(반응 시간 겨루기). 없으면 1층만 */
  private readonly race: ClaimRaceSpec | null;
  /** 연결 → 앱 핑 왕복 표본(뒤가 최근) */
  private readonly rtts = new Map<string, number[]>();
  /** 보낸 핑 번호 → 보낸 시각 */
  private readonly pings = new Map<number, number>();
  private pingSeq = 0;
  private pingTimer: (() => void) | null = null;
  /** 방장: 청구 아이디 → 받은 시각과 보낸 연결(내 것은 null) */
  private readonly arrivals = new Map<
    string,
    { at: number; from: string | null }
  >();
  /** 방장: 발표를 차례대로(겨루기 순서 계산은 함께 뽑기로 기다릴 수 있다) */
  private announcing: Promise<void> = Promise.resolve();

  constructor(options: ClaimHubOptions<View>) {
    this.options = options;
    this.rules = { ...CLAIM_RULES, ...(options.spec.rules ?? {}) };
    this.race = options.spec.race ?? null;
    options.transport.onMessage((message, from) => {
      if (!this.closed && isClaimWire(message)) this.receive(message, from);
    });
    if (this.race) this.schedulePing();
  }

  /** 2층: 방 안 앱 핑을 드물게 보낸다(서버로 보내지 않는다, docs/43 0-1) */
  private schedulePing(): void {
    this.pingTimer = this.options.clock.after(RACE_PING_MS, () => {
      if (this.closed) return;
      const n = this.pingSeq++;
      this.pings.set(n, this.options.clock.now());
      if (this.pings.size > 16) this.pings.delete(n - 16);
      this.options.transport.send({
        v: 1,
        kind: "claim-ping",
        game: this.options.game,
        n,
      });
      this.schedulePing();
    });
  }

  /** 2층: 그 연결과의 앱 핑 왕복(가장 짧은 값과 최근 최대). 표본이 없으면 null */
  rttOf(peerId: string): { min: number; recentMax: number } | null {
    const list = this.rtts.get(peerId);
    if (!list || list.length === 0) return null;
    return {
      min: Math.min(...list),
      recentMax: Math.max(...list.slice(-RTT_RECENT)),
    };
  }

  /** 2층: 방장이 첫 청구 뒤 기다리는 시간(늦게 닿는 더 빠른 청구를 기다린다) */
  private gatherMs(): number {
    let worst: number | null = null;
    for (const peer of this.rtts.keys()) {
      const r = this.rttOf(peer);
      if (r) worst = Math.max(worst ?? 0, r.recentMax);
    }
    if (worst === null) return RACE_GATHER_DEFAULT_MS;
    return Math.min(
      RACE_GATHER.maxMs,
      Math.max(RACE_GATHER.minMs, Math.round(worst + RACE_GATHER.marginMs)),
    );
  }

  /** 판 번호가 바뀐 화면을 받으면 부른다. 같은 판 번호의 판은 처음 것을 남긴다 */
  observe(view: View): void {
    const seen = this.options.spec.stimulusOf(view);
    if (!this.boards.has(seen)) {
      this.boards.set(
        seen,
        JSON.parse(JSON.stringify(this.options.spec.board(view))) as unknown,
      );
      this.shownAt.set(seen, this.options.clock.now());
    }
    this.first ??= seen;
    if (this.latest === null || seen > this.latest) this.latest = seen;
    this.prune();
  }

  /** 판정에 쓸 수 있는 판(`staleBoards`)보다 넉넉히 남긴다. 이보다 옛 판의 청구는 참가자가 받지도 기억하지도 않는다 */
  private get keepBoards(): number {
    return this.rules.staleBoards + 8;
  }

  /** 옛 판의 판·청구 기억을 지운다(발표로 정리된 것은 이미 지웠다). 넘치면 오래된 것부터 */
  private prune(): void {
    if (this.latest === null) return;
    const floor = this.latest - this.keepBoards;
    for (const key of this.boards.keys())
      if (key < floor) {
        this.boards.delete(key);
        this.shownAt.delete(key);
      }
    for (const [id, seen] of this.seenIds)
      if (seen < floor) this.seenIds.delete(id);
    for (const [id, seen] of this.mine) if (seen < floor) this.mine.delete(id);
    for (const [id, copy] of this.announced)
      if (copy.seen < floor) this.announced.delete(id);
    // 아직 발표되지 않은 받은 청구는 이의 유예가 끝날 때 지워진다(이의 판단에 필요하다).
    trim(this.seenIds, MAX_REMEMBERED);
    trim(this.mine, MAX_REMEMBERED);
    trim(this.announced, MAX_REMEMBERED);
    trim(this.objected, MAX_REMEMBERED);
    while (this.received.size > MAX_REMEMBERED) {
      const [id, entry] = this.received.entries().next().value as [
        string,
        Received,
      ];
      entry.cancel?.();
      this.received.delete(id);
    }
  }

  /** 기억하고 있는 청구 수(시험이 정리되는지 본다) */
  memorySize(): number {
    return (
      this.seenIds.size +
      this.received.size +
      this.announced.size +
      this.mine.size
    );
  }

  /** 내 기기가 마지막으로 본 판 번호 */
  latestSeen(): number | null {
    return this.latest;
  }

  /**
   * 내 청구를 모두에게 보낸다. `seen`이 없으면 마지막으로 본 판. 자리나 판이 아직 없으면 null.
   * 화면은 누른 시각 이전에 그려진 마지막 판을 `seen`으로 넘긴다(docs/43 2-1)
   */
  claim(
    body: unknown,
    extra: { seen?: number; rtMs?: number; hidden?: boolean } = {},
  ): ClaimMessage | null {
    const seat = this.options.mySeat();
    const seen = extra.seen ?? this.latest;
    if (this.closed || seat === null || seen === null) return null;
    if (!this.options.spec.isBody(body)) return null;
    const message: ClaimMessage = {
      v: 1,
      kind: "claim",
      game: this.options.game,
      claimId: this.options.newId?.() ?? randomId(16),
      seat,
      seen,
      body,
      ...(extra.rtMs !== undefined ? { rtMs: extra.rtMs } : {}),
      ...(extra.hidden ? { hidden: true } : {}),
    };
    const parsed = parseClaim(message, this.options.game, (b) =>
      this.options.spec.isBody(b),
    );
    if (!parsed) return null;
    this.mine.set(parsed.claimId, parsed.seen);
    this.options.transport.send(parsed);
    this.accept(parsed);
    return parsed;
  }

  /** 발표(방장은 낸 것, 참가자는 맞춰 보고 받아들인 것) */
  onResolved(listener: (resolved: ClaimsResolved) => void): () => void {
    this.resolvedListeners.add(listener);
    return () => this.resolvedListeners.delete(listener);
  }

  /**
   * 더 받지 않는다. 걸린 타이머를 끈다. 방장은 닫지 않은 묶음(발표 전)을 버리고, 참가자는 받은 청구의 빠뜨림 이의를
   * 내지 않는다(판 끝에 모두가 닫아 같은 결론이 된다)
   */
  close(): void {
    this.closed = true;
    this.pingTimer?.();
    this.pingTimer = null;
    this.windowTimer?.();
    this.windowTimer = null;
    this.pending = [];
    for (const r of this.received.values()) r.cancel?.();
  }

  private isBody = (body: unknown) => this.options.spec.isBody(body);

  private receive(message: unknown, from: string): void {
    const sender = this.options.seatOfPeer(from);
    if (sender === null) return;
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "claim-ping" || kind === "claim-pong") {
      const m = message as { game?: unknown; n?: unknown };
      if (!this.race || m.game !== this.options.game) return;
      if (!Number.isSafeInteger(m.n)) return;
      const n = m.n as number;
      if (kind === "claim-ping") {
        this.options.transport.send(
          { v: 1, kind: "claim-pong", game: this.options.game, n },
          from,
        );
        return;
      }
      const sent = this.pings.get(n);
      if (sent === undefined) return;
      const list = this.rtts.get(from) ?? [];
      list.push(this.options.clock.now() - sent);
      if (list.length > RTT_SAMPLES) list.shift();
      this.rtts.set(from, list);
      return;
    }
    if (kind === "claim") {
      const claim = parseClaim(message, this.options.game, this.isBody);
      // 남의 자리를 사칭한 청구는 버린다(모든 기기가 같은 연결-자리 표로 본다).
      if (!claim || claim.seat !== sender) return;
      this.accept(claim, from);
      return;
    }
    if (this.options.role !== "guest" || sender !== 0) return;
    const resolved = parseResolved(message, this.options.game, this.isBody);
    if (resolved) this.check(resolved);
  }

  /** 청구 하나를 받아들인다(내 것도, 그때 `from`은 null) */
  private accept(claim: ClaimMessage, from: string | null = null): void {
    if (this.seenIds.has(claim.claimId)) {
      // 참가자: 같은 아이디로 내용이 다른 청구가 또 오면 방장 발표와 견줄 때 드러난다(첫 것을 남긴다).
      return;
    }
    // 참가자: 기억을 지운 옛 판의 청구(늦게 온 사본일 수 있다)는 받지 않는다. 방장은 그대로 받아 "늦음"으로 발표한다.
    if (
      this.options.role === "guest" &&
      this.latest !== null &&
      claim.seen < this.latest - this.keepBoards
    )
      return;
    this.seenIds.set(claim.claimId, claim.seen);
    if (this.options.role === "host") {
      this.pending.push(claim);
      if (this.race) {
        this.arrivals.set(claim.claimId, {
          at: this.options.clock.now(),
          from,
        });
        trim(this.arrivals as Map<string, unknown>, MAX_REMEMBERED);
      }
      this.windowTimer ??= this.options.clock.after(
        this.race ? this.gatherMs() : this.rules.windowMs,
        () => this.flush(),
      );
      return;
    }
    const copy = this.announced.get(claim.claimId);
    if (copy) {
      // 발표가 먼저 왔다: 지금 견주고 정리한다.
      this.announced.delete(claim.claimId);
      this.compareContent(copy, claim);
      return;
    }
    const entry: Received = {
      claim,
      at: this.options.clock.now(),
      announced: false,
      cancel: null,
    };
    entry.cancel = this.options.clock.after(this.rules.graceMs, () => {
      entry.cancel = null;
      this.received.delete(claim.claimId);
      if (!entry.announced && !this.closed)
        this.raise(
          `omit:${claim.claimId}`,
          0,
          `방장이 ${claim.seat}번 자리의 청구(${claim.seen}번 판)를 발표하지 않았다`,
        );
    });
    this.received.set(claim.claimId, entry);
  }

  /** 방장: 묶음을 닫고 판정해 발표한다 */
  private flush(): void {
    this.windowTimer = null;
    if (this.closed || this.pending.length === 0) return;
    const claims = this.pending.splice(0, this.pending.length);
    const at = this.latest ?? 0;
    const batch = this.batch++;
    const entries = this.judgeBatch(claims, at);
    const race = this.race;
    if (!race) {
      this.announce({
        v: 1,
        kind: "claims-resolved",
        game: this.options.game,
        batch,
        at,
        entries,
      });
      return;
    }
    // 2층: 인정 반응 시간(경계·하한)으로 겨루기 순서를 정해 발표한다. 잡는 사람끼리 동점이면 함께 뽑기를 기다린다
    const items = entries.map((e) => ({
      entry: e,
      item: {
        claim: e.claim,
        rt: this.hostAllowed(race, e.claim),
        owner: this.isOwner(race, e.claim),
      },
    }));
    this.announcing = this.announcing.then(async () => {
      const arranged = await raceArrange(
        items.map((x) => x.item),
        race.tieMs,
        `b${batch}`,
      );
      if (this.closed) return;
      const byItem = new Map(items.map((x) => [x.item, x.entry]));
      this.announce({
        v: 1,
        kind: "claims-resolved",
        game: this.options.game,
        batch,
        at,
        entries: arranged.map((i) => byItem.get(i) as ResolvedClaim),
        race: { rt: arranged.map((i) => i.rt) },
      });
    });
  }

  private announce(resolved: ClaimsResolved): void {
    this.options.transport.send(resolved);
    for (const l of this.resolvedListeners) l(resolved);
    this.options.apply?.(resolved);
  }

  /** 발표를 다 냈을 때(시험·판 끝이 기다린다) */
  settled(): Promise<void> {
    return this.announcing;
  }

  /** 그 판에서 이 청구를 낸 자리가 본인인가(판을 모르면 아니다) */
  private isOwner(race: ClaimRaceSpec, claim: ClaimMessage): boolean {
    const board = this.boards.get(claim.seen);
    return board !== undefined && race.isOwner(board, claim);
  }

  /** 방장이 인정하는 반응 시간. 내 청구는 보고 그대로(하한만), 손님 청구는 받은 시각과 왕복으로 아래 경계를 씌운다 */
  private hostAllowed(race: ClaimRaceSpec, claim: ClaimMessage): number {
    const arrival = this.arrivals.get(claim.claimId);
    this.arrivals.delete(claim.claimId);
    const shown = this.shownAt.get(claim.seen);
    if (!arrival || arrival.from === null || shown === undefined)
      return allowedRt({
        rtMs: claim.rtMs,
        elapsedMs: null,
        rttMinMs: null,
        spec: race,
      });
    return allowedRt({
      rtMs: claim.rtMs,
      elapsedMs: arrival.at - shown,
      rttMinMs: this.rttOf(arrival.from)?.min ?? null,
      spec: race,
    });
  }

  private judgeBatch(claims: readonly ClaimMessage[], at: number) {
    return resolveClaimBatch({
      claims,
      at,
      rules: this.rules,
      board: (seen) => this.boards.get(seen),
      judge: (board, claim) => this.options.spec.judge(board, claim),
    });
  }

  /** 참가자: 방장 발표를 맞춰 본다 */
  private check(resolved: ClaimsResolved): void {
    const tag = `batch${resolved.batch}`;
    // 판 번호: 방장 화면은 내 화면보다 늦을 수 없다. 줄여 말하면 옛 판 청구를 받아 주려는 것이다.
    if (this.latest !== null) {
      const strict = this.options.strictAt?.() ?? true;
      if (resolved.at < this.latest || (strict && resolved.at !== this.latest))
        this.raise(
          `${tag}:at`,
          0,
          `방장 발표의 판 번호(${resolved.at})가 내가 받은 판(${this.latest})과 다르다`,
        );
    }
    const claims = resolved.entries.map((e) => e.claim);
    const ids = new Set(claims.map((c) => c.claimId));
    if (ids.size !== claims.length)
      this.raise(`${tag}:dup`, 0, "방장 발표에 같은 청구가 두 번 있다");
    // 1층 순서는 (판, 자리, 아이디). 2층 게임은 겨루기 순서라 따로 맞춰 본다(`checkRace`)
    const ordered = [...claims].sort(compareClaims);
    if (!this.race && ordered.some((c, i) => c !== claims[i]))
      this.raise(
        `${tag}:order`,
        0,
        "방장 발표의 처리 순서가 정해진 순서와 다르다",
      );
    const me = this.options.mySeat();
    const expected = new Map(
      this.judgeBatch(claims, resolved.at).map((e) => [e.claim.claimId, e]),
    );
    /** 2층 확인 재료: 내가 직접 받은 시각 */
    const gotAt = new Map<string, number>();
    for (const entry of resolved.entries.values()) {
      const id = entry.claim.claimId;
      if (
        entry.claim.seat === me &&
        !this.mine.has(id) &&
        !this.unknownMine(entry.claim)
      )
        this.raise(
          `fake:${id}`,
          0,
          "방장 발표에 내가 보내지 않은 내 청구가 있다",
        );
      const got = this.received.get(id);
      if (got) {
        got.announced = true;
        got.cancel?.();
        got.cancel = null;
        this.received.delete(id);
        gotAt.set(id, got.at);
        this.compareContent(entry.claim, got.claim);
        this.checkStaleDelay(entry, got);
      } else if (!this.seenIds.has(id)) {
        // 직접 받은 것이 오면 견준다(이미 받아 정리한 청구가 다시 발표된 것이면 둘 일이 없다).
        this.announced.set(id, entry.claim);
      }
      this.compareOutcome(tag, entry, expected.get(id));
    }
    if (this.race) void this.checkRace(this.race, resolved, gotAt);
    this.prune();
    for (const l of this.resolvedListeners) l(resolved);
  }

  /**
   * 2층 확인(방장과 같은 식): 인정 반응 시간이 보고·하한보다 짧지 않나, 내 청구를 부풀리지 않았나, 방장 자기 청구를
   * 내가 잰 경계보다 짧게 잡지 않았나, 순서가 겨루기 순서(동점 본인 우선, 잡는 사람끼리 함께 뽑기)와 같나
   */
  private async checkRace(
    race: ClaimRaceSpec,
    resolved: ClaimsResolved,
    gotAt: ReadonlyMap<string, number>,
  ): Promise<void> {
    const tag = `batch${resolved.batch}`;
    const info = resolved.race;
    if (!info) {
      this.raise(`${tag}:race`, 0, "방장 발표에 반응 시간이 없다");
      return;
    }
    const me = this.options.mySeat();
    const host = [...this.rtts.keys()].find(
      (p) => this.options.seatOfPeer(p) === 0,
    );
    const toHost = host ? this.rttOf(host) : null;
    let boardsKnown = true;
    const items: RaceItem[] = resolved.entries.map((entry, i) => {
      const claim = entry.claim;
      const rt = info.rt[i] as number;
      const reported = Math.max(claim.rtMs ?? 0, race.floorMs);
      if (rt < reported)
        this.raise(
          `${tag}:rt-low:${claim.claimId}`,
          0,
          `방장이 ${claim.seat}번 자리의 반응 시간을 보고보다 줄였다`,
        );
      if (claim.seat === me && this.mine.has(claim.claimId) && toHost) {
        // 정직한 방장이 늘릴 수 있는 것: 그때 왕복 − 봐준 왕복(상한 C) + 그리기·흔들림
        const tolerance =
          toHost.recentMax -
          Math.min(toHost.min, MAX_LATENCY_CREDIT_MS) +
          RACE_CHECK_MARGIN_MS;
        if (rt - reported > tolerance)
          this.raise(
            `${tag}:rt-high:${claim.claimId}`,
            0,
            "방장이 내 반응 시간을 늘려 발표했다",
          );
      }
      const got = gotAt.get(claim.claimId);
      const shown = this.shownAt.get(claim.seen);
      if (claim.seat === 0 && got !== undefined && shown !== undefined) {
        // 방장 청구: 내가 판을 받은 뒤 청구가 닿기까지에서 보냄 지연·여유를 뺀 값보다 짧으면 깎아 보고한 것
        const lower =
          got - shown - race.sendDelayMs - RACE_SLACK_MS - RACE_CHECK_MARGIN_MS;
        if (rt < lower)
          this.raise(
            `${tag}:host-rt:${claim.claimId}`,
            0,
            "방장이 자기 반응 시간을 줄여 발표했다",
          );
      }
      if (!this.boards.has(claim.seen)) boardsKnown = false;
      return { claim, rt, owner: this.isOwner(race, claim) };
    });
    // 판을 모르면(늦게 들어옴) 본인 여부를 몰라 순서는 맞춰 보지 않는다
    if (!boardsKnown) return;
    const arranged = await raceArrange(items, race.tieMs, `b${resolved.batch}`);
    if (arranged.some((item, i) => item !== items[i]))
      this.raise(
        `${tag}:race-order`,
        0,
        "방장 발표의 순서가 반응 시간 겨루기 순서와 다르다",
      );
  }

  /**
   * 새로고침 뒤 다시 들어온 기기는 처음 본 판까지의 내 청구를 모른다(새로고침 전에 냈을 수 있다).
   * 판 번호는 줄지 않으므로 처음 본 판보다 뒤의 판에 대한 내 청구는 모두 이 통로가 낸 것이다
   */
  private unknownMine(claim: ClaimMessage): boolean {
    if (!this.options.resumed) return false;
    return this.first === null || claim.seen <= this.first;
  }

  /**
   * 방장이 묶음을 늦게 닫아 정직한 청구를 "늦음"으로 만들었나. 늦음이 정직하려면 청구가 방장에게 닿을 때
   * 방장 판이 이미 `seen + staleBoards + 1`(늦음이 되는 판, S)이어야 한다. 방장 판은 내게 편도만큼 늦게 오고
   * 청구도 방장에게 편도만큼 늦게 닿으므로, 정직하면 "내가 S를 받은 시각 − 내가 청구를 받은(보낸) 시각"이
   * 편도 몇 번 안쪽이다. 그보다 한참 뒤(`staleSlackMs`)에 S를 받았는데 늦음이면, 방장이 청구를 받고도
   * 발표를 미루다 판을 넘긴 것이다
   */
  private checkStaleDelay(entry: ResolvedClaim, got: Received): void {
    if (entry.outcome.status !== "ignored" || entry.outcome.reason !== "stale")
      return;
    const shown = this.shownAt.get(
      entry.claim.seen + this.rules.staleBoards + 1,
    );
    if (shown === undefined) return;
    if (shown - got.at > this.rules.staleSlackMs)
      this.raise(
        `late:${entry.claim.claimId}`,
        0,
        `방장이 ${entry.claim.seat}번 자리의 청구(${entry.claim.seen}번 판)를 늦게 발표해 늦음으로 버렸다`,
      );
  }

  /** 판정 비교. 내가 그 판을 기록하지 못했으면(늦게 들어옴) 판정은 건너뛴다 */
  private compareOutcome(
    tag: string,
    entry: ResolvedClaim,
    mine: ResolvedClaim | undefined,
  ): void {
    if (!mine) return;
    if (
      mine.outcome.status === "ignored" &&
      mine.outcome.reason === "unknown-board"
    )
      return;
    if (JSON.stringify(mine.outcome) !== JSON.stringify(entry.outcome))
      this.raise(
        `${tag}:judge:${entry.claim.claimId}`,
        0,
        `방장이 ${entry.claim.seat}번 자리의 청구(${entry.claim.seen}번 판)를 다르게 판정했다`,
      );
  }

  private compareContent(announced: ClaimMessage, direct: ClaimMessage): void {
    if (JSON.stringify(announced) === JSON.stringify(direct)) return;
    // 방장이 바꿨는지, 청구한 사람이 사람마다 다르게 보냈는지 가릴 수 없다.
    this.raise(
      `content:${direct.claimId}`,
      null,
      `방장 발표 속 ${direct.seat}번 자리 청구가 내가 직접 받은 것과 다르다`,
    );
  }

  private raise(key: string, seat: number | null, reason: string): void {
    if (this.objected.has(key)) return;
    this.objected.add(key);
    this.options.object(seat, reason);
  }
}
