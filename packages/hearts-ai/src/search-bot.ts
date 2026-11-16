import {
  type Action,
  type CompletedTrick,
  HAND_SIZE,
  type HeartsRules,
  heartsDeck,
  isHeart,
  type PassDirection,
  type PlayerView,
  passTarget,
  playableCards,
  pointsOf,
  QUEEN_OF_SPADES,
  type Trick,
  trickWinner,
} from "@game/hearts-engine";
import {
  type Card,
  nextFloat,
  type RngState,
  rankPower,
  type Suit,
  shuffleInPlace,
  suitOf,
} from "@game/mighty-engine";

import {
  type HeartsBot,
  knownVoids,
  moonThreat,
  passedTo,
  playedCards,
} from "./knowledge";
import {
  handLooksMoony,
  heartsGuardBot,
  heartsMoonBot,
  moonHopeful,
} from "./moon";
import {
  chance,
  forgets,
  type HeartsPersona,
  heartsPersonaForSeat,
  isMemorable,
} from "./persona";
import { heartsNormalBot, passDanger } from "./rule-bot";

/*
 * 하트 고수: 카드를 낼 때 남의 손패를 여러 번 추측해 판 끝까지 둬 보고 고른다.
 *
 * 1. 지금까지 본 것과 어긋나지 않게 남의 손패를 추측한다:
 *    떨어진 무늬(선 무늬를 못 따라 낸 사람), 내가 넘겨준 카드(받은 사람이 아직 쥐고 있다).
 * 2. 추측한 판마다 낼 수 있는 카드 하나하나에 대해 남은 판을 중수끼리 끝까지 둔다.
 * 3. (다른 사람 평균 점수 − 내 점수)가 가장 큰 카드를 낸다. 문 슛도 점수 계산에 들어간다.
 * 4. 카드 넘기기도 같은 방법으로 고른다(중수의 3장을 기준으로, 확실히 나은 조합이 있으면 바꾼다).
 *
 * 점수 판: 이번 판에 누군가 게임 끝 점수를 넘길 수 있으면, 판 점수에 더해 게임 순위(1등·꼴찌)를 본다.
 * 내가 1등이면 다른 사람에게 점수를 몰아 게임을 끝내고, 아니면 끝나는 것을 늦추고 꼴찌를 피한다.
 *
 * 문 슛: 패가 좋고 아직 아무도 점수를 먹지 않았으면 "나는 문 슛을 노린다"는 계획으로도 둬 보고
 * 그쪽이 확실히 나으면 노린다. 남이 노리는 것 같으면 그 사람을 문 슛 봇으로 두어 보아, 막는 수가 나온다.
 *
 * 계산 시간: 추측 판 수 상한과 함께 시간 상한을 둔다(느린 기기 대비). 시계는 넣어 줄 수 있어
 * 시험은 시간을 정해 두고 결과가 늘 같다. 상한에 걸려도 최소 판 수는 채운다.
 *
 * 많이 해 본 사람처럼: 하트·♠Q·J 이상은 늘 세고 낮은 카드는 성향에 따라 가끔 잊는다.
 * 비슷한 수면 정석(중수의 수)을 따르고, 가끔은 비슷한 수 가운데 다른 수를 둔다.
 */

const PLAYERS: readonly number[] = [0, 1, 2, 3];

interface Sim {
  rules: HeartsRules;
  hands: Card[][];
  trick: Trick;
  trickIndex: number;
  tricks: CompletedTrick[];
  heartsBroken: boolean;
  taken: Card[][];
  done: boolean;
}

function cloneSim(sim: Sim): Sim {
  return {
    ...sim,
    hands: sim.hands.map((h) => [...h]),
    trick: { ...sim.trick, plays: [...sim.trick.plays] },
    tricks: [...sim.tricks],
    taken: sim.taken.map((t) => [...t]),
  };
}

function turnOf(sim: Sim): number {
  const last = sim.trick.plays[sim.trick.plays.length - 1];
  if (last) return (last.seat + 1) % 4;
  // 첫 턴 첫 카드는 ♣2를 가진 사람이 낸다.
  if (sim.trick.leader < 0)
    return Math.max(
      0,
      sim.hands.findIndex((h) => h.includes("C2" as Card)),
    );
  return sim.trick.leader;
}

/** 중수에게 넘길 화면. 중수가 읽는 칸만 채운다 */
function viewIn(sim: Sim, seat: number, cards: Card[]): PlayerView {
  return {
    seat,
    rules: sim.rules,
    players: [...PLAYERS],
    roundNumber: 1,
    phase: "play",
    direction: "none",
    hand: sim.hands[seat] ?? [],
    handCounts: sim.hands.map((h) => h.length),
    myPass: null,
    passReady: [true, true, true, true],
    received: [],
    trickIndex: sim.trickIndex,
    trick: sim.trick,
    tricks: sim.tricks,
    takenPoints: sim.taken.map((t) => pointsOf(t, sim.rules)),
    heartsBroken: sim.heartsBroken,
    turn: seat,
    scores: [0, 0, 0, 0],
    history: [],
    roundPoints: null,
    moonShooter: null,
    decision: { kind: "play", cards, leading: sim.trick.plays.length === 0 },
  };
}

function apply(sim: Sim, seat: number, card: Card): void {
  sim.hands[seat] = (sim.hands[seat] ?? []).filter((c) => c !== card);
  sim.trick.plays.push({ seat, card });
  if (
    isHeart(card) ||
    (sim.rules.queenBreaksHearts && card === QUEEN_OF_SPADES)
  )
    sim.heartsBroken = true;
  if (sim.trick.plays.length < 4) return;
  const winner = trickWinner(sim.trick);
  sim.taken[winner] = [
    ...(sim.taken[winner] ?? []),
    ...sim.trick.plays.map((p) => p.card),
  ];
  sim.tricks.push({ ...sim.trick, winner });
  if (sim.trickIndex >= HAND_SIZE - 1) {
    sim.done = true;
    return;
  }
  sim.trickIndex++;
  sim.trick = { leader: winner, plays: [] };
}

/** 시뮬레이션 안에서 자리마다 둘 봇. 기본은 모두 중수 */
type Policy = (seat: number) => HeartsBot;
const ALL_NORMAL: Policy = () => heartsNormalBot;

function playOut(sim: Sim, rng: RngState, policy: Policy = ALL_NORMAL): void {
  while (!sim.done) {
    const seat = turnOf(sim);
    const cards = playableCards(
      sim.rules,
      sim.hands[seat] ?? [],
      sim.trick,
      sim.trickIndex,
      sim.heartsBroken,
    );
    const action = policy(seat).decide(viewIn(sim, seat, cards), rng);
    const card = action.type === "play" ? action.card : (cards[0] as Card);
    apply(sim, seat, cards.includes(card) ? card : (cards[0] as Card));
  }
}

/** 판이 끝난 뒤 자리마다 받는 점수(문 슛 반영) */
function finalPoints(sim: Sim): number[] {
  const points = sim.taken.map((t) => pointsOf(t, sim.rules));
  const shooter = sim.taken.findIndex(
    (t) => t.filter(isHeart).length === 13 && t.includes(QUEEN_OF_SPADES),
  );
  if (shooter >= 0 && sim.rules.moon !== "off") {
    for (let s = 0; s < 4; s++) {
      if (sim.rules.moon === "others")
        points[s] =
          s === shooter ? (points[s] ?? 0) - 26 : (points[s] ?? 0) + 26;
      else if (s === shooter) points[s] = (points[s] ?? 0) - 52;
    }
  }
  return points;
}

/** 판 점수 계산의 조정값(실험용으로 바꿀 수 있다) */
export const HEARTS_TUNING = {
  /** 넘기기 후보 비교에서 오차를 얼마나 깎는가. 0이면 평균이 큰 쪽 */
  passZ: 0.5,
  /** 게임 순위 값의 무게(판 점수로 몇 점어치인가) */
  standingWeight: 26,
  /** 게임이 이어질 때 순위를 어림하는 점수 폭. 작을수록 지금 점수 차를 크게 본다 */
  standingSpread: 12,
  /** 문 슛 계획이 보통 계획보다 이만큼(판당 점수) 나아야 노린다 */
  moonMargin: 1,
  /** 문 슛 계획 비교에서 오차를 얼마나 깎는가(같은 추측 판끼리 짝지어 본 차이의 표준 오차 배수) */
  moonZ: 1,
};

/** 게임 순위를 볼 때 필요한 것: 이번 판 전 점수와 게임 끝 점수 */
export interface Standing {
  scores: readonly number[];
  endScore: number;
}

/**
 * 이번 판에 게임이 끝날 수 있는가(누군가 지금 점수 + 26 ≥ 끝 점수). 그럴 때만 순위를 본다.
 * 문 슛 규칙이 `others`면 다른 사람이 26점씩 받으니 그것도 같은 문턱에 든다.
 */
export function standingFor(view: PlayerView): Standing | null {
  const top = Math.max(...view.scores);
  if (top + 26 < view.rules.endScore) return null;
  return { scores: view.scores, endScore: view.rules.endScore };
}

/**
 * 게임 순위 값: 1등 몫 − 꼴찌 몫의 절반(0~1, 같은 점수면 나눈다).
 * 게임이 끝나면 정확한 순위, 이어지면 점수 차를 `standingSpread` 폭으로 부드럽게 어림한 순위.
 */
export function standingValue(
  totals: readonly number[],
  seat: number,
  endScore: number,
): number {
  const over = Math.max(...totals) >= endScore;
  if (over) {
    const low = Math.min(...totals);
    const high = Math.max(...totals);
    const mine = totals[seat] ?? 0;
    const lows = totals.filter((t) => t === low).length;
    const highs = totals.filter((t) => t === high).length;
    return (mine === low ? 1 / lows : 0) - (mine === high ? 0.5 / highs : 0);
  }
  const k = HEARTS_TUNING.standingSpread;
  const win = totals.map((t) => Math.exp(-(t - Math.min(...totals)) / k));
  const last = totals.map((t) => Math.exp((t - Math.max(...totals)) / k));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return (win[seat] ?? 0) / sum(win) - (0.5 * (last[seat] ?? 0)) / sum(last);
}

/** 판이 끝난 뒤 (다른 사람 평균 점수 − 내 점수). 게임 끝이 가까우면 순위 값을 더한다. 클수록 좋다 */
function utility(sim: Sim, seat: number, standing: Standing | null): number {
  const points = finalPoints(sim);
  const mine = points[seat] ?? 0;
  const others = points.reduce((a, b) => a + b, 0) - mine;
  const round = others / 3 - mine;
  if (!standing) return round;
  const totals = standing.scores.map((s, i) => s + (points[i] ?? 0));
  return (
    round +
    HEARTS_TUNING.standingWeight *
      standingValue(totals, seat, standing.endScore)
  );
}

/**
 * 남의 손패를 한 번 추측한다. 내가 넘겨준 카드는 받은 사람에게 먼저 주고,
 * 나머지는 떨어진 무늬를 피해 남은 장수에 맞춰 나눈다.
 */
export function sampleHeartsHands(
  view: PlayerView,
  rng: RngState,
  /** 잊은 카드. 어디 있는지 모르는 카드로 추측한다 */
  forgotten: ReadonlySet<Card> = new Set(),
): Card[][] | null {
  const seen = new Set<Card>(
    [...view.hand, ...playedCards(view)].filter((c) => !forgotten.has(c)),
  );
  const pool = heartsDeck().filter((c) => !seen.has(c));
  const voids = knownVoids(view);
  const passed = passedTo(view);
  const others = PLAYERS.filter((s) => s !== view.seat);
  const allowed = (seat: number, card: Card) =>
    !voids.get(seat)?.has(suitOf(card) as Suit);

  for (let attempt = 0; attempt < 40; attempt++) {
    const hands: Card[][] = PLAYERS.map(() => []);
    hands[view.seat] = [...view.hand];
    const left = new Map(others.map((s) => [s, view.handCounts[s] ?? 0]));
    // 잊은 카드만큼은 이미 나와 아무도 갖고 있지 않은 자리(-1)에 둔다.
    const nowhere = forgotten.size;
    let rest = [...pool];
    if (passed) {
      for (const card of passed.cards) {
        if (!rest.includes(card)) continue;
        (hands[passed.seat] as Card[]).push(card);
        left.set(passed.seat, (left.get(passed.seat) ?? 0) - 1);
        rest = rest.filter((c) => c !== card);
      }
    }
    shuffleInPlace(rng, rest);
    // 갈 수 있는 자리가 적은 카드부터 나눈다.
    rest.sort(
      (a, b) =>
        others.filter((s) => allowed(s, a)).length -
        others.filter((s) => allowed(s, b)).length,
    );
    let ok = true;
    left.set(-1, nowhere);
    for (const card of rest) {
      const options = [...others, -1].filter(
        (s) =>
          (left.get(s) ?? 0) > 0 &&
          (s === -1 || attempt >= 30 || allowed(s, card)),
      );
      const total = options.reduce((sum, s) => sum + (left.get(s) ?? 0), 0);
      if (total === 0) {
        ok = false;
        break;
      }
      let r = nextFloat(rng) * total;
      let chosen = options[options.length - 1] as number;
      for (const s of options) {
        r -= left.get(s) ?? 0;
        if (r < 0) {
          chosen = s;
          break;
        }
      }
      left.set(chosen, (left.get(chosen) ?? 0) - 1);
      if (chosen >= 0) (hands[chosen] as Card[]).push(card);
    }
    if (ok) return hands;
  }
  return null;
}

/**
 * 기준 후보(0번, 정석)와 같은 추측 판끼리 짝지어 비교해, 평균 차이에서 오차를 뺀 값이 가장 큰 후보.
 * 기준보다 확실히 나은 후보가 없으면 기준. 마이티 고수의 `pickSure`와 같다.
 */
function pickSure(samples: readonly (readonly number[])[], z: number): number {
  const base = samples[0] ?? [];
  let best = 0;
  let bestGain = 0;
  samples.forEach((s, i) => {
    if (i === 0 || s.length === 0) return;
    const diffs = s.map((v, w) => v - (base[w] ?? 0));
    const n = diffs.length;
    const mean = diffs.reduce((a, b) => a + b, 0) / n;
    const variance =
      n > 1 ? diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1) : 0;
    const gain = mean - z * Math.sqrt(variance / n);
    if (gain > bestGain) {
      bestGain = gain;
      best = i;
    }
  });
  return best;
}

/** 계산 시간 상한. `now`는 ms를 돌려주는 시계(시험은 정해 둔 시계를 넣는다) */
export interface SearchBudget {
  /** 추측 판을 이만큼 돌렸으면 시간이 남아도 멈춘다 */
  worlds: number;
  /** 이 시간(ms)을 넘기면 추측 판을 더 돌리지 않는다 */
  timeLimitMs: number;
  /** 시간이 넘어도 이만큼은 돌린다 */
  minWorlds: number;
  now: () => number;
}

/** 추측 판을 하나씩 돌린다. 돌린 판 수를 돌려준다 */
function runWorlds(budget: SearchBudget, world: () => void): number {
  const start = budget.now();
  let done = 0;
  while (done < budget.worlds) {
    world();
    done++;
    if (done >= budget.minWorlds && budget.now() - start >= budget.timeLimitMs)
      break;
  }
  return done;
}

/** 넘기기를 정하는 중수에게 줄 화면. 중수는 손패와 장수만 읽는다 */
function passView(
  rules: HeartsRules,
  seat: number,
  hand: Card[],
  direction: PassDirection,
  count: number,
): PlayerView {
  return {
    ...viewIn(
      {
        rules,
        hands: PLAYERS.map((s) => (s === seat ? hand : [])),
        trick: { leader: -1, plays: [] },
        trickIndex: 0,
        tricks: [],
        heartsBroken: false,
        taken: PLAYERS.map(() => []),
        done: false,
      },
      seat,
      [],
    ),
    phase: "passing",
    direction,
    decision: { kind: "pass", direction, count },
  };
}

/**
 * 넘길 카드 후보: 중수가 고를 조합(기준), 그중 한 장을 다음 위험 카드로 바꾼 것, 짧은 무늬 통째로.
 * 문 슛 계획까지 볼 때는 가장 낮은 카드들(높은 카드를 쥐고 낮은 카드를 치운다)도 넣는다.
 */
function passCandidates(
  hand: readonly Card[],
  count: number,
  moon: boolean,
): Card[][] {
  const order = [...hand].sort(
    (a, b) => passDanger(hand, b) - passDanger(hand, a),
  );
  const base = order.slice(0, count);
  const result: Card[][] = [base];
  for (const spare of order.slice(count, count + 2))
    for (let i = 0; i < count; i++) {
      const set = [...base];
      set[i] = spare;
      result.push(set);
    }
  // 짧은 무늬를 통째로 넘겨 비우면 나중에 점수 카드를 버릴 수 있다.
  for (const suit of ["C", "D", "S"] as const) {
    const cards = hand.filter((c) => suitOf(c) === suit);
    if (cards.length === 0 || cards.length > count) continue;
    if (cards.length === 1 && cards.includes(QUEEN_OF_SPADES)) continue;
    const fill = order.filter((c) => !cards.includes(c));
    result.push([...cards, ...fill.slice(0, count - cards.length)]);
  }
  if (moon)
    result.push(
      [...hand].sort((a, b) => rankPower(a) - rankPower(b)).slice(0, count),
    );
  const seen = new Set<string>();
  return result.filter((set) => {
    const key = [...set].sort().join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 넘기기 계산 결과: 고른 카드와 실제로 돌린 추측 판 수 */
export interface HeartsPassPlan {
  cards: Card[];
  /** 문 슛 계획으로 둬 본 결과가 가장 나았다 */
  moon: boolean;
  worlds: number;
}

export interface HeartsPlanOptions {
  budget: SearchBudget;
  /** 게임 끝이 가까우면 순위를 본다 */
  standing?: boolean;
  /** 문 슛 노리기(막기도 따로 정하지 않으면 함께) */
  moon?: boolean;
  /** 남의 문 슛 막기. 없으면 `moon`을 따른다 */
  block?: boolean;
}

/**
 * 넘길 카드를 판 끝까지 둬 보고 고른다. 추측한 판마다 남의 패를 나누고, 다른 세 사람은
 * 중수처럼 위험한 카드를 넘긴다고 본다(모두 동시에 넘기므로 내 선택과 상관없다).
 * 패가 좋으면 후보마다 "받은 패로 문 슛을 노린다"는 계획으로도 둬 본다.
 */
export function planHeartsPass(
  view: PlayerView,
  rng: RngState,
  options: HeartsPlanOptions,
): HeartsPassPlan | null {
  const decision = view.decision;
  if (decision?.kind !== "pass" || decision.direction === "none") return null;
  const me = view.seat;
  const moon =
    (options.moon ?? false) &&
    view.rules.moon !== "off" &&
    handLooksMoony(view.hand);
  const candidates = passCandidates(view.hand, decision.count, moon);
  const plans = moon ? [false, true] : [false];
  if (candidates.length <= 1 && plans.length === 1) return null;
  const standing = options.standing ? standingFor(view) : null;
  const pool = heartsDeck().filter((c) => !view.hand.includes(c));
  // 후보 × 계획. 0번은 기준 후보의 보통 계획
  const entries = plans.flatMap((shoot) =>
    candidates.map((cards) => ({ cards, shoot })),
  );
  const samples: number[][] = entries.map(() => []);
  const worlds = runWorlds(options.budget, () => {
    const rest = shuffleInPlace(rng, [...pool]);
    const hands: Card[][] = PLAYERS.map(() => []);
    hands[me] = [...view.hand];
    let at = 0;
    for (const s of PLAYERS) {
      if (s === me) continue;
      hands[s] = rest.slice(at, at + HAND_SIZE);
      at += HAND_SIZE;
    }
    // 다른 사람이 넘길 카드
    const theirs = PLAYERS.map((s) => {
      if (s === me) return [];
      const given = heartsNormalBot.decide(
        passView(
          view.rules,
          s,
          hands[s] as Card[],
          decision.direction,
          decision.count,
        ),
        rng,
      );
      return given.type === "pass" ? given.cards : [];
    });
    entries.forEach(({ cards, shoot }, i) => {
      const passes = theirs.map((p, s) => (s === me ? cards : p));
      const dealt = hands.map((h, s) =>
        h.filter((c) => !(passes[s] as Card[]).includes(c)),
      );
      PLAYERS.forEach((s) => {
        const to = passTarget(s, decision.direction);
        (dealt[to] as Card[]).push(...(passes[s] as Card[]));
      });
      const sim: Sim = {
        rules: view.rules,
        hands: dealt,
        trick: { leader: -1, plays: [] },
        trickIndex: 0,
        tricks: [],
        heartsBroken: false,
        taken: PLAYERS.map(() => []),
        done: false,
      };
      playOut(sim, rng, shoot ? shooterPolicy(me) : ALL_NORMAL);
      (samples[i] as number[]).push(utility(sim, me, standing));
    });
  });
  const best = entries[pickSure(samples, HEARTS_TUNING.passZ)];
  return best ? { cards: best.cards, moon: best.shoot, worlds } : null;
}

/** 내가 문 슛을 노리는 계획: 나는 문 슛 봇, 남은 문 슛을 막는 중수 */
function shooterPolicy(me: number): Policy {
  return (seat) => (seat === me ? heartsMoonBot : heartsGuardBot);
}

/** 남이 문 슛을 노리는 것 같을 때: 그 사람은 문 슛 봇, 나머지는 중수 */
function threatPolicy(threat: number): Policy {
  return (seat) => (seat === threat ? heartsMoonBot : heartsNormalBot);
}

/**
 * 평균이 가장 좋은 카드를 고르되, 그와 비슷한 카드(성향의 `closeMargin` 안)에 정석(중수의 카드)이
 * 있으면 정석을 따른다. 가끔(`whim`)은 비슷한 카드 가운데 아무거나 골라 매번 똑같이 두지 않는다.
 */
function chooseCard(
  cards: readonly Card[],
  values: readonly number[],
  fallback: Card | null,
  persona: HeartsPersona,
  rng: RngState,
): Card {
  const best = Math.max(...values);
  const close = cards.filter(
    (_, i) => (values[i] ?? -Infinity) >= best - persona.closeMargin,
  );
  if (close.length > 1 && chance(rng, persona.whim))
    return close[Math.floor(nextFloat(rng) * close.length)] as Card;
  if (fallback !== null && close.includes(fallback)) return fallback;
  return cards[values.indexOf(best)] as Card;
}

/** 카드 내기 계산 결과 */
export interface HeartsPlayPlan {
  /** 보통 계획(나는 중수처럼 끝까지 둔다)으로 본 카드마다의 평균 */
  values: { card: Card; mean: number }[];
  /** 문 슛 계획으로 본 카드마다의 평균. 노려 볼 만한 패가 아니면 null */
  moon: { card: Card; mean: number }[] | null;
  /** 문 슛을 노리는 것 같아 막으려고 본 자리 */
  threat: number | null;
  /** 문 슛 계획이 보통 계획보다 확실히 나을 때 그 계획의 가장 좋은 카드 */
  moonCard: Card | null;
  worlds: number;
}

/**
 * 낼 수 있는 카드마다 남의 손패를 추측해 끝까지 둬 본 평균(다른 사람 평균 점수 − 내 점수).
 * 카드 내기 차례가 아니거나 추측이 안 되면 null
 */
export function planHeartsPlay(
  view: PlayerView,
  rng: RngState,
  options: HeartsPlanOptions & { persona?: HeartsPersona },
): HeartsPlayPlan | null {
  const decision = view.decision;
  if (decision?.kind !== "play") return null;
  const persona = options.persona ?? heartsPersonaForSeat(view.seat);
  // 끝난 턴의 낮은 카드는 성향에 따라 잊는다(사람은 하트와 높은 카드 위주로 센다).
  const forgotten = new Set(
    view.tricks
      .flatMap((t) => t.plays.map((p) => p.card))
      .filter(
        (c) =>
          !isMemorable(c) && forgets(persona, view.seat, view.roundNumber, c),
      ),
  );
  const standing = options.standing ? standingFor(view) : null;
  const threat = (options.block ?? options.moon) ? moonThreat(view) : null;
  const shoot = (options.moon ?? false) && moonHopeful(view);
  const normal = threat !== null ? threatPolicy(threat) : ALL_NORMAL;
  const trick = view.trick ?? { leader: view.seat, plays: [] };
  const base: Omit<Sim, "hands"> = {
    rules: view.rules,
    trick: { ...trick, plays: [...trick.plays] },
    trickIndex: view.trickIndex,
    tricks: [...view.tricks],
    heartsBroken: view.heartsBroken,
    taken: PLAYERS.map((s) =>
      view.tricks
        .filter((t) => t.winner === s)
        .flatMap((t) => t.plays.map((p) => p.card)),
    ),
    done: false,
  };
  // 카드마다 추측 판별 값(같은 판끼리 짝지어 비교하려고 모두 남긴다)
  const normalSamples: number[][] = decision.cards.map(() => []);
  const moonSamples: number[][] = decision.cards.map(() => []);
  let counted = 0;
  const worlds = runWorlds(options.budget, () => {
    const hands = sampleHeartsHands(view, rng, forgotten);
    if (!hands) return;
    counted++;
    decision.cards.forEach((card, i) => {
      const sim = cloneSim({ ...base, hands });
      apply(sim, view.seat, card);
      playOut(sim, rng, normal);
      normalSamples[i]?.push(utility(sim, view.seat, standing));
      if (!shoot) return;
      const moonSim = cloneSim({ ...base, hands });
      apply(moonSim, view.seat, card);
      playOut(moonSim, rng, shooterPolicy(view.seat));
      moonSamples[i]?.push(utility(moonSim, view.seat, standing));
    });
  });
  if (counted === 0) return null;
  const average = (xs: readonly number[]) =>
    xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const means = (samples: number[][]) =>
    decision.cards.map((card, i) => ({
      card,
      mean: average(samples[i] ?? []),
    }));
  const values = means(normalSamples);
  const moon = shoot ? means(moonSamples) : null;
  return {
    values,
    moon,
    threat,
    moonCard: moon
      ? sureMoonCard(values, moon, normalSamples, moonSamples)
      : null,
    worlds,
  };
}

/**
 * 문 슛 계획의 가장 좋은 카드가 보통 계획의 가장 좋은 카드보다 확실히 나은가.
 * 같은 추측 판끼리 짝지은 차이의 평균에서 표준 오차(`moonZ`배)를 뺀 값이 `moonMargin`을 넘어야 한다.
 */
function sureMoonCard(
  values: readonly { card: Card; mean: number }[],
  moon: readonly { card: Card; mean: number }[],
  normalSamples: readonly number[][],
  moonSamples: readonly number[][],
): Card | null {
  const argmax = (xs: readonly { mean: number }[]) =>
    xs.reduce(
      (best, x, i) => (x.mean > (xs[best]?.mean ?? -Infinity) ? i : best),
      0,
    );
  const m = argmax(moon);
  const n = argmax(values);
  const a = moonSamples[m] ?? [];
  const b = normalSamples[n] ?? [];
  const diffs = a.map((v, w) => v - (b[w] ?? 0));
  const count = diffs.length;
  if (count === 0) return null;
  const mean = diffs.reduce((x, y) => x + y, 0) / count;
  const variance =
    count > 1
      ? diffs.reduce((x, d) => x + (d - mean) ** 2, 0) / (count - 1)
      : 0;
  const gain = mean - HEARTS_TUNING.moonZ * Math.sqrt(variance / count);
  return gain > HEARTS_TUNING.moonMargin ? (moon[m]?.card ?? null) : null;
}

/**
 * 낼 수 있는 카드마다 남의 손패를 추측해 끝까지 둬 본 평균(다른 사람 평균 점수 − 내 점수).
 * 복기 해설에도 쓴다. 카드 내기 차례가 아니거나 추측이 안 되면 null
 */
export function evaluateHeartsPlays(
  view: PlayerView,
  rng: RngState,
  worlds = 30,
  persona: HeartsPersona = heartsPersonaForSeat(view.seat),
): { card: Card; mean: number }[] | null {
  return (
    planHeartsPlay(view, rng, {
      persona,
      budget: {
        worlds,
        minWorlds: worlds,
        timeLimitMs: Number.POSITIVE_INFINITY,
        now: () => 0,
      },
    })?.values ?? null
  );
}

export interface HeartsSearchOptions {
  /** 카드 한 장을 고를 때 추측해 보는 판 수 */
  worlds?: number;
  /** 넘길 카드를 고를 때 추측해 보는 판 수. 0이면 중수처럼 넘긴다 */
  passWorlds?: number;
  /** 성향. 없으면 자리마다 정해진 성향 */
  persona?: HeartsPersona;
  /**
   * 시간 상한을 잴 시계(fair-play `Clock`과 같은 모양). 없으면 시간 상한 없이 판 수만 본다(기본).
   * 결과가 기기 속도에 따라 달라지므로 다시 계산해 맞춰 보는 곳(온라인 방 검증)이나 시험에서는 넣지 않는다
   */
  clock?: { now(): number };
  /** 시계가 있을 때 한 번 정하는 데 쓸 시간 상한(ms). 기본 300 */
  timeLimitMs?: number;
  /** 시간이 넘어도 돌릴 추측 판 수. 기본 4 */
  minWorlds?: number;
  /** 게임 끝이 가까우면 순위를 본다. 기본 끔(재 보니 1등 몫이 나아지지 않았다, docs/hearts/02 3절) */
  standing?: boolean;
  /** 문 슛 노리기. 기본 켬 */
  moon?: boolean;
  /** 남의 문 슛 막기. 기본 켬 */
  block?: boolean;
}

/** 고수가 한 번 정하는 데 쓰는 시간 상한(ms). 이 맥에서 평균은 이보다 훨씬 짧다(docs/hearts/02 3절) */
export const HEARTS_SEARCH_TIME_LIMIT_MS = 300;

export function createHeartsSearchBot(
  options: HeartsSearchOptions = {},
): HeartsBot {
  const clock = options.clock;
  const budgetOf = (worlds: number): SearchBudget =>
    clock
      ? {
          worlds,
          timeLimitMs: options.timeLimitMs ?? HEARTS_SEARCH_TIME_LIMIT_MS,
          minWorlds: Math.min(worlds, options.minWorlds ?? 4),
          now: () => clock.now(),
        }
      : {
          worlds,
          timeLimitMs: Number.POSITIVE_INFINITY,
          minWorlds: worlds,
          now: () => 0,
        };
  const worlds = options.worlds ?? 30;
  const passWorlds = options.passWorlds ?? 24;
  const standing = options.standing ?? false;
  const moon = options.moon ?? true;
  const block = options.block ?? true;
  return {
    name: "hearts-search",
    decide(view, rng): Action {
      const decision = view.decision;
      const persona = options.persona ?? heartsPersonaForSeat(view.seat);
      const fallback = heartsNormalBot.decide(view, rng);
      if (decision?.kind === "pass" && passWorlds > 0) {
        const plan = planHeartsPass(view, rng, {
          budget: budgetOf(passWorlds),
          standing,
          moon,
        });
        return plan ? { type: "pass", cards: plan.cards } : fallback;
      }
      if (decision?.kind !== "play" || decision.cards.length <= 1)
        return fallback;
      const plan = planHeartsPlay(view, rng, {
        budget: budgetOf(worlds),
        persona,
        standing,
        moon,
        block,
      });
      if (!plan) return fallback;
      const fallbackCard = fallback.type === "play" ? fallback.card : null;
      const card = chooseCard(
        plan.values.map((v) => v.card),
        plan.values.map((v) => v.mean),
        fallbackCard,
        persona,
        rng,
      );
      // 문 슛 계획이 확실히 나으면 그 계획의 가장 좋은 카드
      const chosen = plan.moonCard ?? card;
      return fallback.type === "play" && fallback.card === chosen
        ? fallback
        : { type: "play", card: chosen };
    },
  };
}

/** 고수(시간 상한 없음, 같은 씨앗이면 어느 기기에서나 같은 수) */
export const heartsSearchBot: HeartsBot = createHeartsSearchBot();
