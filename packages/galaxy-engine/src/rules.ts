import {
  decodeTimePreset,
  encodeTimePreset,
  type TimePreset,
} from "@game/mighty-engine";

import { OPEN_SKIES } from "./sky-ids";

/**
 * 은하 한 바퀴 규칙(docs/48 2절). 판마다 고르는 것은 여기에 둔다.
 * - players 인원(2~4)
 * - length 판 길이: 짧은 판(short)·기본 판(standard)·긴 판(long), 2-11
 * - trade 도착 인수(2-8). g4까지는 굴리기 전 자유 거래였고 g5에서 인수로 바꿨다(이름은 규칙 문자열과 함께 그대로)
 * - seasonal 제철 하늘(2-12 1번)
 * - meteor 유성우의 밤(2-12 7번): 마지막 두 돌림 이용료 2배. 차례 수가 있는 판(짧은·기본)에만
 * - requests 관측 의뢰(15-5 1번): 판 처음 몰래 받은 의뢰를 판 끝에 펼쳐 이루었으면 지원금
 * - moon 달의 길(15-5 2번): 달이 차례마다 한 칸씩 돌고, 달 아래 별의 별자리는 이용료 절반
 * - sky 하늘 id(5-9, 예: "seasons")
 * - time 개인 시간(docs/24). 없으면 시간 없음
 */
export type GalaxyLength = "short" | "standard" | "long";

/**
 * 규칙 판 번호. 숫자 표(이용료·차례 수·자산 계산 등)를 바꾸면 올린다.
 * 옛 판 기록을 새 숫자로 다시 두면 결과가 달라지므로, 판 번호가 다른 기록은 다시 두지 않는다.
 * 2: 2026-11-04 재미 개선(docs/48 3-6). 문자열 머리 `g2-`
 * 3: 2026-11-04 마무리 손질(3-6 g3): 뒤 자리 시작 자금 보정, 공문 13 지원금 반. 문자열 머리 `g3-`
 * 4: 2026-11-05 다듬기(15절): 반쯤 섞은 판 배치, 제철은 별자리로, 이용료 다시 맞춤. 문자열 머리 `g4-`
 * 5: 2026-11-05 저울질(16절): 자유 거래 대신 도착 인수, 별은 자산에 값의 일부만, 완성 지원금은 별자리 값,
 *    내 별 재방문 반값 올리기, 지원금 조정. 문자열 머리 `g5-`
 */
export const GALAXY_EDITION = 5;

export interface GalaxyRules {
  /** 규칙 판 번호(`GALAXY_EDITION`) */
  edition: typeof GALAXY_EDITION;
  players: 2 | 3 | 4;
  length: GalaxyLength;
  trade: boolean;
  seasonal: boolean;
  meteor: boolean;
  moon: boolean;
  requests: boolean;
  sky: string;
  time?: TimePreset;
}

export const STANDARD_RULES: GalaxyRules = {
  edition: GALAXY_EDITION,
  players: 4,
  length: "standard",
  trade: true,
  seasonal: true,
  meteor: false,
  moon: true,
  requests: true,
  sky: "seasons",
};

/** 짧은 판도 거래를 켠다(2-8) */
export const SHORT_RULES: GalaxyRules = {
  ...STANDARD_RULES,
  length: "short",
  trade: true,
};

export const LONG_RULES: GalaxyRules = { ...STANDARD_RULES, length: "long" };

/**
 * 숫자 표 한 곳(docs/48 2·3절). 밸런스를 고칠 때는 이 표만 바꾼다.
 * 비율은 천분율 정수로 둔다(기기마다 계산 끝자리가 같게).
 */
export const NUMBERS = {
  /** 시작 자금(2-11) */
  startFunds: { short: 1000, standard: 1000, long: 1500 },
  /**
   * 첫 차례 이점 보정(3-6 g3): 첫 차례에서 n번째 뒤 자리는 시작 자금을 이만큼 × n 더 받는다(4인 0·20·40·60).
   * g2 bench에서 첫 차례 자리의 1등이 30.1%(기준 25 ± 5)로 넘었다. 먼저 사는 자리가 별 하나(60~200)를
   * 앞서 가지는 몫의 일부를 되돌린다
   */
  lateSeatBonus: 20,
  /** 우주국 지원금(2-5). 별빛이 넉넉하면 줄어든다(`salaryOf`, g5 16절) */
  salary: 120,
  /** 지원금이 줄기 시작하는 별빛, 넘는 몫에서 덜어 내는 비율(천분율), 가장 적은 지원금 */
  salaryFree: 300,
  salaryTaper: 200,
  salaryMin: 20,
  /** 한 사람이 갖는 차례 수(2-11). 긴 판은 제한 없음 */
  turns: {
    short: { 2: 24, 3: 17, 4: 12 },
    standard: { 2: 36, 3: 26, 4: 20 },
    long: null,
  },
  /** 시간 상한(ms, 엔진 밖 시계가 재고 `timeUp`으로 알린다). 긴 판은 없음 */
  timeCap: { short: 18 * 60_000, standard: 35 * 60_000, long: null },
  /** 짧은 판에 사람마다 나눠 주는 별 수(자리마다 다른 별자리 하나에서, dice.ts `dealStars`) */
  dealStars: { short: 2, standard: 0, long: 0 },
  /**
   * 정거장 이용료 배수(천분율, 2-2). 위 단계는 한 단 값(별 값의 절반)을 판 안에 되찾게 정했다(3-1 회수 기간):
   * 완성 → 2단 +0.5p, 2단 → 3단 +0.7p, 3단 → 큰 정거장 +0.8p. 큰 정거장은 처음 값 2.4p(#64 전)로 두어 운항 중단을 줄였다.
   * g4(15-3): 반쯤 섞은 판은 별자리가 일찍 완성돼 정거장이 일찍 서므로 운항 중단이 28.5%로 늘었다.
   * 2단 0.9 → 0.8p, 3단 1.6 → 1.4p, 큰 정거장 2.4 → 2.0p로 내려 4인 중수 400판 19.5%(기준 20% 아래)
   * g5(16절): 자유 거래가 빠져 완성이 늦어지고(중앙값 7 → 11돌림) 운항 중단이 3%대로 내려, 짓는 값을 되찾게
   * 2단 0.9p·3단 1.6p·큰 정거장 2.4p로 다시 올렸다(400판 운항 중단 7.2%, 300 넘는 이용료 나온 판 38%)
   */
  rent: {
    single: 200,
    pair: 300,
    complete: 400,
    level2: 900,
    level3: 1600,
    grand: 2400,
  },
  /** 정거장 한 단 값 = 별자리 기본 값의 이만큼(천분율) */
  levelCost: 500,
  /** 정거장을 내리면 한 단 값의 이만큼을 돌려받는다(천분율) */
  sellBack: 500,
  /** 맡기면 별 값의 이만큼을 받는다(천분율) */
  mortgage: 500,
  /** 되찾을 때 별 값의 이만큼을 낸다(천분율) */
  unmortgage: 550,
  /** 소행성대에서 바로 나가는 값 */
  asteroidFine: 50,
  /** 관측 지원금: 인원마다 자산 순위 1위부터(2-5) */
  observatory: { 2: [0, 100], 3: [0, 60, 120], 4: [0, 50, 100, 150] },
  /**
   * 판이 끝날 때 완성한 별자리마다 더하는 자산 = 그 별자리 기본 값(별 하나 값)의 이만큼(천분율).
   * g4까지는 모두 100이었다. g5(16절): 밝은 별자리를 완성하면 더 크게(페가수스 60 ~ 큰개 200)
   */
  completeBonusRate: 1000,
  /**
   * 자산에 넣는 별 값의 비율(천분율, 2-10). g4까지는 값 그대로(1000)라 별을 사도 자산이 줄지 않아
   * 「보이는 대로 다 사기」가 언제나 손해 없는 수였다. g5(16절): 사는 순간 자산이 값의 5분의 1만큼 줄어
   * 이용료로 되찾을 별을 고른다(75%는 완성이 줄고 돈이 더 쌓였다)
   */
  starAsset: 800,
  /**
   * 도착 인수(2-8, g5): 남의 별에 멈춰 이용료를 낸 뒤 그 별을 별 값의 이만큼(천분율)에 주인에게 내고 사들일 수 있다.
   * 주인이 완성한 별자리의 별·맡긴 별은 사들일 수 없다. 주인은 거절할 수 없고 흥정은 없다.
   * bench(16절): 1.5배 완성 나온 판 87%, 2배 84%, 2.5배 79%(기준 80% 넘게)
   */
  takeover: 1500,
  /** 내 별 재방문(g5): 내 별에 멈춘 차례에는 그 별자리 정거장 한 단을 한 단 값의 이만큼(천분율)에 올린다 */
  revisitBuild: 500,
  /** 제철 하늘 이용료 배수(천분율). 반올림으로 차이가 사라지지 않게 제철이면 적어도 `seasonalMin` 더 낸다 */
  seasonal: 1500,
  seasonalMin: 10,
  /** 유성우의 밤: 마지막 이만큼의 돌림 동안 이용료 배수(천분율). 이때는 제철 1.5배 대신 이 배수만 쓴다 */
  meteorRounds: 2,
  meteor: 2000,
  /** 달의 길: 판 처음 달이 있는 칸(관측지, 우주국 맞은편)과 달 아래 별자리의 이용료 배수(천분율) */
  moonStart: 16,
  moonRent: 500,
  /** 관측 의뢰를 이루면 우주국이 주는 별빛 */
  requestBonus: 150,
  /** 긴 판의 제철 하늘은 이만큼의 돌림마다 바뀐다(차례 수가 없으므로) */
  longSeasonRounds: 8,
  /** 별 값 범위(5-9): 가장 어두운 별자리 ~ 가장 밝은 별자리, 별자리 안 가장 밝은 별 더함 */
  valueMin: 60,
  valueMax: 200,
  brightestBonus: 20,
} as const;

/** 한 사람의 차례 수(긴 판은 null) */
export function turnLimitOf(rules: GalaxyRules): number | null {
  const table = NUMBERS.turns[rules.length];
  return table ? table[rules.players] : null;
}

/** 이 돌림이 유성우의 밤인가(2-12 7번): 켠 판의 마지막 `meteorRounds` 돌림. 차례 수가 없는 긴 판은 없다 */
export function meteorFor(rules: GalaxyRules, round: number): boolean {
  const limit = turnLimitOf(rules);
  return rules.meteor && limit !== null && round > limit - NUMBERS.meteorRounds;
}

/** 첫 운항 중단에 판이 끝나나(기본·짧은 판, 2-9) */
export function endsOnFirstBankrupt(rules: GalaxyRules): boolean {
  return rules.length !== "long";
}

const LENGTH_CODES: Record<GalaxyLength, string> = {
  short: "s",
  standard: "m",
  long: "l",
};

/*
 * 규칙 문자열. 온라인 방에서 규칙을 나눌 때 쓴다.
 * 형식: `g5-` + 인원(2·3·4) + 길이(s 짧은 / m 기본 / l 긴) + 도착 인수(t 켬 / n 끔, g4까지는 거래)
 *       + 제철 하늘(w 켬 / n 끔) + 유성우의 밤(켜면 r, 끄면 생략) + 달의 길(켜면 o) + 관측 의뢰(켜면 q)
 *       + `-` + 하늘 id(영문·숫자·점)
 *       + 시간(없으면 생략, `-t1` 빠른·`-t2` 보통).
 * 예: 기본(유성우 끔, 달·의뢰 켬) `g5-4mtwoq-seasons`, 유성우를 켜면 `g5-4mtwroq-seasons`,
 *     짧은 판 2인 인수·제철·달·의뢰 끔 `g5-2snn-seasons`, 빠른 시간이면 `g5-4mtwoq-seasons-t1`.
 * 긴 판은 마지막 돌림이 없어 유성우를 싣지 않는다(r 없음)
 */
export function encodeGalaxyRules(rules: GalaxyRules): string {
  return `g${GALAXY_EDITION}-${rules.players}${LENGTH_CODES[rules.length]}${rules.trade ? "t" : "n"}${rules.seasonal ? "w" : "n"}${rules.meteor ? "r" : ""}${rules.moon ? "o" : ""}${rules.requests ? "q" : ""}-${rules.sky}${encodeTimePreset(rules.time ?? "none")}`;
}

/**
 * 규칙 문자열을 읽는다. 온라인에서 받은 문자열이 판 만들기(`boardOfSky`)에서 터지지 않게
 * 처음 여는 하늘(`OPEN_SKIES`)이 아니면 거절한다
 */
export function decodeGalaxyRules(
  text: string,
): { ok: true; rules: GalaxyRules } | { ok: false; reason: string } {
  const match =
    /^g5-([234])([sml])([tn])([wn])(r?)(o?)(q?)-([A-Za-z0-9.]+)(-t\d)?$/.exec(
      text.trim(),
    );
  if (!match && /^g[1-4]-/.test(text.trim()))
    return {
      ok: false,
      reason:
        "옛 규칙으로 만든 판이에요. 화면을 새로 고친 뒤 다시 만들어 주세요",
    };
  if (!match)
    return { ok: false, reason: "은하 한 바퀴 규칙 문자열 형식이 아니에요" };
  const [
    ,
    players,
    length,
    trade,
    seasonal,
    meteor,
    moon,
    requests,
    sky,
    tail,
  ] = match;
  const time = decodeTimePreset(tail);
  if (time === null) return { ok: false, reason: "모르는 시간 규칙이에요" };
  if (!OPEN_SKIES.includes(sky as string))
    return { ok: false, reason: "아직 열지 않았거나 없는 하늘이에요" };
  const lengthName = (Object.keys(LENGTH_CODES) as GalaxyLength[]).find(
    (k) => LENGTH_CODES[k] === length,
  ) as GalaxyLength;
  return {
    ok: true,
    rules: {
      edition: GALAXY_EDITION,
      players: Number(players) as 2 | 3 | 4,
      length: lengthName,
      trade: trade === "t",
      seasonal: seasonal === "w",
      meteor: meteor === "r",
      moon: moon === "o",
      requests: requests === "q",
      sky: sky as string,
      ...(time === "none" ? {} : { time }),
    },
  };
}

/** 천분율 곱을 10 단위로 반올림한다(정수 계산, 0.5는 올림) */
export function round10(value: number, ...permilles: number[]): number {
  let numerator = value;
  let denominator = 1;
  for (const p of permilles) {
    numerator *= p;
    denominator *= 1000;
  }
  return Math.floor((numerator + 5 * denominator) / (10 * denominator)) * 10;
}

/** 천분율 곱(정수로 내림) */
export function permille(value: number, rate: number): number {
  return Math.floor((value * rate) / 1000);
}
