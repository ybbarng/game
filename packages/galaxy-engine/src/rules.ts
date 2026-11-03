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
 * - trade 거래(2-8)
 * - seasonal 제철 하늘(2-12 1번)
 * - sky 하늘 id(5-9, 예: "seasons")
 * - time 개인 시간(docs/24). 없으면 시간 없음
 */
export type GalaxyLength = "short" | "standard" | "long";

export interface GalaxyRules {
  players: 2 | 3 | 4;
  length: GalaxyLength;
  trade: boolean;
  seasonal: boolean;
  sky: string;
  time?: TimePreset;
}

export const STANDARD_RULES: GalaxyRules = {
  players: 4,
  length: "standard",
  trade: true,
  seasonal: true,
  sky: "seasons",
};

/** 짧은 판은 거래를 기본으로 끈다(2-8) */
export const SHORT_RULES: GalaxyRules = {
  ...STANDARD_RULES,
  length: "short",
  trade: false,
};

export const LONG_RULES: GalaxyRules = { ...STANDARD_RULES, length: "long" };

/**
 * 숫자 표 한 곳(docs/48 2·3절). 밸런스를 고칠 때는 이 표만 바꾼다.
 * 비율은 천분율 정수로 둔다(기기마다 계산 끝자리가 같게).
 */
export const NUMBERS = {
  /** 시작 자금(2-11) */
  startFunds: { short: 1000, standard: 1000, long: 1500 },
  /** 우주국 지원금(2-5) */
  salary: 120,
  /** 한 사람이 갖는 차례 수(2-11). 긴 판은 제한 없음 */
  turns: {
    short: { 2: 20, 3: 14, 4: 10 },
    standard: { 2: 36, 3: 26, 4: 20 },
    long: null,
  },
  /** 시간 상한(ms, 엔진 밖 시계가 재고 `timeUp`으로 알린다). 긴 판은 없음 */
  timeCap: { short: 15 * 60_000, standard: 35 * 60_000, long: null },
  /** 짧은 판에 사람마다 나눠 주는 별 수 */
  dealStars: { short: 2, standard: 0, long: 0 },
  /** 정거장 이용료 배수(천분율, 2-2) */
  rent: {
    single: 100,
    pair: 150,
    complete: 200,
    level2: 500,
    level3: 1300,
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
  /** 판이 끝날 때 완성한 별자리마다 더하는 자산 */
  completeBonus: 100,
  /** 제철 하늘 이용료 배수(천분율) */
  seasonal: 1500,
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
 * 형식: `g1-` + 인원(2·3·4) + 길이(s 짧은 / m 기본 / l 긴) + 거래(t 켬 / n 끔)
 *       + 제철 하늘(w 켬 / n 끔) + `-` + 하늘 id(영문·숫자·점)
 *       + 시간(없으면 생략, `-t1` 빠른·`-t2` 보통).
 * 예: 기본 `g1-4mtw-seasons`, 짧은 판 2인 `g1-2snw-seasons`, 빠른 시간이면 `g1-4mtw-seasons-t1`
 */
export function encodeGalaxyRules(rules: GalaxyRules): string {
  return `g1-${rules.players}${LENGTH_CODES[rules.length]}${rules.trade ? "t" : "n"}${rules.seasonal ? "w" : "n"}-${rules.sky}${encodeTimePreset(rules.time ?? "none")}`;
}

/**
 * 규칙 문자열을 읽는다. 온라인에서 받은 문자열이 판 만들기(`boardOfSky`)에서 터지지 않게
 * 처음 여는 하늘(`OPEN_SKIES`)이 아니면 거절한다
 */
export function decodeGalaxyRules(
  text: string,
): { ok: true; rules: GalaxyRules } | { ok: false; reason: string } {
  const match = /^g1-([234])([sml])([tn])([wn])-([A-Za-z0-9.]+)(-t\d)?$/.exec(
    text.trim(),
  );
  if (!match)
    return { ok: false, reason: "은하 한 바퀴 규칙 문자열 형식이 아니에요" };
  const [, players, length, trade, seasonal, sky, tail] = match;
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
      players: Number(players) as 2 | 3 | 4,
      length: lengthName,
      trade: trade === "t",
      seasonal: seasonal === "w",
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
