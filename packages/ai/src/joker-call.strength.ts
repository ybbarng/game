import {
  type JokerCallVerdict,
  type MatchState,
  presetRules,
  type RulePresetId,
  trickJokerCallVerdict,
} from "@game/mighty-engine";
import { describe, it } from "vitest";

import type { Bot } from "./bot";
import { createRuleBot, NORMAL_BOOK } from "./heuristic-bot";
import { createSearchBot } from "./search-bot";
import { simulate } from "./simulate";

// 이 패키지는 node 형을 쓰지 않는다(엔진처럼 어디서나 돈다). bench만 이 둘을 쓴다
declare const console: { log(...args: unknown[]): void };
declare const process: { env: Record<string, string | undefined> };

/*
 * 조커콜 가리기(`jokerCallOdds`) 세기 재기: pnpm --filter @game/mighty-ai bench src/joker-call.strength.ts
 * 새 컴퓨터를 옛 컴퓨터와 섞어 앉히고(같은 판을 자리 바꿔 두 번) 판당 돈 차이, 주공일 때 공약 성공률,
 * 조커콜 효과 비율(`trickJokerCallVerdict`)을 견준다. 판 수는 환경 변수로:
 * JOKER_BENCH_NORMAL(중수 씨앗 수, 기본 0이면 건너뜀), JOKER_BENCH_SEARCH(고수 씨앗 수), JOKER_BENCH_RULES(규칙, 기본 standard5),
 * JOKER_BENCH_MIN(문턱 여럿, 쉼표로. 기본 0.2)
 */

interface Side {
  money: number;
  declared: number;
  declaredWon: number;
  calls: Record<JokerCallVerdict, number>;
}

function emptySide(): Side {
  return {
    money: 0,
    declared: 0,
    declaredWon: 0,
    calls: { effective: 0, lostTrick: 0, ownJoker: 0, noJoker: 0 },
  };
}

function countRound(state: MatchState, sideOf: (seat: number) => Side) {
  const { round } = state;
  const declarer = round.declarer;
  if (declarer === null || round.result === null) return;
  const d = sideOf(declarer);
  d.declared++;
  if (round.result.rulingWon) d.declaredWon++;
  const ruling = (s: number) => s === declarer || s === round.friend;
  for (const trick of round.tricks) {
    const verdict = trickJokerCallVerdict(trick, ruling);
    if (verdict) sideOf(trick.leader).calls[verdict]++;
  }
}

function duel(
  rules: ReturnType<typeof presetRules>,
  challenger: Bot,
  baseline: Bot,
  seeds: number,
  rounds = 6,
) {
  const mine = emptySide();
  const theirs = emptySide();
  let played = 0;
  let edge = 0;
  // 씨앗마다(자리 바꾼 두 번을 합친) 판당 돈 차이. 표준 오차를 잰다
  const perSeed: number[] = [];
  for (let seed = 0; seed < seeds; seed++) {
    let seedEdge = 0;
    let seedRounds = 0;
    for (const seats of [
      [0, 2],
      [1, 3, 4],
    ]) {
      const bots = [0, 1, 2, 3, 4].map((s) =>
        seats.includes(s) ? challenger : baseline,
      );
      const sideOf = (s: number) => (seats.includes(s) ? mine : theirs);
      const result = simulate({
        rules,
        seed,
        bots,
        rounds,
        onRoundScored: (state) => countRound(state, sideOf),
      });
      let a = 0;
      let b = 0;
      result.moneyDelta.forEach((delta, seat) => {
        if (seats.includes(seat)) a += delta / seats.length;
        else b += delta / (5 - seats.length);
      });
      edge += a - b;
      played += result.roundsPlayed;
      seedEdge += a - b;
      seedRounds += result.roundsPlayed;
    }
    if (seedRounds > 0) perSeed.push(seedEdge / seedRounds);
  }
  const avg = perSeed.reduce((x, y) => x + y, 0) / perSeed.length;
  const variance =
    perSeed.reduce((x, y) => x + (y - avg) ** 2, 0) /
    Math.max(1, perSeed.length - 1);
  const error = Math.sqrt(variance / perSeed.length);
  return { edge: edge / played, error, played, mine, theirs };
}

function line(name: string, side: Side): string {
  const c = side.calls;
  const total = c.effective + c.lostTrick + c.ownJoker + c.noJoker;
  const pct = (n: number) =>
    total === 0 ? "-" : `${((100 * n) / total).toFixed(1)}%`;
  const rate =
    side.declared === 0
      ? "-"
      : `${((100 * side.declaredWon) / side.declared).toFixed(1)}%`;
  return `${name}: 주공 ${side.declared}판 성공 ${rate} · 조커콜 ${total}번 효과 ${pct(c.effective)} (턴 내줌 ${pct(c.lostTrick)}, 우리 조커 ${pct(c.ownJoker)}, 조커 없음 ${pct(c.noJoker)})`;
}

function report(title: string, r: ReturnType<typeof duel>) {
  console.log(
    [
      `${title} — ${r.played}판, 판당 돈 차이(새 − 옛) ${r.edge >= 0 ? "+" : ""}${r.edge.toFixed(3)} (표준 오차 ${r.error.toFixed(3)})`,
      `  ${line("새", r.mine)}`,
      `  ${line("옛", r.theirs)}`,
    ].join("\n"),
  );
}

const rulesId = (process.env.JOKER_BENCH_RULES ?? "standard5") as RulePresetId;
const rules = presetRules(rulesId);
const normalSeeds = Number(process.env.JOKER_BENCH_NORMAL ?? 0);
const searchSeeds = Number(process.env.JOKER_BENCH_SEARCH ?? 0);
const mins = (process.env.JOKER_BENCH_MIN ?? "0.2").split(",").map(Number);

const oldNormal = createRuleBot({
  name: "normal-old",
  book: NORMAL_BOOK.filter((r) => r !== "jokerCallOdds"),
});
const newNormal = (min: number) =>
  createRuleBot({
    name: `normal-${min}`,
    book: [
      ...NORMAL_BOOK.filter((r) => r !== "jokerCallOdds"),
      "jokerCallOdds",
    ],
    jokerCallMin: min,
  });

describe(`조커콜 가리기 (${rulesId})`, () => {
  it.skipIf(normalSeeds === 0)("중수: 새 vs 옛", () => {
    for (const min of mins)
      report(
        `중수 문턱 ${min}`,
        duel(rules, newNormal(min), oldNormal, normalSeeds),
      );
  });

  it.skipIf(searchSeeds === 0)("고수: 새 vs 옛", () => {
    const oldSearch = createSearchBot({ rollout: oldNormal });
    for (const min of mins)
      report(
        `고수 문턱 ${min}`,
        duel(
          rules,
          createSearchBot({ rollout: newNormal(min) }),
          oldSearch,
          searchSeeds,
        ),
      );
  });
});
