import {
  type Action,
  type OnecardRules,
  STANDARD_ONECARD_RULES,
  shoutWindows,
  viewOf,
} from "@game/onecard-engine";

import type { GameArchive } from "@/review/archive";

import { onecardKit } from "./kit";

/** 대본 기록의 규칙: 셋이서 다섯 장(판이 짧고 자리 판이 셋) */
export const SCRIPT_RULES: OnecardRules = {
  ...STANDARD_ONECARD_RULES,
  players: 3,
  handSize: 5,
};

export const SCRIPT_SEED = 7;

/**
 * 복기 시험용 원카드 기록을 엔진으로 만든다(단위 시험과 화면 시험이 같은 기록을 쓴다).
 * 차례 사람은 낼 수 있는 첫 수를 둔다. 둘째 걸음에 자리 2가 창 없이 눌러 헛외침, 한 장이 된 사람이 생기면
 * 처음에는 다음 자리가 먼저 눌러 잡고, 그다음부터는 본인이 외친다. 모으기 창·외침 창은 다 되면 닫는다
 */
export function scriptedOnecardLog(
  rules: OnecardRules = SCRIPT_RULES,
  seed: number = SCRIPT_SEED,
): GameArchive["log"] {
  let { state } = onecardKit.createMatch(rules, seed);
  const log: GameArchive["log"] = [];
  const pressed = new Set<number>();
  let caught = false;
  const push = (seat: number, action: Action) => {
    const result = onecardKit.step(state, seat, action);
    if (!result.ok) throw new Error(`${log.length}: ${result.error}`);
    state = result.state;
    log.push({ seat, action });
  };
  for (let i = 0; i < 600 && state.phase !== "over"; i++) {
    const auto = onecardKit.autoAction?.(state, seed + log.length);
    if (auto) {
      push(auto.seat, auto.action);
      continue;
    }
    if (log.length === 1) {
      push(2, { type: "shout", seen: state.turnNo, rt: 500 });
      continue;
    }
    const timers = onecardKit.timers?.(state) ?? [];
    const gather = timers.find((t) => t.key.startsWith("g"));
    if (gather) {
      push(gather.seat, gather.action);
      continue;
    }
    const open = shoutWindows(state).find((w) => !pressed.has(w.id));
    if (open) {
      pressed.add(open.id);
      const seat = caught ? open.seat : (open.seat + 1) % rules.players;
      caught = true;
      push(seat, { type: "shout", seen: state.turnNo, rt: 400 });
      continue;
    }
    const closing = timers[0];
    if (closing) {
      push(closing.seat, closing.action);
      continue;
    }
    const move = viewOf(state, state.turn).moves[0];
    if (!move) throw new Error(`${log.length}: 둘 수가 없다`);
    push(state.turn, move);
  }
  return log;
}

/** 혼자 하기로 남긴 것과 같은 모양의 복기 기록 */
export function scriptedOnecardArchive(): GameArchive {
  const log = scriptedOnecardLog();
  return {
    id: `solo:${SCRIPT_SEED}`,
    game: "onecard",
    mode: "solo",
    startedAt: Date.UTC(2026, 10, 17, 3),
    updatedAt: Date.UTC(2026, 10, 17, 3, 10),
    rules: SCRIPT_RULES,
    seed: SCRIPT_SEED,
    log,
    seat: 0,
    seatNames: null,
    rounds: 1,
    over: true,
  };
}
