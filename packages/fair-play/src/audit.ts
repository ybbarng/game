import {
  type Action,
  type Card,
  createMatch,
  type GameEvent,
  type MatchState,
  type PresetDeal,
  type RuleSet,
  step,
} from "@game/mighty-engine";
import { obj } from "@game/mighty-engine/josa";

import { cardText, slotOfToken } from "./blind";
import { nothingOpened } from "./nothing-opened";

/*
 * 진짜 카드로 다시 계산하기. 마지막 턴에 모두 열쇠를 공개하면 그 판의 실제 패를 안다.
 * 행동 기록을 실제 패로 처음부터 다시 돌려, 자리 표로 진행한 것과 맞는지 보고 어긋나면 누구 탓인지 짚는다.
 * - 다시 돌리다 규칙에 맞지 않는 행동이 나오면: 그 행동을 한 자리(무늬 안 따르기 등)
 * - 죽이기에서 진짜로는 죽었어야 할 사람이 있으면: 그 카드를 갖고도 없다고 한 자리
 * - 진짜로는 프렌드가 드러났어야 하면: 점수를 따고도 프렌드라고 밝히지 않은 자리
 * - 그 밖에 다르면: 진행을 맡은 방장
 */

/** 한 판(나눠 주기 한 번)의 실제 패 */
export interface RoundDeal {
  /** 처음 나눈 패(실제 카드) */
  deal: PresetDeal;
  /** 6·7마 죽이기 뒤 다시 나눈 순서(실제 카드) */
  redeal?: Card[];
  /** 자리 → 카드. 기록 속 자리 표(버린 카드)를 진짜 카드로 바꾼다 */
  cards: ReadonlyMap<number, Card>;
}

export interface FairLogged {
  seat: number;
  action: Action;
  bot?: true;
}

export type ReplayCheck =
  | {
      ok: true;
      /** 다시 계산한 마지막 상태. 첫 판 패도 모르면(첫 판 도중에 그만둠) null */
      state: MatchState | null;
      /** 걸음마다의 상태(첫 상태 포함). 화면 비교에 쓴다 */
      states: MatchState[];
      /** 다시 계산한 기록 수. 아직 패를 모르는 판에 들어서면 거기서 멈춘다 */
      upTo: number;
    }
  | { ok: false; index: number; seat: number; reason: string };

/** 기록 속 자리 표를 진짜 카드로 바꾸고, 엔진이 모르는 칸(카드 자리)을 뺀다 */
export function realAction(
  action: Action,
  cards: ReadonlyMap<number, Card>,
): Action {
  const swap = (c: Card) => {
    const slot = slotOfToken(c);
    return slot === null ? c : (cards.get(slot) ?? c);
  };
  switch (action.type) {
    case "exchange":
      return { ...action, discard: action.discard.map(swap) };
    case "play": {
      const { deckSlot: _, ...rest } = action as Action & { deckSlot?: number };
      return rest as Action;
    }
    default:
      return action;
  }
}

/** 사건 비교용: 같은 판단인지만 본다 */
function decisive(events: readonly GameEvent[]): string {
  return JSON.stringify(
    events
      .filter(
        (e) =>
          e.type === "killAttempt" ||
          e.type === "friendRevealed" ||
          e.type === "trickWon" ||
          e.type === "played" ||
          e.type === "elected",
      )
      .map((e) => (e.type === "played" ? { ...e, slot: null } : e)),
  );
}

/**
 * `deals`는 판 번호(1부터) → 실제 패. 아직 모르는 판(앞으로 나눌 판, 끝까지 치지 않은 판)은 비워 둔다.
 * 첫 판도 다른 판과 같다: 패를 모르면 처음에서 멈춘다(`nothingOpened`).
 * `observed`가 있으면 자리 표로 진행할 때 나온 사건과 걸음마다 맞춰 본다.
 */
export function checkReplay(
  rules: RuleSet,
  seed: number,
  log: readonly FairLogged[],
  deals: ReadonlyMap<number, RoundDeal>,
  observed?: readonly (readonly GameEvent[])[],
): ReplayCheck {
  const first = deals.get(1);
  if (!first) return nothingOpened();
  let state = createMatch({ rules, seed, presetDeal: first.deal }).state;
  const states = [state];
  /** 바로 앞 걸음이 진짜 카드로는 성공한 죽이기였다(죽었어야 할 자리와 불린 카드) */
  let lastKill: { killed: number; card: Card } | null = null;
  for (const [index, entry] of log.entries()) {
    const round = state.roundNumber;
    const current = deals.get(round);
    if (!current) return { ok: true, state, states, upTo: index };
    state.presetDeal = deals.get(round + 1)?.deal ?? null;
    if (state.round.phase === "kill" && current.redeal)
      state.presetRedeal = current.redeal;
    else delete state.presetRedeal;
    // 이 걸음이 새 판을 여는데 그 판 패를 아직 모르면 여기서 멈춘다(엔진이 시드로 섞어 버리지 않게).
    const action = realAction(entry.action, current.cards);
    const opensRound = (s: MatchState) => s.roundNumber !== round;
    const result = step(state, entry.seat, action);
    if (!result.ok) {
      // 걸음별 사건이 없는 기기(참가자): 진짜로는 죽이기가 성공했는데 기록에 죽이기가 또 있으면
      // 자리 표 진행에서는 실패했다는 뜻이다. 불린 카드를 갖고도 없다고 한 자리 탓이다.
      if (lastKill && action.type === "kill")
        return {
          ok: false,
          index: index - 1,
          seat: lastKill.killed,
          reason: `죽이기에 불린 ${obj(cardText(lastKill.card))} 갖고 있으면서 없다고 했어요.`,
        };
      return {
        ok: false,
        index,
        seat: entry.seat,
        reason: `진짜 카드로 다시 계산하니 규칙에 맞지 않는 행동이었다(${result.error})`,
      };
    }
    const kill = result.events.find((e) => e.type === "killAttempt");
    lastKill =
      kill?.type === "killAttempt" && kill.killed !== null
        ? { killed: kill.killed, card: kill.card }
        : null;
    if (opensRound(result.state) && !deals.has(result.state.roundNumber))
      return { ok: true, state, states, upTo: index };
    const seen = observed?.[index];
    if (seen && decisive(seen) !== decisive(result.events)) {
      const blame = blameOf(result.events, seen, entry.seat);
      return { ok: false, index, ...blame };
    }
    // 판을 새로 시작하지 않았으면 다음 판 패는 넣지 않은 상태로 둔다(자리 표 진행과 같게).
    if (result.state.roundNumber === round) result.state.presetDeal = null;
    delete result.state.presetRedeal;
    state = result.state;
    states.push(state);
  }
  return { ok: true, state, states, upTo: log.length };
}

/** 프렌드가 점수를 따고도 밝히지 않았을 때(방장 길 `blameOf`와 참가자 길 `hiddenFriend`가 함께 쓴다) */
export const FRIEND_HIDDEN = "프렌드인데 점수를 따고도 밝히지 않았어요.";

/** 받은 화면에서 프렌드 공개를 보는 데 쓰는 칸 */
export interface SeenFriendView {
  roundNumber: number;
  trickIndex: number;
  friendRevealed: boolean;
}

/**
 * 걸음별 사건이 없는 기기(참가자)의 프렌드 숨기기 찾기. 진짜 카드로는 턴이 끝나며 프렌드가 드러났는데(점수를 따
 * 드러남, `revealFriendOnScore`), 그 뒤 턴의 받은 화면이 여전히 프렌드를 숨겼으면 자리 표 진행에서는 드러나지 않았다는
 * 뜻이다. 방장 물음에 프렌드 카드를 갖고도 아니라고 한 그 자리 탓이다(죽이기의 `lastKill`과 같은 판단).
 * 이것 없이는 그 뒤 컴퓨터 수·화면이 다시 계산한 것과 달라 정직한 방장을 짚는다.
 * `states`는 `checkReplay`가 돌려준 걸음마다의 상태(`states[i + 1]`이 기록 i 뒤)
 */
export function hiddenFriend(
  states: readonly MatchState[],
  seen: readonly SeenFriendView[],
): { index: number; seat: number; reason: string } | null {
  for (let i = 0; i + 1 < states.length; i++) {
    const before = states[i] as MatchState;
    const after = states[i + 1] as MatchState;
    if (before.round.friendRevealed || !after.round.friendRevealed) continue;
    const friend = after.round.friend;
    if (friend === null || after.roundNumber !== before.roundNumber) continue;
    const hidden = seen.some(
      (v) =>
        v.roundNumber === before.roundNumber &&
        v.trickIndex > before.round.trickIndex &&
        !v.friendRevealed,
    );
    if (hidden)
      return {
        index: i,
        seat: friend,
        reason: FRIEND_HIDDEN,
      };
  }
  return null;
}

function blameOf(
  real: readonly GameEvent[],
  seen: readonly GameEvent[],
  actor: number,
): { seat: number; reason: string } {
  const realKill = real.find((e) => e.type === "killAttempt");
  const seenKill = seen.find((e) => e.type === "killAttempt");
  if (
    realKill?.type === "killAttempt" &&
    seenKill?.type === "killAttempt" &&
    realKill.killed !== seenKill.killed &&
    realKill.killed !== null
  )
    return {
      seat: realKill.killed,
      reason: `죽이기에 불린 ${obj(cardText(realKill.card))} 갖고 있으면서 없다고 했어요.`,
    };
  const realFriend = real.find((e) => e.type === "friendRevealed");
  const seenFriend = seen.find((e) => e.type === "friendRevealed");
  if (
    realFriend?.type === "friendRevealed" &&
    realFriend.seat !== null &&
    seenFriend === undefined
  )
    return {
      seat: realFriend.seat,
      reason: FRIEND_HIDDEN,
    };
  return {
    seat: 0,
    reason: `방장이 진행한 결과가 진짜 카드로 다시 계산한 것과 달라요(${actor}번 차례).`,
  };
}
