import type { RaceResult } from "@/net/race/types";

/**
 * 여러 판을 묶은 경기 방식과 종합 순위(docs/47 9-1).
 * ① 한 판 대결 ② 5판 평균(가장 좋은·나쁜 판을 빼고 가운데 셋 평균, 못 맞춘 판이 둘 이상이면 DNF) ③ 먼저 N판 이기기.
 * 모든 기기가 같은 판 결과를 가지므로 종합 순위도 같다.
 */

export type MatchFormat = "single" | "ao5" | "firstTo";

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  single: "한 판",
  ao5: "5판 평균",
  firstTo: "먼저 N판",
};

export interface RoundSummary {
  result: RaceResult;
}

export interface StandingRow {
  id: string;
  /** 화면에 보일 값(평균 시간, 이긴 판 수 등) */
  value: number | null;
  /** 판마다 인정 시간(못 맞췄으면 null) */
  times: (number | null)[];
  wins: number;
}

/** 판의 인정 시간(못 맞췄거나 다툼으로 판정하지 못했으면 null) */
export function roundTime(result: RaceResult, id: string): number | null {
  const p = result.players[id];
  return p?.status === "done" && !p.unranked ? (p.accepted ?? null) : null;
}

/**
 * 경기 누적에 넣는 판. 판정 없음(1:1에서 두 기기 기록이 다름) 판은 승패·평균에 넣지 않는다(docs/47 9-2).
 * 그 판은 판 수에도 세지 않아 경기가 한 판 더 간다
 */
export function decidedRounds<R extends RoundSummary>(rounds: R[]): R[] {
  return rounds.filter((r) => !r.result.noDecision);
}

/** 5판(또는 그보다 적은 판) 평균. 5판이면 가장 좋은·나쁜 것 빼고, 못 맞춘 판은 가장 나쁜 것으로 */
export function averageOf5(times: (number | null)[]): number | null {
  if (times.length === 0) return null;
  if (times.length < 5) {
    const done = times.filter((t): t is number => t !== null);
    if (done.length < times.length) return null;
    return done.reduce((s, t) => s + t, 0) / done.length;
  }
  const five = times.slice(0, 5);
  const dnf = five.filter((t) => t === null).length;
  if (dnf >= 2) return null;
  const sorted = five
    .map((t) => t ?? Number.POSITIVE_INFINITY)
    .sort((a, b) => a - b)
    .slice(1, 4);
  return sorted.reduce((s, t) => s + t, 0) / 3;
}

function winnerOf(result: RaceResult): string | null {
  if (result.noDecision) return null;
  const first = result.ranking[0];
  const p = first === undefined ? undefined : result.players[first];
  return first !== undefined && p?.status === "done" && !p.unranked
    ? first
    : null;
}

/** 종합 순위. 앞선 순서로 */
export function standings(
  format: MatchFormat,
  players: string[],
  all: RoundSummary[],
): StandingRow[] {
  const rounds = decidedRounds(all);
  const rows = players.map((id) => {
    const times = rounds.map((r) => roundTime(r.result, id));
    const wins = rounds.filter((r) => winnerOf(r.result) === id).length;
    let value: number | null;
    if (format === "ao5") value = averageOf5(times);
    else if (format === "firstTo") value = wins;
    else {
      const last = rounds.at(-1);
      value = last ? roundTime(last.result, id) : null;
    }
    return { id, value, times, wins };
  });
  const lastRank = (id: string) => {
    const last = rounds.at(-1)?.result.ranking.indexOf(id) ?? -1;
    return last < 0 ? Number.POSITIVE_INFINITY : last;
  };
  return rows.sort((a, b) => {
    if (format === "firstTo")
      return b.wins - a.wins || lastRank(a.id) - lastRank(b.id);
    const av = a.value ?? Number.POSITIVE_INFINITY;
    const bv = b.value ?? Number.POSITIVE_INFINITY;
    return av - bv || lastRank(a.id) - lastRank(b.id);
  });
}

/** 경기가 끝났나 */
export function matchOver(
  format: MatchFormat,
  target: number,
  all: RoundSummary[],
): boolean {
  const rounds = decidedRounds(all);
  if (format === "single") return rounds.length >= 1;
  if (format === "ao5") return rounds.length >= 5;
  const wins = new Map<string, number>();
  for (const r of rounds) {
    const w = winnerOf(r.result);
    if (w) wins.set(w, (wins.get(w) ?? 0) + 1);
  }
  return [...wins.values()].some((n) => n >= target);
}
