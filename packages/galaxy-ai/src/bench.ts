import {
  type Action,
  boardOfSky,
  cardById,
  type GalaxyRules,
  type GalaxyState,
  type GameEvent,
  isComplete,
  STANDARD_RULES,
  standingsOf,
  turnLimitOf,
} from "@game/galaxy-engine";

import {
  type GalaxyBot,
  galaxyBeginnerBot,
  galaxyExpertBot,
  galaxyIntermediateBot,
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
  /** 4인 중수 × 4, 기본 판, 거래 켬(자리 순서·눈덩이·공문·칸 밟힘 등) */
  main: 2000,
  /** 같은 판, 거래 끔(별자리 완성 비율) */
  noTrade: 1000,
  /** 고수 1 대 중수 3, 중수 1 대 입문 3(각각) */
  strength: 1000,
} as const;

export interface BenchOptions {
  main: number;
  noTrade: number;
  strength: number;
  sky?: string;
}

/** 이 판 수로 줄이거나 늘린 판 수(main이 n, 나머지는 같은 비율) */
export function scaledGames(main: number): BenchOptions {
  const ratio = main / BENCH_GAMES.main;
  return {
    main,
    noTrade: Math.max(1, Math.round(BENCH_GAMES.noTrade * ratio)),
    strength: Math.max(1, Math.round(BENCH_GAMES.strength * ratio)),
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
  };
}

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
): Tally {
  const tally = newTally();
  const board = boardOfSky(rules.sky);
  const leaderRound = 11;
  for (let g = 0; g < n; g++) {
    let leaders: number[] | null = null;
    let completed = false;
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
          } else if (e.type === "linked" && e.owned === e.size)
            completed = true;
          else if (e.type === "auctionStarted") tally.auctions += 1;
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
  seconds: number;
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
    { ...rules, trade: false },
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
    value: `거래 켬 ${pct(withTrade)} · 끔 ${pct(withoutTrade)}`,
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
  // 2-11 시간 어림: 차례마다 15초, 봉인 입찰마다 15초
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
    `판 수: 기본 ${report.options.main} · 거래 끔 ${report.options.noTrade} · 세기 각 ${report.options.strength}. 걸린 시간 ${report.seconds.toFixed(0)}초. docs/48 3-4.`,
    "",
    "| 잴 것 | 값 | 기준 | 판정 |",
    "|---|---|---|---|",
    ...report.rows.map(
      (r) => `| ${r.item} | ${r.value} | ${r.target} | ${mark(r.pass)} |`,
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
