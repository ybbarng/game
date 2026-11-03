import {
  createRng,
  nextInt,
  type PlayerClock,
  spendTime,
  startClock,
  TIME_PRESETS,
  type TimeControl,
} from "@game/mighty-engine";
import {
  CHAIN_LENGTH,
  chainHash,
  LINK_PATTERN,
  seatKey,
  sha256Hex,
} from "@game/yut-engine";

import {
  ASTEROID,
  BASE,
  BOARD_SIZE,
  COMET,
  firstStarOfSide,
  type GalaxyBoard,
  OBSERVATORY,
  STAR_SQUARES,
  sideOf,
  starAt,
} from "./board";
import {
  activeCards,
  CARD_AMOUNTS,
  type CardKind,
  cardById,
  matchesFact,
  type StarFact,
} from "./cards";
import {
  bidCommitment,
  dealStars,
  diceFrom,
  drawIndex,
  HASH_PATTERN,
  rollHash,
  SALT_PATTERN,
} from "./dice";
import {
  endsOnFirstBankrupt,
  type GalaxyRules,
  meteorFor,
  NUMBERS,
  permille,
  round10,
  turnLimitOf,
} from "./rules";
import {
  type Action,
  type AuctionResult,
  BANK,
  type Debt,
  type Decision,
  type GalaxyState,
  type GalaxyView,
  type GameEvent,
  type GameResult,
  type PayReason,
  type RevealPurpose,
  type Standing,
  type TradeOffer,
  type TradeSide,
} from "./state";

export type StepResult =
  | { ok: true; state: GalaxyState; events: GameEvent[] }
  | { ok: false; error: string };

/* ───────────── 만들기 ───────────── */

/** 이 규칙의 개인 시간(없으면 null) */
export function timeControlOf(rules: GalaxyRules): TimeControl | null {
  return rules.time && rules.time !== "none" ? TIME_PRESETS[rules.time] : null;
}

/** 이 돌림의 계절 변(2-12 1번). 판 길이를 네 토막으로 나눈다. 긴 판은 정한 돌림마다 바뀐다 */
export function seasonFor(rules: GalaxyRules, round: number): number | null {
  if (!rules.seasonal) return null;
  const limit = turnLimitOf(rules);
  if (limit) return Math.min(3, Math.floor(((round - 1) * 4) / limit));
  return Math.floor((round - 1) / NUMBERS.longSeasonRounds) % 4;
}

/**
 * 새 판. 하늘에서 만든 판(`buildBoard`)을 받는다. 첫 차례는 시드로 정한다.
 * 규칙의 하늘 id와 판의 하늘이 달라야 하면 안 된다
 */
export function createMatch(
  rules: GalaxyRules,
  seed: number,
  board: GalaxyBoard,
): { state: GalaxyState; events: GameEvent[] } {
  if (board.skyId !== rules.sky)
    throw new Error(
      `규칙의 하늘(${rules.sky})과 판의 하늘(${board.skyId})이 다르다`,
    );
  const n = rules.players;
  const seats = Array.from({ length: n }, (_, s) => s);
  const starter = nextInt(createRng(seed), n);
  const control = timeControlOf(rules);
  const state: GalaxyState = {
    rules,
    board,
    roundNumber: 1,
    phase: "commit",
    round: 1,
    season: seasonFor(rules, 1),
    meteor: meteorFor(rules, 1),
    starter,
    turn: {
      seat: starter,
      doubles: 0,
      rolls: 0,
      offered: false,
      next: "roll",
      again: false,
    },
    positions: seats.map(() => BASE),
    cash: seats.map(() => NUMBERS.startFunds[rules.length]),
    out: seats.map(() => false),
    jailed: seats.map(() => false),
    owners: Array.from({ length: BOARD_SIZE }, () => -1),
    levels: Array.from({ length: BOARD_SIZE }, () => 0),
    mortgaged: Array.from({ length: BOARD_SIZE }, () => false),
    deck: activeCards(board),
    revealCount: 0,
    generation: 0,
    chains: seats.map(() => ({ commit: null, last: null, used: 0 })),
    reveals: seats.map(() => null),
    revealFor: NUMBERS.dealStars[rules.length] > 0 ? "deal" : null,
    lastRoll: null,
    auction: null,
    auctionCount: 0,
    lastAuction: null,
    trade: null,
    debt: null,
    endAfterTurn: false,
    timeUp: false,
    bankIn: 0,
    bankOut: 0,
    result: null,
    clocks: control ? seats.map(() => startClock(control)) : null,
    keys: seats.map((s) => seatKey(seed, s)),
  };
  return { state, events: [{ type: "gameStarted", turn: starter }] };
}

/** 시작 별빛 합(돈 합 확인용) */
export function startTotal(rules: GalaxyRules): number {
  return NUMBERS.startFunds[rules.length] * rules.players;
}

/* ───────────── 읽기 ───────────── */

/** 판에 남아 있는 자리 */
export function activeSeats(state: Pick<GalaxyState, "out">): number[] {
  return state.out.flatMap((out, s) => (out ? [] : [s]));
}

/** 이 사람이 이 별자리 별을 몇 개 가졌나 */
export function ownedInGroup(
  state: Pick<GalaxyState, "board" | "owners">,
  seat: number,
  group: number,
): number {
  const squares = state.board.groups[group]?.squares ?? [];
  return squares.filter((sq) => state.owners[sq] === seat).length;
}

/** 이 사람이 이 별자리를 완성했나(별을 모두 가졌다) */
export function isComplete(
  state: Pick<GalaxyState, "board" | "owners">,
  seat: number,
  group: number,
): boolean {
  const squares = state.board.groups[group]?.squares ?? [];
  return squares.length > 0 && squares.every((sq) => state.owners[sq] === seat);
}

/**
 * 이 칸에 머물면 내는 이용료(주인 없음·맡긴 별은 0, 2-2). 제철이면 1.5배(적어도 10 더),
 * 유성우의 밤에는 제철 대신 모든 별이 2배(2-12)
 */
export function rentOf(
  state: Pick<
    GalaxyState,
    "board" | "owners" | "levels" | "mortgaged" | "season"
  > & { meteor?: boolean },
  square: number,
): number {
  if (state.meteor) {
    const plain = baseRentOf({ ...state, season: null }, square);
    return round10(plain, NUMBERS.meteor);
  }
  return baseRentOf(state, square);
}

function baseRentOf(
  state: Pick<
    GalaxyState,
    "board" | "owners" | "levels" | "mortgaged" | "season"
  >,
  square: number,
): number {
  const star = starAt(state.board, square);
  const owner = state.owners[square] ?? -1;
  if (!star || owner < 0 || state.mortgaged[square]) return 0;
  const level = state.levels[square] ?? 1;
  const rates = NUMBERS.rent;
  let rate: number;
  if (level >= 4) rate = rates.grand;
  else if (level === 3) rate = rates.level3;
  else if (level === 2) rate = rates.level2;
  else {
    const size = state.board.groups[star.group]?.squares.length ?? 0;
    const owned = ownedInGroup(state, owner, star.group);
    rate =
      owned >= size ? rates.complete : owned >= 2 ? rates.pair : rates.single;
  }
  const plain = Math.max(10, round10(star.value, rate));
  const inSeason = state.season !== null && sideOf(square) === state.season;
  if (!inSeason) return plain;
  return Math.max(
    plain + NUMBERS.seasonalMin,
    round10(star.value, rate, NUMBERS.seasonal),
  );
}

/** 정거장 한 단 값 */
export function levelCostAt(board: GalaxyBoard, square: number): number {
  const star = starAt(board, square);
  return star ? (board.groups[star.group]?.levelCost ?? 0) : 0;
}

/** 맡기면 받는 값 */
export function mortgageValue(board: GalaxyBoard, square: number): number {
  const star = starAt(board, square);
  return star ? permille(star.value, NUMBERS.mortgage) : 0;
}

/** 되찾을 때 내는 값(올림) */
export function unmortgageCost(board: GalaxyBoard, square: number): number {
  const star = starAt(board, square);
  return star ? Math.ceil((star.value * NUMBERS.unmortgage) / 1000) : 0;
}

/** 정거장 한 단을 내리면 돌려받는 값 */
export function sellValue(board: GalaxyBoard, square: number): number {
  return permille(levelCostAt(board, square), NUMBERS.sellBack);
}

/**
 * 자산(2-10) = 별빛 + 가진 별 값(맡긴 별은 맡긴 값) + 지은 정거장을 내릴 때 돌려받는 값(한 단 값의 절반,
 * 1단은 별 값에 들어 있다) + 완성 별자리마다 100. 정거장은 짓는 순간 자산이 절반만큼 줄어
 * 이용료로 되찾을 시간이 남았을 때 짓는다(「언제 올릴까」)
 */
export function assetsOf(
  state: Pick<
    GalaxyState,
    "board" | "owners" | "levels" | "mortgaged" | "cash"
  >,
  seat: number,
): number {
  let total = state.cash[seat] ?? 0;
  for (const sq of STAR_SQUARES) {
    if (state.owners[sq] !== seat) continue;
    const star = starAt(state.board, sq);
    if (!star) continue;
    total += state.mortgaged[sq] ? mortgageValue(state.board, sq) : star.value;
    total +=
      Math.max(0, (state.levels[sq] ?? 1) - 1) * sellValue(state.board, sq);
  }
  state.board.groups.forEach((_, g) => {
    if (isComplete(state, seat, g)) total += NUMBERS.completeBonus;
  });
  return total;
}

/** 다 정리하면 마련할 수 있는 별빛(정거장을 모두 내리고 맡길 수 있는 별을 모두 맡긴다) */
export function liquidationOf(
  state: Pick<
    GalaxyState,
    "board" | "owners" | "levels" | "mortgaged" | "cash"
  >,
  seat: number,
): number {
  let total = state.cash[seat] ?? 0;
  for (const sq of STAR_SQUARES) {
    if (state.owners[sq] !== seat) continue;
    total +=
      Math.max(0, (state.levels[sq] ?? 1) - 1) * sellValue(state.board, sq);
    if (!state.mortgaged[sq]) total += mortgageValue(state.board, sq);
  }
  return total;
}

/**
 * 순위. `losers`(기권·시간패·공개 안 함)와 운항 중단한 자리는 뒤로, 나머지는 자산이 많은 차례,
 * 같으면 별빛이 많은 차례. 둘 다 같으면 같은 순위
 */
export function standingsOf(
  state: Pick<
    GalaxyState,
    "board" | "owners" | "levels" | "mortgaged" | "cash" | "out"
  >,
  losers: readonly number[] = [],
): Standing[] {
  const rows = state.cash.map((cash, seat) => ({
    seat,
    assets: assetsOf(state, seat),
    cash,
    out: state.out[seat] === true,
    tier: state.out[seat] || losers.includes(seat) ? 1 : 0,
  }));
  const better = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.tier < b.tier ||
    (a.tier === b.tier &&
      (a.assets > b.assets || (a.assets === b.assets && a.cash > b.cash)));
  return rows
    .map((row) => ({
      seat: row.seat,
      rank: 1 + rows.filter((other) => better(other, row)).length,
      assets: row.assets,
      cash: row.cash,
      out: row.out,
    }))
    .sort((a, b) => a.rank - b.rank || a.seat - b.seat);
}

/** 관측지에 멈춘 사람이 받는 관측 지원금(남은 사람 가운데 자산 순위로, 2-5) */
export function observatoryGrant(
  state: Pick<
    GalaxyState,
    "board" | "owners" | "levels" | "mortgaged" | "cash" | "out"
  >,
  seat: number,
): number {
  const active = activeSeats(state);
  const table = NUMBERS.observatory[active.length as 2 | 3 | 4];
  if (!table) return 0;
  const rank = standingsOf(state)
    .filter((s) => !s.out)
    .find((s) => s.seat === seat)?.rank;
  return rank ? (table[rank - 1] ?? 0) : 0;
}

/** 지금 시계가 가는 자리와 그 사람이 쓸 수 있는 남은 시간(ms). 모두가 함께 내는 때(약속·공개·입찰)는 재지 않는다 */
export function clockTurn(
  state: GalaxyState,
): { seat: number; left: number } | null {
  const control = timeControlOf(state.rules);
  if (!control || !state.clocks) return null;
  let seat: number;
  switch (state.phase) {
    case "turn":
    case "buy":
      seat = state.turn.seat;
      break;
    case "trade":
      seat = state.trade?.to ?? -1;
      break;
    case "debt":
      seat = state.debt?.seat ?? -1;
      break;
    default:
      return null;
  }
  const clock = state.clocks[seat];
  if (!clock) return null;
  return { seat, left: clock.main + clock.periods * control.byoyomi };
}

/** 지금 결정해야 하는 자리들(입찰·약속·공개는 여러 자리가 함께) */
export function pendingSeats(state: GalaxyState): number[] {
  const active = activeSeats(state);
  switch (state.phase) {
    case "commit":
      return active.filter((s) => state.chains[s]?.commit === null);
    case "reveal":
      return active.filter((s) => state.reveals[s] === null);
    case "turn":
    case "buy":
      return [state.turn.seat];
    case "bid":
      return active.filter((s) => state.auction?.commits[s] === null);
    case "bidReveal":
      return active.filter((s) => state.auction?.reveals[s] === null);
    case "trade":
      return state.trade ? [state.trade.to] : [];
    case "debt":
      return state.debt ? [state.debt.seat] : [];
    default:
      return [];
  }
}

/* ───────────── 안에서 쓰는 걸음 ───────────── */

function clone(state: GalaxyState): GalaxyState {
  return {
    ...state,
    turn: { ...state.turn },
    positions: [...state.positions],
    cash: [...state.cash],
    out: [...state.out],
    jailed: [...state.jailed],
    owners: [...state.owners],
    levels: [...state.levels],
    mortgaged: [...state.mortgaged],
    deck: [...state.deck],
    chains: state.chains.map((c) => ({ ...c })),
    reveals: [...state.reveals],
    lastRoll: state.lastRoll
      ? {
          ...state.lastRoll,
          dice: [...state.lastRoll.dice] as [number, number],
        }
      : null,
    auction: state.auction
      ? {
          ...state.auction,
          commits: [...state.auction.commits],
          reveals: state.auction.reveals.map((r) => (r ? { ...r } : null)),
        }
      : null,
    lastAuction: state.lastAuction
      ? { ...state.lastAuction, bids: [...state.lastAuction.bids] }
      : null,
    trade: state.trade ? cloneOffer(state.trade) : null,
    debt: state.debt ? { ...state.debt } : null,
    result: state.result
      ? {
          ...state.result,
          standings: state.result.standings.map((s) => ({ ...s })),
        }
      : null,
    clocks: state.clocks ? state.clocks.map((c) => ({ ...c })) : null,
    keys: [...state.keys],
  };
}

function cloneOffer(offer: TradeOffer): TradeOffer {
  return {
    ...offer,
    give: { stars: [...offer.give.stars], cash: offer.give.cash },
    get: { stars: [...offer.get.stars], cash: offer.get.cash },
  };
}

function fail(error: string): StepResult {
  return { ok: false, error };
}

/** 별빛 옮기기. 모든 이동은 여기를 지나 `pay` 사건으로 남는다 */
function pay(
  s: GalaxyState,
  events: GameEvent[],
  from: number,
  to: number,
  amount: number,
  reason: PayReason,
  about: { square?: number; card?: number } = {},
): void {
  if (amount <= 0) return;
  if (from === BANK) s.bankOut += amount;
  else s.cash[from] = (s.cash[from] ?? 0) - amount;
  if (to === BANK) s.bankIn += amount;
  else s.cash[to] = (s.cash[to] ?? 0) + amount;
  events.push({ type: "pay", from, to, amount, reason, ...about });
}

/** 별자리 잇기 사건: 이 사람이 이 별자리 별을 둘 이상 가졌으면 알린다 */
function announceLinks(
  s: GalaxyState,
  seat: number,
  squares: readonly number[],
  events: GameEvent[],
): void {
  const groups = new Set<number>();
  for (const sq of squares) {
    const star = starAt(s.board, sq);
    if (star) groups.add(star.group);
  }
  for (const group of [...groups].sort((a, b) => a - b)) {
    const owned = ownedInGroup(s, seat, group);
    const size = s.board.groups[group]?.squares.length ?? 0;
    if (owned >= 2) events.push({ type: "linked", seat, group, owned, size });
  }
}

function finish(
  s: GalaxyState,
  kind: GameResult["kind"],
  seat: number | null,
  events: GameEvent[],
): void {
  const losers =
    seat !== null &&
    (kind === "resign" || kind === "time" || kind === "forfeit")
      ? [seat]
      : [];
  const result: GameResult = { kind, seat, standings: standingsOf(s, losers) };
  s.result = result;
  s.phase = "gameOver";
  s.auction = null;
  s.trade = null;
  s.debt = null;
  events.push({ type: "gameEnded", result });
}

function startTurn(s: GalaxyState, seat: number, events: GameEvent[]): void {
  s.turn = {
    seat,
    doubles: 0,
    rolls: 0,
    offered: false,
    next: s.jailed[seat] ? "jailRoll" : "roll",
    again: false,
  };
  s.phase = "turn";
  events.push({ type: "turnStarted", seat, round: s.round });
}

/** 멈춘 칸의 일을 마쳤다: 같은 눈이면 한 번 더, 아니면 차례 마치기를 기다린다 */
function continueTurn(s: GalaxyState, events: GameEvent[]): void {
  if (s.phase === "gameOver") return;
  const seat = s.turn.seat;
  if (s.out[seat]) {
    endTurn(s, events);
    return;
  }
  s.phase = "turn";
  s.turn.next = s.turn.again && !s.jailed[seat] ? "roll" : "end";
}

/** 차례를 넘긴다. 돌림이 끝나면 차례 수·시간 상한을 보고 판을 끝낸다 */
function endTurn(s: GalaxyState, events: GameEvent[]): void {
  if (s.phase === "gameOver") return;
  if (s.endAfterTurn) {
    const outSeat = s.out.indexOf(true);
    finish(s, "bankrupt", outSeat >= 0 ? outSeat : null, events);
    return;
  }
  const n = s.rules.players;
  let next = s.turn.seat;
  let crossed = false;
  for (let k = 1; k <= n; k++) {
    const cand = (s.turn.seat + k) % n;
    if (cand === s.starter) crossed = true;
    if (!s.out[cand]) {
      next = cand;
      break;
    }
  }
  if (crossed) {
    const limit = turnLimitOf(s.rules);
    if (s.timeUp) {
      finish(s, "timeUp", null, events);
      return;
    }
    if (limit !== null && s.round >= limit) {
      finish(s, "turns", null, events);
      return;
    }
    s.round += 1;
    const season = seasonFor(s.rules, s.round);
    if (season !== s.season) {
      s.season = season;
      if (season !== null) events.push({ type: "seasonChanged", season });
    }
    const meteor = meteorFor(s.rules, s.round);
    if (meteor && !s.meteor) events.push({ type: "meteorShower" });
    s.meteor = meteor;
  }
  startTurn(s, next, events);
}

/** 운항 중단(2-9): 남에게 낼 빚이면 별(맡긴 그대로)과 별빛이 그 사람에게, 우주국 빚이면 별은 주인 없이 돌아간다 */
function bankrupt(
  s: GalaxyState,
  seat: number,
  to: number,
  events: GameEvent[],
): void {
  const stars = STAR_SQUARES.filter((sq) => s.owners[sq] === seat);
  for (const sq of stars) {
    const level = s.levels[sq] ?? 1;
    if (level > 1) {
      pay(s, events, BANK, seat, (level - 1) * sellValue(s.board, sq), "sell", {
        square: sq,
      });
      s.levels[sq] = 1;
    }
  }
  pay(s, events, seat, to, s.cash[seat] ?? 0, "bankrupt");
  for (const sq of stars) {
    if (to === BANK) {
      s.owners[sq] = -1;
      s.levels[sq] = 0;
      s.mortgaged[sq] = false;
    } else {
      s.owners[sq] = to;
    }
  }
  s.out[seat] = true;
  s.jailed[seat] = false;
  events.push({ type: "bankrupt", seat, to });
  if (to !== BANK) announceLinks(s, to, stars, events);
  if (endsOnFirstBankrupt(s.rules)) s.endAfterTurn = true;
  else if (activeSeats(s).length <= 1) finish(s, "lastStanding", null, events);
}

/**
 * 내야 할 돈. 있으면 바로 내고 "done", 모자라지만 정리하면 낼 수 있으면 빚 정리 단계로 "wait",
 * 정리해도 모자라면 운항 중단하고 "done"
 */
function charge(
  s: GalaxyState,
  seat: number,
  to: number,
  amount: number,
  reason: PayReason,
  events: GameEvent[],
  about: { square?: number; card?: number } = {},
): "done" | "wait" {
  if (amount <= 0) return "done";
  if ((s.cash[seat] ?? 0) >= amount) {
    pay(s, events, seat, to, amount, reason, about);
    return "done";
  }
  if (liquidationOf(s, seat) >= amount) {
    const debt: Debt = { seat, to, amount, reason };
    s.debt = debt;
    s.phase = "debt";
    events.push({ type: "debt", debt: { ...debt } });
    return "wait";
  }
  bankrupt(s, seat, to, events);
  return "done";
}

/** 빚 정리 중 별빛이 넉넉해지면 갚고 차례를 잇는다 */
function settleDebt(s: GalaxyState, events: GameEvent[]): void {
  const debt = s.debt;
  if (!debt || (s.cash[debt.seat] ?? 0) < debt.amount) return;
  pay(s, events, debt.seat, debt.to, debt.amount, debt.reason);
  s.debt = null;
  continueTurn(s, events);
}

/** 앞으로 `steps`칸. 우주국을 지나거나 멈추면 지원금 */
function moveForward(
  s: GalaxyState,
  seat: number,
  steps: number,
  via: "dice" | "comet",
  events: GameEvent[],
): void {
  const from = s.positions[seat] as number;
  const path: number[] = [];
  for (let i = 1; i <= steps; i++) path.push((from + i) % BOARD_SIZE);
  const to = path.at(-1) as number;
  s.positions[seat] = to;
  events.push({ type: "moved", seat, from, to, path, forward: true, via });
  if (path.includes(BASE)) pay(s, events, BANK, seat, NUMBERS.salary, "salary");
}

/** 공문으로 곧장 간다. 앞으로 가며 우주국을 지나면(`salary`) 지원금 */
function jumpTo(
  s: GalaxyState,
  seat: number,
  target: number,
  salary: boolean,
  events: GameEvent[],
): void {
  const from = s.positions[seat] as number;
  s.positions[seat] = target;
  events.push({
    type: "moved",
    seat,
    from,
    to: target,
    path: [target],
    forward: salary,
    via: "card",
  });
  if (salary && (target === BASE || target < from))
    pay(s, events, BANK, seat, NUMBERS.salary, "salary");
}

/** 소행성대로 보내 걸리게 한다 */
function sendToAsteroid(
  s: GalaxyState,
  seat: number,
  by: "card" | "doubles",
  events: GameEvent[],
): void {
  const from = s.positions[seat] as number;
  s.positions[seat] = ASTEROID;
  events.push({
    type: "moved",
    seat,
    from,
    to: ASTEROID,
    path: [ASTEROID],
    forward: false,
    via: by === "card" ? "card" : "dice",
  });
  s.turn.again = false;
  s.jailed[seat] = true;
  events.push({ type: "jailed", seat, by });
}

/** 가진 별 가운데 별 사실에 맞는 칸 */
function ownedFact(s: GalaxyState, seat: number, fact: StarFact): number[] {
  return STAR_SQUARES.filter((sq) => {
    const star = starAt(s.board, sq);
    return (
      s.owners[sq] === seat && star !== null && matchesFact(star.star, fact)
    );
  });
}

/** 공문 한 장을 편다(4-2). 남은 공문이 없으면 다시 채운다 */
function drawCard(
  s: GalaxyState,
  seat: number,
  link: string,
  events: GameEvent[],
): "done" | "wait" {
  if (s.deck.length === 0) s.deck = activeCards(s.board);
  if (s.deck.length === 0) return "done";
  const index = drawIndex(s.deck.length, link);
  const card = s.deck.splice(index, 1)[0] as number;
  return applyCard(s, seat, card, link, events);
}

/** 공문의 효과(2-6) */
function applyCard(
  s: GalaxyState,
  seat: number,
  card: number,
  link: string,
  events: GameEvent[],
): "done" | "wait" {
  const about = { card };
  const active = activeSeats(s);
  const shown = (squares: number[]) =>
    events.push({ type: "card", seat, card, squares });
  switch (card) {
    case 1:
      shown([]);
      pay(s, events, BANK, seat, CARD_AMOUNTS.thanks, "card", about);
      return "done";
    case 2: {
      const squares = ownedFact(s, seat, "firstMagnitude");
      shown(squares);
      pay(
        s,
        events,
        BANK,
        seat,
        CARD_AMOUNTS.firstMagnitude * squares.length,
        "card",
        about,
      );
      return "done";
    }
    case 3: {
      const squares = active.flatMap((p) => ownedFact(s, p, "blue"));
      shown(squares);
      for (const p of active)
        if (ownedFact(s, p, "blue").length > 0)
          pay(s, events, BANK, p, CARD_AMOUNTS.blue, "card", about);
      return "done";
    }
    case 4: {
      const squares = ownedFact(s, seat, "far");
      shown(squares);
      pay(
        s,
        events,
        BANK,
        seat,
        CARD_AMOUNTS.far * squares.length,
        "card",
        about,
      );
      return "done";
    }
    case 5:
      shown([]);
      for (const p of active)
        pay(s, events, BANK, p, CARD_AMOUNTS.supply, "card", about);
      return "done";
    case 6: {
      let amount = 0;
      const squares: number[] = [];
      for (const sq of STAR_SQUARES) {
        if (s.owners[sq] !== seat || s.mortgaged[sq]) continue;
        const level = s.levels[sq] ?? 0;
        amount +=
          level >= 4
            ? CARD_AMOUNTS.inspectGrand
            : level * CARD_AMOUNTS.inspectLevel;
        squares.push(sq);
      }
      shown(squares);
      return charge(s, seat, BANK, amount, "card", events, about);
    }
    case 7:
      shown([]);
      return charge(s, seat, BANK, CARD_AMOUNTS.dust, "card", events, about);
    case 8: {
      const squares = ownedFact(s, seat, "red");
      shown(squares);
      return charge(
        s,
        seat,
        BANK,
        CARD_AMOUNTS.red * squares.length,
        "card",
        events,
        about,
      );
    }
    case 9: {
      shown([]);
      const ranking = standingsOf(s).filter((r) => !r.out);
      const richest = ranking[0];
      const poorest = ranking.at(-1);
      if (!richest || !poorest || richest.rank === poorest.rank) return "done";
      return charge(
        s,
        richest.seat,
        poorest.seat,
        CARD_AMOUNTS.support,
        "card",
        events,
        about,
      );
    }
    case 10: {
      const squares = ownedFact(s, seat, "near");
      shown(squares);
      pay(
        s,
        events,
        BANK,
        seat,
        CARD_AMOUNTS.near * squares.length,
        "card",
        about,
      );
      return "done";
    }
    case 11:
      shown([]);
      sendToAsteroid(s, seat, "card", events);
      return "done";
    case 12: {
      const squares = ownedFact(s, seat, "yellow");
      shown(squares);
      pay(
        s,
        events,
        BANK,
        seat,
        CARD_AMOUNTS.yellow * squares.length,
        "card",
        about,
      );
      return "done";
    }
    case 13:
      // 관측지로 옮기기만 한다(관측 지원금 없음, bench: 지원금까지 주면 평균 이득이 ±60을 넘었다)
      shown([]);
      jumpTo(s, seat, OBSERVATORY, true, events);
      events.push({ type: "landed", seat, square: OBSERVATORY });
      return "done";
    case 14: {
      shown([]);
      const side = sideOf(s.positions[seat] as number) ?? 0;
      jumpTo(s, seat, firstStarOfSide(side + 1), true, events);
      return land(s, seat, link, events, true);
    }
    case 15:
      shown([]);
      jumpTo(s, seat, COMET, true, events);
      return land(s, seat, link, events);
    case 16: {
      // 같은 별자리 별을 둘 이상 가진 별자리마다(완성하면 더). 맡긴 별도 센다(이용료 셈과 같다)
      let amount = 0;
      const squares: number[] = [];
      s.board.groups.forEach((group, g) => {
        const owned = ownedInGroup(s, seat, g);
        if (owned < 2) return;
        amount +=
          owned >= group.squares.length
            ? CARD_AMOUNTS.lineSurveyComplete
            : CARD_AMOUNTS.lineSurvey;
        squares.push(...group.squares.filter((sq) => s.owners[sq] === seat));
      });
      shown(squares);
      pay(s, events, BANK, seat, amount, "card", about);
      return "done";
    }
    default:
      return "done";
  }
}

/** 멈춘 칸의 일(2-4 3번, 2-5). `halfRent`는 공문 14(이용료 반) */
function land(
  s: GalaxyState,
  seat: number,
  link: string,
  events: GameEvent[],
  halfRent = false,
): "done" | "wait" {
  const square = s.positions[seat] as number;
  events.push({ type: "landed", seat, square });
  const kind = s.board.squares[square]?.kind;
  switch (kind) {
    case "observatory": {
      const amount = observatoryGrant(s, seat);
      events.push({ type: "observed", seat, amount });
      pay(s, events, BANK, seat, amount, "observatory");
      return "done";
    }
    case "comet":
      s.phase = "turn";
      s.turn.next = "comet";
      return "wait";
    case "notice":
      return drawCard(s, seat, link, events);
    case "star": {
      const owner = s.owners[square] ?? -1;
      if (owner < 0) {
        s.phase = "buy";
        return "wait";
      }
      if (owner === seat) return "done";
      const rent = rentOf(s, square);
      const amount = halfRent ? Math.max(10, round10(rent, 500)) : rent;
      if (rent <= 0) return "done";
      return charge(s, seat, owner, amount, "rent", events, { square });
    }
    default:
      return "done";
  }
}

/** 굴린 눈을 쓴다(공개로 정해졌거나, 튜토리얼에서 정해 둔 눈) */
function applyDice(
  s: GalaxyState,
  purpose: RevealPurpose,
  dice: [number, number],
  link: string,
  index: number,
  events: GameEvent[],
): void {
  const seat = s.turn.seat;
  const doubles = dice[0] === dice[1];
  const sum = dice[0] + dice[1];
  s.lastRoll = { seat, index, dice, purpose };
  events.push({ type: "dice", seat, index, dice, doubles, purpose });
  s.turn.rolls += 1;
  if (purpose === "roll") {
    if (doubles) {
      s.turn.doubles += 1;
      if (s.turn.doubles >= 3) {
        sendToAsteroid(s, seat, "doubles", events);
        continueTurn(s, events);
        return;
      }
    }
    s.turn.again = doubles;
    moveForward(s, seat, sum, "dice", events);
  } else if (purpose === "jailRoll") {
    s.jailed[seat] = false;
    s.turn.again = false;
    if (!doubles) {
      // 이번 차례는 쉬고, 다음 차례에는 그냥 나간다(최대 한 차례).
      events.push({ type: "freed", seat, by: "wait" });
      continueTurn(s, events);
      return;
    }
    events.push({ type: "freed", seat, by: "doubles" });
    moveForward(s, seat, sum, "dice", events);
  } else {
    // 혜성: 같은 눈이어도 한 번 더 없음. 이번 차례의 같은 눈 한 번 더는 그대로 남는다.
    moveForward(s, seat, sum, "comet", events);
  }
  if (land(s, seat, link, events) === "done") continueTurn(s, events);
}

/** 짧은 판 시작 별을 나눈다 */
function applyDeal(s: GalaxyState, hash: string, events: GameEvent[]): void {
  const seats = activeSeats(s);
  const hands = dealStars(
    hash,
    s.board.groups.map((g) => g.squares),
    seats,
    NUMBERS.dealStars[s.rules.length],
  );
  const stars: number[][] = s.cash.map(() => []);
  hands.forEach((hand, i) => {
    const seat = seats[i] as number;
    for (const sq of hand) {
      s.owners[sq] = seat;
      s.levels[sq] = 1;
    }
    stars[seat] = [...hand];
  });
  events.push({ type: "dealt", stars });
  seats.forEach((seat) => {
    announceLinks(s, seat, stars[seat] ?? [], events);
  });
  startTurn(s, s.starter, events);
}

/** 공개를 연다. 남은 자리 사슬을 다 썼으면 모두 다시 약속한다 */
function openReveal(
  s: GalaxyState,
  purpose: RevealPurpose,
  events: GameEvent[],
): void {
  s.revealFor = purpose;
  s.reveals = s.reveals.map(() => null);
  const active = activeSeats(s);
  if (active.some((seat) => (s.chains[seat]?.used ?? 0) >= CHAIN_LENGTH)) {
    s.generation += 1;
    s.chains = s.chains.map(() => ({ commit: null, last: null, used: 0 }));
    s.phase = "commit";
    events.push({ type: "recommit", generation: s.generation });
    return;
  }
  s.phase = "reveal";
}

/** 남은 자리 고리가 모두 모였다 */
function resolveReveal(s: GalaxyState, events: GameEvent[]): void {
  const links = activeSeats(s).map((seat) => s.reveals[seat] as string);
  const index = s.revealCount;
  const hash = rollHash(index, links);
  const purpose = s.revealFor ?? "roll";
  s.revealCount += 1;
  s.reveals = s.reveals.map(() => null);
  s.revealFor = null;
  if (purpose === "deal") {
    applyDeal(s, hash, events);
    return;
  }
  applyDice(s, purpose, diceFrom(hash), hash, index, events);
}

/** 봉인 입찰을 판정한다(2-7) */
function resolveAuction(s: GalaxyState, events: GameEvent[]): void {
  const auction = s.auction;
  if (!auction) return;
  const bids = s.cash.map((_, seat) => {
    if (s.out[seat]) return null;
    const r = auction.reveals[seat];
    return r?.valid ? r.value : 0;
  });
  const n = s.rules.players;
  // 같은 값이면 넘긴 사람 다음 사람부터 앞선다(넘긴 사람이 마지막).
  const priority = Array.from(
    { length: n },
    (_, k) => (auction.passer + 1 + k) % n,
  );
  let winner: number | null = null;
  let price = 0;
  for (const seat of priority) {
    const bid = bids[seat] ?? 0;
    if (bid > price) {
      price = bid;
      winner = seat;
    }
  }
  if (winner !== null) {
    pay(s, events, winner, BANK, price, "bid", { square: auction.square });
    s.owners[auction.square] = winner;
    s.levels[auction.square] = 1;
    s.mortgaged[auction.square] = false;
  }
  const result: AuctionResult = {
    index: auction.index,
    square: auction.square,
    bids,
    winner,
    price,
  };
  s.lastAuction = result;
  s.auction = null;
  events.push({ type: "auctionEnded", result: { ...result, bids: [...bids] } });
  if (winner !== null) announceLinks(s, winner, [auction.square], events);
  continueTurn(s, events);
}

/** 거래할 수 있는 별인가(2-8): 내 별, 맡기지 않음, 그 별자리에 2단 이상 정거장이 없음 */
function tradable(s: GalaxyState, seat: number, square: number): boolean {
  const star = starAt(s.board, square);
  if (!star || s.owners[square] !== seat || s.mortgaged[square]) return false;
  const squares = s.board.groups[star.group]?.squares ?? [];
  return squares.every((sq) => (s.levels[sq] ?? 0) <= 1);
}

function checkSide(
  s: GalaxyState,
  seat: number,
  side: TradeSide,
  label: string,
): string | null {
  if (!side || !Array.isArray(side.stars)) return `${label} 형식이 아니에요`;
  if (!Number.isInteger(side.cash) || side.cash < 0)
    return `${label} 별빛은 0 이상의 정수여야 해요`;
  if (side.cash > (s.cash[seat] ?? 0))
    return `${label} 별빛이 가진 것보다 많아요`;
  if (new Set(side.stars).size !== side.stars.length)
    return `${label} 별이 겹쳐요`;
  for (const sq of side.stars)
    if (!Number.isInteger(sq) || !tradable(s, seat, sq))
      return `${label} 별 가운데 거래할 수 없는 별이 있어요(내 별이 아니거나, 맡겼거나, 2단 이상 정거장이 있는 별자리)`;
  return null;
}

/** 거래 제안이 지금 규칙에 맞는지. 맞으면 null, 아니면 까닭 */
export function tradeProblem(s: GalaxyState, offer: TradeOffer): string | null {
  const { from, to } = offer;
  if (!Number.isInteger(to) || to < 0 || to >= s.rules.players || to === from)
    return "거래할 상대가 아니에요";
  if (s.out[to]) return "판에서 빠진 우주인과는 거래할 수 없어요";
  const problem =
    checkSide(s, from, offer.give, "주는") ??
    checkSide(s, to, offer.get, "받는");
  if (problem) return problem;
  if (offer.give.stars.length + offer.get.stars.length === 0)
    return "별이 하나는 오가야 해요";
  return null;
}

function applyTrade(
  s: GalaxyState,
  offer: TradeOffer,
  events: GameEvent[],
): void {
  for (const sq of offer.give.stars) s.owners[sq] = offer.to;
  for (const sq of offer.get.stars) s.owners[sq] = offer.from;
  pay(s, events, offer.from, offer.to, offer.give.cash, "trade");
  pay(s, events, offer.to, offer.from, offer.get.cash, "trade");
  events.push({ type: "tradeAccepted", offer: cloneOffer(offer) });
  announceLinks(s, offer.to, offer.give.stars, events);
  announceLinks(s, offer.from, offer.get.stars, events);
}

/** 개인 시간: 결정에 쓴 시간을 깎는다. 시간을 넘겼으면 그 행동은 하지 않고 시간패로 끝내고 true */
function chargeClock(
  s: GalaxyState,
  seat: number,
  spent: number | undefined,
  events: GameEvent[],
): boolean {
  const control = timeControlOf(s.rules);
  if (!control || !s.clocks || clockTurn(s)?.seat !== seat) return false;
  const clock = s.clocks[seat] as PlayerClock;
  const result = spendTime(clock, spent ?? 0, control);
  s.clocks[seat] = result.clock;
  if (result.flagged) {
    finish(s, "time", seat, events);
    return true;
  }
  return false;
}

/* ───────────── 관리: 정거장·맡기기 ───────────── */

function manageProblem(
  s: GalaxyState,
  seat: number,
  action: Extract<
    Action,
    { type: "build" | "sell" | "mortgage" | "unmortgage" }
  >,
): string | null {
  const inTurn = s.phase === "turn" && s.turn.seat === seat;
  const inDebt = s.phase === "debt" && s.debt?.seat === seat;
  if (!inTurn && !inDebt) return "지금은 정거장이나 별을 정리할 때가 아니에요";
  if (inDebt && (action.type === "build" || action.type === "unmortgage"))
    return "빚을 정리하는 중에는 정거장을 내리거나 별을 맡기기만 할 수 있어요";
  const square = action.square;
  const star = Number.isInteger(square) ? starAt(s.board, square) : null;
  if (!star) return "별 칸이 아니에요";
  if (s.owners[square] !== seat) return "내 별이 아니에요";
  const squares = s.board.groups[star.group]?.squares ?? [];
  const levels = squares.map((sq) => s.levels[sq] ?? 0);
  const level = s.levels[square] ?? 0;
  switch (action.type) {
    case "build": {
      if (!isComplete(s, seat, star.group))
        return "별자리를 완성해야 정거장을 올릴 수 있어요";
      if (squares.some((sq) => s.mortgaged[sq]))
        return "맡긴 별이 있는 별자리는 올릴 수 없어요";
      if (level >= 4) return "이미 큰 정거장이에요";
      if (level > Math.min(...levels))
        return "한 별자리 안에서는 고르게 올려야 해요";
      if ((s.cash[seat] ?? 0) < levelCostAt(s.board, square))
        return "별빛이 모자라요";
      return null;
    }
    case "sell":
      if (level < 2) return "내릴 정거장이 없어요(1단은 별과 함께 있어요)";
      if (level < Math.max(...levels))
        return "한 별자리 안에서는 고르게 내려야 해요";
      return null;
    case "mortgage":
      if (s.mortgaged[square]) return "이미 맡긴 별이에요";
      if (levels.some((l) => l > 1))
        return "2단 이상 정거장이 있는 별자리는 먼저 정거장을 내려야 해요";
      return null;
    case "unmortgage":
      if (!s.mortgaged[square]) return "맡긴 별이 아니에요";
      if ((s.cash[seat] ?? 0) < unmortgageCost(s.board, square))
        return "별빛이 모자라요";
      return null;
  }
}

function applyManage(
  s: GalaxyState,
  seat: number,
  action: Extract<
    Action,
    { type: "build" | "sell" | "mortgage" | "unmortgage" }
  >,
  events: GameEvent[],
): void {
  const square = action.square;
  switch (action.type) {
    case "build":
      pay(s, events, seat, BANK, levelCostAt(s.board, square), "build", {
        square,
      });
      s.levels[square] = (s.levels[square] ?? 1) + 1;
      events.push({
        type: "built",
        seat,
        square,
        level: s.levels[square] as number,
      });
      break;
    case "sell":
      pay(s, events, BANK, seat, sellValue(s.board, square), "sell", {
        square,
      });
      s.levels[square] = (s.levels[square] ?? 2) - 1;
      events.push({
        type: "sold",
        seat,
        square,
        level: s.levels[square] as number,
      });
      break;
    case "mortgage":
      s.mortgaged[square] = true;
      pay(s, events, BANK, seat, mortgageValue(s.board, square), "mortgage", {
        square,
      });
      events.push({ type: "mortgaged", seat, square });
      break;
    case "unmortgage":
      pay(
        s,
        events,
        seat,
        BANK,
        unmortgageCost(s.board, square),
        "unmortgage",
        {
          square,
        },
      );
      s.mortgaged[square] = false;
      events.push({ type: "unmortgaged", seat, square });
      break;
  }
  if (s.phase === "debt") settleDebt(s, events);
}

/* ───────────── 걸음 ───────────── */

function retire(state: GalaxyState): StepResult {
  if (state.phase === "gameOver") return fail("이미 끝난 게임이에요");
  const next = clone(state);
  const events: GameEvent[] = [];
  const pending = pendingSeats(state);
  const together =
    state.phase === "commit" ||
    state.phase === "reveal" ||
    state.phase === "bid" ||
    state.phase === "bidReveal";
  if (together && pending.length === 1) {
    finish(next, "forfeit", pending[0] as number, events);
    next.retired = true;
    const ended = events.at(-1);
    if (ended?.type === "gameEnded") ended.retired = true;
  } else {
    next.phase = "gameOver";
    next.retired = true;
    events.push({ type: "gameEnded", result: null, retired: true });
  }
  return { ok: true, state: next, events };
}

export function step(
  state: GalaxyState,
  seat: number,
  action: Action,
): StepResult {
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.rules.players)
    return fail("없는 자리예요");
  if (!action || typeof action !== "object") return fail("모르는 행동이에요");
  if (state.phase === "gameOver") return fail("이미 끝난 게임이에요");
  if (action.type === "retire") return retire(state);
  if (state.out[seat]) return fail("운항을 멈춘 우주인이에요");
  const next = clone(state);
  const events: GameEvent[] = [];
  const done = (): StepResult => ({ ok: true, state: next, events });
  // 결정에 쓴 시간을 먼저 깎는다. 넘겼으면 그 행동은 하지 않고 시간패.
  const spent = "spent" in action ? action.spent : undefined;
  const timed =
    action.type !== "timeout" &&
    action.type !== "timeUp" &&
    action.type !== "resign" &&
    "spent" in action;
  const charged = (): boolean =>
    timed && chargeClock(next, seat, spent, events);

  switch (action.type) {
    case "resign":
      finish(next, "resign", seat, events);
      return done();
    case "timeUp":
      if (state.rules.length === "long")
        return fail("긴 판은 시간 상한이 없어요");
      if (state.timeUp) return fail("이미 시간 상한에 닿았어요");
      next.timeUp = true;
      events.push({ type: "timeUp" });
      return done();
    case "timeout": {
      const control = timeControlOf(state.rules);
      if (!control || clockTurn(state)?.seat !== seat)
        return fail("시계가 가는 차례가 아니에요");
      const clock = (state.clocks as PlayerClock[])[seat] as PlayerClock;
      if (!spendTime(clock, action.spent, control).flagged)
        return fail("아직 시간이 남았어요");
      (next.clocks as PlayerClock[])[seat] = { main: 0, periods: 0 };
      finish(next, "time", seat, events);
      return done();
    }
    case "commit": {
      if (state.phase !== "commit") return fail("약속할 때가 아니에요");
      const chain = state.chains[seat];
      if (!chain || chain.commit !== null) return fail("이미 약속했어요");
      if (typeof action.hash !== "string" || !LINK_PATTERN.test(action.hash))
        return fail("약속 형식이 아니에요");
      next.chains[seat] = { commit: action.hash, last: action.hash, used: 0 };
      events.push({ type: "committed", seat });
      if (activeSeats(next).every((s) => next.chains[s]?.commit !== null)) {
        if (next.revealFor) next.phase = "reveal";
        else startTurn(next, next.starter, events);
      }
      return done();
    }
    case "reveal": {
      if (state.phase !== "reveal") return fail("공개할 때가 아니에요");
      if (state.reveals[seat] !== null) return fail("이미 공개했어요");
      const chain = state.chains[seat];
      if (!chain?.last) return fail("약속이 없어요");
      if (typeof action.link !== "string" || !LINK_PATTERN.test(action.link))
        return fail("고리 형식이 아니에요");
      if (chainHash(action.link) !== chain.last)
        return fail("약속한 사슬의 다음 고리가 아니에요");
      next.reveals[seat] = action.link;
      next.chains[seat] = {
        commit: chain.commit,
        last: action.link,
        used: chain.used + 1,
      };
      events.push({ type: "revealed", seat });
      if (activeSeats(next).every((s) => next.reveals[s] !== null))
        resolveReveal(next, events);
      return done();
    }
    case "roll": {
      if (state.phase !== "turn") return fail("굴릴 때가 아니에요");
      if (state.turn.seat !== seat) return fail("차례가 아니에요");
      const purpose = state.turn.next;
      if (purpose === "end")
        return fail("이번 차례는 더 굴리지 않아요. 차례를 마쳐 주세요");
      if (charged()) return done();
      events.push({ type: "rolled", seat, purpose });
      openReveal(next, purpose, events);
      return done();
    }
    case "payFine": {
      if (state.phase !== "turn" || state.turn.seat !== seat)
        return fail("차례가 아니에요");
      if (state.turn.next !== "jailRoll")
        return fail("소행성대에 걸리지 않았어요");
      if ((state.cash[seat] ?? 0) < NUMBERS.asteroidFine)
        return fail("별빛이 모자라요");
      if (charged()) return done();
      pay(next, events, seat, BANK, NUMBERS.asteroidFine, "fine");
      next.jailed[seat] = false;
      next.turn.next = "roll";
      events.push({ type: "freed", seat, by: "fine" });
      return done();
    }
    case "buy": {
      if (state.phase !== "buy" || state.turn.seat !== seat)
        return fail("살 때가 아니에요");
      const square = state.positions[seat] as number;
      const price = starAt(state.board, square)?.value ?? 0;
      if ((state.cash[seat] ?? 0) < price) return fail("별빛이 모자라요");
      if (charged()) return done();
      pay(next, events, seat, BANK, price, "buy", { square });
      next.owners[square] = seat;
      next.levels[square] = 1;
      events.push({ type: "bought", seat, square, price });
      announceLinks(next, seat, [square], events);
      continueTurn(next, events);
      return done();
    }
    case "pass": {
      if (state.phase !== "buy" || state.turn.seat !== seat)
        return fail("넘길 때가 아니에요");
      if (charged()) return done();
      const square = state.positions[seat] as number;
      const index = state.auctionCount;
      next.auctionCount += 1;
      next.auction = {
        index,
        square,
        passer: seat,
        commits: state.cash.map(() => null),
        reveals: state.cash.map(() => null),
      };
      next.phase = "bid";
      events.push({ type: "auctionStarted", index, square, passer: seat });
      return done();
    }
    case "bid": {
      const auction = next.auction;
      if (state.phase !== "bid" || !auction)
        return fail("입찰할 때가 아니에요");
      if (auction.commits[seat] !== null) return fail("이미 입찰했어요");
      if (typeof action.hash !== "string" || !HASH_PATTERN.test(action.hash))
        return fail("입찰 약속 형식이 아니에요");
      auction.commits[seat] = action.hash;
      events.push({ type: "bidCommitted", seat });
      if (activeSeats(next).every((s) => auction.commits[s] !== null))
        next.phase = "bidReveal";
      return done();
    }
    case "bidReveal": {
      const auction = next.auction;
      if (state.phase !== "bidReveal" || !auction)
        return fail("입찰을 공개할 때가 아니에요");
      const commit = auction.commits[seat];
      if (!commit) return fail("입찰하지 않았어요");
      if (auction.reveals[seat] !== null) return fail("이미 공개했어요");
      if (typeof action.salt !== "string" || !SALT_PATTERN.test(action.salt))
        return fail("소금 형식이 아니에요");
      if (!Number.isInteger(action.value) || action.value < 0)
        return fail("입찰 값은 0 이상의 정수여야 해요");
      if (bidCommitment(auction.index, action.value, action.salt) !== commit)
        return fail("약속한 입찰 값과 달라요");
      const value = action.value;
      const valid =
        value === 0 ||
        (value >= 10 && value % 10 === 0 && value <= (state.cash[seat] ?? 0));
      auction.reveals[seat] = { value, salt: action.salt, valid };
      events.push({ type: "bidRevealed", seat });
      if (activeSeats(next).every((s) => auction.reveals[s] !== null))
        resolveAuction(next, events);
      return done();
    }
    case "offer": {
      if (!state.rules.trade) return fail("거래를 끈 판이에요");
      if (state.phase !== "turn" || state.turn.seat !== seat)
        return fail("거래는 내 차례에만 제안할 수 있어요");
      if (
        state.turn.rolls > 0 ||
        state.turn.next === "comet" ||
        state.turn.next === "end"
      )
        return fail("거래는 굴리기 전에만 제안할 수 있어요");
      if (state.turn.offered)
        return fail("이번 차례에는 이미 거래를 제안했어요");
      const offer: TradeOffer = {
        from: seat,
        to: action.to,
        give: {
          stars: [...(action.give?.stars ?? [])],
          cash: action.give?.cash ?? 0,
        },
        get: {
          stars: [...(action.get?.stars ?? [])],
          cash: action.get?.cash ?? 0,
        },
      };
      const problem = tradeProblem(state, offer);
      if (problem) return fail(problem);
      if (charged()) return done();
      next.trade = offer;
      next.turn.offered = true;
      next.phase = "trade";
      events.push({ type: "tradeOffered", offer: cloneOffer(offer) });
      return done();
    }
    case "acceptTrade":
    case "rejectTrade": {
      const offer = state.trade;
      if (state.phase !== "trade" || !offer) return fail("답할 거래가 없어요");
      if (offer.to !== seat) return fail("나에게 온 거래가 아니에요");
      if (action.type === "acceptTrade") {
        const problem = tradeProblem(state, offer);
        if (problem) return fail(problem);
      }
      if (charged()) return done();
      if (action.type === "acceptTrade") applyTrade(next, offer, events);
      else events.push({ type: "tradeRejected", offer: cloneOffer(offer) });
      next.trade = null;
      next.phase = "turn";
      return done();
    }
    case "build":
    case "sell":
    case "mortgage":
    case "unmortgage": {
      const problem = manageProblem(state, seat, action);
      if (problem) return fail(problem);
      if (charged()) return done();
      applyManage(next, seat, action, events);
      return done();
    }
    case "end": {
      if (state.phase !== "turn" || state.turn.seat !== seat)
        return fail("차례가 아니에요");
      if (state.turn.next !== "end") return fail("아직 굴려야 해요");
      if (charged()) return done();
      endTurn(next, events);
      return done();
    }
    default:
      return fail("모르는 행동이에요");
  }
}

/**
 * 튜토리얼·시험용: 정해 둔 눈으로 굴린 것처럼 한다(사슬 공개 없이).
 * 기록 다시 두기(`replay`)에는 들어가지 않는다
 */
export function stepWithDice(
  state: GalaxyState,
  seat: number,
  dice: [number, number],
): StepResult {
  if (state.phase !== "turn" || state.turn.seat !== seat)
    return fail("굴릴 때가 아니에요");
  const purpose = state.turn.next;
  if (purpose === "end") return fail("이번 차례는 더 굴리지 않아요");
  if (!dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6))
    return fail("주사위 눈은 1~6이에요");
  const next = clone(state);
  const events: GameEvent[] = [{ type: "rolled", seat, purpose }];
  const index = next.revealCount;
  next.revealCount += 1;
  const link = sha256Hex(`galaxy-fixed|${index}|${dice.join(",")}`);
  applyDice(next, purpose, [dice[0], dice[1]], link, index, events);
  return { ok: true, state: next, events };
}

/* ───────────── 화면·기록 ───────────── */

function decisionFor(state: GalaxyState, seat: number): Decision | null {
  if (!pendingSeats(state).includes(seat)) return null;
  switch (state.phase) {
    case "commit":
      return { kind: "commit" };
    case "reveal":
      return { kind: "reveal", purpose: state.revealFor ?? "roll" };
    case "turn": {
      const next = state.turn.next;
      if (next === "end") return { kind: "end" };
      return {
        kind: "roll",
        purpose: next,
        canPayFine:
          next === "jailRoll" &&
          (state.cash[seat] ?? 0) >= NUMBERS.asteroidFine,
        canOffer:
          state.rules.trade && state.turn.rolls === 0 && !state.turn.offered,
      };
    }
    case "buy": {
      const square = state.positions[seat] as number;
      const price = starAt(state.board, square)?.value ?? 0;
      return {
        kind: "buy",
        square,
        price,
        canAfford: (state.cash[seat] ?? 0) >= price,
      };
    }
    case "bid":
      return state.auction
        ? {
            kind: "bid",
            index: state.auction.index,
            square: state.auction.square,
            max: state.cash[seat] ?? 0,
          }
        : null;
    case "bidReveal":
      return state.auction
        ? { kind: "bidReveal", index: state.auction.index }
        : null;
    case "trade":
      return state.trade
        ? { kind: "trade", offer: cloneOffer(state.trade) }
        : null;
    case "debt":
      return state.debt ? { kind: "debt", debt: { ...state.debt } } : null;
    default:
      return null;
  }
}

/** 한 자리에서 본 화면. 남의 재료와 아직 끝나지 않은 입찰 값은 보이지 않는다 */
export function viewOf(state: GalaxyState, seat: number): GalaxyView {
  const { keys, auction, ...rest } = clone(state);
  return {
    ...rest,
    auction: auction
      ? {
          index: auction.index,
          square: auction.square,
          passer: auction.passer,
          committed: auction.commits.map((c) => c !== null),
          revealed: auction.reveals.map((r) => r !== null),
          myCommit: auction.commits[seat] ?? null,
        }
      : null,
    mySeat: seat,
    decision: decisionFor(state, seat),
    botKey: keys[seat] ?? "",
  };
}

/**
 * 지금 이 자리가 할 수 있는 행동(값을 고르지 않는 것만): 굴리기·50 내기·사기·넘기기·차례 마치기·
 * 거래 답·정거장 올리기·내리기·맡기기·되찾기. 약속·공개·입찰·거래 제안은 값이 있어 넣지 않는다
 */
export function legalActions(state: GalaxyState, seat: number): Action[] {
  const candidates: Action[] = [
    { type: "roll" },
    { type: "payFine" },
    { type: "buy" },
    { type: "pass" },
    { type: "end" },
    { type: "acceptTrade" },
    { type: "rejectTrade" },
  ];
  for (const square of STAR_SQUARES) {
    if (state.owners[square] !== seat) continue;
    candidates.push(
      { type: "build", square },
      { type: "sell", square },
      { type: "mortgage", square },
      { type: "unmortgage", square },
    );
  }
  return candidates.filter((action) => step(state, seat, action).ok);
}

/**
 * 빚 정리 제안(2-9, 7-5): 높은 정거장부터 고르게 내리고, 그래도 모자라면 싼 별부터 맡긴다.
 * 빚이 없으면 빈 목록
 */
export function debtPlan(state: GalaxyState): Action[] {
  const plan: Action[] = [];
  let s = state;
  while (s.phase === "debt" && s.debt && s.debt.seat === state.debt?.seat) {
    const seat = s.debt.seat;
    const owned = STAR_SQUARES.filter((sq) => s.owners[sq] === seat);
    const sells = owned
      .filter((sq) => step(s, seat, { type: "sell", square: sq }).ok)
      .sort(
        (a, b) =>
          (s.levels[b] ?? 0) - (s.levels[a] ?? 0) ||
          sellValue(s.board, b) - sellValue(s.board, a) ||
          a - b,
      );
    const mortgages = owned
      .filter((sq) => step(s, seat, { type: "mortgage", square: sq }).ok)
      .sort(
        (a, b) =>
          mortgageValue(s.board, a) - mortgageValue(s.board, b) || a - b,
      );
    const square = sells[0] ?? mortgages[0];
    if (square === undefined) break;
    const action: Action =
      sells[0] !== undefined
        ? { type: "sell", square }
        : { type: "mortgage", square };
    const result = step(s, seat, action);
    if (!result.ok) break;
    plan.push(action);
    s = result.state;
  }
  return plan;
}

export interface LoggedAction {
  seat: number;
  action: Action;
}

/** 기록대로 다시 둔다(온라인 판 끝 검증·복기·무르기) */
export function replay(
  rules: GalaxyRules,
  seed: number,
  board: GalaxyBoard,
  log: readonly LoggedAction[],
):
  | { ok: true; state: GalaxyState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed, board);
  for (const [index, entry] of log.entries()) {
    const result = step(state, entry.seat, entry.action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}

/** 공문 갈래(화면 색 등) */
export function cardKind(card: number): CardKind {
  return cardById(card).kind;
}
