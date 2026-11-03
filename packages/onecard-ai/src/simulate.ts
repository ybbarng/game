/*
 * 컴퓨터끼리 한 판을 끝까지 한다(세기 비교·시험용). 실제 시간 대신 가상 시계(ms)로
 * 차례 행동 간격, 외침 창(P·T), 컴퓨터 외침·잡기 시간을 차례대로 일으킨다. 같은 씨앗이면 같은 판.
 */
import { createRng, nextInt } from "@game/mighty-engine";
import {
  type Action,
  createMatch,
  type GameEvent,
  type OnecardRules,
  type OnecardState,
  seededReshuffle,
  shoutWindows,
  shuffledOnecardDeck,
  step,
  viewOf,
} from "@game/onecard-engine";

import { chooseAction } from "./choose";
import type { OnecardLevel } from "./levels";
import { createMemory, type OnecardMemory, observe } from "./memory";
import { planShout, type ShoutPlan, shoutAction } from "./shout";

export interface SimulateOptions {
  /** 외침·잡기를 한다(기본 켬). 끄면 차례 행동만 한다 */
  shouts?: boolean;
  /** 차례 행동 사이 가상 시간(ms, 기본 1500) */
  turnMs?: number;
}

type Timer =
  | {
      at: number;
      order: number;
      kind: "window";
      id: number;
      target: number;
      window: "selfWindow" | "catchWindow";
    }
  | { at: number; order: number; kind: "shout"; seat: number; plan: ShoutPlan };

export interface SimulatedGame {
  state: OnecardState;
  /** 받아들인 외침 수(자리별) */
  shouts: number[];
}

/** 자리 s에 `levels[s]` 컴퓨터를 앉혀 한 판을 끝까지 한다 */
export function playGame(
  levels: readonly OnecardLevel[],
  rules: OnecardRules,
  seed: number,
  options: SimulateOptions = {},
): SimulatedGame {
  const withShouts = options.shouts ?? true;
  const turnMs = options.turnMs ?? 1500;
  const n = rules.players;
  let { state } = createMatch(rules, {
    deck: shuffledOnecardDeck(seed),
    first: seed % n,
  });
  const rng = createRng(seed + 1);
  const memories: OnecardMemory[] = Array.from({ length: n }, (_, s) =>
    createMemory(viewOf(state, s)),
  );
  const shouts = new Array<number>(n).fill(0);
  const timers: Timer[] = [];
  const timedWindows = new Set<number>();
  let order = 0;
  let now = 0;
  let turnAt = turnMs;

  const apply = (seat: number, action: Action): boolean => {
    const r = step(state, seat, action);
    if (!r.ok) return false;
    state = r.state;
    afterStep(r.events);
    return true;
  };

  const afterStep = (events: GameEvent[]) => {
    for (let s = 0; s < n; s++)
      observe(memories[s] as OnecardMemory, events, viewOf(state, s), now);
    if (!withShouts) return;
    for (const w of shoutWindows(state)) {
      if (timedWindows.has(w.id)) continue;
      timedWindows.add(w.id);
      timers.push({
        at: now + w.ms,
        order: order++,
        kind: "window",
        id: w.id,
        target: w.seat,
        window: w.kind,
      });
    }
    for (let s = 0; s < n; s++) {
      const view = viewOf(state, s);
      const memory = memories[s] as OnecardMemory;
      for (
        let plan = planShout(view, levels[s] as OnecardLevel, rng, memory, now);
        plan;
        plan = planShout(view, levels[s] as OnecardLevel, rng, memory, now)
      )
        timers.push({
          at: now + plan.delayMs,
          order: order++,
          kind: "shout",
          seat: s,
          plan,
        });
    }
  };

  for (let guard = 0; guard < 20_000; guard++) {
    if (state.phase === "over") return { state, shouts };
    if (state.phase === "reshuffle") {
      apply(
        state.turn,
        seededReshuffle(state, nextInt(rng, 2 ** 31)) as Action,
      );
      continue;
    }
    // 차례 행동 전에 올 시계부터
    let first = -1;
    timers.forEach((t, i) => {
      const f = timers[first];
      if (
        t.at <= turnAt &&
        (!f || t.at < f.at || (t.at === f.at && t.order < f.order))
      )
        first = i;
    });
    if (first >= 0) {
      const [timer] = timers.splice(first, 1) as [Timer];
      now = timer.at;
      if (timer.kind === "window") {
        if (shoutWindows(state).some((w) => w.id === timer.id))
          apply(timer.target, {
            type: "timeout",
            kind: timer.window,
            target: timer.target,
            id: timer.id,
          });
      } else {
        const action = shoutAction(
          timer.plan,
          viewOf(state, timer.seat),
          memories[timer.seat] as OnecardMemory,
          now,
        );
        if (action && apply(timer.seat, action))
          shouts[timer.seat] = (shouts[timer.seat] ?? 0) + 1;
      }
      continue;
    }
    now = turnAt;
    const seat = state.turn;
    const action = chooseAction(
      viewOf(state, seat),
      levels[seat] as OnecardLevel,
      rng,
      memories[seat],
    );
    if (!apply(seat, action))
      throw new Error(`단계 ${levels[seat]} 컴퓨터가 할 수 없는 행동을 했다`);
    turnAt = now + turnMs;
  }
  throw new Error("판이 끝나지 않는다");
}
