import type { SolveRecord } from "../records";
import {
  recordedMs,
  TEN_MINUTES_MS,
  type Timed,
  averageOf as wcaAverage,
} from "../timer/stats";
import {
  DIVISIONS,
  type Division,
  TIER_LABEL,
  TIER_TABLE,
  type TierId,
  type TierRow,
} from "./table";

/**
 * 기록 → 최고 Ao5 → 티어·구간(docs/47 14절). 순수 함수라 사이트와 Cubie 미니 모드가 함께 쓴다.
 *
 * - Ao5: 연달아 맞춘 5판 가운데 가장 좋은·나쁜 판을 빼고 남은 3판의 평균(WCA 9f8·9f9). 한 판 기록은 1/100초 아래를
 *   버리고 +2를 더하며, 평균은 10분 미만 1/100초·10분 이상 초로 반올림한다(`timer/stats.ts`). DNF 하나는 가장 나쁜
 *   판으로 빠지고, 둘 이상이면 그 Ao5는 DNF. 6×6·7×7도 Ao5(WCA는 Mo3).
 * - 티어 값은 그 크기의 최고 Ao5(지금까지 나온 Ao5 가운데 가장 좋은 것). 떨어지지 않는다.
 */

/**
 * `hints`: Cubie 「공식 보기」를 본 횟수(미니 모드 기록만, docs/47 15-15). 힌트를 본 판이 든 5판은 Ao5로 치지 않는다
 * (힌트 판만 빼고 이어 세면 망친 판에 힌트를 눌러 지우는 길이 생긴다). 사이트 기록에는 이 칸이 없다
 */
export type Timeable = Pick<SolveRecord, "ms" | "penalty"> & {
  hints?: number;
};

function timed(r: Timeable): Timed {
  if (r.ms === null) return { ms: 0, penalty: "DNF" };
  return { ms: r.ms, penalty: r.penalty > 0 ? "+2" : "none" };
}

/** 5판(순서 상관없음)의 Ao5(ms). DNF면 null */
export function ao5(five: readonly Timeable[]): number | null {
  if (five.length !== 5) throw new RangeError("Ao5는 5판으로 센다");
  const v = wcaAverage(five.map(timed));
  return v === null || !Number.isFinite(v) ? null : v;
}

/** 가장 좋은 Ao5와 그 5판(목록 안의 시작 자리) */
export interface BestAo5 {
  ms: number;
  /** 목록(새것이 앞)에서 그 5판의 첫 자리 */
  at: number;
}

/**
 * 기록 목록(새것이 앞)에서 연달아 5판씩 본 Ao5 가운데 가장 좋은 것. 힌트를 본 판이 든 5판은 건너뛴다.
 * 없으면(5판 아래, 모두 DNF) null
 */
export function bestAo5(records: readonly Timeable[]): BestAo5 | null {
  let best: BestAo5 | null = null;
  for (let i = 0; i + 5 <= records.length; i++) {
    const five = records.slice(i, i + 5);
    if (five.some((r) => (r.hints ?? 0) > 0)) continue;
    const v = ao5(five);
    if (v !== null && (best === null || v < best.ms)) best = { ms: v, at: i };
  }
  return best;
}

export interface TierPlace {
  tier: TierId;
  /** 구간이 없는 티어(그랜드마스터·챌린저, 6×6·7×7 아이언)는 null */
  division: Division | null;
  /** 낮은 쪽부터 센 자리(0 = 아이언 IV). 견주기용 */
  step: number;
}

/** 크기 `n`에서 Ao5 `ms`의 티어. 표가 없는 크기면 null */
export function tierOf(n: number, ms: number): TierPlace | null {
  const table = TIER_TABLE[n];
  if (!table || !Number.isFinite(ms)) return null;
  let place: TierPlace | null = null;
  let step = 0;
  for (const row of table) {
    for (let d = 0; d < row.cuts.length; d++) {
      if (ms <= Math.round((row.cuts[d] as number) * 1000))
        place = {
          tier: row.tier,
          division: divisionOf(row, d),
          step,
        };
      step++;
    }
  }
  return place;
}

function divisionOf(row: TierRow, d: number): Division | null {
  return row.cuts.length === 4 ? (DIVISIONS[d] as Division) : null;
}

/** 다음 티어(티어 화면 진열, docs/47 14-7 「진열」) */
export interface NextTier {
  tier: TierId;
  /** 그 티어에 드는 최고 Ao5 상한(ms, 가장 낮은 구간의 상한) */
  cutMs: number;
  /** 지금 최고 Ao5에서 줄여야 할 시간(ms) */
  gapMs: number;
}

/**
 * 크기 `n`에서 Ao5 `ms`인 사람의 다음 티어(지금 티어 바로 위 티어의 가장 낮은 구간에 들려면). 꼭대기(챌린저)면 null
 */
export function nextTier(n: number, ms: number): NextTier | null {
  const table = TIER_TABLE[n];
  const here = tierOf(n, ms);
  if (!table || !here) return null;
  const i = table.findIndex((r) => r.tier === here.tier);
  const up = table[i + 1];
  if (!up) return null;
  const cutMs = Math.round((up.cuts[0] as number) * 1000);
  return { tier: up.tier, cutMs, gapMs: Math.max(0, ms - cutMs) };
}

/** 「다이아몬드 II」「챌린저」 */
export function tierName(p: Pick<TierPlace, "tier" | "division">): string {
  return p.division
    ? `${TIER_LABEL[p.tier]} ${p.division}`
    : TIER_LABEL[p.tier];
}

/** 크기의 지금 최고 티어 */
export interface MyTier {
  n: number;
  /** 최고 Ao5(ms) */
  ao5: number;
  place: TierPlace;
}

/**
 * 크기 `n` 혼자 맞추기 기록(새것이 앞)과 따로 남겨 둔 최고 Ao5 5판(`loadBestFive`, 목록 상한에 밀려 빠진 옛 최고)에서
 * 지금 최고 티어. Ao5가 없으면 null
 */
export function myTier(
  n: number,
  records: readonly Timeable[],
  bestFive: readonly Timeable[] = [],
): MyTier | null {
  const fromList = bestAo5(records)?.ms ?? null;
  const kept =
    bestFive.length === 5 && !bestFive.some((r) => (r.hints ?? 0) > 0)
      ? ao5(bestFive)
      : null;
  const best =
    fromList === null
      ? kept
      : kept === null
        ? fromList
        : Math.min(fromList, kept);
  if (best === null) return null;
  const place = tierOf(n, best);
  return place ? { n, ao5: best, place } : null;
}

// ── 최고 5판·다음 판 목표·티어 이력(2026-11-18, docs/47 14-8) ─────────────

/** 기록 한 판의 기록 시간(WCA 9f: 1/100초 아래 버림, +2 더함, 10분 넘으면 초 아래 버림, DNF는 끝없음) */
function recorded(r: Timeable): number {
  return recordedMs(timed(r));
}

/**
 * 5판(새것이 앞) 가운데 평균에서 빠지는 가장 빠른 판과 가장 느린 판의 자리(0~4). 같은 시간이 여럿이면 앞(새것) 판.
 * 다섯 모두 같으면 가장 느린 판은 가장 빠른 판이 아닌 첫 판
 */
export function trimmedOf(five: readonly Timeable[]): {
  fast: number;
  slow: number;
} {
  const v = five.map(recorded);
  let fast = 0;
  for (let i = 1; i < v.length; i++)
    if ((v[i] as number) < (v[fast] as number)) fast = i;
  let slow = -1;
  for (let i = 0; i < v.length; i++) {
    if (i === fast) continue;
    if (slow < 0 || (v[i] as number) > (v[slow] as number)) slow = i;
  }
  return { fast, slow };
}

/** 티어를 정한 5판 평균과 그 5판 */
export interface BestFiveDetail {
  /** 최고 5판 평균(ms) */
  ms: number;
  /** 기록 목록 안의 5판(`list`)인지 따로 남겨 둔 최고 5판(`kept`)인지. 값이 같으면 목록 */
  from: "list" | "kept";
  /** `list`면 목록(새것이 앞)에서 그 5판의 첫 자리, `kept`면 0 */
  at: number;
  /** 그 5판(새것이 앞) 안에서 빠진 가장 빠른·느린 판의 자리(0~4) */
  fast: number;
  slow: number;
}

/** 최고 5판 평균을 낸 5판(`myTier`와 같은 값). 없으면 null */
export function bestFiveDetail(
  records: readonly Timeable[],
  bestFive: readonly Timeable[] = [],
): BestFiveDetail | null {
  const fromList = bestAo5(records);
  const kept =
    bestFive.length === 5 && !bestFive.some((r) => (r.hints ?? 0) > 0)
      ? ao5(bestFive)
      : null;
  if (fromList && (kept === null || fromList.ms <= kept)) {
    const five = records.slice(fromList.at, fromList.at + 5);
    return {
      ms: fromList.ms,
      from: "list",
      at: fromList.at,
      ...trimmedOf(five),
    };
  }
  if (kept === null) return null;
  return { ms: kept, from: "kept", at: 0, ...trimmedOf(bestFive) };
}

/** 낮은 쪽부터 센 자리 `step`의 구간과 그 상한(ms). 없으면 null */
export function placeAt(
  n: number,
  step: number,
): (TierPlace & { cutMs: number }) | null {
  const table = TIER_TABLE[n];
  if (!table) return null;
  let s = 0;
  for (const row of table)
    for (let d = 0; d < row.cuts.length; d++) {
      if (s === step)
        return {
          tier: row.tier,
          division: divisionOf(row, d),
          step,
          cutMs: Math.round((row.cuts[d] as number) * 1000),
        };
      s++;
    }
  return null;
}

/**
 * 지금 구간 안의 자리(기록 창 가로 막대, docs/47 14-9). 왼쪽 끝은 지금 구간에 든 경계(그 구간 상한), 오른쪽 끝은 바로 위
 * 구간에 드는 경계. 꼭대기(챌린저)는 더 빠를 수 없으니 오른쪽 끝이 0초(2026-11-18 사용자 「그것보다 나갈 수는 없잖아」).
 * 맨 아래 구간(아이언 IV, 6×6·7×7 아이언)은 상한이 없어(「다 맞춤」) 왼쪽 끝을 오른쪽 경계의 두 배로 둔다
 */
export interface TierBand {
  /** 지금 구간 */
  here: TierPlace;
  /** 왼쪽 끝: 지금 구간 상한(ms). 상한이 없는 맨 아래 구간이면 null(자리는 `highMs`의 두 배로 셈) */
  lowMs: number | null;
  /** 바로 위 구간. 꼭대기면 null */
  up: TierPlace | null;
  /** 오른쪽 끝: 바로 위 구간 상한(ms). 꼭대기면 0 */
  highMs: number;
  /** 막대 위 자리(0 = 왼쪽 끝, 1 = 오른쪽 끝). 시간에 비례, 0~1로 자른다 */
  ratio: number;
}

/** 크기 `n`에서 최고 5판 평균 `ms`의 구간 안 자리. 티어가 없으면 null */
export function tierBand(n: number, ms: number): TierBand | null {
  const here = tierOf(n, ms);
  if (!here) return null;
  const low = placeAt(n, here.step)?.cutMs ?? Number.POSITIVE_INFINITY;
  const next = placeAt(n, here.step + 1);
  const highMs = next ? next.cutMs : 0;
  const lowMs = Number.isFinite(low) ? low : null;
  const left = lowMs ?? highMs * 2;
  const raw = left > highMs ? (left - ms) / (left - highMs) : 0;
  let up: TierPlace | null = null;
  if (next) {
    const { cutMs: _, ...p } = next;
    up = p;
  }
  return {
    here,
    lowMs,
    up,
    highMs,
    ratio: Math.min(1, Math.max(0, raw)),
  };
}

/**
 * 다음 판 하나로 바로 위 구간에 닿으려면(티어 화면·기록 창). 다음 판 X를 더한 마지막 5판의 5판 평균이 그 구간 상한
 * 이하가 되는 X의 최댓값.
 * - `within`: 다음 판을 `ms` 안에 맞추면 된다(벌점 없이). WCA 반올림까지 그대로 셈해 경계는 1/100초 단위로 맞다
 * - `any`: 다음 판이 몇 초든(DNF여도) 닿는다(앞 네 판이 이미 충분히 빠르다)
 * - `out`: 다음 판 하나로는 닿지 않는다(앞 네 판이 느리거나, 힌트 판이 들었거나, 아직 네 판이 안 됨). `gapMs`는 지금
 *   최고 5판 평균에서 그 상한까지 줄일 시간
 */
export type NextSolve =
  | { kind: "within"; to: TierPlace; cutMs: number; ms: number }
  | { kind: "any"; to: TierPlace; cutMs: number }
  | { kind: "out"; to: TierPlace; cutMs: number; gapMs: number };

/** 다음 판 목표. 아직 티어가 없거나 꼭대기면 null */
export function nextSolve(
  n: number,
  records: readonly Timeable[],
  bestFive: readonly Timeable[] = [],
): NextSolve | null {
  const mine = myTier(n, records, bestFive);
  if (!mine) return null;
  const up = placeAt(n, mine.place.step + 1);
  if (!up) return null;
  const { cutMs, ...to } = up;
  const out: NextSolve = {
    kind: "out",
    to,
    cutMs,
    gapMs: Math.max(0, mine.ao5 - cutMs),
  };
  const four = records.slice(0, 4);
  if (four.length < 4 || four.some((r) => (r.hints ?? 0) > 0)) return out;
  const ok = (x: Timeable) => {
    const v = ao5([x, ...four]);
    return v !== null && v <= cutMs;
  };
  if (ok({ ms: null, penalty: 0 })) return { kind: "any", to, cutMs };
  if (!ok({ ms: 0, penalty: 0 })) return out;
  // ok(10·lo)는 참, ok(10·hi)는 거짓. 다음 판이 다른 네 판보다 느리면 빠지므로 그 위는 DNF와 같다(거짓)
  const finite = four.map(recorded).filter(Number.isFinite);
  let lo = 0;
  let hi = Math.ceil(Math.max(cutMs * 3, ...finite) / 10) + 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok({ ms: mid * 10, penalty: 0 })) lo = mid;
    else hi = mid;
  }
  // 10분 넘는 한 판은 초 아래를 버리므로 그 초 안은 모두 같다
  const ms =
    lo * 10 >= TEN_MINUTES_MS ? Math.floor(lo / 100) * 1000 + 990 : lo * 10;
  return { kind: "within", to, cutMs, ms };
}

/** 티어 이력의 한 점: 그 판까지의 최고 5판 평균 */
export interface TierHistoryPoint {
  /** 기록 번호(없으면 오래된 판부터 센 차례) */
  no: number;
  /** 끝난 시각(Date.now) */
  at: number;
  /** 그 판까지의 최고 5판 평균(ms). 아직 없으면 null */
  ms: number | null;
}

/** 티어(구간)가 바뀐 순간 */
export interface TierChange {
  no: number;
  at: number;
  /** 바뀌기 전 구간(첫 티어면 null) */
  from: TierPlace | null;
  to: TierPlace;
  /** 그때의 최고 5판 평균(ms) */
  ms: number;
}

/**
 * 이미 있는 기록(새것이 앞)에서 다시 센 티어 이력: 오래된 판부터 판마다 그때까지의 최고 5판 평균과, 구간이 바뀐
 * 순간. 힌트 판이 든 5판은 넣지 않는다(`bestAo5`와 같다). 따로 남겨 둔 최고 5판은 목록과 이어지지 않아 넣지 않는다
 */
export function tierHistory(
  n: number,
  records: readonly (Timeable & { at: number; no?: number })[],
): { points: TierHistoryPoint[]; changes: TierChange[] } {
  const old = [...records].reverse();
  const points: TierHistoryPoint[] = [];
  const changes: TierChange[] = [];
  let best: number | null = null;
  let place: TierPlace | null = null;
  old.forEach((r, i) => {
    if (i >= 4) {
      const five = old.slice(i - 4, i + 1);
      if (!five.some((x) => (x.hints ?? 0) > 0)) {
        const v = ao5(five);
        if (v !== null && (best === null || v < best)) best = v;
      }
    }
    const no = r.no ?? i + 1;
    points.push({ no, at: r.at, ms: best });
    const p = best === null ? null : tierOf(n, best);
    if (p && (place === null || p.step !== place.step)) {
      changes.push({ no, at: r.at, from: place, to: p, ms: best as number });
      place = p;
    }
  });
  return { points, changes };
}
