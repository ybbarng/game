import {
  type ChessRules,
  createChessScenario,
  createMatch,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/chess-engine";
import { createRng } from "@game/mighty-engine";
import { expect, it } from "vitest";

import {
  type ChessBot,
  chessBeginnerBot,
  chessExpertBot,
  chessExpertBotV1,
  chessIntermediateBot,
  chessMasterBot,
  createChessMasterBot,
  MASTER_NODE_BUDGET,
} from "./bots";
import { EXPERT_TUNING, type SearchTuning } from "./expert";
import { MASTER_TUNING } from "./master";
import { playGame } from "./simulate";

// 세기 비교 결과를 사람이 읽게 찍는다(장기 세기 비교와 같다).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };
const env = process.env;

const RULES: ChessRules = STANDARD_RULES;

/** `strong`이 백·흑을 번갈아 쥐고 `games`판 두어 점수(승 1·무 0.5)를 센다 */
function duel(strong: ChessBot, weak: ChessBot, games: number) {
  let wins = 0;
  let draws = 0;
  const kinds: Record<string, number> = {};
  for (let seed = 1; seed <= games; seed++) {
    const seat = seed % 2;
    const bots: [ChessBot, ChessBot] =
      seat === 0 ? [strong, weak] : [weak, strong];
    const end = playGame(bots, RULES, seed);
    if (end.wins[seat] === 1) wins++;
    const result = end.result;
    if (result?.kind === "draw") draws++;
    const kind =
      result?.kind === "draw" ? `draw:${result.reason}` : (result?.kind ?? "?");
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  const points = wins + draws / 2;
  console.log(
    `${strong.name} 대 ${weak.name}: ${wins}승 ${draws}무 ${games - wins - draws}패 / ${games}판 (${points}점)`,
    JSON.stringify(kinds),
  );
  return points;
}

/** `bot`이 백으로 상대(흑)와 두며 한 수마다 걸린 시간 */
function moveTimes(bot: ChessBot, opponent: ChessBot, seed: number) {
  let { state } = createMatch(RULES, seed);
  const rng = createRng(seed + 1);
  const times: number[] = [];
  for (let i = 0; i < 160 && state.phase === "play"; i++) {
    const seat = pendingSeats(state)[0] as number;
    const mine = seat === state.whiteSeat;
    const t = performance.now();
    const action = (mine ? bot : opponent).decide(viewOf(state, seat), rng);
    if (mine) times.push(performance.now() - t);
    const r = step(state, seat, action);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return times;
}

it("고수 한 수에 걸리는 시간", () => {
  for (const bot of [chessExpertBotV1, chessExpertBot]) {
    const times = [
      ...moveTimes(bot, chessIntermediateBot, 1),
      ...moveTimes(bot, chessExpertBotV1, 2),
    ].sort((a, b) => a - b);
    console.log(
      `${bot.name} 한 수: 가운데 ${times[times.length >> 1]?.toFixed(0)}ms, 가장 긴 ${times.at(-1)?.toFixed(0)}ms (${times.length}수)`,
    );
  }
});

it("고수·초고수는 킹+퀸·킹+룩으로 킹을 몰고, 초고수는 킹+폰 대 킹을 이긴다", () => {
  for (const bot of [chessExpertBot, chessMasterBot])
    for (const fen of [
      "8/8/3k4/8/8/8/8/2Q1K3 w - - 0 1",
      "3k4/8/8/8/4K3/8/8/7R w - - 0 1",
      ...(bot === chessMasterBot
        ? // 승패표로 이기는 판(맞서기를 가진 판, 킹이 폰 앞 6번째 줄에 선 판)
          ["8/4k3/8/4K3/4P3/8/8/8 b - - 0 1", "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1"]
        : []),
    ]) {
      const end = playGame(
        [bot, chessBeginnerBot],
        RULES,
        1,
        createChessScenario({ fen, me: "w" }),
      );
      console.log(
        `${bot.name} ${fen}: ${end.result?.kind} ${end.played.length}수`,
      );
      expect(end.result).toEqual({ kind: "checkmate", seat: 0 });
    }
});

it("새 고수가 예전 고수를 이긴다", () => {
  expect(duel(chessExpertBot, chessExpertBotV1, 20)).toBeGreaterThanOrEqual(14);
});

it("단계가 높을수록 이긴다", () => {
  expect(
    duel(chessIntermediateBot, chessBeginnerBot, 10),
  ).toBeGreaterThanOrEqual(8);
  expect(duel(chessExpertBot, chessIntermediateBot, 10)).toBeGreaterThanOrEqual(
    8,
  );
});

// ── 초고수 ──────────────────────────────────────────────────

/**
 * 잴 초고수. 환경 변수로 바꿔 가며 잰다: BUDGET(판 수 상한), NOBOOK=1(책 없이),
 * PLAIN=evaluate,futility,…(그 항목만 고수와 같게)
 */
const masterUnderTest = (() => {
  const plain = (env.PLAIN ?? "").split(",").filter(Boolean);
  const tuning: SearchTuning = { ...MASTER_TUNING };
  for (const key of plain) {
    if (key === "evaluate") tuning.evaluate = EXPERT_TUNING.evaluate;
    else if (key === "probe") tuning.probe = null;
    else if (key === "pruneLosingCaptures") tuning.pruneLosingCaptures = false;
    else if (key === "futility") tuning.futility = false;
    else if (key === "deepReduce") tuning.deepReduce = false;
  }
  return createChessMasterBot(Number(env.BUDGET ?? MASTER_NODE_BUDGET), {
    book: env.NOBOOK !== "1",
    tuning,
  });
})();

it("초고수 한 수에 걸리는 시간(같은 실행에서 고수와 견준다)", () => {
  // 기기 부하에 따라 시간이 달라지므로 고수도 같은 판들에서 함께 잰다.
  for (const bot of [chessExpertBot, masterUnderTest]) {
    const times = [
      ...moveTimes(bot, chessIntermediateBot, 1),
      ...moveTimes(bot, chessExpertBot, 2),
    ].sort((a, b) => a - b);
    console.log(
      `${bot.name} 한 수: 가운데 ${times[times.length >> 1]?.toFixed(0)}ms, 가장 긴 ${times.at(-1)?.toFixed(0)}ms (${times.length}수)`,
    );
  }
});

it("초고수가 고수를 이긴다(20판 15점 이상)", () => {
  const games = Number(env.GAMES ?? 20);
  expect(duel(masterUnderTest, chessExpertBot, games)).toBeGreaterThanOrEqual(
    games * 0.75,
  );
});
