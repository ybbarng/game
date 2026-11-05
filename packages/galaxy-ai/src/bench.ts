import {
  type Action,
  activeSeats,
  assetsOf,
  boardOfSky,
  cardById,
  type GalaxyBoard,
  type GalaxyRules,
  type GalaxyState,
  type GameEvent,
  isComplete,
  NUMBERS,
  SHORT_RULES,
  STANDARD_RULES,
  standingsOf,
  starAt,
  turnLimitOf,
} from "@game/galaxy-engine";

import {
  type GalaxyBot,
  galaxyBeginnerBot,
  galaxyExpertBot,
  galaxyIntermediateBot,
  galaxyStrategyBot,
} from "./bots";
import { landingOdds } from "./odds";
import { playGalaxy } from "./simulate";

/**
 * 밸런스 bench(docs/48 3-4): 컴퓨터끼리 많이 두어 표의 항목을 모두 잰다.
 * 결정적이다(판 i의 시드는 고정). 기준을 넘는 항목은 「넘음」으로 표시만 한다.
 * 이 맥에서 돌리지 않는다. CI 워크플로 「galaxy-bench」가 돌린다.
 */

/** 판 수(기본). 워크플로 입력이 이 값을 바꿀 수 있다 */
export const BENCH_GAMES = {
  /** 4인 중수 × 4, 기본 판, 인수 켬(자리 순서·눈덩이·공문·칸 밟힘 등) */
  main: 2000,
  /** 같은 판, 인수 끔(별자리 완성 비율) */
  noTrade: 1000,
  /** 고수 1 대 중수 3, 중수 1 대 입문 3(각각) */
  strength: 1000,
  /** 긴장 지표 묶음(각각): 짧은 판 유성우 켬·끔, 기본 판 유성우 반대쪽(기본 판 켬·끔 가운데 main이 아닌 쪽) */
  tension: 1000,
} as const;

export interface BenchOptions {
  main: number;
  noTrade: number;
  strength: number;
  tension: number;
  sky?: string;
}

/** 이 판 수로 줄이거나 늘린 판 수(main이 n, 나머지는 같은 비율) */
export function scaledGames(main: number): BenchOptions {
  const ratio = main / BENCH_GAMES.main;
  return {
    main,
    noTrade: Math.max(1, Math.round(BENCH_GAMES.noTrade * ratio)),
    strength: Math.max(1, Math.round(BENCH_GAMES.strength * ratio)),
    tension: Math.max(1, Math.round(BENCH_GAMES.tension * ratio)),
  };
}

const now = (): number => performance.now();

/** 한 판 묶음에서 모으는 수 */
interface Tally {
  games: number;
  turns: number;
  landed: number[];
  landedTotal: number;
  /** 자리 순서(첫 차례 0)마다 1등 몫(같은 1등은 나눠 센다) */
  firstBySeatOrder: number[];
  bankruptEnds: number;
  completionGames: number;
  /** 별자리마다 판 끝에 완성한 사람이 있던 판 수, 그 사람이 1등인 판 수 */
  groupComplete: number[];
  groupCompleteWins: number[];
  /** 10돌림을 마쳤을 때 1등이 판 끝에도 1등 */
  leaderChecked: number;
  leaderKept: number;
  /** 공문마다 편 수와 편 사람의 이득 합 */
  cardDraws: number[];
  cardGain: number[];
  rounds: number;
  decisions: number;
  auctions: number;
  /** 긴장 지표: 판마다 판 끝 1위와 꼴찌 자산 차이 */
  gaps: number[];
  /** 마지막 5돌림이 시작될 때 1등이 판 끝 1등이 아니었던 판 / 그 자리를 잰 판 */
  lateChecked: number;
  lateFlipped: number;
  /** 판마다 300 넘는 이용료를 낸 수 */
  bigRents: number[];
  /** 판마다 첫 별자리 완성 돌림(없으면 넣지 않는다) */
  firstComplete: number[];
  /** 2단 이상 정거장이 선 판 */
  level2Games: number;
  /** 관측 의뢰: 펼친 의뢰 수, 이룬 의뢰 수, 의뢰 지원금이 1등을 바꾼 판 */
  requestsShown: number;
  requestsDone: number;
  requestFlips: number;
}

function newTally(): Tally {
  return {
    games: 0,
    turns: 0,
    landed: new Array(32).fill(0),
    landedTotal: 0,
    firstBySeatOrder: new Array(4).fill(0),
    bankruptEnds: 0,
    completionGames: 0,
    groupComplete: new Array(12).fill(0),
    groupCompleteWins: new Array(12).fill(0),
    leaderChecked: 0,
    leaderKept: 0,
    cardDraws: new Array(17).fill(0),
    cardGain: new Array(17).fill(0),
    rounds: 0,
    decisions: 0,
    auctions: 0,
    gaps: [],
    lateChecked: 0,
    lateFlipped: 0,
    bigRents: [],
    firstComplete: [],
    level2Games: 0,
    requestsShown: 0,
    requestsDone: 0,
    requestFlips: 0,
  };
}

/** 이용료가 이만큼 넘으면 「크게 받는 순간」으로 센다 */
const BIG_RENT = 300;
/** 막판 뒤집힘을 보는 돌림 수 */
const LATE_ROUNDS = 5;

/** 공문을 편 사람의 이득: 그 걸음에서 공문 뒤 다음 굴림 전까지 그 사람에게 오간 별빛(빚으로 미룬 것 포함) */
function cardGains(events: readonly GameEvent[], tally: Tally): void {
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as GameEvent;
    if (e.type !== "card") continue;
    let gain = 0;
    for (let j = i + 1; j < events.length; j++) {
      const f = events[j] as GameEvent;
      if (f.type === "card" || f.type === "dice" || f.type === "turnStarted")
        break;
      if (f.type === "pay") {
        if (f.to === e.seat) gain += f.amount;
        if (f.from === e.seat) gain -= f.amount;
      } else if (f.type === "debt") {
        if (f.debt.seat === e.seat) gain -= f.debt.amount;
        if (f.debt.to === e.seat) gain += f.debt.amount;
      }
    }
    tally.cardDraws[e.card] = (tally.cardDraws[e.card] ?? 0) + 1;
    tally.cardGain[e.card] = (tally.cardGain[e.card] ?? 0) + gain;
  }
}

function winnersOf(state: GalaxyState): number[] {
  return (state.result?.standings ?? [])
    .filter((s) => s.rank === 1)
    .map((s) => s.seat);
}

/** 한 묶음: 같은 컴퓨터 배치로 n판 */
function runSet(
  n: number,
  rules: GalaxyRules,
  seatBots: (game: number) => GalaxyBot[],
  seedBase: number,
  onGame?: (state: GalaxyState, game: number) => void,
  /** 판(배치 시험, layouts.ts). 없으면 하늘의 판 */
  givenBoard?: GalaxyBoard,
): Tally {
  const tally = newTally();
  const board = givenBoard ?? boardOfSky(rules.sky);
  const leaderRound = 11;
  const limit = turnLimitOf(rules);
  const lateRound = limit === null ? null : limit - LATE_ROUNDS + 1;
  for (let g = 0; g < n; g++) {
    let leaders: number[] | null = null;
    let lateLeaders: number[] | null = null;
    let completed = false;
    let firstComplete: number | null = null;
    let bigRents = 0;
    let level2 = false;
    const { state } = playGalaxy({
      bots: seatBots(g),
      rules,
      seed: seedBase + g,
      board,
      onStep(_before, _seat, action: Action, after, events) {
        if (action.type !== "commit" && action.type !== "reveal")
          tally.decisions += 1;
        for (const e of events) {
          if (e.type === "landed") {
            tally.landed[e.square] = (tally.landed[e.square] ?? 0) + 1;
            tally.landedTotal += 1;
          } else if (e.type === "turnStarted") {
            tally.turns += 1;
            if (e.round === leaderRound && leaders === null)
              leaders = standingsOf(after)
                .filter((s) => s.rank === 1 && !s.out)
                .map((s) => s.seat);
            if (e.round === lateRound && lateLeaders === null)
              lateLeaders = standingsOf(after)
                .filter((s) => s.rank === 1 && !s.out)
                .map((s) => s.seat);
          } else if (e.type === "linked" && e.owned === e.size) {
            completed = true;
            firstComplete ??= after.round;
          } else if (e.type === "auctionStarted") tally.auctions += 1;
          else if (
            e.type === "pay" &&
            e.reason === "rent" &&
            e.amount > BIG_RENT
          )
            // 빚 정리로 미룬 이용료도 갚을 때 같은 pay 사건이 난다
            bigRents += 1;
          else if (e.type === "built" && e.level >= 2) level2 = true;
          else if (e.type === "requestRevealed") {
            tally.requestsShown += 1;
            if (e.done) tally.requestsDone += 1;
          }
        }
        cardGains(events, tally);
      },
    });
    tally.games += 1;
    tally.rounds += state.round;
    if (state.result?.kind === "bankrupt") tally.bankruptEnds += 1;
    if (completed) tally.completionGames += 1;
    const winners = winnersOf(state);
    const n4 = rules.players;
    for (const w of winners) {
      const order = (w - state.starter + n4) % n4;
      tally.firstBySeatOrder[order] =
        (tally.firstBySeatOrder[order] ?? 0) + 1 / winners.length;
    }
    state.board.groups.forEach((_, group) => {
      for (let seat = 0; seat < n4; seat++)
        if (isComplete(state, seat, group)) {
          tally.groupComplete[group] = (tally.groupComplete[group] ?? 0) + 1;
          if (winners.includes(seat))
            tally.groupCompleteWins[group] =
              (tally.groupCompleteWins[group] ?? 0) + 1;
        }
    });
    const atTen = leaders as number[] | null;
    if (atTen && atTen.length > 0) {
      tally.leaderChecked += 1;
      if (atTen.some((s) => winners.includes(s))) tally.leaderKept += 1;
    }
    const late = lateLeaders as number[] | null;
    if (late && late.length > 0) {
      tally.lateChecked += 1;
      if (!late.some((s) => winners.includes(s))) tally.lateFlipped += 1;
    }
    const finals = state.result?.standings ?? [];
    if (finals.length > 0)
      tally.gaps.push((finals[0]?.assets ?? 0) - (finals.at(-1)?.assets ?? 0));
    tally.bigRents.push(bigRents);
    const first = firstComplete as number | null;
    if (first !== null) tally.firstComplete.push(first);
    if (level2) tally.level2Games += 1;
    // 의뢰 지원금을 뺀 자산으로 1등이 달랐나
    const done = state.requests?.reveals.map((r) => r?.done === true) ?? [];
    if (done.some(Boolean) && finals.length > 0) {
      const plain = finals.map((f) => ({
        seat: f.seat,
        out: f.out,
        assets: f.assets - (done[f.seat] ? NUMBERS.requestBonus : 0),
      }));
      const best = Math.max(
        ...plain.filter((p) => !p.out).map((p) => p.assets),
      );
      const before = plain.filter((p) => !p.out && p.assets === best);
      if (!before.some((p) => winners.includes(p.seat)))
        tally.requestFlips += 1;
    }
    onGame?.(state, g);
  }
  return tally;
}

/** 결정 시간을 재는 컴퓨터(감싼 컴퓨터와 같은 수) */
function timed(bot: GalaxyBot, record: (ms: number) => void): GalaxyBot {
  return {
    name: bot.name,
    decide(view, rng) {
      const start = now();
      const action = bot.decide(view, rng);
      record(now() - start);
      return action;
    },
  };
}

/** 한 단계 1 대 다른 단계 3(자리를 돌려 가며). 1 쪽이 1등인 몫 */
function strengthOf(
  n: number,
  one: GalaxyBot,
  three: GalaxyBot,
  seedBase: number,
  rules: GalaxyRules,
): number {
  let share = 0;
  runSet(
    n,
    rules,
    (g) => [0, 1, 2, 3].map((s) => (s === g % 4 ? one : three)),
    seedBase,
    (state, g) => {
      const winners = winnersOf(state);
      if (winners.includes(g % 4)) share += 1 / winners.length;
    },
  );
  return share / n;
}

export interface BenchRow {
  item: string;
  value: string;
  target: string;
  /** 기준 안이면 true, 기준을 넘으면 false, 기준이 없는 항목은 null */
  pass: boolean | null;
}

export interface BenchReport {
  options: BenchOptions;
  rows: BenchRow[];
  /** 칸 | 이름 | 잰 비율 | 계산한 비율 */
  landing: {
    square: number;
    name: string;
    measured: number;
    computed: number;
  }[];
  groups: { name: string; completed: number; winRate: number | null }[];
  cards: { id: number; title: string; draws: number; mean: number | null }[];
  /** 긴장 지표(판 길이 × 유성우의 밤 켬·끔) */
  tension: TensionRow[];
  seconds: number;
}

/** 긴장 지표 한 줄(docs/48 3-6) */
export interface TensionRow {
  length: "standard" | "short";
  meteor: boolean;
  games: number;
  /** 판 끝 1위 − 꼴찌 자산: 아래 사분위, 중앙값, 위 사분위 */
  gap: [number, number, number];
  /** 마지막 5돌림이 시작될 때 1등이 판 끝 1등이 아닌 판의 비율 */
  lateFlip: number;
  /** 300 넘는 이용료: 판마다 평균, 한 번이라도 나온 판의 비율 */
  bigRentMean: number;
  bigRentGames: number;
  /** 첫 별자리 완성 돌림 중앙값(완성이 나온 판만), 차례 수 */
  firstComplete: number | null;
  limit: number;
  /** 2단 이상 정거장이 선 판의 비율 */
  level2: number;
  bankrupt: number;
}

/** 정렬된 수의 분위(선형 사이값) */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (at - lo);
}

function tensionOf(
  tally: Tally,
  rules: GalaxyRules,
): Omit<TensionRow, "length" | "meteor"> {
  const games = Math.max(1, tally.games);
  const gaps = [...tally.gaps].sort((a, b) => a - b);
  const firsts = [...tally.firstComplete].sort((a, b) => a - b);
  return {
    games: tally.games,
    gap: [quantile(gaps, 0.25), quantile(gaps, 0.5), quantile(gaps, 0.75)],
    lateFlip: tally.lateFlipped / Math.max(1, tally.lateChecked),
    bigRentMean: tally.bigRents.reduce((a, b) => a + b, 0) / games,
    bigRentGames: tally.bigRents.filter((x) => x > 0).length / games,
    firstComplete: firsts.length > 0 ? quantile(firsts, 0.5) : null,
    limit: turnLimitOf(rules) ?? 0,
    level2: tally.level2Games / games,
    bankrupt: tally.bankruptEnds / games,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** bench 전체를 돌린다 */
export function runGalaxyBench(options: BenchOptions): BenchReport {
  const started = now();
  const sky = options.sky ?? "seasons";
  const rules: GalaxyRules = { ...STANDARD_RULES, sky };
  const board = boardOfSky(sky);
  const mid = galaxyIntermediateBot;
  const main = runSet(options.main, rules, () => [mid, mid, mid, mid], 10_000);
  const noTrade = runSet(
    options.noTrade,
    { ...rules, takeover: false },
    () => [mid, mid, mid, mid],
    20_000,
  );
  const times: number[] = [];
  const expert = timed(galaxyExpertBot, (ms) => times.push(ms));
  const expertShare = strengthOf(options.strength, expert, mid, 30_000, rules);
  const midShare = strengthOf(
    options.strength,
    mid,
    galaxyBeginnerBot,
    40_000,
    rules,
  );
  // 긴장 지표: 유성우의 밤 켬·끔을 같은 시드로 견준다(기본 판 한쪽은 main 묶음)
  const all = () => [mid, mid, mid, mid];
  const otherMeteor = { ...rules, meteor: !rules.meteor };
  const shortRules: GalaxyRules = { ...SHORT_RULES, sky };
  const tension: TensionRow[] = [
    {
      length: "standard",
      meteor: rules.meteor,
      ...tensionOf(main, rules),
    },
    {
      length: "standard",
      meteor: otherMeteor.meteor,
      ...tensionOf(
        runSet(options.tension, otherMeteor, all, 10_000),
        otherMeteor,
      ),
    },
    ...[true, false].map((meteor) => {
      const r = { ...shortRules, meteor };
      return {
        length: "short" as const,
        meteor,
        ...tensionOf(runSet(options.tension, r, all, 60_000), r),
      };
    }),
  ];

  const rows: BenchRow[] = [];
  const odds = landingOdds(board);
  const landing = odds.map((computed, square) => ({
    square,
    name:
      board.squares[square]?.star?.star.ko ??
      (
        {
          base: "우주국",
          asteroid: "소행성대",
          observatory: "관측지",
          comet: "혜성",
          notice: "공문",
        } as Record<string, string>
      )[board.squares[square]?.kind ?? ""] ??
      "",
    measured: main.landedTotal
      ? (main.landed[square] ?? 0) / main.landedTotal
      : 0,
    computed,
  }));
  const gap = Math.max(
    ...landing.map((l) => Math.abs(l.measured - l.computed)),
  );
  rows.push({
    item: `칸마다 밟힌 비율(${main.turns.toLocaleString("en-US")}차례)`,
    value: `계산과 가장 큰 차이 ${(gap * 100).toFixed(2)}%p, 소행성대 ${pct(landing[8]?.measured ?? 0)}`,
    target: "표를 문서에 적는다(아래 표)",
    pass: null,
  });
  const seatRates = main.firstBySeatOrder.map(
    (w) => w / Math.max(1, main.games),
  );
  rows.push({
    item: `자리 순서별 1등 비율(4인 중수 ×4, ${main.games}판)`,
    value: seatRates.map((r, i) => `${i + 1}번째 ${pct(r)}`).join(" · "),
    target: "25% ± 5",
    pass: seatRates.every((r) => Math.abs(r - 0.25) <= 0.05),
  });
  const groups = board.groups.map((group, g) => {
    const completed = main.groupComplete[g] ?? 0;
    return {
      name: group.ko,
      completed,
      winRate:
        completed > 0 ? (main.groupCompleteWins[g] ?? 0) / completed : null,
    };
  });
  const rates = groups.flatMap((g) => (g.winRate === null ? [] : [g.winRate]));
  const spread = rates.length ? Math.max(...rates) - Math.min(...rates) : 0;
  rows.push({
    item: "별자리마다 「완성한 사람이 1등」 비율",
    value: `가장 높은 것과 낮은 것 차이 ${(spread * 100).toFixed(1)}%p(아래 표)`,
    target: "차이 20%p 안",
    pass: rates.length === groups.length ? spread <= 0.2 : false,
  });
  const bankrupt = main.bankruptEnds / Math.max(1, main.games);
  rows.push({
    item: "운항 중단으로 끝난 판(기본 판)",
    value: pct(bankrupt),
    target: "20% 아래(판은 차례 수로 끝난다, docs/48 3-5)",
    pass: bankrupt <= 0.2,
  });
  const withTrade = main.completionGames / Math.max(1, main.games);
  const withoutTrade = noTrade.completionGames / Math.max(1, noTrade.games);
  rows.push({
    item: "별자리 완성이 한 번이라도 나온 판",
    value: `인수 켬 ${pct(withTrade)} · 끔 ${pct(withoutTrade)}`,
    target: "켬 80% 넘게(끔은 참고, docs/48 3-5)",
    pass: withTrade > 0.8,
  });
  const kept = main.leaderKept / Math.max(1, main.leaderChecked);
  rows.push({
    item: "10차례 때 1등이 끝에 1등인 비율(눈덩이)",
    value: `${pct(kept)}(${main.leaderChecked}판)`,
    target: "60% 아래",
    pass: kept < 0.6,
  });
  const cards = main.cardDraws.flatMap((draws, id) => {
    if (id === 0) return [];
    return [
      {
        id,
        title: cardById(id).title,
        draws,
        mean: draws > 0 ? (main.cardGain[id] ?? 0) / draws : null,
      },
    ];
  });
  const worst = Math.max(
    0,
    ...cards.flatMap((c) => (c.mean === null ? [] : [Math.abs(c.mean)])),
  );
  rows.push({
    item: "공문마다 평균 이득(편 사람)",
    value: `가장 큰 크기 ${worst.toFixed(1)}(아래 표)`,
    target: "±60 안",
    pass: worst <= 60,
  });
  const limit = turnLimitOf(rules) ?? 0;
  const roundsMean = main.rounds / Math.max(1, main.games);
  const decisionsMean = main.decisions / Math.max(1, main.games);
  const auctionsMean = main.auctions / Math.max(1, main.games);
  const turnsMean = main.turns / Math.max(1, main.games);
  // 2-11 시간 어림: 차례마다 15초, 봉투 입찰마다 15초
  const minutes = ((turnsMean + auctionsMean) * 15) / 60;
  rows.push({
    item: "판 길이(돌림 수 × 결정 수)",
    value: `돌림 ${roundsMean.toFixed(1)}/${limit} · 차례 ${turnsMean.toFixed(1)} · 결정 ${decisionsMean.toFixed(0)} · 입찰 ${auctionsMean.toFixed(1)} → 어림 ${minutes.toFixed(0)}분`,
    target: "2-11 표(4인 기본 20차례, 25~32분)",
    pass: minutes <= 35,
  });
  rows.push({
    item: `컴퓨터 세기(각 ${options.strength}판)`,
    value: `고수 1 대 중수 3: 고수 1등 ${pct(expertShare)} · 중수 1 대 입문 3: 중수 1등 ${pct(midShare)}`,
    target: "고수 40% 넘게, 중수 35% 넘게",
    pass: expertShare > 0.4 && midShare > 0.35,
  });
  const meanMs = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const maxMs = times.reduce((a, b) => Math.max(a, b), 0);
  rows.push({
    item: "고수 한 결정 시간(이 기기)",
    value: `평균 ${meanMs.toFixed(2)}ms · 가장 긴 것 ${maxMs.toFixed(1)}ms`,
    target: "가장 긴 것 200ms 안(휴대폰 1초 안쪽)",
    pass: maxMs < 200,
  });
  return {
    options: { ...options, sky },
    rows,
    landing,
    groups,
    cards,
    tension,
    seconds: (now() - started) / 1000,
  };
}

/** 결과를 마크다운으로(워크플로 요약과 산출물) */
export function benchMarkdown(report: BenchReport): string {
  const mark = (p: boolean | null) =>
    p === null ? "—" : p ? "안" : "**넘음**";
  const lines = [
    `# 은하 한 바퀴 밸런스 bench(${report.options.sky})`,
    "",
    `판 수: 기본 ${report.options.main} · 인수 끔 ${report.options.noTrade} · 세기 각 ${report.options.strength} · 긴장 지표 각 ${report.options.tension}. 걸린 시간 ${report.seconds.toFixed(0)}초. docs/48 3-4.`,
    "",
    "| 잴 것 | 값 | 기준 | 판정 |",
    "|---|---|---|---|",
    ...report.rows.map(
      (r) => `| ${r.item} | ${r.value} | ${r.target} | ${mark(r.pass)} |`,
    ),
    "",
    "## 긴장 지표(4인 중수 ×4, 유성우의 밤 켬·끔은 같은 시드, docs/48 3-6)",
    "",
    "| 판 | 유성우 | 판 수 | 1위−꼴찌 자산(사분위 아래·중앙·위) | 마지막 5돌림 안 1위 바뀜 | 300 넘는 이용료(판마다 · 나온 판) | 첫 완성 돌림 중앙값 | 2단 이상 선 판 | 운항 중단 |",
    "|---|---|---|---|---|---|---|---|---|",
    ...report.tension.map(
      (t) =>
        `| ${t.length === "short" ? "짧은" : "기본"} | ${t.meteor ? "켬" : "끔"} | ${t.games} | ${t.gap.map((x) => Math.round(x)).join(" · ")} | ${pct(t.lateFlip)} | ${t.bigRentMean.toFixed(2)} · ${pct(t.bigRentGames)} | ${t.firstComplete === null ? "—" : `${t.firstComplete}/${t.limit}`} | ${pct(t.level2)} | ${pct(t.bankrupt)} |`,
    ),
    "",
    "## 칸마다 밟힌 비율",
    "",
    "| 칸 | 이름 | 잰 비율 | 계산(landingOdds) |",
    "|---|---|---|---|",
    ...report.landing.map(
      (l) =>
        `| ${l.square} | ${l.name} | ${(l.measured * 100).toFixed(2)}% | ${(l.computed * 100).toFixed(2)}% |`,
    ),
    "",
    "## 별자리마다 완성한 사람이 1등인 비율",
    "",
    "| 별자리 | 판 끝에 완성된 판 | 그 사람이 1등 |",
    "|---|---|---|",
    ...report.groups.map(
      (g) =>
        `| ${g.name} | ${g.completed} | ${g.winRate === null ? "—" : pct(g.winRate)} |`,
    ),
    "",
    "## 공문마다 편 사람의 평균 이득",
    "",
    "| # | 공문 | 편 수 | 평균 이득 |",
    "|---|---|---|---|",
    ...report.cards.map(
      (c) =>
        `| ${c.id} | ${c.title} | ${c.draws} | ${c.mean === null ? "—" : c.mean.toFixed(1)} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

/** 배치 견주기 한 줄(docs/48 15-3) */
export interface LayoutRow {
  name: string;
  length: "standard" | "short";
  games: number;
  /** 평균 돌림 · 차례 · 결정 · 어림 분 */
  rounds: number;
  turns: number;
  decisions: number;
  minutes: number;
  /** 첫 별자리 완성 돌림: 아래 사분위·중앙값·위 사분위(완성이 나온 판만) */
  firstComplete: [number, number, number] | null;
  completionGames: number;
  /** 자리 순서(첫 차례부터) 1등 몫 */
  seats: number[];
  bankrupt: number;
  lateFlip: number;
  bigRentGames: number;
  /** 별자리 「완성한 사람이 1등」 가장 높은 것 − 낮은 것 */
  groupSpread: number | null;
  limit: number;
  /** 관측 의뢰를 이룬 비율(펼친 의뢰 가운데), 의뢰 지원금이 1등을 바꾼 판 비율 */
  requestDone: number | null;
  requestFlip: number;
}

/**
 * 판 배치 견주기(docs/48 15-3): 4인 중수 ×4로 같은 시드(기본 판 10_000~, 짧은 판 60_000~)를 배치마다 둔다.
 * 엔진 규칙은 그대로이고 별 칸만 옮긴 판을 넣는다
 */
export function runLayoutBench(
  layouts: readonly { name: string; board: GalaxyBoard }[],
  games: { standard: number; short: number },
  sky = "seasons",
): LayoutRow[] {
  const mid = galaxyIntermediateBot;
  const all = () => [mid, mid, mid, mid];
  const rows: LayoutRow[] = [];
  for (const layout of layouts)
    for (const length of ["standard", "short"] as const) {
      const rules: GalaxyRules = {
        ...(length === "standard" ? STANDARD_RULES : SHORT_RULES),
        sky,
      };
      const t = runSet(
        games[length],
        rules,
        all,
        length === "standard" ? 10_000 : 60_000,
        undefined,
        layout.board,
      );
      const g = Math.max(1, t.games);
      const firsts = [...t.firstComplete].sort((a, b) => a - b);
      const rates = layout.board.groups.flatMap((_, i) => {
        const c = t.groupComplete[i] ?? 0;
        return c > 0 ? [(t.groupCompleteWins[i] ?? 0) / c] : [];
      });
      rows.push({
        name: layout.name,
        length,
        games: t.games,
        rounds: t.rounds / g,
        turns: t.turns / g,
        decisions: t.decisions / g,
        minutes: ((t.turns / g + t.auctions / g) * 15) / 60,
        firstComplete: firsts.length
          ? [
              quantile(firsts, 0.25),
              quantile(firsts, 0.5),
              quantile(firsts, 0.75),
            ]
          : null,
        completionGames: t.completionGames / g,
        seats: t.firstBySeatOrder.map((w) => w / g),
        bankrupt: t.bankruptEnds / g,
        lateFlip: t.lateFlipped / Math.max(1, t.lateChecked),
        bigRentGames: t.bigRents.filter((x) => x > 0).length / g,
        groupSpread: rates.length
          ? Math.max(...rates) - Math.min(...rates)
          : null,
        limit: turnLimitOf(rules) ?? 0,
        requestDone: t.requestsShown ? t.requestsDone / t.requestsShown : null,
        requestFlip: t.requestFlips / g,
      });
    }
  return rows;
}

/** 배치 견주기 표(마크다운) */
export function layoutMarkdown(rows: readonly LayoutRow[]): string {
  return [
    "| 배치 | 판 | 판 수 | 돌림 · 차례 · 결정 · 어림 | 첫 완성 돌림(사분위 아래·중앙·위) | 완성 나온 판 | 자리 순서 1등 | 운항 중단 | 마지막 5돌림 1위 바뀜 | 300 넘는 이용료 나온 판 | 별자리 1등 비율 차이 | 의뢰 이룸 · 1등 바뀜 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.length === "short" ? "짧은" : "기본"} | ${r.games} | ${r.rounds.toFixed(1)}/${r.limit} · ${r.turns.toFixed(1)} · ${r.decisions.toFixed(0)} · ${r.minutes.toFixed(0)}분 | ${r.firstComplete ? r.firstComplete.map((x) => x.toFixed(1)).join(" · ") : "—"} | ${pct(r.completionGames)} | ${r.seats.map((s) => pct(s)).join(" · ")} | ${pct(r.bankrupt)} | ${pct(r.lateFlip)} | ${pct(r.bigRentGames)} | ${r.groupSpread === null ? "—" : `${(r.groupSpread * 100).toFixed(1)}%p`} | ${r.requestDone === null ? "—" : `${pct(r.requestDone)} · ${pct(r.requestFlip)}`} |`,
    ),
    "",
  ].join("\n");
}

/* ───────────── 규칙 g5 저울질 bench(docs/48 16절) ───────────── */

/** 돈의 흐름 한 줄: 한 사람이 한 판에 주고받은 평균(까닭마다) */
export interface FlowRow {
  reason: string;
  /** 우주국 → 사람(+), 사람 → 우주국(−). 사람끼리 오간 것(이용료·인수)은 받은 쪽 기준 합 */
  perPlayer: number;
}

export interface BalanceReport {
  games: number;
  /** 다 사기 2 대 골라 사기 2(자리를 번갈아): 다 사기 쪽 1등 몫(같은 1등은 나눈다), 평균 자산 */
  duel: { allShare: number; allAssets: number; pickyAssets: number };
  /** 돌림이 시작될 때 남은 사람의 평균 별빛·자산(4인 중수 ×4, 기본 판) */
  cash: { round: number; cash: number; assets: number }[];
  flows: FlowRow[];
  /** 1등 판 끝 자산 가운데 별빛 몫 */
  cashShare: number;
  layout: LayoutRow[];
  strength: { expert: number; intermediate: number };
  /** 도착 인수: 판마다 평균 횟수, 인수가 별자리를 완성한 비율 */
  takeovers: { perGame: number; completing: number };
  seconds: number;
}

/** 규칙 g5 저울질 bench: 전략 견주기·돈 곡선·돈의 흐름·3-4 기준 묶음 */
export function runBalanceBench(n: number, sky = "seasons"): BalanceReport {
  const started = now();
  const rules: GalaxyRules = { ...STANDARD_RULES, sky };
  const all = galaxyStrategyBot("all");
  const picky = galaxyStrategyBot("picky");
  let allShare = 0;
  let allAssets = 0;
  let pickyAssets = 0;
  runSet(
    n,
    rules,
    (g) => [0, 1, 2, 3].map((s) => ((s + g) % 2 === 0 ? all : picky)),
    70_000,
    (state, g) => {
      const winners = winnersOf(state);
      for (const w of winners)
        if ((w + g) % 2 === 0) allShare += 1 / winners.length;
      for (const st of state.result?.standings ?? []) {
        if ((st.seat + g) % 2 === 0) allAssets += st.assets / 2;
        else pickyAssets += st.assets / 2;
      }
    },
  );
  const mid = galaxyIntermediateBot;
  const limit = turnLimitOf(rules) ?? 20;
  const sums = new Array(limit + 1).fill(0).map(() => ({ c: 0, a: 0, k: 0 }));
  const flow = new Map<string, number>();
  let takeovers = 0;
  let completing = 0;
  let cashShare = 0;
  let games = 0;
  for (let g = 0; g < n; g++) {
    const seen = new Set<number>();
    const { state } = playGalaxy({
      bots: [mid, mid, mid, mid],
      rules,
      seed: 80_000 + g,
      onStep(_before, _seat, _action, after, events) {
        for (const e of events) {
          if (e.type === "turnStarted" && !seen.has(e.round)) {
            seen.add(e.round);
            const row = sums[e.round];
            if (row)
              for (const s of activeSeats(after)) {
                row.c += after.cash[s] ?? 0;
                row.a += assetsOf(after, s);
                row.k += 1;
              }
          } else if (e.type === "pay") {
            const sign = e.to === -1 ? -1 : 1;
            flow.set(e.reason, (flow.get(e.reason) ?? 0) + sign * e.amount);
          } else if (e.type === "takenOver") {
            takeovers += 1;
            const group = starAt(after.board, e.square)?.group ?? -1;
            if (isComplete(after, e.seat, group)) completing += 1;
          }
        }
      },
    });
    games += 1;
    const top = state.result?.standings[0];
    if (top && top.assets > 0) cashShare += top.cash / top.assets;
  }
  const players = games * rules.players;
  const layout = runLayoutBench(
    [{ name: "지금 규칙", board: boardOfSky(sky) }],
    { standard: n, short: n },
    sky,
  );
  const strength = {
    expert: strengthOf(n, galaxyExpertBot, mid, 30_000, rules),
    intermediate: strengthOf(n, mid, galaxyBeginnerBot, 40_000, rules),
  };
  return {
    games: n,
    duel: {
      allShare: allShare / n,
      allAssets: allAssets / n,
      pickyAssets: pickyAssets / n,
    },
    cash: sums.flatMap((row, round) =>
      row.k > 0 ? [{ round, cash: row.c / row.k, assets: row.a / row.k }] : [],
    ),
    flows: [...flow.entries()]
      .map(([reason, total]) => ({ reason, perPlayer: total / players }))
      .sort((a, b) => b.perPlayer - a.perPlayer),
    cashShare: cashShare / Math.max(1, games),
    layout,
    strength,
    takeovers: {
      perGame: takeovers / Math.max(1, games),
      completing: takeovers ? completing / takeovers : 0,
    },
    seconds: (now() - started) / 1000,
  };
}

/** 저울질 bench 결과(마크다운) */
export function balanceMarkdown(r: BalanceReport): string {
  const pick = [1, 5, 10, 15, 20];
  return [
    `# 규칙 저울질 bench(판 수 ${r.games}, ${r.seconds.toFixed(0)}초)`,
    "",
    `- 다 사기 2 대 골라 사기 2: 다 사기 1등 몫 ${pct(r.duel.allShare)}, 평균 자산 다 사기 ${r.duel.allAssets.toFixed(0)} · 골라 사기 ${r.duel.pickyAssets.toFixed(0)}`,
    `- 돌림 시작 평균 별빛(자산): ${r.cash
      .filter((c) => pick.includes(c.round))
      .map((c) => `${c.round}차례 ${c.cash.toFixed(0)}(${c.assets.toFixed(0)})`)
      .join(" · ")}`,
    `- 1등 자산 가운데 별빛 몫 ${pct(r.cashShare)}`,
    `- 돈의 흐름(한 사람 한 판): ${r.flows.map((f) => `${f.reason} ${f.perPlayer.toFixed(0)}`).join(" · ")}`,
    `- 세기: 고수 1등 ${pct(r.strength.expert)} · 중수 1등 ${pct(r.strength.intermediate)}`,
    `- 도착 인수: 판마다 ${r.takeovers.perGame.toFixed(2)}번, 그 가운데 별자리 완성 ${pct(r.takeovers.completing)}`,
    "",
    layoutMarkdown(r.layout),
  ].join("\n");
}
