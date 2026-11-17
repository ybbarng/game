import { type PlayerView, WINDOWS_RULES } from "@game/hearts-engine";
import { describe, expect, it } from "vitest";

import type { HeartsBot } from "./knowledge";
import { heartsNormalBot } from "./rule-bot";
import {
  createHeartsSearchBot,
  HEARTS_SEARCH_TIME_LIMIT_MS,
  HEARTS_TUNING,
  type HeartsSearchOptions,
  standingFor,
} from "./search-bot";
import { type HeartsSimulationResult, simulateHearts } from "./simulate";

/*
 * 고수 판단 셋(넘기기 시간 상한·점수 판·문 슛)을 옛 고수와 견준다.
 * 게임 끝(100점)까지 두어 판당 점수 차와 게임 1등 몫을 함께 잰다.
 * 도전자를 0·2번 자리와 1·3번 자리에 한 번씩 앉혀 패 운을 줄인다.
 *
 * 돌리기: pnpm --filter @game/hearts-ai bench src/search.strength.ts
 * 새 고수는 제품의 혼자 하기처럼 실제 시계로 시간 상한을 켠다.
 * 게임 수: HEARTS_BENCH_GAMES(기본 12, 자리 바꿔 두 번이라 실제로는 24게임)
 * 씨앗 시작: HEARTS_BENCH_FROM(기본 0). 나눠 돌린 결과를 합칠 때 겹치지 않게 한다
 * 고를 비교: HEARTS_BENCH_ONLY=old,standing,moon,block,time,normal (쉼표로, 없으면 전부)
 * 추측 판 수: HEARTS_BENCH_WORLDS=카드 내기,넘기기(예: 12,8). 두 쪽 모두 같게 줄여 게임을 더 많이 돌린다
 *
 * 점수 판(standing)은 55~90점에서 시작하고 짝 비교를 함께 한다: 같은 씨앗·같은 자리를 옛 고수 넷으로도
 * 두어(대조 게임), 도전자 자리의 1등 몫·점수 차에서 대조 게임의 값을 뺀다. 시작 점수가 1등을 거의 정해
 * 버리는 흔들림이 빠져 오차가 줄어든다.
 * 점수 판 실험: HEARTS_BENCH_SET='standingRollout=self;standingWeight=13,standingLast=0'처럼 설정을 ;로 나눠
 * 차례로 잰다(대조 게임은 한 번만 둔다). 설정 하나는 도전자 옵션 `standingRollout`과 standing으로 시작하는
 * 조정값(`HEARTS_TUNING`)을 쉼표로. 옛 고수는 점수 판을 보지 않아 조정값에 바뀌지 않는다
 */

declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

const GAMES = Number(process.env.HEARTS_BENCH_GAMES ?? 12);
const FROM = Number(process.env.HEARTS_BENCH_FROM ?? 0);
const ONLY = (process.env.HEARTS_BENCH_ONLY ?? "")
  .split(",")
  .filter((s: string) => s.length > 0);
/** 점수 판 실험 설정 하나: 도전자에 더할 옵션과 바꿀 조정값 */
interface StandingConfig {
  label: string;
  options: HeartsSearchOptions;
  tuning: Record<string, number>;
}

/** `standingRollout=self,standingWeight=13;standingLast=0` 꼴. 비어 있으면 기본값 하나 */
function standingConfigs(text: string | undefined): StandingConfig[] {
  const parts = (text ?? "").split(";");
  return parts.map((part) => {
    const options: Record<string, string> = {};
    const tuning: Record<string, number> = {};
    let clocked = false;
    for (const [k, v] of part
      .split(",")
      .filter((s) => s.includes("="))
      .map((s) => s.split("=") as [string, string])) {
      if (k === "standingRollout") options[k] = v;
      // clock=1: 제품의 혼자 하기처럼 실제 시계로 시간 상한(300ms)을 켠다
      else if (k === "clock") clocked = v === "1";
      else if (k.startsWith("standing") && k in HEARTS_TUNING)
        tuning[k] = Number(v);
      else throw new Error(`점수 판 설정이 아니다: ${k}`);
    }
    return {
      label: part || "기본값",
      options: clocked ? { ...options, clock: performance } : options,
      tuning,
    };
  });
}
const STANDING_SET = standingConfigs(process.env.HEARTS_BENCH_SET);
const DEFAULT_TUNING = { ...HEARTS_TUNING };

const [PLAY_WORLDS, PASS_WORLDS] = (process.env.HEARTS_BENCH_WORLDS ?? "")
  .split(",")
  .map((s: string) => (s ? Number(s) : undefined));
const WORLDS: HeartsSearchOptions = {
  ...(PLAY_WORLDS ? { worlds: PLAY_WORLDS } : {}),
  ...(PASS_WORLDS ? { passWorlds: PASS_WORLDS } : {}),
};

/** 옛 고수(2026-10-25): 넘기기·카드 내기 계산은 같고, 시간 상한·점수 판·문 슛이 없다 */
const OLD: HeartsSearchOptions = {
  ...WORLDS,
  standing: false,
  moon: false,
  block: false,
};

interface Timing {
  pass: number[];
  play: number[];
}

function timed(bot: HeartsBot, timing: Timing): HeartsBot {
  return {
    name: bot.name,
    decide(view: PlayerView, rng) {
      const t = performance.now();
      const action = bot.decide(view, rng);
      const ms = performance.now() - t;
      if (view.decision?.kind === "pass") timing.pass.push(ms);
      else if (view.decision?.kind === "play" && view.decision.cards.length > 1)
        timing.play.push(ms);
      return action;
    },
  };
}

/** 문 슛 판: 한 사람 0점, 나머지 26점 이상(윈도우 규칙) */
function moonShooterOf(round: readonly number[]): number | null {
  const zero = round.indexOf(0);
  if (zero < 0) return null;
  return round.every((p, s) => s === zero || p >= 26) ? zero : null;
}

/** 게임 끝이 가까운 시작 점수: 자리마다 55~90점(씨앗으로 정해짐) */
function lateScores(seed: number): number[] {
  return [0, 1, 2, 3].map((s) => 55 + ((seed * 7919 + s * 104729) % 36));
}

/** 이 자리들이 게임 1등을 한 몫(같은 점수면 나눈다). 게임이 안 끝났으면 null */
function winsOf(
  result: HeartsSimulationResult,
  seats: readonly number[],
): number | null {
  if (result.state.round.phase !== "gameOver") return null;
  const low = Math.min(...result.points);
  const lows = result.points.filter((p) => p === low).length;
  let wins = 0;
  result.points.forEach((p, s) => {
    if (p === low && seats.includes(s)) wins += 1 / lows;
  });
  return wins;
}

/** 이 자리들의 (상대 평균 − 내 평균) 받은 점수 */
function edgeOf(
  result: HeartsSimulationResult,
  seats: readonly number[],
): number {
  let mine = 0;
  let theirs = 0;
  result.points.forEach((p, s) => {
    if (seats.includes(s)) mine += p / 2;
    else theirs += p / 2;
  });
  return theirs - mine;
}

interface GameRecord {
  edge: number;
  rounds: number;
  won: number;
  /** 짝 비교: 같은 씨앗·자리를 옛 고수 넷으로 둔 대조 게임 */
  control?: { edge: number; rounds: number; won: number };
}

const SEATINGS = [
  [0, 2],
  [1, 3],
];

function play(
  bots: HeartsBot[],
  seed: number,
  late: boolean,
): HeartsSimulationResult {
  return simulateHearts({
    rules: WINDOWS_RULES,
    seed: 1000 + seed,
    bots,
    rounds: 1000,
    ...(late ? { scores: lateScores(seed) } : {}),
  });
}

/** 짝 비교의 대조 게임(옛 고수 넷, 55~90점 시작). 씨앗별로 한 번만 둔다 */
const controls = new Map<number, HeartsSimulationResult>();

function duel(
  challenger: HeartsBot,
  baseline: HeartsBot,
  games: number,
  late = false,
  paired = false,
) {
  const perGame: GameRecord[] = [];
  let moonsMine = 0;
  let moonsTheirs = 0;
  for (let seed = FROM; seed < FROM + games; seed++) {
    for (const seats of SEATINGS) {
      const bots = [0, 1, 2, 3].map((s) =>
        seats.includes(s) ? challenger : baseline,
      );
      const result = play(bots, seed, late);
      const record: GameRecord = {
        edge: edgeOf(result, seats),
        rounds: result.rounds,
        won: winsOf(result, seats) ?? Number.NaN,
      };
      if (paired) {
        // 대조 게임은 씨앗만으로 정해지니(옛 고수 넷) 자리·설정이 달라도 한 번만 둔다.
        let control = controls.get(seed);
        if (!control) {
          control = play(
            [0, 1, 2, 3].map(() => baseline),
            seed,
            late,
          );
          controls.set(seed, control);
        }
        record.control = {
          edge: edgeOf(control, seats),
          rounds: control.rounds,
          won: winsOf(control, seats) ?? Number.NaN,
        };
      }
      perGame.push(record);
      for (const r of result.state.history) {
        const shooter = moonShooterOf(r);
        if (shooter === null) continue;
        if (seats.includes(shooter)) moonsMine++;
        else moonsTheirs++;
      }
    }
  }
  return { perGame, moonsMine, moonsTheirs };
}

/** 평균과 표준 오차 */
function meanSe(xs: readonly number[]): [number, number] {
  const n = xs.length;
  if (n === 0) return [0, 0];
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance =
    n > 1 ? xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1) : 0;
  return [mean, Math.sqrt(variance / n)];
}

const signed = (x: number, digits: number) =>
  `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;

function report(r: ReturnType<typeof duel>): string {
  const games = r.perGame.filter((g) => !Number.isNaN(g.won));
  const rounds = r.perGame.reduce((a, g) => a + g.rounds, 0);
  const perRound = rounds / Math.max(1, r.perGame.length);
  // 판당 점수 차: 게임마다 점수 차 합을 평균 판 수로 나눈다
  const [edge, edgeSe] = meanSe(r.perGame.map((g) => g.edge / perRound));
  const [win, winSe] = meanSe(games.map((g) => g.won));
  let text =
    `판당 ${signed(edge, 2)}점(±${edgeSe.toFixed(2)}), 1등 몫 ${(win * 100).toFixed(1)}%(±${(winSe * 100).toFixed(1)})` +
    ` (${games.length}게임 ${rounds}판, 문 슛 도전자 ${r.moonsMine}·상대 ${r.moonsTheirs})`;
  const paired = games.filter((g) => g.control && !Number.isNaN(g.control.won));
  if (paired.length > 0) {
    const [dw, dwSe] = meanSe(paired.map((g) => g.won - (g.control?.won ?? 0)));
    const [de, deSe] = meanSe(
      paired.map((g) => (g.edge - (g.control?.edge ?? 0)) / perRound),
    );
    text +=
      `\n  짝 비교(대조 게임 뺌): 1등 몫 ${signed(dw * 100, 1)}%p(±${(dwSe * 100).toFixed(1)}), 판당 ${signed(de, 2)}점(±${deSe.toFixed(2)})` +
      `\n  합칠 값 n=${paired.length} 1등차합=${paired.reduce((a, g) => a + g.won - (g.control?.won ?? 0), 0).toFixed(3)}` +
      ` 1등차제곱합=${paired.reduce((a, g) => a + (g.won - (g.control?.won ?? 0)) ** 2, 0).toFixed(3)}` +
      ` 점수차합=${paired.reduce((a, g) => a + (g.edge - (g.control?.edge ?? 0)), 0).toFixed(1)}` +
      ` 점수차제곱합=${paired.reduce((a, g) => a + (g.edge - (g.control?.edge ?? 0)) ** 2, 0).toFixed(1)} 판=${rounds}`;
  }
  return text;
}

function stats(xs: number[]) {
  if (xs.length === 0) return "없음";
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return `평균 ${mean.toFixed(1)}ms, 95% ${p95.toFixed(1)}ms, 최대 ${(sorted.at(-1) ?? 0).toFixed(1)}ms`;
}

const VARIANTS: [string, HeartsSearchOptions, "old" | "normal" | "late"][] = [
  ["새 고수(전부) vs 옛 고수", { clock: performance }, "old"],
  [
    "점수 판만 vs 옛 고수(55~90점에서 시작)",
    { ...OLD, standing: true },
    "late",
  ],
  ["문 슛 노리기만 vs 옛 고수", { ...OLD, moon: true, block: false }, "old"],
  ["문 슛 막기만 vs 옛 고수", { ...OLD, moon: false, block: true }, "old"],
  [
    "시간 상한만 vs 옛 고수",
    { ...OLD, clock: performance, timeLimitMs: HEARTS_SEARCH_TIME_LIMIT_MS },
    "old",
  ],
  ["새 고수(전부) vs 중수", { clock: performance }, "normal"],
];

/** 진단: HEARTS_BENCH_DIFF=1이면 순위를 보는 국면에서 옛 고수와 다른 카드를 고른 횟수를 센다(느려진다) */
const DIFF = process.env.HEARTS_BENCH_DIFF === "1";

interface Changes {
  active: number;
  changed: number;
}

/** 둘 때마다 같은 난수 상태로 옛 고수의 수도 구해 견준다. 도전자가 실제로 두는 수는 그대로다 */
function countChanges(
  bot: HeartsBot,
  old: HeartsBot,
  changes: Changes,
): HeartsBot {
  return {
    name: bot.name,
    decide(view, rng) {
      const active =
        view.decision?.kind === "play" &&
        view.decision.cards.length > 1 &&
        standingFor(view) !== null;
      const theirs = active ? old.decide(view, { ...rng }) : null;
      const action = bot.decide(view, rng);
      if (theirs) {
        changes.active++;
        if (
          action.type === "play" &&
          theirs.type === "play" &&
          action.card !== theirs.card
        )
          changes.changed++;
      }
      return action;
    },
  };
}

const KEYS: Record<string, string> = {
  "새 고수(전부) vs 옛 고수": "old",
  "점수 판만 vs 옛 고수(55~90점에서 시작)": "standing",
  "문 슛 노리기만 vs 옛 고수": "moon",
  "문 슛 막기만 vs 옛 고수": "block",
  "시간 상한만 vs 옛 고수": "time",
  "새 고수(전부) vs 중수": "normal",
};

describe("하트 고수 판단 셋 (pnpm --filter @game/hearts-ai bench src/search.strength.ts)", () => {
  for (const [label, options, against] of VARIANTS) {
    const key = KEYS[label] ?? label;
    const run = ONLY.length === 0 || ONLY.includes(key) ? it : it.skip;
    run(label, () => {
      const late = against === "late";
      // 점수 판은 설정마다 차례로(같은 대조 게임을 쓴다), 나머지는 한 번
      const configs: StandingConfig[] = late
        ? STANDING_SET
        : [{ label: "", options: {}, tuning: {} }];
      for (const config of configs) {
        Object.assign(HEARTS_TUNING, DEFAULT_TUNING, config.tuning);
        const timing: Timing = { pass: [], play: [] };
        const baseline =
          against === "normal" ? heartsNormalBot : createHeartsSearchBot(OLD);
        const bot = createHeartsSearchBot({
          ...WORLDS,
          ...options,
          ...config.options,
        });
        const changes: Changes = { active: 0, changed: 0 };
        const challenger = timed(
          late && DIFF ? countChanges(bot, baseline, changes) : bot,
          timing,
        );
        const r = duel(challenger, baseline, GAMES, late, late);
        const changed =
          late && DIFF
            ? `\n  순위를 보는 국면의 카드 내기 ${changes.active}번 중 옛 고수와 다른 카드 ${changes.changed}번(${((changes.changed / Math.max(1, changes.active)) * 100).toFixed(1)}%)`
            : "";
        console.log(
          `${label}${late ? ` [${config.label}]` : ""}${PLAY_WORLDS ? ` [추측 ${PLAY_WORLDS}·${PASS_WORLDS ?? 24}판]` : ""} 씨앗 ${FROM}~${FROM + GAMES - 1}: ${report(r)}${changed}` +
            `\n  넘기기 ${stats(timing.pass)}\n  카드 내기 ${stats(timing.play)}`,
        );
        expect(r.perGame.length).toBeGreaterThan(0);
      }
      Object.assign(HEARTS_TUNING, DEFAULT_TUNING);
    });
  }
});
