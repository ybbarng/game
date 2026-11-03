import {
  type Action,
  boardOfSky,
  createMatch,
  type GalaxyBoard,
  type GalaxyRules,
  type GalaxyState,
  type GameEvent,
  pendingSeats,
  step,
  viewOf,
} from "@game/galaxy-engine";
import { createRng } from "@game/mighty-engine";

import { type GalaxyBot, galaxyBotFor } from "./bots";

/** 걸음 하나를 지켜보는 함수(bench가 칸 밟힘·공문 이득 등을 센다) */
export type StepWatcher = (
  before: GalaxyState,
  seat: number,
  action: Action,
  after: GalaxyState,
  events: readonly GameEvent[],
) => void;

export interface PlayOptions {
  /** 자리 s가 `bots[s]` */
  bots: readonly GalaxyBot[];
  rules: GalaxyRules;
  seed: number;
  /** 판. 적지 않으면 규칙의 하늘로 만든다 */
  board?: GalaxyBoard;
  onStep?: StepWatcher;
  /** 멈춘 판을 잡는 상한(걸음 수) */
  maxSteps?: number;
  /** 참이 되면 판 끝 전이라도 멈춘다(시험이 확인할 지점까지만 둘 때) */
  until?: (state: GalaxyState) => boolean;
}

/**
 * 컴퓨터들이 한 판을 끝까지 둔다(결정적: 같은 시드·규칙·하늘·컴퓨터면 같은 판).
 * 여러 자리가 함께 내는 때(약속·공개·입찰)는 자리 차례로 낸다
 */
export function playGalaxy(options: PlayOptions): {
  state: GalaxyState;
  steps: number;
} {
  const board = options.board ?? boardOfSky(options.rules.sky);
  let { state } = createMatch(options.rules, options.seed, board);
  const rng = createRng(options.seed + 1);
  const max = options.maxSteps ?? 200_000;
  for (let steps = 0; steps < max; steps++) {
    const seat = pendingSeats(state)[0];
    if (seat === undefined || options.until?.(state)) return { state, steps };
    const bot = options.bots[seat] as GalaxyBot;
    const action = bot.decide(viewOf(state, seat), rng);
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(
        `${bot.name}(${seat}번 자리)이 둘 수 없는 수 ${JSON.stringify(action)}: ${result.error}`,
      );
    options.onStep?.(state, seat, action, result.state, result.events);
    state = result.state;
  }
  throw new Error("판이 끝나지 않는다");
}

/**
 * 시드·규칙·하늘·단계 목록으로 한 판을 끝까지 둔다(`levels[s]`가 자리 s의 단계: 0 입문, 1 중수, 2 고수).
 * 하늘을 적지 않으면 규칙의 하늘
 */
export function simulateGalaxy(options: {
  seed: number;
  rules: GalaxyRules;
  levels: readonly number[];
  sky?: string;
  onStep?: StepWatcher;
}): { state: GalaxyState; steps: number } {
  const rules = options.sky
    ? { ...options.rules, sky: options.sky }
    : options.rules;
  if (options.levels.length !== rules.players)
    throw new Error("단계 수와 인원이 다르다");
  return playGalaxy({
    bots: options.levels.map(galaxyBotFor),
    rules,
    seed: options.seed,
    ...(options.onStep ? { onStep: options.onStep } : {}),
  });
}
