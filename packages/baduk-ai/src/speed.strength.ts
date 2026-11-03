import {
  createMatch,
  pendingSeats,
  STANDARD_RULES,
  step,
  viewOf,
} from "@game/baduk-engine";
import { createRng } from "@game/mighty-engine";
import { it } from "vitest";

import { boardOfView, createBadukSearchBot } from "./bots";
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
