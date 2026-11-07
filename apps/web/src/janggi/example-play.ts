import {
  createJanggiScenario,
  type JanggiRules,
  type JanggiState,
  type Piece,
  pointAt,
  type Setup,
  STANDARD_RULES,
  step,
} from "@game/janggi-engine";

import { parseMove, type ReplayBy, sideAt } from "./replay";

/*
 * 배우기 예시를 직접 두고 맞혀 보는 장면(2026-11-08, docs/23 「직접 두고 맞혀 보기」)이 쓰는 계산.
 * 판·화면을 모르는 순수 함수라 시험이 엔진으로 그대로 본다.
 */

/**
 * 먼저 맞혀 보기: `at`수를 둔 뒤(그 다음 수를 두기 전) 판의 한 자리를 누르게 묻는다.
 * 정답 `answer`는 바로 다음 수(`at`째 수)가 가는 자리다(잡는 수면 잡히는 기물의 자리).
 * 수순 끝(`at`이 수 개수)에서 물으면, 마지막 수를 둔 편이 그 판에서 노리는 상대 기물의 자리다
 */
export interface Guess {
  at: number;
  /** 묻는 말 */
  ask: string;
  answer: string;
  /** 정답을 보인 뒤 붙이는 말(맞혔든 틀렸든) */
  why: string;
}

/** 맞혀 보기에서 누른 자리가 정답인지 */
export function guessRight(guess: Guess, at: number): boolean {
  return pointAt(guess.answer) === at;
}

/**
 * 예시 끝 판에서 이어 둘 대국 상태. 나는 0번 자리 초, 한은 컴퓨터. 초부터 번갈아 둔 예시만 이어 둔다
 * (초 혼자 둔 예시는 한이 그동안 가만히 있던 그림이라 실제 대국 판이 아니다, `canContinue`)
 */
export function exampleState(options: {
  pieces: Readonly<Record<string, Piece>>;
  moves: readonly string[];
  setups?: { cho: Setup; han: Setup };
  rules?: JanggiRules;
}): JanggiState {
  let state = createJanggiScenario({
    rules: options.rules ?? STANDARD_RULES,
    pieces: options.pieces,
  });
  if (options.setups)
    state = {
      ...state,
      setups: { c: options.setups.cho, h: options.setups.han },
    };
  const apply = (seat: number, action: Parameters<typeof step>[2]) => {
    const result = step(state, seat, action);
    if (!result.ok) throw new Error(`예시를 이어 둘 수 없다: ${result.error}`);
    state = result.state;
  };
  options.moves.forEach((text, i) => {
    const m = parseMove(text);
    apply(sideAt(i) === "c" ? 0 : 1, { type: "move", from: m.from, to: m.to });
  });
  return state;
}

/** 이어 두기를 열 수 있는 예시인지(초부터 번갈아 둔 수순) */
export const canContinue = (by: ReplayBy | undefined) =>
  (by ?? "turns") === "turns";
