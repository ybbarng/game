/*
 * 화면·방장 LocalMatch가 쓰는 자리 컴퓨터(apps/web/src/onecard/bots.ts의 `OnecardBot` 모양).
 * 화면은 누가 외쳤는지 숨기므로, 받아들인 행동마다 `hear(events, view)`로 사건을 들려줘야
 * 잡기·본인 외침을 할 수 있다(듣지 못하면 외침 계획은 미리 외침만 낸다).
 * 자리마다 하나씩 만든다(기억이 자리에 묶인다).
 */
import type { RngState } from "@game/mighty-engine";
import type { Action, GameEvent, OnecardView } from "@game/onecard-engine";

import { chooseAction } from "./choose";
import type { OnecardLevel } from "./levels";
import { createMemory, type OnecardMemory, observe } from "./memory";
import { planShout, type ShoutPlan, shoutAction } from "./shout";

export interface OnecardSeatBot {
  readonly level: OnecardLevel;
  /** 차례 행동(내기·먹기, 7의 무늬 포함) */
  chooseAction(view: OnecardView, rng: RngState): Action;
  /**
   * 몇 ms 뒤에 외칠지. 없으면 null. 받아들인 행동마다 null이 나올 때까지 부른다.
   * 잡기는 규칙의 P·T 안에 닿을 때만 낸다. `nowMs`는 `hear`와 같은 시계(없으면 방금 한 장이 된 것으로 본다)
   */
  planShout(view: OnecardView, rng: RngState, nowMs?: number): ShoutPlan | null;
  /**
   * 받아들인 행동 하나의 사건과 그 뒤 이 자리 화면. `nowMs`(받아들인 시각)를 주면 본인 시간 P가 지난 늦은
   * 본인 외침(엔진이 받지 않아 여전히 잡힌다)을 가려 잡으러 간다. 없으면 외침은 모두 안전으로 본다
   */
  hear(events: readonly GameEvent[], view: OnecardView, nowMs?: number): void;
  /**
   * 계획한 시간이 됐을 때 넣을 외침(`seen` = 지금 `turnNo`). 그사이 외쳤거나 먹어 누를 까닭이 없어졌으면 null.
   * 부르지 않고 바로 `{type:"shout", seen: view.turnNo}`를 넣어도 되지만, 그러면 헛외침이 늘어난다
   */
  shoutNow(plan: ShoutPlan, view: OnecardView, nowMs?: number): Action | null;
}

export function createSeatBot(level: OnecardLevel): OnecardSeatBot {
  let memory: OnecardMemory | null = null;
  const mind = (view: OnecardView): OnecardMemory => {
    if (!memory || memory.seat !== view.mySeat) memory = createMemory(view);
    return memory;
  };
  return {
    level,
    chooseAction: (view, rng) => chooseAction(view, level, rng, mind(view)),
    planShout: (view, rng, nowMs) =>
      planShout(view, level, rng, mind(view), nowMs),
    hear: (events, view, nowMs) => observe(mind(view), events, view, nowMs),
    shoutNow: (plan, view, nowMs) => shoutAction(plan, view, mind(view), nowMs),
  };
}
