/*
 * 외침·잡기(docs/42 B안 8번, 13절). 컴퓨터는 시간을 재지 않는다.
 * `planShout`가 "이 상황에서 몇 ms 뒤에 누를지"를 정하면, 바깥(방장 LocalMatch·화면)이 그 시간에
 * `shoutAction`을 불러 그때도 누를 만한지 다시 보고(그사이 외쳤거나 먹었으면 누르지 않는다) 행동을 넣는다.
 *
 * 쓰는 법: 받아들인 행동마다 `observe` 뒤 `planShout`를 null이 나올 때까지 부르고, 계획마다 시계를 건다.
 * 같은 상황(자리의 한 장 상태 번호)에는 계획을 한 번만 세운다(외치지 않기로 한 것도 기억한다).
 */
import { nextFloat, type RngState } from "@game/mighty-engine";
import {
  type Action,
  HUMAN_RT_FLOOR_MS,
  type OnecardView,
  STALE_SEEN,
} from "@game/onecard-engine";

import { levelInfo, type OnecardLevel } from "./levels";
import type { OnecardMemory } from "./memory";
import { isActiveSeat, playMoves } from "./table";

export interface ShoutPlan {
  /**
   * pre: 두 장인 내 차례에 미리 외침(카드를 내기 전에 넣는다) / self: 외치지 않은 한 장인 나 /
   * catch: 외치지 않은 한 장인 남 잡기 / false: 이미 외친 남을 잡으려는 헛외침(입문)
   */
  reason: "pre" | "self" | "catch" | "false";
  /** 잡을 자리(pre·self는 나). 잡을 사람이 여럿이면 `targets`의 처음 */
  target: number;
  /** 잡을 자리 모두. 한 번 누르면 그 판에 창이 열린 사람이 모두 잡히므로 한 번만 누른다 */
  targets: number[];
  /** 지금부터 누르기까지(ms) */
  delayMs: number;
  /** o2 겨루기: 누를 때 보고할 반응 시간(ms, 한 장이 된 때부터). 하한 100ms 이상 */
  rtMs?: number;
  /** o2 겨루기: 누를 때 보낼 판 번호(한 장이 된 판). 없으면 그때 화면의 판 */
  seen?: number;
}

/** 잡기 창이 닫히기 이만큼 전까지 닿지 못하면 누르지 않는다(ms, 지연·시계 차이 여유) */
export const CATCH_MARGIN_MS = 250;

/** 한 장이 된 때(모르면 지금)부터 잡을 수 있는 시간이 끝나는 시각 */
function catchDeadline(
  view: OnecardView,
  memory: OnecardMemory,
  seat: number,
  now: number,
): number {
  const since = memory.exposedAt[seat] ?? now;
  const self = view.rules.race ? 0 : view.rules.selfWindowMs;
  return since + self + view.rules.catchWindowMs - CATCH_MARGIN_MS;
}

/**
 * o2 겨루기 계획(docs/42 17-4). 본인 외침·잡기 모두 한 장이 된 때부터 단계별 반응 시간 뒤에 누른다.
 * 미리 외침은 없다. 반응 시간은 사람 하한(100ms) 아래로 내려가지 않는다
 */
function planRace(
  view: OnecardView,
  level: OnecardLevel,
  rng: RngState,
  memory: OnecardMemory,
  now: number | undefined,
): ShoutPlan | null {
  const me = view.mySeat;
  const profile = levelInfo(level).shout;
  const reaction = (range: readonly [number, number], seats: number[]) => {
    const rt = Math.max(HUMAN_RT_FLOOR_MS, between(rng, range));
    const known = seats.flatMap((s) => {
      const t = memory.exposedAt[s];
      return t === null || t === undefined ? [] : [t];
    });
    const at = now ?? (known.length > 0 ? Math.max(...known) : 0);
    const base = known.length > 0 ? Math.max(...known) : at;
    const pressAt = Math.max(at, base + rt);
    const turns = seats.flatMap((s) => {
      const t = memory.exposedTurn[s];
      return t === null || t === undefined ? [] : [t];
    });
    return {
      at,
      pressAt,
      delayMs: Math.max(0, Math.round(pressAt - at)),
      rtMs: Math.max(HUMAN_RT_FLOOR_MS, Math.round(pressAt - base)),
      ...(turns.length > 0 ? { seen: Math.max(...turns) } : {}),
    };
  };

  if (
    memory.marks[me] === "exposed" &&
    firstTime(memory, `self:${memory.markIds[me]}`) &&
    nextFloat(rng) < profile.shout
  ) {
    const r = reaction(profile.raceSelfMs, [me]);
    if (catchDeadline(view, memory, me, r.at) >= r.pressAt)
      return {
        reason: "self",
        target: me,
        targets: [me],
        delayMs: r.delayMs,
        rtMs: r.rtMs,
        ...(r.seen !== undefined ? { seen: r.seen } : {}),
      };
  }

  const fresh: number[] = [];
  for (let seat = 0; seat < view.rules.players; seat++) {
    if (seat === me || !isActiveSeat(view, seat)) continue;
    if (
      memory.marks[seat] === "exposed" &&
      firstTime(memory, `catch:${seat}:${memory.markIds[seat]}`)
    )
      fresh.push(seat);
  }
  if (fresh.length > 0 && nextFloat(rng) < profile.catch) {
    const r = reaction(profile.raceCatchMs, fresh);
    const targets = fresh.filter(
      (s) => catchDeadline(view, memory, s, r.at) >= r.pressAt,
    );
    if (targets.length > 0)
      return {
        reason: "catch",
        target: targets[0] as number,
        targets,
        delayMs: r.delayMs,
        rtMs: r.rtMs,
        ...(r.seen !== undefined ? { seen: r.seen } : {}),
      };
  }

  for (let seat = 0; seat < view.rules.players; seat++) {
    if (seat === me || !isActiveSeat(view, seat)) continue;
    if (
      memory.marks[seat] === "safe" &&
      profile.falseShout > 0 &&
      firstTime(memory, `false:${seat}:${memory.markIds[seat]}`) &&
      nextFloat(rng) < profile.falseShout
    ) {
      const rt = Math.max(HUMAN_RT_FLOOR_MS, between(rng, profile.raceCatchMs));
      return {
        reason: "false",
        target: seat,
        targets: [seat],
        delayMs: rt,
        rtMs: rt,
      };
    }
  }
  return null;
}

function between(rng: RngState, [lo, hi]: readonly [number, number]): number {
  return Math.round(between01(rng, [lo, hi]));
}

function between01(rng: RngState, [lo, hi]: readonly [number, number]): number {
  return lo + (hi - lo) * nextFloat(rng);
}

/** 이 상황에 계획을 처음 세우나(세웠으면 다시 세우지 않는다) */
function firstTime(memory: OnecardMemory, key: string): boolean {
  if (memory.planned.has(key)) return false;
  memory.planned.add(key);
  return true;
}

/**
 * 외침 계획 하나. 없으면 null. 한 번 부를 때 하나만 내므로 null이 나올 때까지 부른다.
 * 기억(`memory`)이 꼭 있어야 한다: 화면은 누가 외쳤는지 숨긴다.
 * `now`: 지금 시각(`observe`에 준 시계와 같은 것). 없으면 방금 한 장이 된 것으로 본다
 */
export function planShout(
  view: OnecardView,
  level: OnecardLevel,
  rng: RngState,
  memory: OnecardMemory,
  now?: number,
): ShoutPlan | null {
  if (view.phase === "over") return null;
  const me = view.mySeat;
  if (!isActiveSeat(view, me)) return null;
  if (view.rules.race) return planRace(view, level, rng, memory, now);
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
      return {
        reason: "self",
        target: me,
        targets: [me],
        delayMs: between(rng, [lo, hi]),
      };
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
        targets: [me],
        delayMs: between(rng, profile.preMs),
      };
  }

  // 남: 외치지 않은 한 장짜리를 잡는다. 아직 정하지 않은 사람을 모아 한 번에 정한다(한 번 누르면 모두 잡힌다)
  const span = view.rules.selfWindowMs + view.rules.catchWindowMs;
  const fresh: number[] = [];
  for (let seat = 0; seat < view.rules.players; seat++) {
    if (seat === me || !isActiveSeat(view, seat)) continue;
    if (
      memory.marks[seat] === "exposed" &&
      firstTime(memory, `catch:${seat}:${memory.markIds[seat]}`)
    )
      fresh.push(seat);
  }
  if (fresh.length > 0 && nextFloat(rng) < profile.catch) {
    // 지금 시각을 모르면 방금 한 장이 된 것으로 본다
    const known = fresh.flatMap((s) => {
      const t = memory.exposedAt[s];
      return t === null || t === undefined ? [] : [t];
    });
    const at = now ?? (known.length > 0 ? Math.max(...known) : 0);
    // 가장 늦게 한 장이 된 사람을 알아챈 때부터 잰다
    const base = Math.max(...fresh.map((s) => memory.exposedAt[s] ?? at));
    // 늦게 알아챘으면(계획을 늦게 세웠으면) 지금 바로
    const pressAt = Math.max(at, base + span * between01(rng, profile.catchAt));
    // 누르는 때 아직 창이 열려 있을 사람만. 아무도 없으면 누르지 않는다(늦은 누름은 헛외침이 될 수 있다)
    const targets = fresh.filter(
      (s) => catchDeadline(view, memory, s, at) >= pressAt,
    );
    if (targets.length > 0)
      return {
        reason: "catch",
        target: targets[0] as number,
        targets,
        delayMs: Math.max(0, Math.round(pressAt - at)),
      };
  }

  // 입문은 이미 외친 사람도 가끔 잡으려 한다(헛외침)
  for (let seat = 0; seat < view.rules.players; seat++) {
    if (seat === me || !isActiveSeat(view, seat)) continue;
    const mark = memory.marks[seat];
    const id = memory.markIds[seat];
    if (
      mark === "safe" &&
      profile.falseShout > 0 &&
      firstTime(memory, `false:${seat}:${id}`)
    ) {
      if (nextFloat(rng) < profile.falseShout)
        return {
          reason: "false",
          target: seat,
          targets: [seat],
          delayMs: Math.round(span * between01(rng, profile.catchAt)),
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
  now?: number,
): Action | null {
  if (view.phase === "over" || !isActiveSeat(view, view.mySeat)) return null;
  const me = view.mySeat;
  // o2: 한 장이 된 판을 본 것으로, 그 판부터 잰 반응 시간을 싣는다(너무 옛 판이면 지금 판)
  const raceSeen =
    plan.seen !== undefined && view.turnNo - plan.seen <= STALE_SEEN
      ? plan.seen
      : view.turnNo;
  const shout: Action = view.rules.race
    ? {
        type: "shout",
        seen: raceSeen,
        rt: Math.max(HUMAN_RT_FLOOR_MS, plan.rtMs ?? plan.delayMs),
      }
    : { type: "shout", seen: view.turnNo };
  switch (plan.reason) {
    case "self":
      return memory.marks[me] === "exposed" ? shout : null;
    case "pre":
      // 그사이 카드를 냈으면 본인 외침이 된다(본인 창은 다시 섞기 중에도 받는다)
      if (memory.marks[me] === "exposed") return shout;
      // 미리 외침은 차례 행동을 기다릴 때(play)만 받는다. 다시 섞기 중에 누르면 헛외침이 된다
      return view.phase === "play" &&
        view.turn === me &&
        view.hand.length === 2 &&
        memory.marks[me] !== "pre"
        ? shout
        : null;
    case "catch":
      // 잡을 사람 가운데 아직 외치지도 먹지도 않았고, (시각을 알면) 창이 닫히지 않은 사람이 있을 때만
      return plan.targets.some(
        (s) =>
          memory.marks[s] === "exposed" &&
          (now === undefined ||
            memory.exposedAt[s] === null ||
            now <= catchDeadline(view, memory, s, now)),
      )
        ? shout
        : null;
    case "false":
      return view.handCounts[plan.target] === 1 ? shout : null;
  }
}
