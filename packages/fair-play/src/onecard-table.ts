import type { Card } from "@game/mighty-engine";

import { tokenOf } from "./blind";
import { type Clock, realClock } from "./clock";
import { type Incident, reportShuffleTamper } from "./coordinator";
import type { FairDevice } from "./device";
import type { FairControl } from "./messages";
import { CARD_CODES, COLOR_JOKER, DECK } from "./protocol";

/*
 * 원카드 멘탈 포커(docs/42 4-2). 마이티·하트·화투와 같은 섞기·열쇠(device.ts)에 54장 덱을 얹고,
 * 판 도중 더미가 바닥나면 버린 더미(이미 모두가 본 카드)를 새 섞기 사슬로 다시 섞어 새 더미로 쓴다.
 *
 * - 한 판은 덱 조각 여러 개로 이뤄진다. 조각 0은 처음 덱(54장: 손패 → 처음 펼칠 카드 → 더미),
 *   조각 k(≥1)는 k번째로 다시 섞은 더미다. 조각마다 기기 판 번호(`onecardDealId(판, 조각)`)가 따로 있고
 *   섞기 사슬·열쇠·섞기 증명은 그 판 번호로 기존 그대로 돈다(`FairDevice.start`). 그래서 다시 섞은 사슬에도
 *   섞기 증명이 붙고, 증명은 뒤에서 오가 게임을 멈추지 않는다.
 * - 다시 섞을 카드 목록은 공개 정보다. 방장이 알리고(`reshuffle`), 모두가 그 카드가 이미 모두에게 열린
 *   카드인지 본다. 순서는 카드 번호표 순서로 맞춰(`reshuffleOrder`) 기기마다 같은 덱에서 사슬을 시작한다.
 *   기기마다 첫 입력을 스스로 계산하므로, 방장이 알린 목록과 다른 카드로 사슬을 시작하면 섞기 증명이 짚는다.
 * - 자리 번호는 판 전체로 잇는다: 조각 k의 장부 자리 s는 판 자리 `base_k + s`다(`base_0 = 0`, 다음 조각은
 *   앞 조각 크기만큼 뒤). 엔진에는 판 자리로 만든 자리 표(`?_N`)를 넣으니 `swapTokens`를 그대로 쓴다.
 * - 뽑기는 더미 순서대로만 한다. 앞 조각 더미를 다 뽑은 뒤에만 다음 조각에서 뽑는다(엔진이 더미가 바닥났을
 *   때만 다시 섞는다). 그래서 뽑은 순서가 그대로 엔진이 쓴 순서이고, 판 끝에 진짜 카드로 다시 돌려 맞춰 본다
 *   (`checkOnecardReplay`).
 * - 다시 섞는 동안 기다리는 사람은 뽑을 사람뿐이다. 방장은 다시 섞기를 알린 뒤 바로 뽑기를 알릴 수 있고
 *   (자리 번호는 미리 정해져 있다), 사슬이 끝나면 그 사람 카드가 열린다.
 */

/** 원카드 덱 54장: 마이티 53장(흑백 조커 `"JK"` 포함) + 컬러 조커 `"JC"` */
export const ONECARD_CARDS: readonly Card[] = [...DECK, COLOR_JOKER];

/** 한 판에 쓸 수 있는 덱 조각 수(처음 덱 + 다시 섞기). 기기 판 번호가 겹치지 않게 하는 한도다 */
export const ONECARD_MAX_SEGMENTS = 1024;

/**
 * 다시 섞기 알림의 카드가 "이미 모두에게 열린 카드"가 될 때까지 기다리는 시간(ms). 카드를 낸 사람의 열쇠는
 * 방장을 거치지 않고 직접 오므로 다시 섞기 알림보다 늦게 닿을 수 있다. 이 시간 안에 열리지 않으면 방장을 짚는다
 */
export const ONECARD_SHOWN_WAIT_MS = 10_000;

/** 모두에게 여는 자리(처음 펼칠 카드·모두에게 펼치는 뽑기)의 주인 */
const PUBLIC = -1;

/** 다시 섞기 알림(방장 → 모두) */
export type OnecardReshuffleMessage = Extract<FairControl, { k: "reshuffle" }>;

/** 다시 섞기 알림을 만든다(`deal`은 판·조각에서 계산한다) */
export function onecardReshuffleMessage(
  round: number,
  segment: number,
  cards: readonly Card[],
): OnecardReshuffleMessage {
  return {
    t: "fp",
    k: "reshuffle",
    deal: onecardDealId(round, segment),
    round,
    segment,
    cards: [...cards],
  };
}

/** 받은 다시 섞기 알림의 모양과 `deal = onecardDealId(round, segment)`가 맞는가 */
export function isOnecardReshuffle(
  value: unknown,
): value is OnecardReshuffleMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (m.t !== "fp" || m.k !== "reshuffle") return false;
  const { round, segment, deal, cards } = m;
  if (!Number.isInteger(round) || (round as number) < 0) return false;
  if (
    !Number.isInteger(segment) ||
    (segment as number) < 1 ||
    (segment as number) >= ONECARD_MAX_SEGMENTS
  )
    return false;
  if (deal !== onecardDealId(round as number, segment as number)) return false;
  return (
    Array.isArray(cards) &&
    cards.length <= ONECARD_CARDS.length &&
    cards.every((c) => typeof c === "string")
  );
}

/** 판 번호와 덱 조각 번호(0 = 처음 덱, k = k번째 다시 섞기)로 기기 판 번호(섞기 사슬 하나) */
export function onecardDealId(round: number, segment: number): number {
  if (
    !Number.isInteger(segment) ||
    segment < 0 ||
    segment >= ONECARD_MAX_SEGMENTS
  )
    throw new Error(`덱 조각 번호가 범위를 벗어났다: ${segment}`);
  return round * ONECARD_MAX_SEGMENTS + segment;
}

/** 처음 덱 자리: 자리 번호 순서로 손패, 그다음 처음 펼칠 카드, 남은 것은 더미(앞이 맨 위) */
export interface OnecardLayout {
  hands: number[][];
  open: number[];
  deck: number[];
}

export function onecardLayout(
  handSizes: readonly number[],
  open = 1,
  size = ONECARD_CARDS.length,
): OnecardLayout {
  let next = 0;
  const take = (n: number) => Array.from({ length: n }, () => next++);
  const hands = handSizes.map(take);
  const openSlots = take(open);
  if (next > size) throw new Error("손패와 펼칠 카드가 덱보다 많다");
  return { hands, open: openSlots, deck: take(size - next) };
}

/** 다시 섞을 카드를 카드 번호표 순서로(기기마다 같은 덱에서 사슬을 시작한다) */
export function reshuffleOrder(cards: readonly Card[]): Card[] {
  const index = new Map<Card, number>();
  for (const c of cards) {
    const i = CARD_CODES.indexOf(c);
    if (i < 0) throw new Error(`번호표에 없는 카드: ${c}`);
    index.set(c, i);
  }
  return [...cards].sort(
    (a, b) => (index.get(a) as number) - (index.get(b) as number),
  );
}

/** 두 카드 묶음이 순서를 빼고 같은가 */
export function sameCards(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((c, i) => c === y[i]);
}

/** 방장이 연 더미 자리. `deal`·`slot`은 그 조각의 기기 판 번호와 장부 자리, `global`은 판 자리 */
export interface OnecardDraw {
  deal: number;
  slot: number;
  global: number;
  /** 받는 기기(−1이면 모두) */
  to: number;
}

/** 엔진에 넣는 판 패(진짜 카드 또는 자리 표) */
export interface OnecardPreset {
  /** 자리 번호 순서 손패 */
  hands: string[][];
  /** 처음 펼친 카드(버린 더미의 시작) */
  open: string[];
  /** 처음 더미(앞이 맨 위) */
  deck: string[];
}

/** 판 하나의 진짜 패(판 끝에 모두 연 뒤) */
export interface OnecardRoundDeal {
  preset: OnecardPreset;
  /** k번째 다시 섞은 더미(앞이 맨 위). `refills[0]`이 조각 1 */
  refills: Card[][];
  /** k번째 다시 섞기에 알린 카드(번호표 순서). `declared[0]`이 조각 1 */
  declared: Card[][];
  /** 판 자리 → 카드 */
  cards: ReadonlyMap<number, Card>;
}

interface SegmentCtx {
  segment: number;
  dealId: number;
  /** 이 조각의 장부 자리 0이 판 자리로 몇인가 */
  base: number;
  /** 이 조각에 넣은 카드(조각 0은 덱 전체, 그 밖은 알린 카드) */
  cards: Card[];
  /** 더미로 쓰는 장부 자리(앞이 맨 위) */
  pile: number[];
  /** 다음에 뽑을 `pile` 위치 */
  next: number;
}

interface RoundCtx {
  round: number;
  handSizes: number[];
  open: number;
  layout: OnecardLayout;
  segments: SegmentCtx[];
  requests: OnecardDraw[];
  allRevealed: boolean;
  opened: OnecardRoundDeal | null;
}

/** 새로고침에 대비해 남길 것(열쇠는 `FairDevice.snapshotAll`이 따로 남긴다) */
export interface OnecardDeckSnapshot {
  rounds: {
    round: number;
    hands: number[];
    open: number;
    /** k번째 다시 섞기에 알린 카드 */
    reshuffles: Card[][];
    requests: { deal: number; slot: number; to: number }[];
    all: boolean;
  }[];
}

/**
 * 방장·참가자가 똑같이 돌리는 원카드 덱 진행: 판마다 섞고 나누기, 처음 카드 펼치기, 더미 뽑기,
 * 판 도중 다시 섞기, 판 끝 열기와 조각별 확인. 엔진과 메시지 통로는 부르는 쪽(온라인 방)이 맡는다.
 *
 * 방장: `beginRound` → (엔진 걸음마다) `draw`로 연 자리를 `{k:"deck", deal, slot, to}`로 알리고,
 * 더미가 모자라면 먼저 `reshuffle`(알릴 것: 판, 조각, 카드) → 판 끝 `revealAll`.
 * 참가자: 같은 `beginRound`, 받은 알림대로 `reshuffle`·`request`·`revealAll`.
 */
export class OnecardDeck {
  readonly device: FairDevice;
  readonly devices: readonly number[];
  readonly cards: readonly Card[];
  private readonly deviceOf: (seat: number) => number;
  private readonly onIncident: (incident: Incident) => void;
  halted = false;
  private pendingIncident = false;
  readonly rounds = new Map<number, RoundCtx>();
  private readonly byDeal = new Map<
    number,
    { round: RoundCtx; segment: SegmentCtx }
  >();
  /** 그 조각을 시작하기 전에 온 뽑기(다시 들어온 기기가 기록을 다시 받을 때) */
  private early: { deal: number; slot: number; to: number }[] = [];
  private readonly clock: Clock;
  /** 다시 섞기 알림의 카드가 모두에게 열리기를 기다리는 것(열쇠가 알림보다 늦게 오는 망) */
  private readonly shownWaits = new Set<{
    ctx: RoundCtx;
    segment: number;
    cards: readonly Card[];
    cancel: () => void;
  }>();

  constructor(options: {
    device: FairDevice;
    /** 섞는 차례(방장 0이 먼저, 참가자 기기 번호 순) */
    devices: readonly number[];
    deviceOf: (seat: number) => number;
    onIncident: (incident: Incident) => void;
    /** 덱(기본 54장). 시험은 작은 덱을 넣는다 */
    cards?: readonly Card[];
    /** 다시 섞은 카드가 열리기를 기다리는 시간을 잰다. 시험은 ManualClock */
    clock?: Clock;
  }) {
    this.clock = options.clock ?? realClock;
    this.device = options.device;
    this.devices = options.devices;
    this.deviceOf = options.deviceOf;
    this.onIncident = options.onIncident;
    this.cards = options.cards ?? ONECARD_CARDS;
    this.device.on("cards", () => this.check());
    this.device.on("slots", () => this.check());
    this.device.on("keys", () => this.check());
    this.device.on("problem", (_deal, reason, device, pending) =>
      this.incident({
        seat: device,
        reason,
        ...(pending ? { pending: true as const } : {}),
      }),
    );
  }

  /** 판을 멈추고 알린다. 누군지 확인하는 중인 알림(`pending`)은 뒤따르는 알림으로 바꾼다 */
  incident(incident: Incident): void {
    if (this.halted && !this.pendingIncident) return;
    this.halted = true;
    this.pendingIncident = incident.pending === true;
    this.onIncident(incident);
  }

  /** 판을 섞고 나눈다(이미 시작했으면 그대로). 손패는 받는 기기만, 처음 펼칠 카드는 모두가 연다 */
  beginRound(round: number, handSizes: readonly number[], open = 1): void {
    if (this.rounds.has(round)) return;
    const layout = onecardLayout(handSizes, open, this.cards.length);
    const ctx: RoundCtx = {
      round,
      handSizes: [...handSizes],
      open,
      layout,
      segments: [],
      requests: [],
      allRevealed: false,
      opened: null,
    };
    this.rounds.set(round, ctx);
    const owners = new Map<number, number>();
    layout.hands.forEach((slots, seat) => {
      for (const slot of slots) owners.set(slot, this.deviceOf(seat));
    });
    for (const slot of layout.open) owners.set(slot, PUBLIC);
    this.startSegment(ctx, [...this.cards], layout.deck, owners);
  }

  private startSegment(
    ctx: RoundCtx,
    cards: Card[],
    pile: number[],
    owners: ReadonlyMap<number, number>,
  ): SegmentCtx {
    const segment = ctx.segments.length;
    const last = ctx.segments.at(-1);
    const seg: SegmentCtx = {
      segment,
      dealId: onecardDealId(ctx.round, segment),
      base: last ? last.base + last.cards.length : 0,
      cards,
      pile,
      next: 0,
    };
    ctx.segments.push(seg);
    this.byDeal.set(seg.dealId, { round: ctx, segment: seg });
    this.device.start(seg.dealId, this.devices, cards);
    if (owners.size > 0) this.device.assign(seg.dealId, owners);
    const early = this.early.filter((e) => e.deal === seg.dealId);
    this.early = this.early.filter((e) => e.deal !== seg.dealId);
    for (const e of early) this.request(e.deal, e.slot, e.to);
    this.notify();
    return seg;
  }

  /**
   * 버린 더미를 다시 섞어 덱 조각 `segment`(1, 2, …)를 연다. `cards`는 공개 정보(버린 더미에서 맨 위를 뺀
   * 카드)라 방장이 알리고 모두가 같은 목록으로 부른다. 조각 번호는 차례대로여야 한다.
   * 알린 카드가 아직 모두에게 열리지 않은 카드면(남의 손패·더미) 방장을 짚는다. 이미 받은 열쇠를 다 처리한 뒤에 본다.
   * 돌려주는 값은 새 조각의 기기 판 번호
   */
  reshuffle(
    round: number,
    segment: number,
    cards: readonly Card[],
    options: { trusted?: boolean } = {},
  ): number {
    const ctx = this.rounds.get(round);
    if (!ctx) throw new Error(`시작하지 않은 판 ${round}을 다시 섞으려 했다`);
    const ordered = reshuffleOrder(cards);
    const existing = ctx.segments[segment];
    if (existing && segment > 0) {
      // 같은 알림을 다시 받았다(다시 들어온 기기).
      if (existing.cards.join() !== ordered.join())
        this.incident({
          seat: 0,
          reason: "방장이 같은 다시 섞기를 다른 카드로 알렸다",
        });
      return existing.dealId;
    }
    if (segment !== ctx.segments.length || segment === 0) {
      this.incident({ seat: 0, reason: "방장이 다시 섞기 순서를 틀렸다" });
      return onecardDealId(round, Math.max(0, segment));
    }
    const prev = ctx.segments.at(-1) as SegmentCtx;
    const bad =
      ordered.length === 0
        ? "방장이 빈 카드 목록을 다시 섞으려 했다"
        : new Set(ordered).size !== ordered.length
          ? "방장이 같은 카드를 두 번 다시 섞으려 했다"
          : ordered.some((c) => !this.cards.includes(c))
            ? "방장이 덱에 없는 카드를 다시 섞으려 했다"
            : prev.next < prev.pile.length
              ? "방장이 더미가 남았는데 다시 섞으려 했다"
              : null;
    if (bad) {
      this.incident({ seat: 0, reason: bad });
      return onecardDealId(round, segment);
    }
    const seg = this.startSegment(
      ctx,
      ordered,
      ordered.map((_, i) => i),
      new Map(),
    );
    // 알린 카드가 정말 이미 모두에게 열린 카드인지는 앞서 온 열쇠를 다 처리한 뒤에 본다
    // (카드를 낸 열쇠와 다시 섞기 알림이 거의 함께 온다). 카드를 낸 사람의 열쇠는 방장을 거치지 않고 직접 와서
    // 알림보다 늦을 수 있으니, 아직 안 열렸으면 열쇠가 닿을 때까지(`ONECARD_SHOWN_WAIT_MS`) 기다린 뒤 짚는다.
    if (options.trusted) return seg.dealId;
    void this.device.settled().then(() => {
      if (this.halted || this.allShown(ctx, seg.segment, ordered)) return;
      const wait = {
        ctx,
        segment: seg.segment,
        cards: ordered,
        cancel: () => {},
      };
      wait.cancel = this.clock.after(ONECARD_SHOWN_WAIT_MS, () => {
        this.shownWaits.delete(wait);
        if (this.halted || this.allShown(ctx, seg.segment, ordered)) return;
        this.incident({
          seat: 0,
          reason: "방장이 아직 모두에게 열리지 않은 카드를 다시 섞으려 했다",
        });
      });
      this.shownWaits.add(wait);
    });
    return seg.dealId;
  }

  private allShown(
    ctx: RoundCtx,
    segment: number,
    cards: readonly Card[],
  ): boolean {
    return cards.every((c) => this.wasShown(ctx, segment, c));
  }

  /**
   * 조각 `segment`에 넣을 카드 `card`가 이미 모두에게 열렸나: 그 카드가 마지막으로 들어간 앞 조각에서
   * 그 카드가 모두에게 열린 자리가 있어야 한다(같은 카드를 두 조각에 동시에 둘 수 없다)
   */
  private wasShown(ctx: RoundCtx, segment: number, card: Card): boolean {
    for (let j = segment - 1; j >= 0; j--) {
      const seg = ctx.segments[j] as SegmentCtx;
      if (!seg.cards.includes(card)) continue;
      for (let slot = 0; slot < seg.cards.length; slot++)
        if (this.device.open(seg.dealId, slot) === card) return true;
      return false;
    }
    return false;
  }

  /**
   * 방장: 더미에서 `n`장을 `to` 기기에게(−1이면 모두에게) 연다. 알릴 뽑기들을 돌려준다.
   * 지금 조각 더미가 모자라면 있는 만큼만 돌려주니, 모자란 만큼은 `reshuffle` 뒤에 다시 부른다
   */
  draw(round: number, to: number, n: number): OnecardDraw[] {
    const ctx = this.rounds.get(round);
    if (!ctx) return [];
    const out: OnecardDraw[] = [];
    for (let i = 0; i < n; i++) {
      const seg = ctx.segments.at(-1);
      if (!seg || seg.next >= seg.pile.length) break;
      const slot = seg.pile[seg.next] as number;
      if (!this.request(seg.dealId, slot, to)) break;
      out.push({ deal: seg.dealId, slot, global: seg.base + slot, to });
    }
    return out;
  }

  /**
   * 방장이 더미 자리를 열라고 했다(참가자는 받은 알림마다 부른다). 더미는 순서대로만 연다. 맞았는지는 판 끝에
   * 진짜 카드로 다시 돌려 본다(`checkOnecardReplay`). 받아들였으면 true
   */
  request(deal: number, slot: number, to: number): boolean {
    const found = this.byDeal.get(deal);
    if (!found) {
      this.early.push({ deal, slot, to });
      return false;
    }
    const { round: ctx, segment: seg } = found;
    const before = ctx.requests.find((r) => r.deal === deal && r.slot === slot);
    if (before) {
      if (before.to !== to)
        this.incident({
          seat: 0,
          reason: "방장이 같은 더미 카드를 두 사람에게 열라고 했다",
        });
      return before.to === to;
    }
    const exhausted = ctx.segments
      .slice(0, seg.segment)
      .every((s) => s.next >= s.pile.length);
    if (
      !exhausted ||
      slot !== seg.pile[seg.next] ||
      (to !== PUBLIC && !this.devices.includes(to))
    ) {
      this.incident({
        seat: 0,
        reason: "방장이 더미를 순서와 다르게 열라고 했다",
      });
      return false;
    }
    seg.next += 1;
    ctx.requests.push({ deal, slot, global: seg.base + slot, to });
    this.device.assign(deal, new Map([[slot, to]]));
    this.notify();
    return true;
  }

  /** 이 판에서 방장이 연 더미 자리(판 자리 순서 = 엔진이 뽑은 순서) */
  requestsOf(round: number): readonly OnecardDraw[] {
    return this.rounds.get(round)?.requests ?? [];
  }

  /** 지금 조각 더미에 남은 장수 */
  remaining(round: number): number {
    const seg = this.rounds.get(round)?.segments.at(-1);
    return seg ? seg.pile.length - seg.next : 0;
  }

  /** 이 판에서 다시 섞은 횟수(덱 조각 수 − 1) */
  reshuffles(round: number): number {
    return Math.max(0, (this.rounds.get(round)?.segments.length ?? 1) - 1);
  }

  /** 덱 조각의 기기 판 번호들(조각 순서) */
  dealsOf(round: number): number[] {
    return this.rounds.get(round)?.segments.map((s) => s.dealId) ?? [];
  }

  /** 조각의 섞기 사슬이 끝나 자리가 장부에 올라왔다 */
  segmentReady(round: number, segment: number): boolean {
    const seg = this.rounds.get(round)?.segments[segment];
    if (!seg) return false;
    return (
      (this.device.ledger(seg.dealId)?.deck.length ?? 0) >= seg.cards.length
    );
  }

  /** 마지막으로 다시 섞은 조각의 섞기 사슬이 아직이다(화면의 "다시 섞는 중") */
  reshuffling(round: number): boolean {
    const n = this.rounds.get(round)?.segments.length ?? 0;
    return n > 1 && !this.segmentReady(round, n - 1);
  }

  /** 내 손패를 다 열었고 처음 펼칠 카드가 모두에게 열렸다(그 판 엔진을 만들 수 있다) */
  dealtHere(round: number): boolean {
    const ctx = this.rounds.get(round);
    const seg = ctx?.segments[0];
    if (!ctx || !seg) return false;
    const mine = this.device.myCards(seg.dealId);
    const me = this.device.id;
    for (const [seat, slots] of ctx.layout.hands.entries())
      if (this.deviceOf(seat) === me && slots.some((s) => !mine.has(s)))
        return false;
    return ctx.layout.open.every(
      (s) => this.device.open(seg.dealId, s) !== null,
    );
  }

  /** 이 판에서 이 기기가 아는 카드(판 자리 → 카드): 내 카드와 모두에게 열린 카드 */
  knownCards(round: number): Map<number, Card> {
    return this.collect(round, true);
  }

  /** 모두에게 열린 카드(판 자리 → 카드, 내 카드 빼고) */
  publicCards(round: number): Map<number, Card> {
    return this.collect(round, false);
  }

  private collect(round: number, withMine: boolean): Map<number, Card> {
    const out = new Map<number, Card>();
    for (const seg of this.rounds.get(round)?.segments ?? []) {
      if (withMine)
        for (const [slot, card] of this.device.myCards(seg.dealId))
          out.set(seg.base + slot, card);
      const ledger = this.device.ledger(seg.dealId);
      if (!ledger) continue;
      for (let slot = 0; slot < ledger.deck.length; slot++) {
        if (out.has(seg.base + slot)) continue;
        const card = this.device.open(seg.dealId, slot);
        if (card !== null) out.set(seg.base + slot, card);
      }
    }
    return out;
  }

  /** 판 자리 → 그 조각의 기기 판 번호와 장부 자리(카드를 낼 때 열쇠를 공개할 곳) */
  locate(round: number, global: number): { deal: number; slot: number } | null {
    for (const seg of this.rounds.get(round)?.segments ?? [])
      if (global >= seg.base && global < seg.base + seg.cards.length)
        return { deal: seg.dealId, slot: global - seg.base };
    return null;
  }

  /** 엔진에 넣는 처음 패: 모두에게 열린 카드는 진짜 카드, 나머지는 판 자리 표 */
  presetFor(round: number): OnecardPreset | null {
    const ctx = this.rounds.get(round);
    if (!ctx) return null;
    const known = this.publicCards(round);
    const card = (slot: number) => (known.get(slot) ?? tokenOf(slot)) as string;
    return {
      hands: ctx.layout.hands.map((slots) => slots.map(card)),
      open: ctx.layout.open.map(card),
      deck: ctx.layout.deck.map(card),
    };
  }

  /** 엔진에 넣는 다시 섞은 더미(조각 `segment`, 앞이 맨 위): 판 자리 표 */
  refillFor(round: number, segment: number): string[] | null {
    const seg = this.rounds.get(round)?.segments[segment];
    if (!seg || segment === 0) return null;
    return seg.pile.map((s) => tokenOf(seg.base + s) as string);
  }

  /** 판 끝: 모든 조각에서 내 열쇠를 공개한다. 다 열리면 조각마다 카드가 맞는지 보고 `onOpened`를 부른다 */
  revealAll(round: number): void {
    const ctx = this.rounds.get(round);
    if (!ctx || ctx.allRevealed) return;
    ctx.allRevealed = true;
    for (const seg of ctx.segments) this.device.revealAll(seg.dealId);
    this.check();
  }

  /** 판 하나의 진짜 패(모두 열고 확인한 판) */
  roundDeal(round: number): OnecardRoundDeal | null {
    return this.rounds.get(round)?.opened ?? null;
  }

  private check(): void {
    // 늦게 온 열쇠로 다시 섞은 카드가 모두 열렸으면 기다림을 끝낸다.
    for (const wait of [...this.shownWaits])
      if (this.allShown(wait.ctx, wait.segment, wait.cards)) {
        wait.cancel();
        this.shownWaits.delete(wait);
      }
    for (const ctx of this.rounds.values()) this.checkRound(ctx);
    this.notify();
  }

  private checkRound(ctx: RoundCtx): void {
    if (this.halted || !ctx.allRevealed || ctx.opened) return;
    const opened: Map<number, Card>[] = [];
    for (const seg of ctx.segments) {
      const cards = this.device.openAll(seg.dealId);
      if (!cards) return;
      opened.push(cards);
    }
    const all = new Map<number, Card>();
    for (const [k, seg] of ctx.segments.entries()) {
      const cards = opened[k] as Map<number, Card>;
      const got = [...cards.values()];
      // 같은 카드가 두 번, 또는 알린 카드와 다른 카드가 들어 있으면 그 조각의 섞기 사슬을 조작했다.
      const what =
        new Set(got).size !== got.length
          ? "열어 보니 같은 카드가 두 번 있다"
          : !sameCards(got, seg.cards)
            ? "열어 보니 섞기로 한 카드와 다른 카드가 들어 있다"
            : null;
      if (what) {
        reportShuffleTamper(
          this.device,
          seg.dealId,
          k === 0 ? what : `${k}번째 다시 섞기: ${what}`,
          (i) => this.incident(i),
        );
        return;
      }
      for (const [slot, card] of cards) all.set(seg.base + slot, card);
    }
    const first = opened[0] as Map<number, Card>;
    const at = (slot: number) => first.get(slot) as Card;
    ctx.opened = {
      preset: {
        hands: ctx.layout.hands.map((slots) => slots.map(at)),
        open: ctx.layout.open.map(at),
        deck: ctx.layout.deck.map(at),
      },
      refills: ctx.segments
        .slice(1)
        .map((seg, k) =>
          seg.pile.map(
            (s) => (opened[k + 1] as Map<number, Card>).get(s) as Card,
          ),
        ),
      declared: ctx.segments.slice(1).map((seg) => [...seg.cards]),
      cards: all,
    };
    for (const l of this.openListeners) l(ctx.round);
  }

  private openListeners = new Set<(round: number) => void>();
  /** 판 하나가 모두 열리고 조각별 확인을 지났다 */
  onOpened(listener: (round: number) => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private waiters = new Set<() => void>();
  /** 상태가 바뀔 때마다 부를 함수(기다리는 쪽이 조건을 다시 본다) */
  watch(fn: () => void): () => void {
    this.waiters.add(fn);
    return () => this.waiters.delete(fn);
  }
  private notify(): void {
    for (const w of [...this.waiters]) w();
  }

  snapshot(): OnecardDeckSnapshot {
    return {
      rounds: [...this.rounds.values()].map((ctx) => ({
        round: ctx.round,
        hands: [...ctx.handSizes],
        open: ctx.open,
        reshuffles: ctx.segments.slice(1).map((s) => [...s.cards]),
        requests: ctx.requests.map(({ deal, slot, to }) => ({
          deal,
          slot,
          to,
        })),
        all: ctx.allRevealed,
      })),
    };
  }

  /** 새로고침한 기기: 판과 조각을 같은 차례로 다시 시작하고(같은 열쇠) 연 더미 자리를 되살린다 */
  resume(saved: OnecardDeckSnapshot): void {
    for (const r of saved.rounds) {
      this.beginRound(r.round, r.hands, r.open);
      const ctx = this.rounds.get(r.round) as RoundCtx;
      // 뽑기와 다시 섞기를 처음 했던 차례대로 되살린다(앞 조각 더미를 다 뽑은 뒤에 다시 섞었다).
      // 이 기기가 이미 확인했던 알림이라 "열린 카드인지"는 다시 보지 않는다(열쇠는 방장이 다시 보낸다).
      const reshuffleUpTo = (segment: number) => {
        while (ctx.segments.length <= segment) {
          const k = ctx.segments.length;
          const cards = r.reshuffles[k - 1];
          if (!cards) return;
          this.reshuffle(r.round, k, cards, { trusted: true });
        }
      };
      for (const q of r.requests) {
        reshuffleUpTo(q.deal - onecardDealId(r.round, 0));
        this.request(q.deal, q.slot, q.to);
      }
      reshuffleUpTo(r.reshuffles.length);
      if (r.all) this.revealAll(r.round);
    }
  }
}

export type OnecardStep<State, Event> =
  | { ok: true; state: State; events: Event[] }
  | { ok: false; error: string };

/**
 * 판 끝 검증에 필요한 원카드 엔진 모양. 엔진은 순수 함수이고, 멘탈 포커에서는 패와 다시 섞은 더미를 밖에서 받는다
 */
export interface OnecardFairSpec<Rules, State, Action, Event> {
  createMatch(
    rules: Rules,
    seed: number,
    preset: OnecardPreset,
  ): { state: State; events: Event[] };
  step(state: State, seat: number, action: Action): OnecardStep<State, Event>;
  roundOf(state: State): number;
  /** 다음 판 패를 넣는다(null이면 지운다). 판이 바뀌는 걸음에 쓴다 */
  withPreset(state: State, preset: OnecardPreset | null): State;
  /**
   * 더미가 바닥나 다시 섞을 때 쓸 새 더미(앞이 맨 위)를 넣는다(null이면 지운다). 엔진은 난수로 섞지 않고
   * 이 순서를 쓴다. 없는데 다시 섞어야 하면 던진다(아직 모르는 더미)
   */
  withRefill(state: State, deck: readonly string[] | null): State;
  /** 이 판에서 다시 섞은 횟수 */
  reshufflesOf(state: State): number;
  /** 지금 다시 섞으면 새 더미가 될 카드(버린 더미에서 맨 위를 뺀 것) */
  reshufflePool(state: State): readonly string[];
  /**
   * 이 걸음에 더미에서 뽑은 카드마다 받은 자리(null이면 모두에게 펼침), 뽑은 순서. 판이 바뀌는 걸음(먹다가
   * 파산해 판이 끝남 등)이면 바뀌기 전 판의 더미에서 뽑은 것만 넣는다(다음 판 패는 `withPreset`으로 넣으므로 뽑기가 아니다)
   */
  drawsOf(events: readonly Event[]): (number | null)[];
}

export interface OnecardLogged<Action = unknown> {
  seat: number;
  action: Action;
  bot?: true;
}

export type OnecardReplayCheck<State> =
  | { ok: true; state: State; states: State[]; upTo: number }
  | { ok: false; index: number; seat: number; reason: string };

/**
 * 판마다의 진짜 패(처음 덱 + 다시 섞은 더미들)로 기록을 처음부터 다시 돌린다. 아직 패를 모르는 판에
 * 들어서면 거기서 멈춘다. 걸음마다 다음 다시 섞기의 진짜 더미를 넣어 두고, 엔진이 다시 섞으면
 * 그때의 버린 더미가 방장이 알린 카드와 같은지 본다. `requests`(판 → 방장이 연 더미 자리)가 있으면
 * 더미를 엔진이 뽑은 대로만(같은 차례, 같은 사람에게) 열었는지도 본다.
 * 한 걸음에 다시 섞기는 많아야 한 번이다(다시 섞으면 버린 더미에 맨 위 한 장만 남는다)
 */
export function checkOnecardReplay<Rules, State, Action, Event>(
  spec: OnecardFairSpec<Rules, State, Action, Event>,
  rules: Rules,
  seed: number,
  log: readonly OnecardLogged<Action>[],
  deals: ReadonlyMap<number, OnecardRoundDeal>,
  requests?: {
    of(round: number): readonly OnecardDraw[];
    deviceOf(seat: number): number;
  },
): OnecardReplayCheck<State> {
  const first = deals.get(1);
  if (!first)
    return { ok: false, index: -1, seat: 0, reason: "첫 판 패가 없다" };
  let state = spec.createMatch(rules, seed, first.preset).state;
  const states = [state];
  let used = 0;
  const host = (index: number, reason: string): OnecardReplayCheck<State> => ({
    ok: false,
    index,
    seat: 0,
    reason,
  });
  let round = spec.roundOf(state);
  /** 이 걸음에 엔진이 뽑은 카드가 방장이 연 더미 자리와 같은 차례·같은 사람인가 */
  const drawsMatch = (events: readonly Event[]): boolean => {
    if (!requests) return true;
    const asked = requests.of(round);
    for (const use of spec.drawsOf(events)) {
      const want = use === null ? PUBLIC : requests.deviceOf(use);
      const got = asked[used];
      if (!got || got.to !== want) return false;
      used += 1;
    }
    return true;
  };
  for (const [index, entry] of log.entries()) {
    round = spec.roundOf(state);
    const deal = deals.get(round);
    if (!deal) return { ok: true, state, states, upTo: index };
    const k = spec.reshufflesOf(state);
    const pool = spec.reshufflePool(state);
    const next = deals.get(round + 1);
    const input = spec.withRefill(
      spec.withPreset(state, next?.preset ?? null),
      deal.refills[k] ?? null,
    );
    let result: OnecardStep<State, Event>;
    try {
      result = spec.step(input, entry.seat, realOnecardAction(entry.action));
    } catch {
      // 다음 판 패나 다시 섞은 더미를 아직 모른다.
      return { ok: true, state, states, upTo: index };
    }
    if (!result.ok)
      return {
        ok: false,
        index,
        seat: entry.seat,
        reason: `진짜 카드로 다시 계산하니 규칙에 맞지 않는 행동이었다(${result.error})`,
      };
    const after = result.state;
    if (spec.roundOf(after) === round) {
      const k2 = spec.reshufflesOf(after);
      if (k2 > k + 1)
        return host(index, "한 걸음에 두 번 다시 섞었다(엔진과 맞지 않는다)");
      if (k2 === k + 1) {
        const declared = deal.declared[k] ?? [];
        if (!sameCards(pool, declared))
          return host(
            index,
            "방장이 다시 섞을 카드를 버린 더미와 다르게 알렸다",
          );
      }
      if (!drawsMatch(result.events))
        return host(index, "방장이 더미 카드를 엔진과 다르게 열었다");
    } else {
      // 판이 바뀌는 걸음에도 바뀌기 전에 그 판 더미에서 뽑은 카드가 있을 수 있다(원카드 엔진: 먹다가
      // 파산해 판이 끝남). 그것까지 맞춰 본 뒤 남은 연 자리가 있는지 본다. 이 걸음의 다시 섞기는 상태가 다음 판으로
      // 넘어가 버린 더미와 견줄 수 없다. 원카드 엔진은 다시 섞기가 따로 한 걸음(`reshuffle` 행동)이라 판 끝과
      // 겹치지 않고, 알린 카드는 그 자리(`reshuffle`의 열린 카드 확인)와 판 끝(조각을 열어 같은 카드인지)에서 본다.
      if (!drawsMatch(result.events))
        return host(index, "방장이 더미 카드를 엔진과 다르게 열었다");
      if (requests && requests.of(round).length > used)
        return host(index, "방장이 엔진이 쓰지 않은 더미 카드를 열었다");
      used = 0;
    }
    state = spec.withRefill(spec.withPreset(after, null), null);
    states.push(state);
  }
  return { ok: true, state, states, upTo: log.length };
}

/** 기록 속 행동에서 멘탈 포커 칸(연 자리)을 뺀다 */
export function realOnecardAction<Action>(action: Action): Action {
  if (typeof action !== "object" || action === null) return action;
  const { fairSlots: _, ...rest } = action as Action & { fairSlots?: unknown };
  return rest as Action;
}
