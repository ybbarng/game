import {
  createMatch,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/baduk-engine";
import { createRng } from "@game/mighty-engine";
import { it } from "vitest";

import {
  badukExpertBot,
  badukMasterBot,
  boardOfView,
  createBadukSearchBot,
} from "./bots";
import { FastBoard } from "./fast-board";
import { masterSearch } from "./master";
import { search } from "./search";

// 한 수에 드는 시간(고수 탐색과 초고수 탐색, 같은 판 수). 빈 판과 중반 판(고수끼리 n수 둔 판).
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

function midgame(size: 9 | 13 | 19, moves: number): FastBoard {
  const rules = { ...STANDARD_RULES, size };
  let { state } = createMatch(rules, 1);
  const bot = createBadukSearchBot(300);
  const rng = createRng(2);
  for (let i = 0; i < moves && state.phase === "play"; i++) {
    const seat = pendingSeats(state)[0] as number;
    const r = step(state, seat, bot.decide(viewOf(state, seat), rng));
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return boardOfView(viewOf(state, pendingSeats(state)[0] as number));
}

it("한 수 시간", () => {
  const n = Number(process.env.SPEED_PLAYOUTS ?? 3000);
  const sizes = (process.env.SPEED_SIZES ?? "9,13,19").split(",").map(Number);
  for (const size of sizes as (9 | 13 | 19)[]) {
    for (const moves of [0, Math.round(size * size * 0.3)]) {
      const board = moves === 0 ? new FastBoard(size) : midgame(size, moves);
      let t = performance.now();
      search(board, 7.5, n, createRng(1));
      const light = performance.now() - t;
      t = performance.now();
      masterSearch(board, 7.5, n, createRng(1));
      const heavy = performance.now() - t;
      console.log(
        `${size}줄 ${moves}수 뒤 ${n}판: 고수 탐색 ${light.toFixed(0)}ms, 초고수 탐색 ${heavy.toFixed(0)}ms`,
      );
    }
  }
});

/** 정렬한 값에서 가운데·열에 아홉·가장 긴 값 */
function spread(sorted: number[]) {
  return {
    median: sorted[sorted.length >> 1] ?? 0,
    p90: sorted[Math.floor(sorted.length * 0.9)] ?? 0,
    max: sorted.at(-1) ?? 0,
  };
}

// 휴대폰에서 한 수를 얼마나 기다리는지 어림할 때 쓴다(docs/25 3절 「휴대폰 한 수 시간」).
// 실제로 쓰는 초고수(판 크기마다 줄인 판 수)가 고수와 두는 판에서, 돌이 판의 15%~60%를 채운 중반 수만 잰다.
// 판마다 초고수가 흑·백을 번갈아 쥔다.
//   SPEED_SIZES=13 SPEED_MID_GAMES=4 pnpm -C packages/baduk-ai bench speed -t "중반 초고수"
it("중반 초고수 한 수 시간", () => {
  const games = Number(process.env.SPEED_MID_GAMES ?? 4);
  const sizes = (process.env.SPEED_SIZES ?? "9,13,19").split(",").map(Number);
  for (const size of sizes as (9 | 13 | 19)[]) {
    const rules = { ...STANDARD_RULES, size };
    const area = size * size;
    const times: number[] = [];
    for (let seed = 1; seed <= games; seed++) {
      let { state } = createMatch(rules, seed);
      const masterSeat = seed % 2;
      const rng = createRng(seed + 1);
      while (state.phase === "play") {
        const seat = pendingSeats(state)[0] as number;
        const view = viewOf(state, seat);
        const ply = view.played.length;
        if (ply > area * 0.6) break;
        let action: ReturnType<typeof badukMasterBot.decide>;
        if (seat === masterSeat) {
          const t = performance.now();
          action = badukMasterBot.decide(view, rng);
          if (ply >= area * 0.15) times.push(performance.now() - t);
        } else action = badukExpertBot.decide(view, rng);
        const r = step(state, seat, action);
        if (!r.ok) throw new Error(r.error);
        state = r.state;
      }
    }
    times.sort((a, b) => a - b);
    const t = spread(times);
    console.log(
      `${size}줄 중반 초고수 한 수(상대 고수, ${games}판, ${times.length}수): 가운데 ${t.median.toFixed(0)}ms, 열에 아홉 ${t.p90.toFixed(0)}ms, 가장 긴 ${t.max.toFixed(0)}ms · 휴대폰 5배 어림 가운데 ${((t.median * 5) / 1000).toFixed(1)}초, 가장 긴 ${((t.max * 5) / 1000).toFixed(1)}초`,
    );
  }
});
