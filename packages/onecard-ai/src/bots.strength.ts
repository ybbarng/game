import { createRng } from "@game/mighty-engine";
import {
  type Action,
  createMatch,
  STANDARD_ONECARD_RULES,
  seededReshuffle,
  shuffledOnecardDeck,
  step,
  viewOf,
} from "@game/onecard-engine";
import { expect, it } from "vitest";

import { chooseAction } from "./choose";
import { expertCandidates } from "./expert";
import type { OnecardLevel } from "./levels";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(나이롱뽕 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

const NAMES = ["입문", "중수", "고수"];
/** 3인 판 수. 4인 짝 비교는 그 절반(짝마다 두 판). 줄여 빨리 볼 때 `ONECARD_BENCH_GAMES=60` */
const GAMES = Number(process.env.ONECARD_BENCH_GAMES ?? 300);
const PAIRED = Math.round(GAMES / 2);

/**
 * 4인 판: 같은 씨앗으로 두 번 한다. 한 번은 한 자리에 `strong`, 나머지 셋은 `weak`,
 * 한 번은 넷 모두 `weak`. 그 자리 등수 차이를 모으면 패 운이 많이 지워진다(짝 비교).
 * 자리는 씨앗마다 돌린다. 1등 횟수도 센다
 */
function paired(strong: OnecardLevel, weak: OnecardLevel, games: number) {
  let rank = 0;
  let baseRank = 0;
  let firsts = 0;
  let baseFirsts = 0;
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 4;
    const levels = [0, 1, 2, 3].map((s) => (s === seat ? strong : weak));
    const mixed = playGame(levels, STANDARD_ONECARD_RULES, seed).state;
    const base = playGame(
      [weak, weak, weak, weak],
      STANDARD_ONECARD_RULES,
      seed,
    ).state;
    const mine = mixed.result?.ranks[seat] as number;
    const before = base.result?.ranks[seat] as number;
    rank += mine;
    baseRank += before;
    if (mine === 1) firsts++;
    if (before === 1) baseFirsts++;
  }
  const result = {
    rank: rank / games,
    baseRank: baseRank / games,
    firsts,
    baseFirsts,
  };
  console.log(
    `4인 ${games}판: ${NAMES[weak]} 셋 사이 한 자리에 ${NAMES[strong]} → 평균 등수 ${result.baseRank.toFixed(2)} → ${result.rank.toFixed(2)}, 1등 ${baseFirsts}번 → ${firsts}번`,
  );
  return result;
}

/** 3인 판: 입문·중수·고수가 자리를 돌려 가며 한다. 단계별 평균 등수와 1등 횟수 */
function threeWay(games: number) {
  const perms: OnecardLevel[][] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const rules = { ...STANDARD_ONECARD_RULES, players: 3 };
  const ranks = [0, 0, 0];
  const firsts = [0, 0, 0];
  const shouts = [0, 0, 0];
  for (let seed = 1; seed <= games; seed++) {
    const levels = perms[seed % perms.length] as OnecardLevel[];
    const game = playGame(levels, rules, seed);
    levels.forEach((level, seat) => {
      const r = game.state.result?.ranks[seat] as number;
      ranks[level] = (ranks[level] as number) + r;
      if (r === 1) firsts[level] = (firsts[level] as number) + 1;
      shouts[level] = (shouts[level] as number) + (game.shouts[seat] as number);
    });
  }
  for (const level of [0, 1, 2])
    console.log(
      `3인 ${games}판 ${NAMES[level]}: 평균 등수 ${((ranks[level] as number) / games).toFixed(2)}, 1등 ${firsts[level]}번(${(((firsts[level] as number) / games) * 100).toFixed(0)}%), 외침 ${shouts[level]}번`,
    );
  return ranks.map((r) => r / games);
}

/** 4인 고수끼리 몇 판을 두며, 후보가 둘 이상이라 실제로 굴려 본 수의 시간만 잰다 */
it("고수 한 수에 걸리는 시간", () => {
  const rng = createRng(4);
  const times: number[] = [];
  let all = 0;
  for (let seed = 1; seed <= 3; seed++) {
    let { state } = createMatch(STANDARD_ONECARD_RULES, {
      deck: shuffledOnecardDeck(seed),
    });
    for (let i = 0; i < 300 && state.phase !== "over"; i++) {
      const seat = state.turn;
      const action =
        state.phase === "reshuffle"
          ? (seededReshuffle(state, seed + i) as Action)
          : (() => {
              const view = viewOf(state, seat);
              const searched = expertCandidates(view, {}).length > 1;
              const t = performance.now();
              const a = chooseAction(view, 2, rng);
              all++;
              if (searched) times.push(performance.now() - t);
              return a;
            })();
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
  }
  times.sort((a, b) => a - b);
  console.log(
    `고수 한 수(굴려 본 ${times.length}수 / 전체 ${all}수): 가운데 ${times[times.length >> 1]?.toFixed(1)}ms, 상위 5% ${times[Math.floor(times.length * 0.95)]?.toFixed(1)}ms, 가장 긴 ${times.at(-1)?.toFixed(1)}ms`,
  );
  expect(times.at(-1)).toBeLessThan(1000);
});

it("3인: 고수 > 중수 > 입문(평균 등수가 낮다)", () => {
  const [beginner, intermediate, expert] = threeWay(GAMES) as [
    number,
    number,
    number,
  ];
  expect(expert).toBeLessThan(intermediate);
  expect(intermediate).toBeLessThan(beginner);
});

it("4인: 위 단계를 아래 단계 사이에 앉히면 등수가 오른다", () => {
  const a = paired(1, 0, PAIRED);
  expect(a.rank).toBeLessThan(a.baseRank);
  const b = paired(2, 1, PAIRED);
  expect(b.rank).toBeLessThan(b.baseRank);
});
