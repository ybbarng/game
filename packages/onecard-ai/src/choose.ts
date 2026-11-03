import type { RngState } from "@game/mighty-engine";
import type { Action, OnecardView } from "@game/onecard-engine";

import {
  intermediateMove,
  type OnecardBot,
  onecardBeginnerBot,
  onecardIntermediateBot,
} from "./bots";
import { expertMove, onecardExpertBot } from "./expert";
import type { OnecardLevel } from "./levels";
import type { OnecardMemory } from "./memory";

/**
 * 차례 행동(내기·먹기). 7의 무늬는 play 행동에 들어 있다. 같은 화면·단계·난수면 같은 행동.
 * 기억이 있으면 고수가 없는 무늬 짐작까지 쓴다
 */
export function chooseAction(
  view: OnecardView,
  level: OnecardLevel,
  rng: RngState,
  memory?: OnecardMemory,
): Action {
  if (view.moves.length === 0)
    throw new Error("원카드 컴퓨터: 내 차례가 아닌 화면이다");
  if (level <= 0) return onecardBeginnerBot.decide(view, rng);
  if (level === 1) return intermediateMove(view);
  return expertMove(view, rng, memory);
}

/** 실력 단계(0 입문, 1 중수, 2 고수). 웹 워커 등록부용(화면만 받는다) */
export function onecardBotFor(level: number): OnecardBot {
  if (level <= 0) return onecardBeginnerBot;
  if (level === 1) return onecardIntermediateBot;
  return onecardExpertBot;
}
