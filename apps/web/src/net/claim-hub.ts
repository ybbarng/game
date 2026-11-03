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
import { randomId, type Transport } from "./transport";

/** 청구 기억(아이디 목록 등)의 상한. 넘치면 오래된 것부터 지운다 */
const MAX_REMEMBERED = 512;

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

  constructor(options: ClaimHubOptions<View>) {
    this.options = options;
    this.rules = { ...CLAIM_RULES, ...(options.spec.rules ?? {}) };
    options.transport.onMessage((message, from) => {
      if (!this.closed && isClaimWire(message)) this.receive(message, from);
    });
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

  /** 더 받지 않는다. 걸린 타이머를 끈다 */
  close(): void {
    this.closed = true;
    this.windowTimer?.();
    this.windowTimer = null;
    for (const r of this.received.values()) r.cancel?.();
  }

  private isBody = (body: unknown) => this.options.spec.isBody(body);

  private receive(message: unknown, from: string): void {
    const sender = this.options.seatOfPeer(from);
    if (sender === null) return;
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "claim") {
      const claim = parseClaim(message, this.options.game, this.isBody);
      // 남의 자리를 사칭한 청구는 버린다(모든 기기가 같은 연결-자리 표로 본다).
      if (!claim || claim.seat !== sender) return;
      this.accept(claim);
      return;
    }
    if (this.options.role !== "guest" || sender !== 0) return;
    const resolved = parseResolved(message, this.options.game, this.isBody);
    if (resolved) this.check(resolved);
  }

  /** 청구 하나를 받아들인다(내 것도) */
  private accept(claim: ClaimMessage): void {
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
      this.windowTimer ??= this.options.clock.after(this.rules.windowMs, () =>
        this.flush(),
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
    const resolved: ClaimsResolved = {
      v: 1,
      kind: "claims-resolved",
      game: this.options.game,
      batch: this.batch++,
      at,
      entries: this.judgeBatch(claims, at),
    };
    this.options.transport.send(resolved);
    for (const l of this.resolvedListeners) l(resolved);
    this.options.apply?.(resolved);
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
    const ordered = [...claims].sort(compareClaims);
    if (ordered.some((c, i) => c !== claims[i]))
      this.raise(
        `${tag}:order`,
        0,
        "방장 발표의 처리 순서가 정해진 순서와 다르다",
      );
    const me = this.options.mySeat();
    const expected = this.judgeBatch(claims, resolved.at);
    for (const [i, entry] of resolved.entries.entries()) {
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
        this.compareContent(entry.claim, got.claim);
        this.checkStaleDelay(entry, got);
      } else if (!this.seenIds.has(id)) {
        // 직접 받은 것이 오면 견준다(이미 받아 정리한 청구가 다시 발표된 것이면 둘 일이 없다).
        this.announced.set(id, entry.claim);
      }
      this.compareOutcome(tag, entry, expected[i]);
    }
    this.prune();
    for (const l of this.resolvedListeners) l(resolved);
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
