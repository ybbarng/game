import type { Clock } from "@game/fair-play";
import {
  createHeartsSearchBot,
  type HeartsBot,
  heartsBeginnerBot,
  heartsIntermediateBot,
  heartsSearchBot,
} from "@game/hearts-ai";

import type { HeartsLevel } from "./settings";

export const HEARTS_LEVELS: readonly {
  value: HeartsLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description:
      "높은 카드를 쥐고 있다가 하트나 ♠Q를 덥석 먹는 실수를 자주 한다.",
  },
  {
    value: 1,
    label: "중수",
    description:
      "높은 카드를 넘기고, 이기고 있는 카드보다 낮은 카드로 턴을 피하고, ♠Q를 남에게 떠넘긴다. 가끔 실수한다.",
  },
  {
    value: 2,
    label: "고수",
    description:
      "많이 해 본 사람처럼 넘길 카드까지 계산하고, 나온 하트·높은 카드를 세며 수를 읽는다. 패가 좋으면 문 슛을 노리고, 남의 문 슛은 막는다. 컴퓨터마다 성향이 다르다.",
  },
];

const timedSearchBots = new WeakMap<Clock, HeartsBot>();

/**
 * 단계의 컴퓨터. `clock`을 주면 고수가 그 시계로 시간 상한(느린 기기 대비)을 쓴다.
 * 시간 상한에 걸리면 기기 속도에 따라 수가 달라지므로 혼자 하기에서만 준다. 온라인 방은 손님 기기가
 * 컴퓨터 수를 다시 계산해 기록과 맞춰 보므로(`kit.botFor`) 주지 않고, 시험도 주지 않는다
 */
export function heartsBotFor(level: HeartsLevel, clock?: Clock): HeartsBot {
  if (level === 2) {
    if (!clock) return heartsSearchBot;
    let bot = timedSearchBots.get(clock);
    if (!bot) {
      bot = createHeartsSearchBot({ clock });
      timedSearchBots.set(clock, bot);
    }
    return bot;
  }
  return level === 0 ? heartsBeginnerBot : heartsIntermediateBot;
}
