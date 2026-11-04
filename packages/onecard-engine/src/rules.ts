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
  /**
   * 한 번 누름이 미리 외침(내 차례·두 장)과 잡기(남이 잡기 창 안) 둘 다에 해당하면 둘 다 한다.
   * 오프라인에서 "원카드!" 한 번은 둘 다 되기 때문(docs/42 12-5). 없으면 켬. 끄면 미리 외침만
   */
  shoutBoth?: boolean;
  /**
   * 반응 속도 겨루기(규칙 문자열 o2, docs/42 17절). 외치지 않은 채 한 장이 되면 겨루기 창 하나(`catchWindowMs`)가 열리고,
   * 창 안의 누름은 각자 기기에서 잰 반응 시간으로 겨룬다. 본인 시간 P·미리 외침·`shoutBoth`는 쓰지 않는다.
   * 없거나 false면 옛 규칙(o1, B안: 본인 시간 P → 잡기 창 T, 미리 외침). 옛 기록은 옛 판정으로 그대로 돈다
   */
  race?: boolean;
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
  shoutBoth: true,
  race: true,
};

/**
 * 옛 규칙(o1, B안: 본인 시간 P → 잡기 창 T, 미리 외침). 옛 기록·복기와 옛 판정 시험이 쓴다.
 * `race` 칸이 없다(o1 규칙 문자열을 풀면 이 모양이 된다)
 */
export const O1_ONECARD_RULES: OnecardRules = {
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
  shoutBoth: true,
};

export const HAND_SIZE_OPTIONS = [7, 5] as const;
export const BANKRUPT_OPTIONS = [20, 15, 24, 0] as const;
export const CATCH_PENALTY_OPTIONS = [1, 2] as const;
export const FALSE_SHOUT_OPTIONS = [1, 2, 0] as const;
export const SELF_WINDOW_OPTIONS = [1000, 0, 2000] as const;
export const CATCH_WINDOW_OPTIONS = [3000, 2000, 5000] as const;
export const FINISH_OPTIONS = ["attack", "special", "none"] as const;

/**
 * 사람 반응 하한(ms, o2). 이보다 짧은 반응 시간은 보고 누른 것이 아니라 예측으로 보고 이 값으로 늘려 인정한다
 * (버리지 않는다). 그래서 하한 아래끼리는 모두 동점이다(docs/42 17-2)
 */
export const HUMAN_RT_FLOOR_MS = 100;

/** 공정 창 X(ms, o2). 인정 반응 시간 차이가 이 안이면 동점: 한 장이 된 본인이 이기고, 잡는 사람끼리는 함께 뽑기 */
export const RACE_TIE_MS = 10;

/**
 * 혼자 하기(대국을 돌리는 기기 안)의 모으는 시간(ms, o2). 첫 누름이 온 뒤 이만큼 기다렸다가 반응 시간 순으로 처리한다.
 * 사람 누름은 화면을 그린 프레임만큼 늦게 닿으므로 그만큼 기다려 준다(컴퓨터 누름은 누르고 있기 시간만큼 늦춰 넣는다)
 */
export const RACE_GATHER_MS = 150;

/** 인정 반응 시간: 사람 하한 아래는 하한으로 */
export function floorRt(rt: number): number {
  return Math.max(rt, HUMAN_RT_FLOOR_MS);
}

/** 겨루기의 누름 하나(엔진·방장·참가자가 같은 순서를 계산한다) */
export interface RacePress {
  seat: number;
  /** 누른 사람이 본 판 번호 */
  seen: number;
  /** 인정 반응 시간(ms). 하한은 `raceOrder`가 씌운다 */
  rt: number;
}

/**
 * 겨루기 순서(o2, docs/42 17-2). 먼저 본 판(`seen`)의 누름이 앞, 같은 판에서는 인정 반응 시간(하한 적용)이 짧은 쪽이 앞.
 * 같은 판에서 맨 앞 누름과 `tieMs` 안의 누름은 동점 묶음이고, 묶음 안에서는 **그 판에서 한 장이던 사람(본인)**이
 * 먼저(본인 외침 우선), 잡는 사람끼리는 `tiebreak`(온라인 방은 함께 뽑기, 기본은 받은 차례)로 가른다.
 * 정렬은 안정적이라 같은 입력이면 늘 같은 결과다
 */
export function raceOrder<T extends RacePress>(
  presses: readonly T[],
  isOwner: (press: T) => boolean,
  tiebreak: (catchers: T[]) => T[] = (c) => c,
  tieMs = RACE_TIE_MS,
): T[] {
  const left = presses
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        a.p.seen - b.p.seen || floorRt(a.p.rt) - floorRt(b.p.rt) || a.i - b.i,
    )
    .map((x) => x.p);
  const out: T[] = [];
  while (left.length > 0) {
    const head = left[0] as T;
    const limit = floorRt(head.rt) + tieMs;
    const group = left.filter(
      (p) => p.seen === head.seen && floorRt(p.rt) <= limit,
    );
    for (const p of group) left.splice(left.indexOf(p), 1);
    const owners = group.filter((p) => isOwner(p));
    const catchers = group.filter((p) => !isOwner(p));
    out.push(
      ...owners,
      ...(catchers.length > 1 ? tiebreak(catchers) : catchers),
    );
  }
  return out;
}

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
 * `shoutBoth`를 끈 규칙만 끝에 `s0`이 붙는다(켠 규칙의 문자열은 옵션이 생기기 전과 같다)
 *
 * 반응 속도 겨루기(`race`)는 판 번호 o2: `o2-p<인원>h<장 수>a…f…b…e…c…x…t<T>r…j…`(본인 시간 P·`s0`이 없다).
 * 예: 기본 `o2-p4h7a2.3.5.5.7fab20e0c1x1t3000r0j0`. 옛 화면은 o2를 읽지 못해 그 방에 들어오지 못한다
 */
export function encodeOnecardRules(rules: OnecardRules): string {
  const a = rules.attack;
  const finish = { attack: "a", special: "s", none: "n" }[rules.finish];
  if (rules.race)
    return (
      `o2-p${rules.players}h${rules.handSize}` +
      `a${a.two}.${a.ace}.${a.spadeAce}.${a.blackJoker}.${a.colorJoker}` +
      `f${finish}b${rules.bankruptAt}e${rules.endOnFirst ? 1 : 0}` +
      `c${rules.catchPenalty}x${rules.falseShoutPenalty}` +
      `t${rules.catchWindowMs}` +
      `r${rules.shoutReward ? 1 : 0}j${rules.jokerColor ? 1 : 0}`
    );
  return (
    `o1-p${rules.players}h${rules.handSize}` +
    `a${a.two}.${a.ace}.${a.spadeAce}.${a.blackJoker}.${a.colorJoker}` +
    `f${finish}b${rules.bankruptAt}e${rules.endOnFirst ? 1 : 0}` +
    `c${rules.catchPenalty}x${rules.falseShoutPenalty}` +
    `w${rules.selfWindowMs}t${rules.catchWindowMs}` +
    `r${rules.shoutReward ? 1 : 0}j${rules.jokerColor ? 1 : 0}` +
    (rules.shoutBoth === false ? "s0" : "")
  );
}

const ATTACK = "([1-9]|1[0-5])";

export function decodeOnecardRules(
  text: string,
): { ok: true; rules: OnecardRules } | { ok: false; reason: string } {
  const trimmed = text.trim();
  const race = trimmed.startsWith("o2-");
  const match = new RegExp(
    race
      ? `^o2-p([2-5])h([57])a${ATTACK}\\.${ATTACK}\\.${ATTACK}\\.${ATTACK}\\.${ATTACK}` +
          "f([asn])b(0|15|20|24)e([01])c([12])x([012])()t(2000|3000|5000)r([01])j([01])()$"
      : `^o1-p([2-5])h([57])a${ATTACK}\\.${ATTACK}\\.${ATTACK}\\.${ATTACK}\\.${ATTACK}` +
          "f([asn])b(0|15|20|24)e([01])c([12])x([012])w(0|1000|2000)t(2000|3000|5000)r([01])j([01])(s0)?$",
  ).exec(trimmed);
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
    noBoth,
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
      // o2는 본인 시간 P를 쓰지 않는다(칸은 기본값으로 채운다)
      selfWindowMs: (race
        ? 1000
        : Number(self)) as OnecardRules["selfWindowMs"],
      catchWindowMs: Number(catchMs) as OnecardRules["catchWindowMs"],
      shoutReward: reward === "1",
      jokerColor: jokerColor === "1",
      shoutBoth: race || noBoth === undefined,
      ...(race ? { race: true } : {}),
    },
  };
}
