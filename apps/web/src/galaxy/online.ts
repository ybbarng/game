import { committedBid, galaxyBotFor } from "@game/galaxy-ai";
import {
  type Action,
  bidSalt,
  debtPlan,
  type GalaxyRules,
  type GalaxyState,
  type GalaxyView,
  type GameEvent,
  NUMBERS,
  pendingSeats,
  timeControlOf,
  viewOf,
} from "@game/galaxy-engine";
import { createRng } from "@game/mighty-engine";

import type { BoardOnlineGame } from "@/components/BoardOnlineScreen";
import type { KitTimer } from "@/game/kit";

import { bidAction } from "./chain";
import { type GalaxyKit, galaxyKit } from "./kit";
import { galaxySession } from "./session";
import { lengthDetail } from "./settings";
import { useGalaxy } from "./store";

/**
 * 결정 시간(docs/48 4-5). 개인 시간이 없는 판에서도 결정마다 이만큼 기다리고, 넘기면 방장이 대신 정한다.
 * 봉투 입찰은 모두가 함께 내므로 개인 시간이 있는 판에서도 자리마다 이 시간을 따로 잰다
 */
export const DECISION_MS = 20_000;

/** 결정 시간을 넘겨 방장이 대신 정한 행동의 꼬리표. 엔진은 보지 않고, 판 끝 검증은 「내가 보낸 것」에서 뺀다 */
type Late = Action & { late: true };

function late(action: Action): Late {
  return { ...action, late: true } as Late;
}

export function isLate(action: Action): boolean {
  return (action as Partial<Late>).late === true;
}

/** 상태마다 번호(엔진 상태는 걸음마다 새로 만들어진다). 차례 결정의 시간 창은 걸음마다 새로 잰다 */
const stateIds = new WeakMap<GalaxyState, number>();
let nextStateId = 0;
function stateId(state: GalaxyState): number {
  let id = stateIds.get(state);
  if (id === undefined) {
    id = nextStateId++;
    stateIds.set(state, id);
  }
  return id;
}

/**
 * 마지막으로 대신 정한 차례(판은 첫 자리 재료로 가린다). 한 번 시간을 넘긴 사람의 같은 차례 남은 결정은
 * 기다리지 않고 바로 대신 정한다(자리를 비운 사람 하나 때문에 차례마다 결정 수 × 20초를 기다리지 않게).
 * 한 기기에 방은 하나뿐이라 하나만 기억한다(판마다 쌓이지 않게)
 */
let lateTurn: string | null = null;
const turnKey = (state: GalaxyState) =>
  `${state.keys[0] ?? ""}:${state.round}:${state.turn.seat}`;

/**
 * 시간을 넘긴 자리 대신 정할 행동(docs/48 4-5). 굴리기·차례 마치기는 그대로, 사기는 중수 컴퓨터가 정하고,
 * 입찰은 「내지 않음」, 거래 답은 거절, 빚 정리는 `debtPlan` 첫 걸음. 사람이 자기 소금으로 낸 봉투는
 * 방장이 공개할 수 없어 null(끝내기로 받는다). 사슬 약속·공개는 여기서 하지 않는다(끊긴 자리 컴퓨터가 맡는다)
 */
export function standInAction(state: GalaxyState, seat: number): Action | null {
  const view = viewOf(state, seat);
  const decision = view.decision;
  switch (decision?.kind) {
    case "bid":
      return bidAction(
        decision.index,
        0,
        bidSalt(state.keys[seat] as string, decision.index),
      );
    case "bidReveal": {
      const value = committedBid(view);
      return value === null
        ? null
        : {
            type: "bidReveal",
            value,
            salt: bidSalt(state.keys[seat] as string, decision.index),
          };
    }
    case "trade":
      return { type: "rejectTrade" };
    case "debt":
      return debtPlan(state)[0] ?? null;
    case "roll":
      return { type: "roll" };
    case "end":
      return { type: "end" };
    case "buy": {
      // 난수는 공개 수와 자리로 정한다(같은 상태면 같은 판단). 판 끝 검증은 이 수를 다시 셈하지 않는다(꼬리표)
      const rng = createRng((state.revealCount * 31 + seat) >>> 0);
      const decided = galaxyBotFor(1).decide(view, rng);
      return decided.type === "buy" ? decided : { type: "pass" };
    }
    default:
      return null;
  }
}

/**
 * 온라인 방 시계(docs/48 4-5, `LocalMatch`가 `Clock`으로 잰다). 엔진이 재지 않는 기다림을 맡는다.
 * - 시간 상한(2-11): 판이 시작한 뒤 정한 시간이 지나면 `timeUp`(긴 판은 없다)
 * - 봉투 입찰: 자리마다 20초, 넘기면 「내지 않음」. 공개는 방장이 아는 소금으로 낸 봉투만 대신 한다
 * - 개인 시간이 없는 판의 차례 결정(굴리기·사기·차례 마치기·거래 답·빚 정리): 결정마다 20초
 * 주사위 사슬 약속·공개는 재지 않는다(기기가 바로 낸다. 끊기면 대신 두는 컴퓨터, 사람 사슬이면 끝내기)
 */
export function galaxyTimers(
  state: GalaxyState,
): KitTimer<Action, GalaxyState>[] {
  if (state.phase === "gameOver") return [];
  const timers: KitTimer<Action, GalaxyState>[] = [];
  const cap = NUMBERS.timeCap[state.rules.length];
  if (cap !== null && !state.timeUp)
    timers.push({
      key: "timeUp",
      seat: 0,
      ms: cap,
      // 방장 자리로 낸다(시간 상한이 있는 판은 첫 운항 중단에 끝나므로 방장 자리는 늘 판에 있다).
      later: (now) =>
        now.timeUp || now.phase === "gameOver" || now.out[0]
          ? null
          : { seat: 0, action: { type: "timeUp" } },
    });
  const pending = pendingSeats(state);
  const auction = state.auction;
  if ((state.phase === "bid" || state.phase === "bidReveal") && auction) {
    for (const seat of pending)
      timers.push({
        key: `${state.phase}:${auction.index}:${seat}`,
        seat,
        ms: DECISION_MS,
        later: (now) => {
          if (now.phase !== state.phase || now.auction?.index !== auction.index)
            return null;
          if (!pendingSeats(now).includes(seat)) return null;
          const action = standInAction(now, seat);
          return action ? { seat, action: late(action) } : null;
        },
      });
    return timers;
  }
  const decides =
    state.phase === "turn" ||
    state.phase === "buy" ||
    state.phase === "trade" ||
    state.phase === "debt";
  if (!decides || timeControlOf(state.rules) !== null) return timers;
  const seat = pending[0];
  if (seat === undefined) return timers;
  const id = stateId(state);
  const again = seat === state.turn.seat && lateTurn === turnKey(state);
  timers.push({
    key: `decide:${id}`,
    seat,
    ms: again ? 0 : DECISION_MS,
    later: (now) => {
      if (stateId(now) !== id) return null;
      const action = standInAction(now, seat);
      if (!action) return null;
      if (seat === now.turn.seat) lateTurn = turnKey(now);
      return { seat, action: late(action) };
    },
  });
  return timers;
}

/**
 * 판 끝 검증: 방장이 넣은 기록(꼬리표·시간 상한·시간패)이 규칙대로인가(`GameKit.verifyUnsigned`).
 * 꼬리표만 달면 「내가 보낸 것」·컴퓨터 수 대조를 건너뛰므로, 대신 정한 수는 사람 자리일 것, 그 자리가 정할
 * 때였을 것, `standInAction`과 같을 것을 본다. 시간패는 엔진이 남은 시간으로 확인한다. 시간 상한은 방장 자리로만
 * 받고 시각은 확인할 수 없다(docs/48 4-5 한계)
 */
export function verifyLate(
  before: GalaxyState,
  seat: number,
  action: Action,
  botSeats?: ReadonlySet<number>,
): string | null {
  if (action.type === "timeUp")
    return seat === 0 ? null : "시간 상한을 방장 아닌 자리로 냈다";
  if (!isLate(action)) return null;
  if (botSeats?.has(seat)) return "컴퓨터 자리를 시간 넘김으로 대신 뒀다";
  if (!pendingSeats(before).includes(seat))
    return "정할 때가 아닌 자리를 대신 뒀다";
  const {
    late: _late,
    spent: _spent,
    ...bare
  } = action as Late & { spent?: number };
  const expected = standInAction(before, seat);
  if (!expected || JSON.stringify(bare) !== JSON.stringify(expected))
    return "시간 넘김으로 대신 둔 수가 정해진 대신 두기와 다르다";
  return null;
}

/** 은하 한 바퀴 온라인 방에서 쓰는 킷: 방 시계(`timers`)와, 대신 정한 행동을 판 끝 검증에서 가리는 것 */
export const galaxyOnlineKit: GalaxyKit = {
  ...galaxyKit,
  // 끝내기·시간패·시간 상한과 대신 정한 꼬리표는 방장 기기만 기록한다.
  guestMayAct: (action) =>
    !isLate(action) &&
    action.type !== "retire" &&
    action.type !== "timeout" &&
    action.type !== "timeUp",
  timers: galaxyTimers,
  verifyUnsigned: ({ before, seat, action, context }) =>
    verifyLate(before, seat, action, context.botSeats),
  timing: {
    ...(galaxyKit.timing as NonNullable<GalaxyKit["timing"]>),
    // 방장 시계가 남긴 기록(시간패·시간 상한·결정 시간 넘김)은 누가 보낸 행동이 아니다.
    strip: (action) => {
      if (isLate(action) || action.type === "timeUp") return null;
      return (galaxyKit.timing as NonNullable<GalaxyKit["timing"]>).strip(
        action,
      );
    },
  },
};

/** 방을 만들 때 보이는 규칙 요약 */
export function galaxyRulesSummary(rules: GalaxyRules): string {
  const length =
    rules.length === "short"
      ? "짧은 판"
      : rules.length === "long"
        ? "긴 판"
        : "기본 판";
  return [
    `${rules.players}명`,
    `${length}(${lengthDetail(rules).split(" · ")[0]})`,
    rules.trade ? "거래" : "거래 없음",
    rules.seasonal ? "제철 하늘" : null,
    rules.meteor && rules.length !== "long" ? "유성우의 밤" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * 친구와 은하 한 바퀴(`BoardOnlineScreen`)에서 이 게임만 다른 것. 2~4명, 빈자리는 컴퓨터.
 * 주사위 사슬 씨앗과 봉투 값·소금은 저장소(`store.ts`)가 이 기기에만 두고, 약속·공개를 자동으로 낸다
 */
export const galaxyOnline: BoardOnlineGame<
  GalaxyRules,
  GalaxyState,
  GalaxyView,
  Action,
  GameEvent
> = {
  kit: galaxyOnlineKit,
  name: "은하 한 바퀴",
  shareTitle: "은하 한 바퀴 한 판 하자",
  session: galaxySession,
  useStore: useGalaxy,
  botFor: galaxyBotFor,
  rulesSummary(rules) {
    return `${galaxyRulesSummary(rules)} · 결정마다 ${DECISION_MS / 1000}초`;
  },
};
