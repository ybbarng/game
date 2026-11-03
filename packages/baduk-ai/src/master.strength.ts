import {
  type BadukRules,
  type BoardSize,
  createMatch,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/baduk-engine";
import { createRng } from "@game/mighty-engine";
import { it } from "vitest";

import { type BadukBot, badukExpertBot, createBadukMasterBot } from "./bots";

/*
 * 초고수 대 고수 세기 비교. 오래 걸려 환경 변수로 판 크기·판 수·초고수 판 수를 고른다.
 *   MASTER_SIZE=9 MASTER_GAMES=20 pnpm --filter @game/baduk-ai bench master
 * MASTER_PLAYOUTS를 주면 그 판 수(9줄 기준)로 둔다. 기법마다 효과를 견줄 때 쓴다.
 */
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

const env = process.env;
const SIZE = Number(env.MASTER_SIZE ?? 9) as BoardSize;
const GAMES = Number(env.MASTER_GAMES ?? 20);
const FIRST = Number(env.MASTER_FIRST_SEED ?? 1);
const master = createBadukMasterBot(
  env.MASTER_PLAYOUTS ? Number(env.MASTER_PLAYOUTS) : undefined,
  { purpose: env.MASTER_PURPOSE !== "0" },
);

/**
 * 상대: 기본은 고수. MASTER_OPP_PLAYOUTS·MASTER_OPP_PURPOSE 가운데 하나라도 주면
 * 그 설정의 초고수와 맞붙인다(목적 층처럼 고수 상대로는 차이가 가려지는 기법을 견줄 때)
 */
const opponent: BadukBot =
  env.MASTER_OPP_PLAYOUTS || env.MASTER_OPP_PURPOSE
    ? createBadukMasterBot(
        env.MASTER_OPP_PLAYOUTS ? Number(env.MASTER_OPP_PLAYOUTS) : undefined,
        { purpose: env.MASTER_OPP_PURPOSE !== "0" },
      )
    : badukExpertBot;

/** 이보다 오래 걸린 수는 따로 찍는다 */
const SLOW = Number(env.MASTER_SLOW ?? 1500);

const RULES: BadukRules = { ...STANDARD_RULES, size: SIZE };

it(`초고수 세기(${SIZE}줄)`, () => {
  let wins = 0;
  const margins: number[] = [];
  const times: number[] = [];
  const timed = (bot: BadukBot): BadukBot => ({
    name: bot.name,
    decide(view, rng) {
      const t = performance.now();
      const a = bot.decide(view, rng);
      const spent = performance.now() - t;
      times.push(spent);
      if (spent > SLOW)
        console.log(
          `  느린 수: ${view.played.length + 1}수째 ${spent.toFixed(0)}ms`,
        );
      return a;
    },
  });
  const strong = timed(master);
  for (let seed = FIRST; seed < FIRST + GAMES; seed++) {
    const black = createMatch(RULES, seed).state.blackSeat;
    // 홀짝 판마다 초고수가 흑·백을 번갈아 쥔다
    const seat = seed % 2 === 0 ? black : 1 - black;
    const bots: [BadukBot, BadukBot] =
      seat === 0 ? [strong, opponent] : [opponent, strong];
    let { state } = createMatch(RULES, seed);
    const rng = createRng(seed + 1);
    while (state.phase !== "gameOver") {
      const s = pendingSeats(state)[0] as number;
      const r = step(
        state,
        s,
        (bots[s] as BadukBot).decide(viewOf(state, s), rng),
      );
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const won = state.wins[seat] === 1;
    if (won) wins++;
    const res = state.result;
    let margin = 0;
    if (res?.kind === "score") {
      const masterBlack = seat === state.blackSeat;
      margin = (res.count.black - res.count.white) * (masterBlack ? 1 : -1);
    }
    margins.push(margin);
    console.log(
      `판 ${seed}: 초고수 ${seat === state.blackSeat ? "흑" : "백"} ${won ? "승" : "패"} ${res?.kind === "score" ? `집 차이 ${margin}` : (res?.kind ?? "")} (${state.played.length}수)`,
    );
  }
  times.sort((a, b) => a - b);
  const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
  console.log(
    `${SIZE}줄 ${master.name} 대 ${opponent.name}: ${wins}승 / ${GAMES}판 (${((wins / GAMES) * 100).toFixed(0)}%), 평균 집 차이 ${avg.toFixed(1)}, 한 수 가운데 ${times[times.length >> 1]?.toFixed(0)}ms·가장 긴 ${times.at(-1)?.toFixed(0)}ms`,
  );
});
