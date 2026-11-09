import type { SolveRecord } from "../records";
import { type Timed, averageOf as wcaAverage } from "../timer/stats";
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

type Timeable = Pick<SolveRecord, "ms" | "penalty">;

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

/** 기록 목록(새것이 앞)에서 연달아 5판씩 본 Ao5 가운데 가장 좋은 것. 없으면(5판 아래, 모두 DNF) null */
export function bestAo5(records: readonly Timeable[]): BestAo5 | null {
  let best: BestAo5 | null = null;
  for (let i = 0; i + 5 <= records.length; i++) {
    const v = ao5(records.slice(i, i + 5));
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
  const kept = bestFive.length === 5 ? ao5(bestFive) : null;
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
