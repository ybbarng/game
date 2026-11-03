import type { Card } from "@game/mighty-engine";

import { slotOfToken } from "./blind";
import { type Clock, realClock } from "./clock";
import type { BusyReason, Incident } from "./coordinator";
import { FairDevice, type FairWire, type GroupName } from "./device";
import { swapTokens } from "./hwatu-table";
import type { FairControl } from "./messages";
import {
  checkOnecardReplay,
  isOnecardReshuffle,
  OnecardDeck,
  type OnecardDeckSnapshot,
  type OnecardFairSpec,
  type OnecardLogged,
  type OnecardPreset,
  type OnecardReplayCheck,
  type OnecardRoundDeal,
  onecardDealId,
  onecardReshuffleMessage,
} from "./onecard-table";
import type { PartySnapshot } from "./protocol";

/*
 * 원카드 멘탈 포커 진행(docs/42 4-2, 16절). `OnecardDeck`(섞기·뽑기·다시 섞기 사슬) 위에 방장 엔진을 잇는다.
 * 화투(`HwatuHostTable`·`HwatuGuestSeat`)와 같은 모양으로 온라인 방(HostRoom·GuestRoom)에 붙는다.
 *
 * - 한 게임이 한 판이다(판 번호 1). 덱 조각 0은 처음 덱, k는 k번째 다시 섞기.
 * - 방장 엔진은 열리지 않은 카드를 판 자리 표(`?_N`)로 든다. 낸 카드는 낸 사람이 그 자리 열쇠를 공개한다.
 * - 처음 펼친 카드가 특수 카드면 엔진이 버린 더미 밑으로 보내고 더미 맨 위를 다시 편다. 방장은 판을 만들기 전에
 *   그 자리를 모두에게 연다(`deck`, to −1). 참가자는 앞서 열린 카드가 특수 카드일 때만 받아들인다.
 * - 더미에서 먹는 카드는 먹는 사람만 연다. 방장이 엔진을 한 걸음 미리 돌려 보고 몇 장을 누구에게 열지 알린다.
 * - 더미가 바닥나면 방장이 버린 더미(공개 정보)를 알리고(`reshuffle`) 모두 새 섞기 사슬을 시작한다. 엔진 행동
 *   `reshuffle`의 새 더미는 그 조각의 자리 표다(`withRefill`).
 * - 게임이 끝나는 걸음 전에 모든 열쇠를 공개한다(남은 손패가 점수이고 끝 화면에 모두 보인다). 다 열리면
 *   진짜 카드로 기록을 다시 돌린다(`checkOnecardTable`).
 */

/** 원카드 화면에서 함께 쓰는 칸 */
export interface OnecardViewLike {
  hand: string[];
  decision: unknown;
}

/** 원카드 멘탈 포커에 필요한 엔진 모양(판 끝 검증 모양 + 진행에 쓰는 것) */
export interface OnecardTableSpec<
  Rules,
  State,
  View extends OnecardViewLike,
  Action,
  Event,
> extends OnecardFairSpec<Rules, State, Action, Event> {
  /** `GameKit.cardTable`에서 화투 모양과 가른다 */
  readonly kind: "onecard";
  /** 자리별 처음 손패 장 수 */
  handSizes(rules: Rules): number[];
  viewOf(state: State, seat: number): View;
  pendingSeats(state: State): number[];
  /** 이 행동으로 모두에게 보일 내 카드(낼 카드) */
  revealsOf(action: Action): string[];
  /** 게임이 끝났다 */
  gameOver(state: State): boolean;
  /** 엔진이 다시 섞기를 기다린다 */
  reshuffling(state: State): boolean;
  /** 다시 섞기 행동인가(방장 기기가 넣는다) */
  isReshuffle(action: Action): boolean;
  /** 진짜 카드 화면을 다시 계산한다(손패 정렬, 낼 수 있는 수) */
  refreshView(view: View): View;
  /** 덱(없으면 54장). 시험이 짧은 덱으로 다시 섞기를 일으킬 때 */
  readonly deckCards?: readonly Card[];
}

/** 모두에게 여는 자리의 주인 */
const PUBLIC = -1;

/** 이 게임의 판 번호(원카드는 한 게임이 한 판) */
const ROUND = 1;

type Prepared<Action> =
  | { ok: true; action: Action }
  | { ok: false; error: string };

/**
 * 판 끝 검증: 처음 펼칠 때 모두에게 연 더미 자리(특수 카드 다시 펴기)를 엔진이 다시 편 것과 맞춰 본 뒤,
 * 나머지를 `checkOnecardReplay`로 본다(그 함수는 걸음마다의 뽑기만 센다)
 */
export function checkOnecardTable<Rules, State, Action, Event>(
  spec: OnecardFairSpec<Rules, State, Action, Event>,
  rules: Rules,
  seed: number,
  log: readonly OnecardLogged<Action>[],
  deals: ReadonlyMap<number, OnecardRoundDeal>,
  requests: {
    of(round: number): readonly { to: number }[];
    deviceOf(seat: number): number;
  },
  flipsOf: (events: readonly Event[]) => number,
): OnecardReplayCheck<State> {
  const first = deals.get(ROUND);
  if (!first)
    return { ok: false, index: -1, seat: 0, reason: "첫 판 패가 없다" };
  const flips = flipsOf(spec.createMatch(rules, seed, first.preset).events);
  const asked = requests.of(ROUND);
  const lead = asked.slice(0, flips);
  if (lead.length < flips || lead.some((r) => r.to !== PUBLIC))
    return {
      ok: false,
      index: -1,
      seat: 0,
      reason: "방장이 처음 카드를 엔진과 다르게 다시 폈다",
    };
  return checkOnecardReplay(spec, rules, seed, log, deals, {
    of: (round) =>
      (round === ROUND ? asked.slice(flips) : requests.of(round)) as never,
    deviceOf: requests.deviceOf,
  });
}

export interface OnecardHostHooks<State, Action> {
  state(): State;
  log(): readonly OnecardLogged<Action>[];
  refresh(): void;
  broadcast(message: FairWire | FairControl): void;
  onIncident(incident: Incident): void;
}

/** 원카드 진행에서 방장·참가자가 함께 쓰는 것 */
abstract class OnecardSide<
  Rules,
  State,
  View extends OnecardViewLike,
  Action,
  Event,
> {
  readonly spec: OnecardTableSpec<Rules, State, View, Action, Event>;
  readonly rules: Rules;
  readonly seed: number;
  readonly device: FairDevice;
  readonly deck: OnecardDeck;
  readonly deals = new Map<number, OnecardRoundDeal>();
  protected readonly guests: Set<number>;
  protected readonly clock: Clock;
  private busy: BusyReason | null = null;
  private readonly busyListeners = new Set<(busy: BusyReason | null) => void>();

  constructor(options: {
    id: number;
    spec: OnecardTableSpec<Rules, State, View, Action, Event>;
    rules: Rules;
    seed: number;
    guestSeats: readonly number[];
    group: GroupName;
    send: (message: FairWire) => void;
    onIncident: (incident: Incident) => void;
    restore?: Record<number, PartySnapshot>;
    clock?: Clock;
    /** 시험용 작은 덱 */
    cards?: readonly Card[];
  }) {
    this.spec = options.spec;
    this.rules = options.rules;
    this.seed = options.seed;
    this.guests = new Set(options.guestSeats);
    this.clock = options.clock ?? realClock;
    this.device = new FairDevice({
      id: options.id,
      group: options.group,
      send: options.send,
      clock: this.clock,
      ...(options.restore ? { restore: options.restore } : {}),
    });
    this.deck = new OnecardDeck({
      device: this.device,
      devices: [0, ...[...this.guests].sort((a, b) => a - b)],
      deviceOf: (seat) => this.deviceOf(seat),
      onIncident: options.onIncident,
      clock: this.clock,
      ...((options.cards ?? options.spec.deckCards)
        ? { cards: options.cards ?? options.spec.deckCards }
        : {}),
    });
    this.deck.onOpened((round) => {
      const real = this.deck.roundDeal(round);
      if (real) this.deals.set(round, real);
      this.opened(round);
    });
    this.deck.watch(() => this.updateBusy());
  }

  /** 화면 띠(`bindFair`)가 섞는 중을 듣는 곳. 화투의 `coordinator`와 같은 자리 */
  get coordinator(): {
    onBusy(listener: (busy: BusyReason | null) => void): () => void;
    incident(incident: Incident): void;
  } {
    return this;
  }

  /** 판을 멈추고 알린다(`OnecardDeck.incident`) */
  incident(incident: Incident): void {
    this.deck.incident(incident);
  }

  deviceOf(seat: number): number {
    return this.guests.has(seat) ? seat : 0;
  }

  get halted(): boolean {
    return this.deck.halted;
  }

  /** 섞고 나누는 중이거나 다시 섞는 사슬이 도는 중이면 "deal" */
  onBusy(listener: (busy: BusyReason | null) => void): () => void {
    this.busyListeners.add(listener);
    listener(this.busy);
    return () => this.busyListeners.delete(listener);
  }

  private updateBusy(): void {
    const reason: BusyReason | null =
      !this.deck.segmentReady(ROUND, 0) ||
      this.deck.reshuffling(ROUND) ||
      !this.deck.dealtHere(ROUND)
        ? "deal"
        : null;
    if (reason === this.busy) return;
    this.busy = reason;
    for (const l of this.busyListeners) l(reason);
  }

  /** 판이 다 열리고 조각별 확인을 지났다 */
  protected abstract opened(round: number): void;

  /** 조건이 맞을 때까지 기다린다. 판을 멈추면 false. `ms`가 있으면 그만큼만 */
  protected until(cond: () => boolean, ms: number | null): Promise<boolean> {
    return new Promise((resolve) => {
      let cancelTimer: (() => void) | null = null;
      let stop: (() => void) | null = null;
      let finished = false;
      const done = (ok: boolean) => {
        if (finished) return;
        finished = true;
        stop?.();
        cancelTimer?.();
        resolve(ok);
      };
      const probe = () => {
        if (this.halted) done(false);
        else if (cond()) done(true);
      };
      stop = this.deck.watch(probe);
      const offCards = this.device.on("cards", probe);
      const offKeys = this.device.on("keys", probe);
      const prevStop = stop;
      stop = () => {
        prevStop();
        offCards?.();
        offKeys?.();
      };
      if (ms !== null) cancelTimer = this.clock.after(ms, () => done(false));
      probe();
    });
  }

  /** 화면 속 자리 표를 이 기기가 아는 카드로. 못 연 카드가 있으면 null */
  protected reveal(view: View): View | null {
    const swapped = swapTokens(view, this.deck.knownCards(ROUND));
    if (swapped.missing > 0) return null;
    return this.spec.refreshView(swapped.value);
  }

  /** 내 손패(자리 표)에서 이 카드가 있는 판 자리 */
  protected slotOf(hand: readonly string[], card: string): number | null {
    const known = this.deck.knownCards(ROUND);
    for (const token of hand) {
      const slot = slotOfToken(token);
      if (slot !== null && known.get(slot) === card) return slot;
    }
    return null;
  }

  /** 판 자리들의 열쇠를 공개한다(낸 카드) */
  protected revealSlots(globals: readonly number[]): void {
    const byDeal = new Map<number, number[]>();
    for (const g of globals) {
      const at = this.deck.locate(ROUND, g);
      if (!at) continue;
      byDeal.set(at.deal, [...(byDeal.get(at.deal) ?? []), at.slot]);
    }
    for (const [deal, slots] of byDeal) this.device.reveal(deal, slots, "play");
  }

  /** 판 자리 하나가 모두에게(또는 이 기기에) 열렸나 */
  protected isOpen(global: number): boolean {
    const at = this.deck.locate(ROUND, global);
    return at !== null && this.device.open(at.deal, at.slot) !== null;
  }
}

/** 방장 기기 쪽 원카드 멘탈 포커 진행 */
export class OnecardHostTable<
  Rules,
  State,
  View extends OnecardViewLike,
  Action,
  Event,
> extends OnecardSide<Rules, State, View, Action, Event> {
  readonly history: { events: Event[] }[] = [];
  private readonly hooks: OnecardHostHooks<State, Action>;
  private ended = false;
  private checked = false;

  constructor(options: {
    spec: OnecardTableSpec<Rules, State, View, Action, Event>;
    rules: Rules;
    seed: number;
    guestSeats: readonly number[];
    group: GroupName;
    hooks: OnecardHostHooks<State, Action>;
    restore?: Record<number, PartySnapshot>;
    clock?: Clock;
    cards?: readonly Card[];
  }) {
    super({
      ...options,
      id: 0,
      send: (m) => options.hooks.broadcast(m),
      onIncident: (i) => options.hooks.onIncident(i),
    });
    this.hooks = options.hooks;
    this.device.on("cards", () => this.hooks.refresh());
    this.deck.watch(() => this.hooks.refresh());
  }

  /** 처음 덱을 섞고 나눈다. 처음 카드가 특수 카드면 다시 펼 자리를 모두에게 연다. 엔진에 넣을 처음 패를 돌려준다 */
  async firstDeal(): Promise<OnecardPreset | null> {
    this.deck.beginRound(ROUND, this.spec.handSizes(this.rules));
    if (!(await this.until(() => this.deck.dealtHere(ROUND), null)))
      return null;
    for (let guard = 0; guard < 64; guard++) {
      const preset = this.deck.presetFor(ROUND);
      if (!preset) return null;
      try {
        this.spec.createMatch(this.rules, this.seed, preset);
        return preset;
      } catch {
        // 다시 펼 카드를 아직 모른다: 더미 맨 위를 모두에게 연다.
      }
      const drawn = this.deck.draw(ROUND, PUBLIC, 1)[0];
      if (!drawn) return null;
      this.hooks.broadcast({
        t: "fp",
        k: "deck",
        deal: drawn.deal,
        slot: drawn.slot,
        to: PUBLIC,
      });
      if (!(await this.until(() => this.isOpen(drawn.global), 15_000)))
        return null;
    }
    return null;
  }

  /** 상태 속 자리 표 가운데 모두에게 열린 것을 진짜 카드로 */
  private public(state: State): State {
    return swapTokens(state, this.deck.publicCards(ROUND)).value;
  }

  /** 다시 섞기를 기다리면 그 조각의 새 더미(자리 표)를 넣는다 */
  private withRefill(state: State): State {
    if (!this.spec.reshuffling(state)) return this.spec.withRefill(state, null);
    const segment = this.spec.reshufflesOf(state) + 1;
    return this.spec.withRefill(state, this.deck.refillFor(ROUND, segment));
  }

  step(input: State, seat: number, action: Action) {
    const state = this.withRefill(this.public(input));
    try {
      const result = this.spec.step(state, seat, action);
      if (!result.ok) return result;
      return {
        ...result,
        state: this.spec.withRefill(result.state, null),
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  after(state: State, events: readonly Event[]): void {
    this.history.push({ events: [...events] });
    if (!this.spec.gameOver(state)) return;
    this.over = true;
    // 끝내기(retire)로 끝난 게임은 열지 않는다(끊긴 사람 열쇠가 없다).
    const retired = (state as { retired?: boolean }).retired === true;
    if (!retired && !this.ended) {
      this.ended = true;
      this.hooks.broadcast({ t: "fp", k: "all", deal: ROUND });
      this.deck.revealAll(ROUND);
    }
    this.verify();
  }

  /** 엔진 상태가 게임 끝이다(기록에 끝나는 걸음이 들어갔다) */
  private over = false;

  protected opened(_round: number): void {
    this.verify();
  }

  /** 다 열렸고 게임이 끝났으면 참가자에게 기록을 보내고 방장 기기도 다시 계산해 본다 */
  private verify(): void {
    if (!this.over || !this.deals.has(ROUND)) return;
    this.hooks.broadcast({
      t: "fp",
      k: "log",
      deal: ROUND,
      log: [...this.hooks.log()] as never,
    });
    if (this.checked) return;
    this.checked = true;
    const checked = checkOnecardTable(
      this.spec,
      this.rules,
      this.seed,
      this.hooks.log(),
      this.deals,
      {
        of: (r) => this.deck.requestsOf(r),
        deviceOf: (seat) => this.deviceOf(seat),
      },
      (events) => flipCount(events),
    );
    if (!checked.ok)
      this.deck.incident({ seat: checked.seat, reason: checked.reason });
  }

  snapshot(): {
    history: { events: Event[] }[];
    device: Record<number, PartySnapshot>;
    deck: OnecardDeckSnapshot;
    ended: boolean;
  } {
    return {
      history: this.history.map((h) => ({ events: h.events })),
      device: this.device.snapshotAll(),
      deck: this.deck.snapshot(),
      ended: this.ended,
    };
  }

  /** 새로고침한 방장: 덱 조각과 연 더미 자리를 되살린다(같은 열쇠) */
  resume(
    saved: ReturnType<
      OnecardHostTable<Rules, State, View, Action, Event>["snapshot"]
    >,
  ): void {
    this.history.push(...saved.history);
    this.deck.resume(saved.deck);
    if (saved.ended) this.ended = true;
    if (this.spec.gameOver(this.hooks.state())) {
      this.over = true;
      this.verify();
    }
  }

  /** 방장 기기 자리(방장·컴퓨터) 화면을 내 카드로 바꾼다. 아직 못 연 카드가 있으면 null */
  viewFor(seat: number, view: View): View | null {
    if (this.deviceOf(seat) !== 0) return view;
    return this.reveal(view);
  }

  pendingSeats(state: State): number[] {
    return this.spec.pendingSeats(state);
  }

  async prepare(
    _input: State,
    seat: number,
    action: Action,
  ): Promise<Prepared<Action>> {
    if (this.halted) return { ok: false, error: "판을 멈췄다" };
    const state = this.hooks.state();
    let out = action;
    // 다시 섞기: 버린 더미(맨 위 빼고, 모두 열린 카드)를 알리고 새 섞기 사슬을 시작한다.
    if (this.spec.isReshuffle(action)) {
      if (!this.spec.reshuffling(state))
        return { ok: false, error: "다시 섞을 때가 아니다" };
      const segment = this.spec.reshufflesOf(state) + 1;
      if (this.deck.reshuffles(ROUND) < segment) {
        const cards = [...this.spec.reshufflePool(this.public(state))];
        if (cards.some((c) => slotOfToken(c) !== null))
          return { ok: false, error: "다시 섞을 카드가 아직 열리지 않았다" };
        const message = onecardReshuffleMessage(
          ROUND,
          segment,
          cards as Card[],
        );
        this.hooks.broadcast(message);
        this.deck.reshuffle(ROUND, segment, cards as Card[], { trusted: true });
      }
      out = {
        ...(action as object),
        order: this.deck.refillFor(ROUND, segment) ?? [],
      } as Action;
    }
    const hand = this.spec.viewOf(state, seat).hand;
    const reveals = this.spec.revealsOf(action);
    if (reveals.length > 0) {
      let slots: number[];
      if (this.deviceOf(seat) === 0) {
        slots = [];
        for (const card of reveals) {
          if (hand.includes(card)) continue;
          const slot = this.slotOf(hand, card);
          if (slot === null) return { ok: false, error: "손에 없는 카드다" };
          slots.push(slot);
        }
        if (slots.length > 0) {
          this.revealSlots(slots);
          out = { ...(out as object), fairSlots: slots } as Action;
        }
      } else {
        const claimed = (action as { fairSlots?: unknown }).fairSlots;
        slots = Array.isArray(claimed)
          ? claimed.filter((s): s is number => Number.isInteger(s))
          : [];
        if (slots.some((s) => !hand.includes(`?_${s}`))) {
          this.deck.incident({
            seat,
            reason: "자기 손에 없는 자리의 카드를 내려 했다",
          });
          return { ok: false, error: "자기 손에 없는 자리의 카드다" };
        }
      }
      if (slots.length > 0) {
        if (
          !(await this.until(() => slots.every((s) => this.isOpen(s)), 15_000))
        )
          return { ok: false, error: "카드 열쇠가 오지 않았다" };
        const known = this.deck.knownCards(ROUND);
        const opened = new Set([...slots.map((s) => known.get(s)), ...hand]);
        if (reveals.some((c) => !opened.has(c))) {
          const reason = "낸다고 한 카드와 열쇠로 연 카드가 다르다";
          this.deck.incident({ seat, reason });
          return { ok: false, error: reason };
        }
      }
    }
    // 엔진을 한 걸음 미리 돌려 보고 더미를 누구에게 몇 장 여는지, 게임이 끝나는지 본다.
    const before = this.deck.requestsOf(ROUND).length;
    for (let guard = 0; guard < 8; guard++) {
      if (this.halted) return { ok: false, error: "판을 멈췄다" };
      const dry = this.step(this.hooks.state(), seat, out);
      if (!dry.ok) return dry;
      const uses = this.spec.drawsOf(dry.events);
      const asked = this.deck.requestsOf(ROUND).length - before;
      for (const use of uses.slice(asked)) {
        const to = use === null ? PUBLIC : this.deviceOf(use);
        const drawn = this.deck.draw(ROUND, to, 1)[0];
        if (!drawn) return { ok: false, error: "더미 자리가 엔진과 맞지 않다" };
        this.hooks.broadcast({
          t: "fp",
          k: "deck",
          deal: drawn.deal,
          slot: drawn.slot,
          to,
        });
      }
      const over =
        this.spec.gameOver(dry.state) &&
        (dry.state as { retired?: boolean }).retired !== true;
      if (over && !this.ended) {
        // 게임이 끝나는 걸음 전에 모든 열쇠를 공개한다(끝 화면에 모든 손패가 보인다).
        this.ended = true;
        this.hooks.broadcast({ t: "fp", k: "all", deal: ROUND });
        this.deck.revealAll(ROUND);
        if (!(await this.until(() => this.deals.has(ROUND), 15_000)))
          return { ok: false, error: "판 끝 열쇠가 오지 않았다" };
        continue;
      }
      break;
    }
    return { ok: true, action: out };
  }

  receive(message: FairWire | FairControl, from: number): void {
    switch (message.k) {
      case "chain":
      case "keys":
      case "sproof":
      case "cproof":
      case "handover":
        this.device.receive(message, from);
        break;
    }
  }
}

/** 엔진이 처음 카드를 다시 편 횟수(`flipAgain` 사건) */
export function flipCount(events: readonly unknown[]): number {
  return events.filter((e) => (e as { type?: string }).type === "flipAgain")
    .length;
}

/** 참가자 기기 쪽 원카드 멘탈 포커 진행 */
export class OnecardGuestSeat<
  Rules,
  State,
  View extends OnecardViewLike,
  Action,
  Event,
> extends OnecardSide<Rules, State, View, Action, Event> {
  readonly seat: number;
  private readonly queue: { view: View; events: Event[] }[] = [];
  private last: View | null = null;
  private lastReal: View | null = null;
  private readonly logs = new Map<number, OnecardLogged<Action>[]>();
  private readonly verified = new Set<number>();
  private started = false;
  /** 받은 차례대로, 앞서 온 열쇠를 다 처리한 뒤에 보는 방장 알림(더미 열기·다시 섞기) */
  private control: Promise<void> = Promise.resolve();

  constructor(
    private readonly options: {
      spec: OnecardTableSpec<Rules, State, View, Action, Event>;
      rules: Rules;
      seed: number;
      seat: number;
      guestSeats: readonly number[];
      group: GroupName;
      broadcast: (message: FairWire | FairControl) => void;
      onIncident: (incident: Incident) => void;
      onSnapshot: (view: View, events: Event[]) => void;
      onVerify: (round: number, log: OnecardLogged<Action>[]) => void;
      restore?: Record<number, PartySnapshot>;
      clock?: Clock;
      cards?: readonly Card[];
    },
  ) {
    super({
      ...options,
      id: options.seat,
      send: (m) => options.broadcast(m),
    });
    this.seat = options.seat;
    this.deck.watch(() => this.flush());
    this.device.on("cards", () => this.flush());
  }

  get waiting(): boolean {
    return this.queue.length > 0;
  }

  /** 이 판의 카드가 모두 열릴 때까지 기다린다. `ms`가 지나면 false */
  whenOpened(round: number, ms = 30_000): Promise<boolean> {
    if (this.deals.has(round)) return Promise.resolve(true);
    return this.until(() => this.deals.has(round), ms);
  }

  /** 게임이 시작했다(시드가 공개됐다): 처음 덱을 함께 섞는다 */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.deck.beginRound(ROUND, this.spec.handSizes(this.options.rules));
  }

  /** 다시 들어온 기기: 원카드는 한 판이라 판 진행을 되살릴 것이 없다(덱 조각은 다시 받은 알림으로 되살린다) */
  history(_items: readonly { events: Event[] }[]): void {
    this.start();
  }

  snapshot(view: View, events: Event[], resync = false): void {
    this.last = view;
    this.queue.push({ view, events: resync ? [] : events });
    this.flush();
  }

  private flush(): void {
    while (this.queue.length > 0) {
      const next = this.queue[0] as { view: View; events: Event[] };
      const real = this.reveal(next.view);
      if (!real) return;
      this.queue.shift();
      this.lastReal = real;
      this.options.onSnapshot(real, next.events);
    }
  }

  /** 보내기 전에: 낼 카드의 열쇠를 공개하고 그 판 자리를 행동에 싣는다 */
  outgoing(action: Action): Action | null {
    if (this.waiting || !this.last || !this.lastReal) return null;
    const reveals = this.spec.revealsOf(action);
    if (reveals.length === 0) return action;
    const slots: number[] = [];
    for (const card of reveals) {
      const slot = this.slotOf(this.last.hand, card);
      if (slot === null) return null;
      slots.push(slot);
    }
    this.revealSlots(slots);
    return { ...(action as object), fairSlots: slots } as Action;
  }

  receive(message: FairWire | FairControl, from: number): void {
    if (this.halted && message.k === "log") return;
    switch (message.k) {
      case "chain":
      case "keys":
      case "sproof":
      case "cproof":
      case "handover":
        this.device.receive(message, from);
        break;
      case "deck":
        if (from === 0) {
          const { deal, slot, to } = message;
          this.later(() => {
            if (to === PUBLIC && !this.mayFlip(deal, slot)) {
              this.deck.incident({
                seat: 0,
                reason:
                  "방장이 처음 카드가 특수 카드가 아닌데 더미를 모두에게 열라고 했다(미리 보기)",
              });
              return;
            }
            this.deck.request(deal, slot, to);
          });
        }
        break;
      case "reshuffle":
        if (from === 0) {
          if (!isOnecardReshuffle(message)) {
            this.deck.incident({
              seat: 0,
              reason: "방장의 다시 섞기 알림 모양이 맞지 않다",
            });
            break;
          }
          const { round, segment, cards } = message;
          this.later(() => {
            this.deck.reshuffle(round, segment, cards);
          });
        }
        break;
      case "all":
        if (from === 0) this.later(() => this.deck.revealAll(ROUND));
        break;
      case "log":
        if (from === 0) {
          this.logs.set(ROUND, message.log as never);
          this.later(() => this.tryVerify(ROUND));
        }
        break;
    }
  }

  /** 앞서 온 열쇠를 다 처리한 뒤 받은 차례대로 */
  private later(fn: () => void): void {
    this.control = this.control
      .then(() => this.device.settled())
      .then(() => {
        if (!this.halted) fn();
      });
  }

  /**
   * 모두에게 여는 더미 자리(처음 카드 다시 펴기)를 받아도 되나: 판이 시작되기 전이고, 그 앞에 마지막으로
   * 모두에게 열린 카드(처음 펼친 카드 또는 앞서 다시 편 카드)가 특수 카드여야 한다
   */
  private mayFlip(deal: number, slot: number): boolean {
    if (deal !== onecardDealId(ROUND, 0)) return false;
    const ctx = this.deck.rounds.get(ROUND);
    if (!ctx) return false;
    // 이미 받은 요청(다시 연결해 다시 받은 것)은 그대로 둔다.
    if (ctx.requests.some((r) => r.deal === deal && r.slot === slot))
      return true;
    if (ctx.requests.some((r) => r.to !== PUBLIC)) return false;
    const prev = ctx.requests.at(-1);
    const prevSlot = prev ? prev.slot : ctx.layout.open[0];
    if (prevSlot === undefined) return false;
    const card = this.device.open(deal, prevSlot);
    return card !== null && isSpecial(card);
  }

  protected opened(round: number): void {
    this.tryVerify(round);
  }

  private tryVerify(round: number): void {
    const log = this.logs.get(round);
    if (!log || !this.deals.has(round) || this.verified.has(round)) return;
    this.verified.add(round);
    this.options.onVerify(round, log);
  }
}

/** 원카드 특수 카드(공격·7·J·Q·K·조커): 처음 펼친 카드가 이것이면 다시 편다 */
function isSpecial(card: string): boolean {
  if (card === "JK" || card === "JC") return true;
  const rank = card.slice(1);
  return ["2", "A", "7", "J", "Q", "K"].includes(rank);
}
