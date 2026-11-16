import { type PlayerView, WINDOWS_RULES } from "@game/hearts-engine";
import { describe, expect, it } from "vitest";

import type { HeartsBot } from "./knowledge";
import { heartsNormalBot } from "./rule-bot";
import {
  createHeartsSearchBot,
  HEARTS_SEARCH_TIME_LIMIT_MS,
  type HeartsSearchOptions,
} from "./search-bot";
import { simulateHearts } from "./simulate";

/*
 * 고수 판단 셋(넘기기 시간 상한·점수 판·문 슛)을 옛 고수와 견준다.
 * 게임 끝(100점)까지 두어 판당 점수 차와 게임 1등 몫을 함께 잰다.
 * 도전자를 0·2번 자리와 1·3번 자리에 한 번씩 앉혀 패 운을 줄인다.
 *
 * 돌리기: pnpm --filter @game/hearts-ai bench -- search
 * 새 고수는 제품의 혼자 하기처럼 실제 시계로 시간 상한을 켠다.
 * 게임 수: HEARTS_BENCH_GAMES(기본 12, 자리 바꿔 두 번이라 실제로는 24게임)
 * 고를 비교: HEARTS_BENCH_ONLY=old,standing,moon,block,time,normal (쉼표로, 없으면 전부)
 * 추측 판 수: HEARTS_BENCH_WORLDS=카드 내기,넘기기(예: 12,8). 두 쪽 모두 같게 줄여 게임을 더 많이 돌린다
 */

declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

const GAMES = Number(process.env.HEARTS_BENCH_GAMES ?? 12);
const ONLY = (process.env.HEARTS_BENCH_ONLY ?? "")
  .split(",")
  .filter((s: string) => s.length > 0);

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

function duel(
  challenger: HeartsBot,
  baseline: HeartsBot,
  games: number,
  late = false,
) {
  let edge = 0;
  let rounds = 0;
  let wins = 0;
  let finished = 0;
  let moonsMine = 0;
  let moonsTheirs = 0;
  for (let seed = 0; seed < games; seed++) {
    for (const seats of [
      [0, 2],
      [1, 3],
    ]) {
      const bots = [0, 1, 2, 3].map((s) =>
        seats.includes(s) ? challenger : baseline,
      );
      const result = simulateHearts({
        rules: WINDOWS_RULES,
        seed: 1000 + seed,
        bots,
        rounds: 1000,
        ...(late ? { scores: lateScores(seed) } : {}),
      });
      let mine = 0;
      let theirs = 0;
      result.points.forEach((p, s) => {
        if (seats.includes(s)) mine += p / 2;
        else theirs += p / 2;
      });
      edge += theirs - mine;
      rounds += result.rounds;
      if (result.state.round.phase === "gameOver") {
        finished++;
        const low = Math.min(...result.points);
        const lows = result.points.filter((p) => p === low).length;
        result.points.forEach((p, s) => {
          if (p === low && seats.includes(s)) wins += 1 / lows;
        });
      }
      for (const r of result.state.history) {
        const shooter = moonShooterOf(r);
        if (shooter === null) continue;
        if (seats.includes(shooter)) moonsMine++;
        else moonsTheirs++;
      }
    }
  }
  return {
    /** 판당 점수 차(도전자가 덜 받은 만큼, 클수록 도전자가 잘함) */
    edge: edge / rounds,
    /** 게임 1등 몫(도전자 두 자리 합, 같은 세기면 0.5) */
    winShare: wins / finished,
    rounds,
    games: finished,
    moonsMine,
    moonsTheirs,
  };
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

const KEYS: Record<string, string> = {
  "새 고수(전부) vs 옛 고수": "old",
  "점수 판만 vs 옛 고수(55~90점에서 시작)": "standing",
  "문 슛 노리기만 vs 옛 고수": "moon",
  "문 슛 막기만 vs 옛 고수": "block",
  "시간 상한만 vs 옛 고수": "time",
  "새 고수(전부) vs 중수": "normal",
};

describe("하트 고수 판단 셋 (pnpm --filter @game/hearts-ai bench -- search)", () => {
  for (const [label, options, against] of VARIANTS) {
    const key = KEYS[label] ?? label;
    const run = ONLY.length === 0 || ONLY.includes(key) ? it : it.skip;
    run(label, () => {
      const timing: Timing = { pass: [], play: [] };
      const challenger = timed(
        createHeartsSearchBot({ ...WORLDS, ...options }),
        timing,
      );
      const baseline =
        against === "normal" ? heartsNormalBot : createHeartsSearchBot(OLD);
      const r = duel(challenger, baseline, GAMES, against === "late");
      console.log(
        `${label}${PLAY_WORLDS ? ` [추측 ${PLAY_WORLDS}·${PASS_WORLDS ?? 24}판]` : ""}: 판당 ${r.edge >= 0 ? "+" : ""}${r.edge.toFixed(2)}점, 1등 몫 ${(r.winShare * 100).toFixed(1)}%` +
          ` (${r.games}게임 ${r.rounds}판, 문 슛 도전자 ${r.moonsMine}·상대 ${r.moonsTheirs})` +
          `\n  넘기기 ${stats(timing.pass)}\n  카드 내기 ${stats(timing.play)}`,
      );
      expect(r.rounds).toBeGreaterThan(0);
    });
  }
});
