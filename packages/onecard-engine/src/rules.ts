/*
 * 원카드 규칙(docs/42 2-1·9절). 나무위키 기본 규칙과 docs/42 추천을 기본값으로 두고,
 * 집마다 다른 것은 `OnecardRules`의 값으로 고른다.
 */
import {
  BLACK_JOKER,
  COLOR_JOKER,
  type OnecardCard,
  rankOf,
  suitOf,
} from "./cards";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

/** 공격 카드마다 먹이는 장 수 */
export interface AttackValues {
  two: number;
  ace: number;
  spadeAce: number;
  blackJoker: number;
  colorJoker: number;
}

/**
 * 마지막 카드 제한. none: 아무 카드로나 끝낸다 / attack: 공격 카드(2·A·조커)로는 끝낼 수 없다 /
 * special: 공격 카드와 7·J·Q·K로도 끝낼 수 없다
 */
export type FinishRule = "none" | "attack" | "special";

export interface OnecardRules {
  /** 인원(2~5) */
  players: number;
  /** 처음 받는 장 수 */
  handSize: 5 | 7;
  attack: AttackValues;
  /** 흑백 조커는 흑색(♠·♣) 뒤에만, 컬러 조커는 적색(◆·♥) 뒤에만 낸다 */
  jokerColor: boolean;
  finish: FinishRule;
  /** 손패가 이 장 수 이상이면 파산(탈락). 0이면 파산 없음 */
  bankruptAt: 0 | 15 | 20 | 24;
  /** 한 사람이 다 내면 판 끝(끄면 한 사람이 남을 때까지 계속) */
  endOnFirst: boolean;
  /** 외치지 않은 한 장짜리를 잡으면 그 사람이 먹는 장 수 */
  catchPenalty: 1 | 2;
  /** 헛외침(잡을 사람도 외칠 때도 아닌데 누름)에 누른 사람이 먹는 장 수 */
  falseShoutPenalty: 0 | 1 | 2;
  /** 외치지 않고 한 장이 된 뒤 본인만 외칠 수 있는 시간 P(ms) */
  selfWindowMs: 0 | 1000 | 2000;
  /** P가 끝난 뒤 남이 잡을 수 있는 시간 T(ms) */
  catchWindowMs: 2000 | 3000 | 5000;
  /** 본인이 외치면 다른 사람들이 한 장씩 먹는다 */
  shoutReward: boolean;
}

export const STANDARD_ATTACK: AttackValues = {
  two: 2,
  ace: 3,
  spadeAce: 5,
  blackJoker: 5,
  colorJoker: 7,
};

export const STANDARD_ONECARD_RULES: OnecardRules = {
  players: 4,
  handSize: 7,
  attack: STANDARD_ATTACK,
  jokerColor: false,
  finish: "attack",
  bankruptAt: 20,
  endOnFirst: false,
  catchPenalty: 1,
  falseShoutPenalty: 1,
  selfWindowMs: 1000,
  catchWindowMs: 3000,
  shoutReward: false,
};

export const HAND_SIZE_OPTIONS = [7, 5] as const;
export const BANKRUPT_OPTIONS = [20, 15, 24, 0] as const;
export const CATCH_PENALTY_OPTIONS = [1, 2] as const;
export const FALSE_SHOUT_OPTIONS = [1, 2, 0] as const;
export const SELF_WINDOW_OPTIONS = [1000, 0, 2000] as const;
export const CATCH_WINDOW_OPTIONS = [3000, 2000, 5000] as const;
export const FINISH_OPTIONS = ["attack", "special", "none"] as const;

/** 지난 판 번호(`seen`)를 이만큼 넘게 지난 외침은 벌칙 없이 버린다(docs/43 2-2 늦은 청구 컷의 단순판) */
export const STALE_SEEN = 2;

/** 이 카드가 먹이는 공격 장 수. 공격 카드가 아니면 0 */
export function attackValue(card: OnecardCard, rules: OnecardRules): number {
  if (card === BLACK_JOKER) return rules.attack.blackJoker;
  if (card === COLOR_JOKER) return rules.attack.colorJoker;
  const rank = rankOf(card);
  if (rank === "2") return rules.attack.two;
  if (rank === "A")
    return suitOf(card) === "S" ? rules.attack.spadeAce : rules.attack.ace;
  return 0;
}

/*
 * 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `o1-p<인원>h<장 수>a<2>.<A>.<♠A>.<흑백 조커>.<컬러 조커>f<a|s|n>b<파산>e<0|1>c<잡기 벌칙>x<헛외침 벌칙>w<P>t<T>r<0|1>j<0|1>`
 * 예: 기본 `o1-p4h7a2.3.5.5.7fab20e0c1x1w1000t3000r0j0`
 */
export function encodeOnecardRules(rules: OnecardRules): string {
  const a = rules.attack;
  const finish = { attack: "a", special: "s", none: "n" }[rules.finish];
  return (
    `o1-p${rules.players}h${rules.handSize}` +
    `a${a.two}.${a.ace}.${a.spadeAce}.${a.blackJoker}.${a.colorJoker}` +
    `f${finish}b${rules.bankruptAt}e${rules.endOnFirst ? 1 : 0}` +
    `c${rules.catchPenalty}x${rules.falseShoutPenalty}` +
    `w${rules.selfWindowMs}t${rules.catchWindowMs}` +
    `r${rules.shoutReward ? 1 : 0}j${rules.jokerColor ? 1 : 0}`
  );
}

const ATTACK = "([1-9]|1[0-5])";

export function decodeOnecardRules(
  text: string,
): { ok: true; rules: OnecardRules } | { ok: false; reason: string } {
  const match = new RegExp(
    `^o1-p([2-5])h([57])a${ATTACK}\\.${ATTACK}\\.${ATTACK}\\.${ATTACK}\\.${ATTACK}` +
      "f([asn])b(0|15|20|24)e([01])c([12])x([012])w(0|1000|2000)t(2000|3000|5000)r([01])j([01])$",
  ).exec(text.trim());
  if (!match) return { ok: false, reason: "원카드 규칙 문자열 형식이 아니다" };
  const [
    ,
    players,
    hand,
    two,
    ace,
    spadeAce,
    blackJoker,
    colorJoker,
    finish,
    bankrupt,
    endOnFirst,
    catchPenalty,
    falseShout,
    self,
    catchMs,
    reward,
    jokerColor,
  ] = match;
  const finishRule: Record<string, FinishRule> = {
    a: "attack",
    s: "special",
    n: "none",
  };
  return {
    ok: true,
    rules: {
      players: Number(players),
      handSize: Number(hand) as OnecardRules["handSize"],
      attack: {
        two: Number(two),
        ace: Number(ace),
        spadeAce: Number(spadeAce),
        blackJoker: Number(blackJoker),
        colorJoker: Number(colorJoker),
      },
      finish: finishRule[finish as string] as FinishRule,
      bankruptAt: Number(bankrupt) as OnecardRules["bankruptAt"],
      endOnFirst: endOnFirst === "1",
      catchPenalty: Number(catchPenalty) as OnecardRules["catchPenalty"],
      falseShoutPenalty: Number(
        falseShout,
      ) as OnecardRules["falseShoutPenalty"],
      selfWindowMs: Number(self) as OnecardRules["selfWindowMs"],
      catchWindowMs: Number(catchMs) as OnecardRules["catchWindowMs"],
      shoutReward: reward === "1",
      jokerColor: jokerColor === "1",
    },
  };
}
