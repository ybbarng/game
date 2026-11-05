import { CHAIN_LENGTH, chainHash, derivedSeed } from "@game/yut-engine";
import { expect } from "vitest";

import { buildBoard } from "./board";
import { bidCommitment, bidSalt } from "./dice";
import { createMatch, type StepResult, step, stepWithDice } from "./match";
import { type GalaxyRules, STANDARD_RULES } from "./rules";
import { createGalaxyScenario } from "./scenario";
import type { Action, GalaxyState, GameEvent } from "./state";
import {
  TEST_CONSTELLATIONS,
  TEST_PAIR_CONSTELLATIONS,
  TEST_PAIR_SKY,
  TEST_SKY,
} from "./test-sky";

/* 시험에서만 쓰는 도움 함수. 패키지 밖으로 내보내지 않는다 */

export const BOARD = buildBoard(TEST_SKY, TEST_CONSTELLATIONS);
export const PAIR_BOARD = buildBoard(TEST_PAIR_SKY, TEST_PAIR_CONSTELLATIONS);

/** 사슬 고리 전체(0이 약속). 같은 씨앗은 한 번만 계산한다 */
const chainCache = new Map<string, string[]>();
export function chainOf(key: string, generation: number): string[] {
  const seed = derivedSeed(key, generation);
  const cached = chainCache.get(seed);
  if (cached) return cached;
  const links: string[] = new Array(CHAIN_LENGTH + 1);
  links[CHAIN_LENGTH] = seed;
  for (let i = CHAIN_LENGTH; i > 0; i--)
    links[i - 1] = chainHash(links[i] as string);
  chainCache.set(seed, links);
  return links;
}

/** 이 자리의 약속 또는 다음 고리 공개 */
export function chainAction(state: GalaxyState, seat: number): Action {
  const links = chainOf(state.keys[seat] as string, state.generation);
  if (state.phase === "commit")
    return { type: "commit", hash: links[0] as string };
  const used = state.chains[seat]?.used ?? 0;
  return { type: "reveal", link: links[used + 1] as string };
}

/** 별빛 합 + 우주국으로 사라진 것 − 우주국이 준 것 */
export function ledger(state: GalaxyState): number {
  return state.cash.reduce((a, b) => a + b, 0) + state.bankIn - state.bankOut;
}

/** 돈 합 확인: 별빛 합 + 우주국으로 사라진 것 − 우주국이 준 것 = 시작 합, 그리고 pay 사건이 별빛 변화와 맞다 */
export function checkMoney(
  before: GalaxyState,
  after: GalaxyState,
  events: readonly GameEvent[],
): void {
  // 장면은 자금을 바꿔 시작하므로 걸음 전 합과 견준다(새 판은 시작 합과 같다, money.test.ts).
  expect(ledger(after)).toBe(ledger(before));
  const delta = before.cash.map(() => 0);
  let bankIn = 0;
  let bankOut = 0;
  for (const e of events) {
    if (e.type !== "pay") continue;
    expect(e.amount).toBeGreaterThan(0);
    if (e.from >= 0) delta[e.from] = (delta[e.from] ?? 0) - e.amount;
    else bankOut += e.amount;
    if (e.to >= 0) delta[e.to] = (delta[e.to] ?? 0) + e.amount;
    else bankIn += e.amount;
  }
  after.cash.forEach((cash, s) => {
    expect(cash - (before.cash[s] ?? 0)).toBe(delta[s]);
  });
  expect(after.bankIn - before.bankIn).toBe(bankIn);
  expect(after.bankOut - before.bankOut).toBe(bankOut);
}

function checked(
  state: GalaxyState,
  result: StepResult,
  label: string,
): { state: GalaxyState; events: GameEvent[] } {
  if (!result.ok) throw new Error(`${result.error}: ${label}`);
  checkMoney(state, result.state, result.events);
  return { state: result.state, events: result.events };
}

/** 성공해야 하는 걸음(돈 합까지 확인) */
export function must(state: GalaxyState, seat: number, action: Action) {
  return checked(state, step(state, seat, action), JSON.stringify(action));
}

/** 정해 둔 눈으로 굴리기(돈 합까지 확인) */
export function roll(state: GalaxyState, dice: [number, number]) {
  return checked(
    state,
    stepWithDice(state, state.turn.seat, dice),
    `주사위 ${dice.join(",")}`,
  );
}

/** 거절되어야 하는 걸음. 오류 글을 돌려준다 */
export function refused(
  state: GalaxyState,
  seat: number,
  action: Action,
): string {
  const result = step(state, seat, action);
  if (result.ok)
    throw new Error(`받아들여지면 안 된다: ${JSON.stringify(action)}`);
  return result.error;
}

/** 모두 약속해 첫 차례(또는 시작 별 공개)까지 */
export function started(
  rules: GalaxyRules = STANDARD_RULES,
  seed = 7,
  board = BOARD,
): GalaxyState {
  let { state } = createMatch(rules, seed, board);
  for (let s = 0; s < rules.players; s++)
    state = must(state, s, chainAction(state, s)).state;
  return state;
}

/** 남은 모든 자리가 고리를 공개한다 */
export function revealAll(state: GalaxyState): {
  state: GalaxyState;
  events: GameEvent[];
} {
  let next = state;
  const events: GameEvent[] = [];
  for (let s = 0; s < next.rules.players; s++) {
    if (next.phase !== "reveal" || next.out[s] || next.reveals[s] !== null)
      continue;
    const r = must(next, s, chainAction(next, s));
    next = r.state;
    events.push(...r.events);
  }
  return { state: next, events };
}

/** 장면(시험 판) */
export function scene(
  options: Omit<Parameters<typeof createGalaxyScenario>[0], "board"> & {
    board?: typeof BOARD;
  } = {},
): GalaxyState {
  return createGalaxyScenario({ board: BOARD, ...options });
}

/** 봉투 입찰 약속(재료에서 소금) */
export function bidOf(state: GalaxyState, seat: number, value: number): Action {
  const index = state.auction?.index ?? 0;
  const salt = bidSalt(state.keys[seat] as string, index);
  return { type: "bid", hash: bidCommitment(index, value, salt) };
}

export function bidRevealOf(
  state: GalaxyState,
  seat: number,
  value: number,
): Action {
  const index = state.auction?.index ?? 0;
  return {
    type: "bidReveal",
    value,
    salt: bidSalt(state.keys[seat] as string, index),
  };
}

/** 모두가 값을 내고 공개한다(값 0은 내지 않음) */
export function auctionWith(state: GalaxyState, values: number[]) {
  let next = state;
  const events: GameEvent[] = [];
  for (const [s, v] of values.entries()) {
    const r = must(next, s, bidOf(next, s, v));
    next = r.state;
    events.push(...r.events);
  }
  for (const [s, v] of values.entries()) {
    const r = must(next, s, bidRevealOf(next, s, v));
    next = r.state;
    events.push(...r.events);
  }
  return { state: next, events };
}

export function paysOf(events: readonly GameEvent[]) {
  return events.flatMap((e) => (e.type === "pay" ? [e] : []));
}
