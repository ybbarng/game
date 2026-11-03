import {
  isOnecardCard,
  isSpecialCard,
  type OnecardCard,
  rankOf,
  SUITS,
  shuffleOnecards,
  sortOnecards,
  suitOf,
} from "./cards";
import { playProblem, type TableFace } from "./play";
import {
  attackValue,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type OnecardRules,
  STALE_SEEN,
} from "./rules";
import type {
  Action,
  DrawReason,
  GameEvent,
  LoggedAction,
  OnecardResult,
  OnecardState,
  OnecardView,
  ShoutVerdict,
  ShoutWindow,
} from "./state";

export type StepResult =
  | { ok: true; state: OnecardState; events: GameEvent[] }
  | { ok: false; error: string };

/** 판 시작 재료. 무작위는 바깥에서: 씨앗으로 섞은 덱(`shuffledOnecardDeck`) 또는 멘탈 포커로 섞은 순서 */
export interface OnecardSetup {
  /** 섞인 덱(앞이 맨 위). 54장 전부가 아니어도 된다(시험용 짧은 덱) */
  deck: readonly OnecardCard[];
  /** 먼저 받고 먼저 내는 자리(기본 0) */
  first?: number;
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

function clone(state: OnecardState): OnecardState {
  return {
    ...state,
    deck: [...state.deck],
    pile: [...state.pile],
    hands: state.hands.map((h) => [...h]),
    preCalled: [...state.preCalled],
    called: [...state.called],
    windows: state.windows.map((w) => ({ ...w })),
    queue: state.queue.map((t) => ({ ...t })),
    finished: [...state.finished],
    bankrupt: [...state.bankrupt],
    bankruptCounts: [...state.bankruptCounts],
    recent: state.recent.map((m) => ({ ...m, exposed: [...m.exposed] })),
    ...(state.refill ? { refill: [...state.refill] } : {}),
  };
}

function hand(state: OnecardState, seat: number): OnecardCard[] {
  return state.hands[seat] as OnecardCard[];
}

/** 아직 판에 있는 자리(다 내지도 파산하지도 않았다) */
export function isActive(state: OnecardState, seat: number): boolean {
  return !state.finished.includes(seat) && !state.bankrupt.includes(seat);
}

export function activeSeats(state: OnecardState): number[] {
  return state.hands.flatMap((_, s) => (isActive(state, s) ? [s] : []));
}

/** `from`에서 지금 방향으로 `steps`번 건너간 판에 있는 자리. 남은 사람이 없으면 `from` */
export function nextActive(
  state: OnecardState,
  from: number,
  steps = 1,
): number {
  const n = state.rules.players;
  let seat = from;
  for (let k = 0; k < steps; k++) {
    let probe = seat;
    for (let i = 0; i < n; i++) {
      probe = (probe + state.direction + n) % n;
      if (isActive(state, probe)) break;
    }
    seat = probe;
  }
  return seat;
}

export function faceOf(state: OnecardState): TableFace {
  return {
    rules: state.rules,
    top: state.pile[state.pile.length - 1] as OnecardCard,
    suit: state.suit,
    attack: state.attack,
  };
}

/** 첫 카드: 특수 카드(공격·7·J·Q·K·조커)면 더미 밑으로 보내고 다시 편다 */
function flipFirst(state: OnecardState, events: GameEvent[]): OnecardCard {
  let card = state.deck.shift() as OnecardCard;
  for (let i = 0; i < state.deck.length && isSpecialCard(card); i++) {
    events.push({ type: "flipAgain", card });
    state.deck.push(card);
    card = state.deck.shift() as OnecardCard;
  }
  return card;
}

export function createMatch(
  rules: OnecardRules,
  setup: OnecardSetup,
): { state: OnecardState; events: GameEvent[] } {
  const n = rules.players;
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS)
    throw new Error(`원카드는 ${MIN_PLAYERS}~${MAX_PLAYERS}명이 한다`);
  const first = setup.first ?? 0;
  if (!Number.isInteger(first) || first < 0 || first >= n)
    throw new Error("없는 자리가 먼저 낸다");
  const deck = [...setup.deck];
  if (!deck.every(isOnecardCard) || new Set(deck).size !== deck.length)
    throw new Error("덱에 모르는 카드나 같은 카드가 있다");
  if (deck.length < n * rules.handSize + 1) throw new Error("덱이 모자라다");
  const state: OnecardState = {
    rules,
    version: 0,
    phase: "play",
    turn: first,
    direction: 1,
    deck,
    pile: [],
    hands: Array.from({ length: n }, () => [] as OnecardCard[]),
    suit: null,
    attack: 0,
    preCalled: new Array<boolean>(n).fill(false),
    called: new Array<boolean>(n).fill(false),
    windows: [],
    nextWindowId: 1,
    queue: [],
    endTurnAfterQueue: false,
    finished: [],
    bankrupt: [],
    bankruptCounts: new Array<number>(n).fill(0),
    turnNo: 0,
    recent: [{ turnNo: 0, exposed: [] }],
    result: null,
  };
  for (let i = 0; i < rules.handSize; i++)
    for (let k = 0; k < n; k++)
      hand(state, (first + k) % n).push(state.deck.shift() as OnecardCard);
  const events: GameEvent[] = [];
  const top = flipFirst(state, events);
  state.pile = [top];
  state.suit = suitOf(top);
  events.push({ type: "dealt", first, top });
  return { state, events };
}

/** 멘탈 포커 판의 처음 패(fair-play `OnecardPreset`과 같은 모양). 모르는 카드는 자리 표(`?_12`) */
export interface OnecardFairPreset {
  /** 자리 번호 순서 손패 */
  hands: readonly (readonly string[])[];
  /** 처음 펼친 카드(한 장, 모두에게 열린 진짜 카드) */
  open: readonly string[];
  /** 더미(앞이 맨 위) */
  deck: readonly string[];
}

/** 아직 열리지 않은 카드 자리 표인가(fair-play `tokenOf`) */
export function isHiddenCard(card: string): boolean {
  return card.startsWith("?_");
}

/**
 * 멘탈 포커 판을 만든다(암호화방). 손패는 섞기 사슬의 자리 순서대로 이미 나뉘어 있다(`onecardLayout`: 자리 순서로 손패,
 * 그다음 펼칠 카드, 나머지는 더미). 처음 펼친 카드가 특수 카드면 버린 더미 밑으로 보내고 더미 맨 위를 다시 편다.
 * 다시 펼 카드는 모두에게 열린 진짜 카드여야 한다(아니면 던진다: 방장이 먼저 모두에게 연다).
 * 더미 순서는 바꾸지 않는다(섞기 사슬 자리 순서 = 엔진이 뽑는 순서)
 */
export function createFairMatch(
  rules: OnecardRules,
  preset: OnecardFairPreset,
  first = 0,
): { state: OnecardState; events: GameEvent[] } {
  const n = rules.players;
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS)
    throw new Error(`원카드는 ${MIN_PLAYERS}~${MAX_PLAYERS}명이 한다`);
  if (preset.hands.length !== n) throw new Error("손패 수가 인원과 다르다");
  if (!Number.isInteger(first) || first < 0 || first >= n)
    throw new Error("없는 자리가 먼저 낸다");
  const opened = preset.open[0];
  if (
    preset.open.length !== 1 ||
    opened === undefined ||
    !isOnecardCard(opened)
  )
    throw new Error("처음 펼친 카드는 열린 카드 한 장이다");
  const all = [...preset.hands.flat(), ...preset.open, ...preset.deck];
  if (new Set(all).size !== all.length)
    throw new Error("덱에 같은 카드가 있다");
  if (all.some((c) => !isOnecardCard(c) && !isHiddenCard(c)))
    throw new Error("덱에 모르는 카드가 있다");
  const deck = [...preset.deck] as OnecardCard[];
  const pile: OnecardCard[] = [];
  const events: GameEvent[] = [];
  let top: OnecardCard = opened;
  while (isSpecialCard(top) && deck.length > 0) {
    const next = deck[0] as string;
    if (!isOnecardCard(next)) throw new Error("다시 펼칠 카드를 아직 모른다");
    events.push({ type: "flipAgain", card: top });
    pile.push(top);
    top = deck.shift() as OnecardCard;
  }
  pile.push(top);
  const state: OnecardState = {
    rules,
    version: 0,
    phase: "play",
    turn: first,
    direction: 1,
    deck,
    pile,
    hands: preset.hands.map((h) => [...h] as OnecardCard[]),
    suit: suitOf(top),
    attack: 0,
    preCalled: new Array<boolean>(n).fill(false),
    called: new Array<boolean>(n).fill(false),
    windows: [],
    nextWindowId: 1,
    queue: [],
    endTurnAfterQueue: false,
    finished: [],
    bankrupt: [],
    bankruptCounts: new Array<number>(n).fill(0),
    turnNo: 0,
    recent: [{ turnNo: 0, exposed: [] }],
    result: null,
    fair: true,
    refill: null,
  };
  events.push({ type: "dealt", first, top });
  return { state, events };
}

/** 멘탈 포커 판: 다음 다시 섞기에 쓸 새 더미를 넣는다(null이면 지운다) */
export function withRefill(
  state: OnecardState,
  deck: readonly string[] | null,
): OnecardState {
  return { ...state, refill: deck ? [...deck] : null };
}

// ── 판 끝 ──────────────────────────────────────────────

export function resultOf(state: OnecardState): OnecardResult {
  const n = state.rules.players;
  const remaining = activeSeats(state).sort(
    (a, b) => hand(state, a).length - hand(state, b).length || a - b,
  );
  const bankrupt = [...state.bankrupt].reverse();
  const order = [...state.finished, ...remaining, ...bankrupt];
  const ranks = new Array<number>(n).fill(0);
  const scores = new Array<number>(n).fill(0);
  state.finished.forEach((s, i) => {
    ranks[s] = i + 1;
  });
  for (const s of remaining) {
    const count = hand(state, s).length;
    ranks[s] =
      state.finished.length +
      1 +
      remaining.filter((o) => hand(state, o).length < count).length;
    scores[s] = count;
  }
  bankrupt.forEach((s, i) => {
    ranks[s] = state.finished.length + remaining.length + i + 1;
    scores[s] = state.bankruptCounts[s] ?? 0;
  });
  return {
    ranks,
    scores,
    order,
    hands: state.hands.map((h) => sortOnecards(h)),
  };
}

/** 끝났으면 판을 닫고 true */
function checkEnd(state: OnecardState, events: GameEvent[]): boolean {
  if (state.phase === "over") return true;
  const active = activeSeats(state);
  if (
    active.length > 1 &&
    !(state.rules.endOnFirst && state.finished.length > 0)
  )
    return false;
  state.phase = "over";
  state.windows = [];
  state.queue = [];
  state.endTurnAfterQueue = false;
  state.result = resultOf(state);
  events.push({ type: "ended", result: state.result });
  return true;
}

// ── 외침 창 ──────────────────────────────────────────────

function openWindow(state: OnecardState, seat: number): void {
  state.windows.push({
    id: state.nextWindowId++,
    seat,
    kind: state.rules.selfWindowMs > 0 ? "self" : "catch",
    heldBy: null,
  });
}

function closeWindows(state: OnecardState, seat: number): void {
  state.windows = state.windows.filter((w) => w.seat !== seat);
}

/** 손패가 바뀌어 한 장 상태가 끝났다(먹음·파산) */
function resetCall(state: OnecardState, seat: number): void {
  state.preCalled[seat] = false;
  state.called[seat] = false;
  closeWindows(state, seat);
}

/** 본인 외침 보상: 다른 사람들이 한 장씩(`shoutReward`) */
function reward(state: OnecardState, seat: number): void {
  if (!state.rules.shoutReward) return;
  let other = nextActive(state, seat);
  const seen = new Set<number>();
  while (other !== seat && !seen.has(other)) {
    seen.add(other);
    state.queue.push({ seat: other, left: 1, reason: "reward" });
    other = nextActive(state, other);
  }
}

// ── 먹기·다시 섞기 ──────────────────────────────────────────────

function goBankrupt(
  state: OnecardState,
  seat: number,
  events: GameEvent[],
): void {
  const cards = hand(state, seat);
  state.bankrupt.push(seat);
  state.bankruptCounts[seat] = cards.length;
  // 파산한 사람의 패는 버린 더미 밑으로(다음 다시 섞기에 들어간다). 멘탈 포커 판은 아무에게도 열리지 않은
  // 카드라 다시 섞을 수 없어 판에서 뺀다
  if (!state.fair) state.pile.unshift(...cards);
  state.hands[seat] = [];
  state.queue = state.queue.filter((t) => t.seat !== seat);
  // 공격을 받던 사람(차례인 사람)이 파산하면 공격은 그 사람에게서 끝난다. 다음 사람이 떠안지 않는다
  if (state.turn === seat) state.attack = 0;
  resetCall(state, seat);
  events.push({ type: "bankrupt", seat });
}

/**
 * 먹을 일을 앞부터 처리한다. 더미가 바닥나면 버린 더미(맨 위 빼고)를 다시 섞어 주기를 기다리고(`reshuffle`),
 * 버린 더미까지 모자라면 있는 만큼만 먹는다
 */
function processQueue(state: OnecardState, events: GameEvent[]): void {
  if (state.phase !== "play") return;
  while (state.queue.length > 0) {
    const task = state.queue[0] as (typeof state.queue)[number];
    if (!isActive(state, task.seat) || task.left <= 0) {
      state.queue.shift();
      continue;
    }
    if (state.deck.length === 0) {
      if (state.pile.length > 1) {
        state.phase = "reshuffle";
        events.push({ type: "reshuffleNeeded", count: state.pile.length - 1 });
        return;
      }
      state.queue.shift();
      continue;
    }
    const take = Math.min(task.left, state.deck.length);
    hand(state, task.seat).push(...state.deck.splice(0, take));
    task.left -= take;
    if (task.left === 0) state.queue.shift();
    resetCall(state, task.seat);
    events.push({
      type: "drew",
      seat: task.seat,
      count: take,
      reason: task.reason,
    });
    const limit = state.rules.bankruptAt;
    if (limit > 0 && hand(state, task.seat).length >= limit) {
      goBankrupt(state, task.seat, events);
      if (checkEnd(state, events)) return;
    }
  }
  if (state.endTurnAfterQueue) {
    state.endTurnAfterQueue = false;
    state.turn = nextActive(state, state.turn);
  }
  if (!isActive(state, state.turn)) state.turn = nextActive(state, state.turn);
}

function enqueue(
  state: OnecardState,
  seat: number,
  count: number,
  reason: DrawReason,
): void {
  if (count > 0) state.queue.push({ seat, left: count, reason });
}

/** 다시 섞을 카드(버린 더미에서 맨 위를 뺀 것, 카드 순서). 다시 섞을 때가 아니면 null */
export function reshuffleRequest(state: OnecardState): OnecardCard[] | null {
  if (state.phase !== "reshuffle") return null;
  return sortOnecards(state.pile.slice(0, -1));
}

/** 씨앗으로 다시 섞는 행동(일반방·혼자 하기). 멘탈 포커 판은 섞은 순서를 바깥에서 만든다 */
export function seededReshuffle(
  state: OnecardState,
  seed: number,
): Action | null {
  const cards = reshuffleRequest(state);
  return cards
    ? { type: "reshuffle", order: shuffleOnecards(cards, seed) }
    : null;
}

// ── 외침 판정 ──────────────────────────────────────────────

/**
 * 외침의 뜻을 가린다(docs/42 B안 2번, docs/43 2-1 `seen` 판).
 * 자기 상태(창·차례·두 장)는 지금 판으로, 남을 잡을 수 있었나는 누른 사람이 본 판(`seen`)으로 본다
 */
export function judgeShout(
  state: OnecardState,
  seat: number,
  seen: number,
): ShoutVerdict | { kind: "error"; error: string } {
  if (state.phase === "over") return { kind: "error", error: "끝난 판이다" };
  if (!isActive(state, seat))
    return { kind: "error", error: "판에서 빠진 자리는 외칠 수 없다" };
  if (!Number.isInteger(seen) || seen < 0 || seen > state.turnNo)
    return { kind: "error", error: "모르는 판 번호다" };
  if (state.turnNo - seen > STALE_SEEN) return { kind: "stale" };
  const own = state.windows.find((w) => w.seat === seat);
  if (own) return own.kind === "self" ? { kind: "self" } : { kind: "lateSelf" };
  const mark = state.recent.find((m) => m.turnNo === seen);
  const targets = (mark?.exposed ?? []).filter((s) => s !== seat);
  const open = state.windows.filter((w) => targets.includes(w.seat));
  const caught = open.filter((w) => w.kind === "catch").map((w) => w.seat);
  const held = open.filter((w) => w.kind === "self").map((w) => w.seat);
  if (
    state.phase === "play" &&
    state.turn === seat &&
    hand(state, seat).length === 2 &&
    !state.preCalled[seat]
  ) {
    // 한 번 누름이 둘 다에 해당하면 둘 다(shoutBoth, docs/42 12-5)
    if (state.rules.shoutBoth === false) return { kind: "pre" };
    return {
      kind: "pre",
      ...(caught.length > 0 ? { alsoCaught: caught } : {}),
      ...(held.length > 0 ? { alsoHeld: held } : {}),
    };
  }
  if (targets.length === 0) return { kind: "false" };
  if (open.length === 0) {
    // 늦음은 같은 자리·같은 seen으로 한 번만 봐준다. 창이 닫힌 판 번호를 골라 마구 눌러도 벌칙이 없던 구멍을 막는다.
    // "창이 닫힌 뒤 첫 차례 행동 전까지만"으로 자르지 않은 까닭: 창이 차례 행동(먹기·다 내기)으로 닫히면
    // 그 전 판을 보고 정직하게 누른 사람의 누름이 지연 때문에 그 행동 뒤에 닿는다. 그 사람을 헛외침으로 만들면
    // `seen` 판정(지연 때문에 한 판 늦게 본 사람을 봐준다)이 무너진다
    const used = (state.lateSeen ?? []).some(
      (l) => l.seat === seat && l.turnNo === seen,
    );
    return used ? { kind: "false" } : { kind: "late" };
  }
  return caught.length > 0
    ? { kind: "catch", targets: caught, held }
    : { kind: "hold", targets: held };
}

function catchSeat(
  state: OnecardState,
  catcher: number,
  target: number,
  events: GameEvent[],
): void {
  closeWindows(state, target);
  events.push({ type: "caught", seat: catcher, target });
  enqueue(state, target, state.rules.catchPenalty, "caught");
}

function applyShout(
  state: OnecardState,
  seat: number,
  verdict: ShoutVerdict,
  seen: number,
  events: GameEvent[],
): void {
  events.push({ type: "shouted", seat });
  switch (verdict.kind) {
    case "pre":
      state.preCalled[seat] = true;
      for (const w of state.windows)
        if (verdict.alsoHeld?.includes(w.seat) && w.heldBy === null)
          w.heldBy = seat;
      for (const target of verdict.alsoCaught ?? [])
        catchSeat(state, seat, target, events);
      break;
    case "self":
      closeWindows(state, seat);
      state.called[seat] = true;
      reward(state, seat);
      break;
    case "hold":
      for (const w of state.windows)
        if (verdict.targets.includes(w.seat) && w.heldBy === null)
          w.heldBy = seat;
      break;
    case "catch":
      // 같은 판에 본인 시간 안인 사람도 있으면 그 사람에게는 적어 둔다
      for (const w of state.windows)
        if (verdict.held.includes(w.seat) && w.heldBy === null) w.heldBy = seat;
      for (const target of verdict.targets)
        catchSeat(state, seat, target, events);
      break;
    case "false":
      events.push({ type: "falseShout", seat });
      enqueue(state, seat, state.rules.falseShoutPenalty, "falseShout");
      break;
    case "late":
      // 벌칙은 없지만 한 번 봐준 것을 적어 둔다(같은 seen으로 되풀이하면 헛외침)
      state.lateSeen = [...(state.lateSeen ?? []), { seat, turnNo: seen }];
      break;
    default:
      // lateSelf·stale: 아무 일 없음
      break;
  }
  processQueue(state, events);
}

// ── 내기 ──────────────────────────────────────────────

function applyPlay(
  state: OnecardState,
  seat: number,
  card: OnecardCard,
  suit: (typeof SUITS)[number] | undefined,
  events: GameEvent[],
): void {
  const cards = hand(state, seat).filter((c) => c !== card);
  state.hands[seat] = cards;
  state.pile.push(card);
  const rank = rankOf(card);
  state.suit = rank === "7" ? (suit as NonNullable<typeof suit>) : suitOf(card);
  state.attack += attackValue(card, state.rules);
  events.push({
    type: "played",
    seat,
    card,
    suit: state.suit,
    attack: state.attack,
  });

  // 외침: 미리 외쳤으면 한 장이 된 순간 외친 것, 아니면 창을 연다
  if (cards.length === 1) {
    if (state.preCalled[seat]) {
      state.called[seat] = true;
      reward(state, seat);
    } else if (!state.called[seat]) openWindow(state, seat);
  } else {
    state.called[seat] = false;
    closeWindows(state, seat);
  }
  state.preCalled[seat] = false;

  const done = cards.length === 0;
  if (done) {
    state.finished.push(seat);
    events.push({ type: "finished", seat, place: state.finished.length });
    if (checkEnd(state, events)) return;
  }

  // 차례: K 한 번 더, Q 방향 바꾸기(둘만 남았으면 K처럼), J 건너뛰기
  const two = activeSeats(state).length + (done ? 1 : 0) <= 2;
  if (rank === "K" || (rank === "Q" && two)) {
    if (done) state.turn = nextActive(state, seat);
  } else if (rank === "Q") {
    state.direction = state.direction === 1 ? -1 : 1;
    state.turn = nextActive(state, seat);
  } else if (rank === "J") state.turn = nextActive(state, seat, 2);
  else state.turn = nextActive(state, seat);
  processQueue(state, events);
}

// ── 한 걸음 ──────────────────────────────────────────────

/**
 * 받아들인 행동마다 기록 길이(`version`)를 올린다. 판 모양이 바뀌는 차례 행동(내기·먹기·다시 섞기·그만두기)이면
 * 판 번호(`turnNo`)도 올리고 그 판의 판정 재료(창이 열린 자리)를 남긴다.
 * 외침·창 시간 끝은 판 번호를 올리지 않는다: 여럿이 거의 같이 누를 때 정직한 누름이 "옛 판"으로 버려지지 않게
 */
function done(
  next: OnecardState,
  events: GameEvent[],
  board: boolean,
): StepResult {
  next.version += 1;
  if (board) {
    next.turnNo += 1;
    next.recent.push({
      turnNo: next.turnNo,
      exposed: next.windows.map((w) => w.seat),
    });
    if (next.recent.length > STALE_SEEN + 1) next.recent.shift();
    // 적어 둔 늦음이 있을 때만 `seen`으로 더는 못 가리키는 것을 지운다.
    // 배열은 늘 새로 만들어 바꾸므로 `clone`이 얕게 나눠 가져도 된다
    if (next.lateSeen)
      next.lateSeen = next.lateSeen.filter(
        (l) => next.turnNo - l.turnNo <= STALE_SEEN,
      );
  }
  return { ok: true, state: next, events };
}

export function step(
  state: OnecardState,
  seat: number,
  action: Action,
): StepResult {
  const n = state.rules.players;
  if (!Number.isInteger(seat) || seat < 0 || seat >= n)
    return fail("없는 자리다");
  if (state.phase === "over") {
    // 판이 끝난 뒤 닿은 청구 묶음도 기록에는 남긴다(아무 일 없음). 방장이 발표한 묶음은 모두 기록에 들어가야
    // 참가자가 발표와 기록을 하나하나 맞춰 볼 수 있다
    if (action.type === "claims" && Array.isArray(action.shouts)) {
      const next = clone(state);
      return done(next, [], false);
    }
    return fail("끝난 판이다");
  }

  if (action.type === "retire") {
    const next = clone(state);
    next.phase = "over";
    next.windows = [];
    next.queue = [];
    next.retired = true;
    next.result = resultOf(next);
    return done(
      next,
      [{ type: "ended", result: next.result, retired: true }],
      true,
    );
  }

  if (action.type === "shout") {
    const verdict = judgeShout(state, seat, action.seen);
    if (verdict.kind === "error") return fail(verdict.error);
    const next = clone(state);
    const events: GameEvent[] = [];
    applyShout(next, seat, verdict, action.seen, events);
    return done(next, events, false);
  }

  if (action.type === "claims") {
    if (
      !Number.isSafeInteger(action.batch) ||
      action.batch < 0 ||
      !Array.isArray(action.shouts)
    )
      return fail("청구 묶음 모양이 맞지 않다");
    const next = clone(state);
    const events: GameEvent[] = [];
    for (const claim of action.shouts) {
      if (next.phase === "over") break;
      if (typeof claim !== "object" || claim === null) continue;
      if (!Number.isInteger(claim.seat) || claim.seat < 0 || claim.seat >= n)
        continue;
      const verdict = judgeShout(next, claim.seat, claim.seen);
      if (verdict.kind === "error") continue;
      applyShout(next, claim.seat, verdict, claim.seen, events);
    }
    return done(next, events, false);
  }

  if (action.type === "timeout") {
    if (action.kind !== "selfWindow" && action.kind !== "catchWindow")
      return fail("모르는 창 종류다");
    const kind = action.kind === "selfWindow" ? "self" : "catch";
    const window = state.windows.find(
      (w) => w.seat === action.target && w.kind === kind,
    );
    if (!window) return fail("그 창이 열려 있지 않다");
    // `id`가 없는 것은 창 번호를 싣기 전 기록(옛 기록 호환): 자리·종류로만 찾는다
    if (action.id !== undefined && action.id !== window.id)
      return fail("지난 창의 시간 끝이다");
    const next = clone(state);
    const events: GameEvent[] = [];
    const w = next.windows.find((x) => x.id === window.id) as ShoutWindow;
    if (kind === "catch") closeWindows(next, w.seat);
    else if (w.heldBy !== null) catchSeat(next, w.heldBy, w.seat, events);
    else {
      // 본인 시간이 끝났다 → 잡기 창(새 번호라 바깥 시계가 새로 잰다)
      w.kind = "catch";
      w.id = next.nextWindowId++;
    }
    processQueue(next, events);
    return done(next, events, false);
  }

  if (action.type === "reshuffle") {
    const wanted = reshuffleRequest(state);
    if (!wanted) return fail("다시 섞을 때가 아니다");
    // 멘탈 포커 판: 새 더미는 섞기 사슬이 정한 자리 순서(바깥이 넣은 `refill`)다. 행동의 순서는 쓰지 않는다.
    // 방장 엔진의 `refill`은 자리 표라 카드 확인은 장 수만, 판 끝 다시 계산(진짜 카드)에서는 같은 카드인지까지 본다
    if (state.fair) {
      const refill = state.refill;
      if (!refill) throw new Error("다시 섞은 더미를 아직 모른다");
      const real = refill.every((c) => isOnecardCard(c));
      if (
        refill.length !== wanted.length ||
        (real &&
          sortOnecards(refill as OnecardCard[]).some((c, i) => c !== wanted[i]))
      )
        return fail("다시 섞을 카드가 맞지 않다");
      const next = clone(state);
      next.deck = [...refill] as OnecardCard[];
      next.refill = null;
      next.reshuffles = (next.reshuffles ?? 0) + 1;
      next.pile = next.pile.slice(-1);
      next.phase = "play";
      const events: GameEvent[] = [
        { type: "reshuffled", count: refill.length },
      ];
      processQueue(next, events);
      return done(next, events, true);
    }
    const order = action.order;
    if (
      !Array.isArray(order) ||
      order.length !== wanted.length ||
      sortOnecards(order).some((c, i) => c !== wanted[i])
    )
      return fail("다시 섞을 카드가 맞지 않다");
    const next = clone(state);
    next.deck = [...order];
    next.pile = next.pile.slice(-1);
    next.phase = "play";
    const events: GameEvent[] = [{ type: "reshuffled", count: order.length }];
    processQueue(next, events);
    return done(next, events, true);
  }

  if (state.phase !== "play") return fail("다시 섞기를 기다린다");
  if (state.turn !== seat) return fail("차례가 아니다");

  if (action.type === "draw") {
    const next = clone(state);
    const events: GameEvent[] = [];
    const count = next.attack > 0 ? next.attack : 1;
    enqueue(next, seat, count, next.attack > 0 ? "attack" : "draw");
    next.attack = 0;
    next.endTurnAfterQueue = true;
    processQueue(next, events);
    return done(next, events, true);
  }

  if (action.type !== "play") return fail("모르는 행동이다");
  const card = action.card;
  if (!isOnecardCard(card)) return fail("모르는 카드다");
  const problem = playProblem(faceOf(state), hand(state, seat), card);
  if (problem) return fail(problem);
  if (rankOf(card) === "7") {
    if (!action.suit || !SUITS.includes(action.suit))
      return fail("7을 내면 바꿀 무늬를 골라야 한다");
  } else if (action.suit !== undefined) return fail("무늬는 7만 고른다");
  const next = clone(state);
  const events: GameEvent[] = [];
  applyPlay(next, seat, card, action.suit, events);
  return done(next, events, true);
}

// ── 바깥이 쓰는 것 ──────────────────────────────────────────────

/** 지금 차례 행동(내기·먹기)을 해야 하는 자리. 다시 섞기를 기다리거나 끝났으면 null */
export function pendingSeat(state: OnecardState): number | null {
  return state.phase === "play" ? state.turn : null;
}

/**
 * 차례 행동을 기다리는 자리들(다른 엔진의 `pendingSeats`와 같은 모양). 원카드는 늘 한 사람이라
 * `pendingSeat`를 배열로 준다. 외침은 누구나 언제든 보내므로 넣지 않는다
 */
export function pendingSeats(state: OnecardState): number[] {
  const seat = pendingSeat(state);
  return seat === null ? [] : [seat];
}

/**
 * 지금 할 수 있는 차례 행동(컴퓨터·화면). 7은 무늬마다 하나씩, 맨 끝은 먹기.
 * 외침(`shout`)은 판에 있는 자리면 언제든 보낼 수 있어 넣지 않는다
 */
export function legalActions(state: OnecardState, seat: number): Action[] {
  if (state.phase !== "play" || state.turn !== seat) return [];
  return movesOf(faceOf(state), hand(state, seat));
}

/**
 * 이 판 모양과 손패로 낼 수 있는 차례 행동(7은 무늬마다, 맨 끝은 먹기).
 * 멘탈 포커 화면이 자리 표를 진짜 카드로 바꾼 뒤 다시 셀 때도 쓴다
 */
export function movesOf(
  face: TableFace,
  mine: readonly OnecardCard[],
): Action[] {
  const actions: Action[] = [];
  for (const card of sortOnecards(mine)) {
    if (playProblem(face, mine, card)) continue;
    if (rankOf(card) === "7")
      for (const suit of SUITS) actions.push({ type: "play", card, suit });
    else actions.push({ type: "play", card });
  }
  actions.push({ type: "draw" });
  return actions;
}

/**
 * 열린 외침 창과 그 길이(ms). 방장 `LocalMatch`가 창 `id`마다 시계를 걸고, 다 되면
 * `{type:"timeout", kind, target: seat, id}`를 넣는다. 화면에는 보이지 않는다(누가 잊었나가 드러난다)
 */
export function shoutWindows(state: OnecardState): {
  id: number;
  seat: number;
  kind: "selfWindow" | "catchWindow";
  ms: number;
}[] {
  return state.windows.map((w) =>
    w.kind === "self"
      ? {
          id: w.id,
          seat: w.seat,
          kind: "selfWindow",
          ms: state.rules.selfWindowMs,
        }
      : {
          id: w.id,
          seat: w.seat,
          kind: "catchWindow",
          ms: state.rules.catchWindowMs,
        },
  );
}

export function viewOf(state: OnecardState, seat: number): OnecardView {
  return {
    rules: state.rules,
    mySeat: seat,
    version: state.version,
    turnNo: state.turnNo,
    phase: state.phase,
    turn: state.turn,
    direction: state.direction,
    hand: sortOnecards(state.hands[seat] ?? []),
    handCounts: state.hands.map((h) => h.length),
    deckCount: state.deck.length,
    pile: [...state.pile],
    suit: state.suit,
    attack: state.attack,
    finished: [...state.finished],
    bankrupt: [...state.bankrupt],
    moves: legalActions(state, seat),
    decision: state.phase === "play" && state.turn === seat ? "turn" : null,
    result: state.result,
    ...(state.retired ? { retired: true } : {}),
  };
}

/** 기록대로 다시 한다(온라인 판 끝 검증·복기). 다시 섞은 순서는 기록의 `reshuffle` 행동에 있다 */
export function replay(
  rules: OnecardRules,
  setup: OnecardSetup,
  log: readonly LoggedAction[],
):
  | { ok: true; state: OnecardState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, setup);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}
