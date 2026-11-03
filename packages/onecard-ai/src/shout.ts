/*
 * 외침·잡기(docs/42 B안 8번, 13절). 컴퓨터는 시간을 재지 않는다.
 * `planShout`가 "이 상황에서 몇 ms 뒤에 누를지"를 정하면, 바깥(방장 LocalMatch·화면)이 그 시간에
 * `shoutAction`을 불러 그때도 누를 만한지 다시 보고(그사이 외쳤거나 먹었으면 누르지 않는다) 행동을 넣는다.
 *
 * 쓰는 법: 받아들인 행동마다 `observe` 뒤 `planShout`를 null이 나올 때까지 부르고, 계획마다 시계를 건다.
 * 같은 상황(자리의 한 장 상태 번호)에는 계획을 한 번만 세운다(외치지 않기로 한 것도 기억한다).
 */
import { nextFloat, type RngState } from "@game/mighty-engine";
import type { Action, OnecardView } from "@game/onecard-engine";

import { levelInfo, type OnecardLevel } from "./levels";
import type { OnecardMemory } from "./memory";
import { isActiveSeat, playMoves } from "./table";

export interface ShoutPlan {
  /**
   * pre: 두 장인 내 차례에 미리 외침(카드를 내기 전에 넣는다) / self: 외치지 않은 한 장인 나 /
   * catch: 외치지 않은 한 장인 남 잡기 / false: 이미 외친 남을 잡으려는 헛외침(입문)
   */
  reason: "pre" | "self" | "catch" | "false";
  /** 잡을 자리(pre·self는 나) */
  target: number;
  /** 지금부터 누르기까지(ms) */
  delayMs: number;
}

function between(rng: RngState, [lo, hi]: readonly [number, number]): number {
  return Math.round(lo + (hi - lo) * nextFloat(rng));
}

/** 이 상황에 계획을 처음 세우나(세웠으면 다시 세우지 않는다) */
function firstTime(memory: OnecardMemory, key: string): boolean {
  if (memory.planned.has(key)) return false;
  memory.planned.add(key);
  return true;
}

/**
 * 외침 계획 하나. 없으면 null. 한 번 부를 때 하나만 내므로 null이 나올 때까지 부른다.
 * 기억(`memory`)이 꼭 있어야 한다: 화면은 누가 외쳤는지 숨긴다
 */
export function planShout(
  view: OnecardView,
  level: OnecardLevel,
  rng: RngState,
  memory: OnecardMemory,
): ShoutPlan | null {
  if (view.phase === "over") return null;
  const me = view.mySeat;
  if (!isActiveSeat(view, me)) return null;
  const profile = levelInfo(level).shout;
  const selfMs = view.rules.selfWindowMs;

  // 나: 외치지 않고 한 장이 됐다. 본인 시간 P 안에 외칠지
  if (
    memory.marks[me] === "exposed" &&
    firstTime(memory, `self:${memory.markIds[me]}`)
  ) {
    if (selfMs > 0 && nextFloat(rng) < profile.shout) {
      const hi = Math.min(profile.selfMs[1], selfMs - 100);
      const lo = Math.min(profile.selfMs[0], hi);
      return { reason: "self", target: me, delayMs: between(rng, [lo, hi]) };
    }
  }

  // 나: 두 장인 내 차례에 낼 카드가 있으면 미리 외친다
  if (
    view.phase === "play" &&
    view.turn === me &&
    view.hand.length === 2 &&
    memory.marks[me] !== "pre" &&
    playMoves(view).length > 0 &&
    firstTime(memory, `pre:${view.turnNo}`)
  ) {
    if (nextFloat(rng) < profile.shout)
      return {
        reason: "pre",
        target: me,
        delayMs: between(rng, profile.preMs),
      };
  }

  // 남: 외치지 않은 한 장짜리를 잡는다. 입문은 이미 외친 사람도 가끔 잡으려 한다(헛외침)
  for (let seat = 0; seat < view.rules.players; seat++) {
    if (seat === me || !isActiveSeat(view, seat)) continue;
    const mark = memory.marks[seat];
    const id = memory.markIds[seat];
    if (mark === "exposed" && firstTime(memory, `catch:${seat}:${id}`)) {
      if (nextFloat(rng) < profile.catch)
        return {
          reason: "catch",
          target: seat,
          delayMs: between(rng, profile.catchMs),
        };
    }
    if (
      mark === "safe" &&
      profile.falseShout > 0 &&
      firstTime(memory, `false:${seat}:${id}`)
    ) {
      if (nextFloat(rng) < profile.falseShout)
        return {
          reason: "false",
          target: seat,
          delayMs: between(rng, profile.catchMs),
        };
    }
  }
  return null;
}

/**
 * 계획한 시간이 됐을 때 넣을 외침. 그사이 상황이 바뀌어 누를 까닭이 없어졌으면 null.
 * `seen`은 지금 화면의 판 번호(`turnNo`)
 */
export function shoutAction(
  plan: ShoutPlan,
  view: OnecardView,
  memory: OnecardMemory,
): Action | null {
  if (view.phase === "over" || !isActiveSeat(view, view.mySeat)) return null;
  const me = view.mySeat;
  const shout: Action = { type: "shout", seen: view.turnNo };
  switch (plan.reason) {
    case "self":
      return memory.marks[me] === "exposed" ? shout : null;
    case "pre":
      // 그사이 카드를 냈으면 본인 외침이 된다
      if (memory.marks[me] === "exposed") return shout;
      return view.turn === me &&
        view.hand.length === 2 &&
        memory.marks[me] !== "pre"
        ? shout
        : null;
    case "catch":
      return memory.marks[plan.target] === "exposed" ? shout : null;
    case "false":
      return view.handCounts[plan.target] === 1 ? shout : null;
  }
}
