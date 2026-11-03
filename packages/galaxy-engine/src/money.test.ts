import { createRng, nextInt, type RngState } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { STAR_SQUARES } from "./board";
import {
  createMatch,
  debtPlan,
  type LoggedAction,
  legalActions,
  pendingSeats,
  replay,
  startTotal,
  step,
} from "./match";
import { type GalaxyRules, LONG_RULES, STANDARD_RULES } from "./rules";
import type { Action, GalaxyState } from "./state";
import {
  BOARD,
  bidOf,
  bidRevealOf,
  chainAction,
  ledger,
  must,
} from "./test-utils";

/**
 * 여러 갈래를 고르게 지나는 간단한 두기(시드로 정해 결정적). 판 전체를 끝까지 두지 않고
 * 정한 걸음 수까지만 둔다. 걸음마다 `must`가 돈 합과 pay 사건을 확인한다
 */
function play(rules: GalaxyRules, seed: number, steps: number) {
  const rng: RngState = createRng(seed);
  let state: GalaxyState = createMatch(rules, seed, BOARD).state;
  const log: LoggedAction[] = [];
  const bids = new Map<number, number>();
  const act = (seat: number, action: Action) => {
    state = must(state, seat, action).state;
    log.push({ seat, action });
    expect(ledger(state)).toBe(startTotal(rules));
  };
  expect(ledger(state)).toBe(startTotal(rules));
  for (let n = 0; n < steps && state.phase !== "gameOver"; n++) {
    const seats = pendingSeats(state);
    const seat = seats[0] as number;
    switch (state.phase) {
      case "commit":
      case "reveal":
        for (const s of seats) act(s, chainAction(state, s));
        break;
      case "bid":
        for (const s of seats) {
          const value = Math.min(state.cash[s] ?? 0, nextInt(rng, 30) * 10);
          bids.set(s, value);
          act(s, bidOf(state, s, value));
        }
        break;
      case "bidReveal":
        for (const s of seats) act(s, bidRevealOf(state, s, bids.get(s) ?? 0));
        break;
      case "debt":
        act(seat, debtPlan(state)[0] as Action);
        break;
      case "trade":
        act(seat, { type: nextInt(rng, 2) ? "acceptTrade" : "rejectTrade" });
        break;
      default: {
        const offer = tradeIdea(state, seat, rng);
        if (offer) {
          act(seat, offer);
          break;
        }
        const options = legalActions(state, seat);
        const build = options.filter((o) => o.type === "build");
        const pick =
          (build.length > 0 && nextInt(rng, 2) ? build[0] : undefined) ??
          (nextInt(rng, 4)
            ? options.find((o) => o.type === "buy")
            : undefined) ??
          options.find((o) => o.type === "pass") ??
          options.find((o) => o.type === "roll") ??
          options.find((o) => o.type === "end") ??
          options[0];
        if (!pick) throw new Error(`할 일이 없다: ${state.phase}`);
        act(seat, pick);
      }
    }
  }
  return { state, log };
}

/** 가끔 별 하나를 바꾸자고 제안한다 */
function tradeIdea(
  state: GalaxyState,
  seat: number,
  rng: RngState,
): Action | null {
  if (!state.rules.trade || state.phase !== "turn") return null;
  if (state.turn.rolls > 0 || state.turn.offered || nextInt(rng, 5))
    return null;
  const mine = STAR_SQUARES.find(
    (sq) => state.owners[sq] === seat && !state.mortgaged[sq],
  );
  const theirs = STAR_SQUARES.find(
    (sq) =>
      (state.owners[sq] ?? -1) >= 0 &&
      state.owners[sq] !== seat &&
      !state.mortgaged[sq],
  );
  if (mine === undefined || theirs === undefined) return null;
  const to = state.owners[theirs] as number;
  const action: Action = {
    type: "offer",
    to,
    give: { stars: [mine], cash: 0 },
    get: { stars: [theirs], cash: 0 },
  };
  return step(state, seat, action).ok ? action : null;
}

describe("돈 합과 다시 두기", () => {
  it("새 판의 돈 합은 시작 합이고, 걸음마다 「별빛 합 + 사라진 것 − 준 것」이 그대로다", () => {
    // 내리기(sell)는 빚 정리에서만 나와 end.test가 따로 본다
    const { state, log } = play(STANDARD_RULES, 1, 260);
    const kinds = new Set(log.map((e) => e.action.type));
    for (const kind of ["buy", "pass", "bidReveal", "offer", "build"])
      expect(kinds).toContain(kind);
    expect(state.revealCount).toBeGreaterThan(20);
    expect(state.owners.filter((o) => o >= 0).length).toBeGreaterThan(5);
    const again = replay(STANDARD_RULES, 1, BOARD, log);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.state).toEqual(state);
    // 판 번호가 다른(옛 규칙) 기록은 지금 숫자로 다시 두지 않는다
    const old = replay(
      { ...STANDARD_RULES, edition: 1 as unknown as 2 },
      1,
      BOARD,
      log,
    );
    expect(old.ok).toBe(false);
  });

  it("긴 판 3인에서도 돈 합이 맞다", () => {
    const rules = { ...LONG_RULES, players: 3 as const };
    const { state } = play(rules, 9, 220);
    expect(ledger(state)).toBe(startTotal(rules));
  });
});
