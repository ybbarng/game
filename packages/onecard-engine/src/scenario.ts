import {
  ONECARD_DECK,
  type OnecardCard,
  type Suit,
  sortOnecards,
  suitOf,
} from "./cards";
import { type OnecardRules, STANDARD_ONECARD_RULES } from "./rules";
import type { OnecardState } from "./state";

/** 튜토리얼·시험 장면: 정해진 손패·더미에서 판을 시작한다 */
export interface OnecardScenarioOptions {
  /** 없으면 기본 규칙. 인원은 손패 수로 정한다 */
  rules?: Partial<OnecardRules>;
  /** 자리별 손패. 0번이 나 */
  hands: OnecardCard[][];
  /** 버린 더미(끝이 맨 위). 한 장 이상 */
  pile: OnecardCard[];
  /** 더미(앞이 맨 위). 없으면 남은 카드를 카드 순서대로 */
  deck?: OnecardCard[];
  /** 지금 차례(기본 0) */
  turn?: number;
  direction?: 1 | -1;
  /** 맞출 무늬(기본: 맨 위 카드의 무늬, 조커면 null) */
  suit?: Suit | null;
  /** 쌓인 공격 장 수(기본 0) */
  attack?: number;
}

export function createOnecardScenario(
  options: OnecardScenarioOptions,
): OnecardState {
  const n = options.hands.length;
  const rules: OnecardRules = {
    ...STANDARD_ONECARD_RULES,
    ...options.rules,
    players: n,
  };
  const used = [...options.hands.flat(), ...options.pile];
  if (new Set(used).size !== used.length)
    throw new Error("장면에 같은 카드가 두 번 있다");
  const top = options.pile[options.pile.length - 1];
  if (!top) throw new Error("버린 더미에 한 장은 있어야 한다");
  const deck = options.deck ?? ONECARD_DECK.filter((c) => !used.includes(c));
  return {
    rules,
    version: 0,
    phase: "play",
    turn: options.turn ?? 0,
    direction: options.direction ?? 1,
    deck: [...deck],
    pile: [...options.pile],
    hands: options.hands.map((h) => sortOnecards(h)),
    suit: options.suit === undefined ? suitOf(top) : options.suit,
    attack: options.attack ?? 0,
    preCalled: new Array<boolean>(n).fill(false),
    called: new Array<boolean>(n).fill(false),
    windows: [],
    nextWindowId: 1,
    queue: [],
    endTurnAfterQueue: false,
    finished: [],
    bankrupt: [],
    bankruptCounts: new Array<number>(n).fill(0),
    turnNo: 0,
    recent: [{ turnNo: 0, exposed: [] }],
    result: null,
  };
}
