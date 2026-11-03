/*
 * 원카드 컴퓨터(docs/42 13절)를 대국 진행(LocalMatch)에 끼운다. 수와 외침 계획은 `@game/onecard-ai`가 정하고,
 * 여기서는 자리마다 자리 컴퓨터(`createSeatBot`, 기억을 든다)를 두고 계획을 LocalMatch 모양으로 바꾼다.
 *
 * LocalMatch는 자리마다 걸어 둔 반응을 하나만 들고, 새 계획을 주면 앞 계획을 버린다(검토 4번).
 * 그래서 잡으려고 기다리던 컴퓨터가 자기 차례에 미리 외칠 계획을 세우면 잡기를 잊었다. 이제는 자리마다
 * 아직 누르지 않은 계획을 모두 들고 있다가 가장 이른 것 하나를 건다. 미리 외침 누름은 엔진에서 잡기도 된다
 * (`shoutBoth`, 기본 켬, docs/42 12-5 1번). 누른 뒤 걸음에서 그 누름으로 할 일이 끝난 계획은 지우고
 * (`shoutNow`가 null), 남은 것이 있으면 다음으로 이른 것을 다시 건다(본인 외침 누름은 남을 잡지 못한다).
 * 시간이 되면 `recheck`로 그 순간 화면을 다시 본다(그사이 외쳤거나 먹었으면 누르지 않는다). 누르지 않으면
 * 걸음이 없어 남은 계획은 다음 걸음에 다시 걸린다.
 */
import { type Clock, realClock } from "@game/fair-play";
import type { RngState } from "@game/mighty-engine";
import {
  createSeatBot,
  type OnecardSeatBot,
  type ShoutPlan,
} from "@game/onecard-ai";
import type { Action, GameEvent, OnecardView } from "@game/onecard-engine";

import type { KitBot } from "@/game/kit";

/** 0 입문, 1 중수, 2 고수 */
export type OnecardBotLevel = 0 | 1 | 2;

/** 한 대국의 컴퓨터 자리들. 자리마다 자리 컴퓨터를 하나씩 만든다(기억이 자리에 묶인다) */
export interface OnecardTableBot {
  readonly name: string;
  seatBot(seat: number): OnecardSeatBot;
}

function clampLevel(level: number): OnecardBotLevel {
  return Math.max(0, Math.min(2, Math.floor(level))) as OnecardBotLevel;
}

/** 단계에 맞는 컴퓨터. 대국마다 새로 만든다 */
export function onecardBotFor(
  level: number,
  make: (level: OnecardBotLevel) => OnecardSeatBot = createSeatBot,
): OnecardTableBot {
  const lv = clampLevel(level);
  const seats = new Map<number, OnecardSeatBot>();
  return {
    name: `onecard-${lv}`,
    seatBot(seat) {
      let bot = seats.get(seat);
      if (!bot) {
        bot = make(lv);
        seats.set(seat, bot);
      }
      return bot;
    },
  };
}

interface Pending {
  plan: ShoutPlan;
  /** 누를 시각(`clock.now()` 기준) */
  dueAt: number;
}

/**
 * 걸음 앞 화면(장 수만). LocalMatch는 판을 나눌 때 반응을 묻지 않아, 자리 컴퓨터가 처음 듣는 걸음은
 * 그 걸음 뒤 화면으로 기억을 만들면 그 걸음에서 한 장이 된 자리를 놓친다. 사건을 거꾸로 돌려 앞 장 수를 만든다
 */
function beforeView(view: OnecardView, events: readonly GameEvent[]) {
  const counts = [...view.handCounts];
  for (const e of events) {
    if (e.type === "played") counts[e.seat] = (counts[e.seat] ?? 0) + 1;
    if (e.type === "drew")
      counts[e.seat] = Math.max(0, (counts[e.seat] ?? 0) - e.count);
  }
  return { ...view, handCounts: counts };
}

/**
 * 대국 진행(LocalMatch)에 넘기는 모양으로 바꾼다. `clock`은 LocalMatch와 같은 시계를 준다
 * (계획마다 남은 시간을 재 가장 이른 것을 고른다). 시간이 되면 `recheck`가 그 순간 화면으로
 * `shoutNow`를 불러 다시 본다: 그사이 외쳤거나 먹어 누를 까닭이 없어졌으면 누르지 않고, 누르면 `seen`은
 * 그때의 판 번호다
 */
export function toKitBot(
  table: OnecardTableBot,
  clock: Clock = realClock,
): KitBot<OnecardView, Action, GameEvent> {
  const pending = new Map<number, Pending[]>();
  const heard = new Set<number>();
  return {
    name: table.name,
    decide: (view, rng) => table.seatBot(view.mySeat).chooseAction(view, rng),
    // 판 끝 검증: 대국 중 `react`가 들었던 것과 같은 사건을 듣는다(차례 수에 쓰는 기억은 사건만으로 정해진다)
    observe(view, events) {
      const seat = view.mySeat;
      const bot = table.seatBot(seat);
      const now = clock.now();
      if (!heard.has(seat)) {
        heard.add(seat);
        bot.hear([], beforeView(view, events), now);
      }
      bot.hear(events, view, now);
    },
    react(view, events, rng: RngState) {
      const seat = view.mySeat;
      const bot = table.seatBot(seat);
      // 대국 시계의 지금 시각을 함께 준다: 늦은 본인 외침(P 뒤, 엔진이 받지 않는다)을 가리고,
      // 잡기 시간을 한 장이 된 때부터 잰다(docs/42 13-2).
      const now = clock.now();
      if (!heard.has(seat)) {
        heard.add(seat);
        bot.hear([], beforeView(view, events), now);
      }
      bot.hear(events, view, now);
      // 시간이 지난 것(이미 눌렀거나 엔진이 거절한 것)과 누를 까닭이 없어진 것은 버린다.
      const queue = (pending.get(seat) ?? []).filter(
        (p) => p.dueAt > now && bot.shoutNow(p.plan, view, now) !== null,
      );
      for (let guard = 0; guard < 16; guard++) {
        const plan = bot.planShout(view, rng, now);
        if (!plan) break;
        queue.push({ plan, dueAt: now + Math.max(0, plan.delayMs) });
      }
      pending.set(seat, queue);
      if (queue.length === 0) return null;
      const dueAt = Math.min(...queue.map((p) => p.dueAt));
      return {
        delayMs: dueAt - now,
        action: { type: "shout", seen: view.turnNo },
        recheck(current) {
          // 시간이 된 계획은 여기서 쓴다. 그 가운데 아직 누를 까닭이 있는 것이 하나라도 있으면 한 번 누른다.
          const at = clock.now();
          const due = (pending.get(seat) ?? []).filter((p) => p.dueAt <= at);
          pending.set(
            seat,
            (pending.get(seat) ?? []).filter((p) => p.dueAt > at),
          );
          for (const p of due) {
            const action = bot.shoutNow(p.plan, current, at);
            if (action) return action;
          }
          return null;
        },
      };
    },
  };
}
