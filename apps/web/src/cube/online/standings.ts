import type { RaceResult } from "@/net/race/types";
import type { PartyEnd } from "./party";

/**
 * 여러 판을 묶은 경기 방식과 종합 순위(docs/47 9-1·9-3).
 * ① 한 판 대결 ② 5판 평균(가장 좋은·나쁜 판을 빼고 가운데 셋 평균, 못 맞춘 판이 둘 이상이면 DNF) ③ 먼저 N판 이기기
 * ④ 점수제 여러 판(판 수 3·5·7, 점수는 이긴 판 수 또는 순위 점수 합, 동점이면 서든데스).
 * 모든 기기가 같은 판 결과를 가지므로 종합 순위도 같다. 점수는 각 기기가 자기 판 결과에서 계산하고 주고받지 않는다.
 */

export type MatchFormat = "single" | "ao5" | "firstTo" | "points";

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  single: "한 판",
  ao5: "5판 평균",
  firstTo: "먼저 N판",
  points: "점수제",
};

/** 점수제의 점수: 이긴 판 수(판마다 1등 1점) 또는 순위 점수 합(판에 든 사람 m명이면 1등 m점 … 꼴찌 1점, 못 맞추면 0점) */
export type Scoring = "wins" | "rank";

export const SCORING_LABELS: Record<Scoring, string> = {
  wins: "이긴 판",
  rank: "순위 점수",
};

/** 점수제 판 수. 홀수만 둔다(이긴 판 수로 1:1이면 비기지 않게) */
export const POINTS_ROUNDS = [3, 5, 7] as const;

export interface MatchRules {
  format: MatchFormat;
  /** 먼저 N판의 N */
  target: number;
  /** 점수제 판 수(없으면 5) */
  rounds?: number;
  /** 점수제 점수(없으면 이긴 판) */
  scoring?: Scoring;
}

export interface RoundSummary {
  result: RaceResult;
  /**
   * 핸디캡 「평균 대비」 점수(낮을수록 좋다, 인정 시간 ÷ 기준 − 1). 있으면 판 안 순위(순위 점수·서든데스)를 인정 시간 대신
   * 이것으로 가른다. 판 결과의 `ranking`도 이 차례로 다시 매겨 둔다(`room.ts`)
   */
  score?: Record<string, number>;
  /**
   * 파티 모드 체력바 판(docs/47 9-6). 있으면 판의 승자·등수를 이것으로 정한다(맞춘 시간이 아니라 체력 판정).
   * 판 결과의 `ranking`도 이 차례로 다시 매겨 둔다(`room.ts`)
   */
  party?: PartySummary;
}

/** 체력바 판의 결과(모든 기기가 같은 값) */
export interface PartySummary {
  winner: string | null;
  end: PartyEnd;
  /** 등수(1부터, 같으면 같은 등수). 순위 없음·기권은 없다 */
  places: Record<string, number>;
  /** 판이 정해진 때 남은 체력 */
  hp: Record<string, number>;
  /** 체력이 0이 된 시각(풀림 기준 ms) */
  knockedOut: Record<string, number>;
  /** 판이 정해진 시각(제한 시간까지 갔으면 없음) */
  at?: number;
}

export interface StandingRow {
  id: string;
  /** 화면에 보일 값(평균 시간, 이긴 판 수 등) */
  value: number | null;
  /** 판마다 인정 시간(못 맞췄으면 null) */
  times: (number | null)[];
  wins: number;
  /** 점수제 점수 합(다른 방식은 0) */
  points: number;
  /** 점수제: 정규 판마다 얻은 점수(그 판에 없었으면 null) */
  roundPoints: (number | null)[];
  /** 등수(1부터). 점수제는 점수가 같으면 같은 등수(서든데스로 가른 1등은 따로) */
  place: number;
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

function winnerOf(r: RoundSummary): string | null {
  const result = r.result;
  if (result.noDecision) return null;
  if (r.party) return r.party.winner;
  const first = result.ranking[0];
  const p = first === undefined ? undefined : result.players[first];
  return first !== undefined && p?.status === "done" && !p.unranked
    ? first
    : null;
}

/** 판에서 맞추고 순위에 든 사람(인정 시간이 있는 사람, 점수가 있으면 점수도 있는 사람)과 견줄 값 */
function ranked(
  result: RaceResult,
  score?: Record<string, number>,
  party?: PartySummary,
): { id: string; value: number }[] {
  if (party)
    return result.noDecision
      ? []
      : Object.entries(party.places).map(([id, value]) => ({ id, value }));
  return Object.values(result.players)
    .filter(
      (p) =>
        p.status === "done" &&
        !p.unranked &&
        p.accepted !== undefined &&
        (score === undefined || p.id in score),
    )
    .map((p) => ({
      id: p.id,
      value: score ? (score[p.id] as number) : (p.accepted as number),
    }));
}

/**
 * 순위 점수: 판에 든 사람이 m명(기권 포함)이면 k등은 m − k + 1점, 못 맞춤·기권·다툼(순위 없음)은 0점.
 * 인정 시간이 같으면 같은 등수. 판정 없음 판은 아무도 점수가 없다
 */
export function rankPoints(
  result: RaceResult,
  score?: Record<string, number>,
  party?: PartySummary,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (result.noDecision) return out;
  const m = Object.keys(result.players).length;
  // 체력바 판은 체력 판정의 등수로(0이 된 사람도 늦게 빠진 차례로 점수가 있다)
  const done = ranked(result, score, party);
  for (const p of done) {
    const place = 1 + done.filter((q) => q.value < p.value).length;
    out[p.id] = m - place + 1;
  }
  return out;
}

function roundScore(scoring: Scoring, r: RoundSummary, id: string): number {
  if (scoring === "wins") return winnerOf(r) === id ? 1 : 0;
  return rankPoints(r.result, r.score, r.party)[id] ?? 0;
}

/** 서든데스 판의 승자: 동점자 가운데 인정 시간이 홀로 가장 빠른 사람. 없으면(모두 못 맞춤·같은 시간) null */
function suddenDeathWinner(
  r: RoundSummary,
  tied: readonly string[],
): string | null {
  const done = ranked(r.result, r.score, r.party).filter((p) =>
    tied.includes(p.id),
  );
  if (done.length === 0) return null;
  const best = Math.min(...done.map((p) => p.value));
  const top = done.filter((p) => p.value === best);
  return top.length === 1 ? (top[0] as (typeof top)[number]).id : null;
}

export interface PointsMatch {
  /** 셈에 쓴 판(정규 판 + 서든데스, 경기가 정해진 뒤의 판은 버린다) */
  used: RoundSummary[];
  /** 정규 판 가운데 치른 수 */
  played: number;
  total: number;
  /** 치른 서든데스 판 수 */
  suddenDeath: number;
  /** 정규 판이 끝났는데 1등 점수가 같은 사람들(서든데스 대상) */
  tied: string[];
  suddenDeathWinner: string | null;
  scores: Map<string, number>;
  over: boolean;
}

/**
 * 점수제 경기의 진행. 판정 없음 판은 판 수에 세지 않는다(`decidedRounds`, 한 판 더 간다). 열지 못한 판(`cancelled`,
 * 남은 사람이 둘 아래·2명 판 섞기 어긋남)도 아무도 풀지 않았으니 세지 않는다.
 * - 이긴 판: 1등이 남은 판을 모두 내줘도 2등에게 따라잡히지 않으면 일찍 끝난다(5판이면 1:1에서 먼저 3판).
 * - 순위 점수: 정해진 판을 모두 치른다.
 * - 정규 판이 끝났는데 1등 점수가 같으면 그 사람들이 서든데스: 다음 판에서 동점자 가운데 가장 빠른 사람이 이긴다
 *   (모두 못 맞추면 한 판 더). 다른 사람도 함께 풀지만 점수는 늘지 않는다.
 * - 경기가 정해진 뒤에 치른 판(방장이 더 연 판)은 셈에 넣지 않는다
 */
export function pointsMatch(
  rules: MatchRules,
  all: readonly RoundSummary[],
): PointsMatch {
  const total = rules.rounds ?? 5;
  const scoring = rules.scoring ?? "wins";
  const rounds = decidedRounds([...all]).filter((r) => !r.result.cancelled);
  const scores = new Map<string, number>();
  const used: RoundSummary[] = [];
  let over = false;
  let played = 0;
  while (played < total && played < rounds.length && !over) {
    const r = rounds[played] as RoundSummary;
    used.push(r);
    played++;
    for (const id of Object.keys(r.result.players))
      scores.set(id, (scores.get(id) ?? 0) + roundScore(scoring, r, id));
    if (scoring === "wins") {
      const [first = 0, second = 0] = [...scores.values()].sort(
        (a, b) => b - a,
      );
      if (first > second + (total - played)) over = true;
    }
  }
  let tied: string[] = [];
  let winner: string | null = null;
  let suddenDeath = 0;
  if (!over && played === total) {
    const best = Math.max(0, ...scores.values());
    tied = [...scores].filter(([, v]) => v === best).map(([id]) => id);
    if (tied.length <= 1) {
      over = true;
      tied = [];
    } else {
      for (const r of rounds.slice(total)) {
        used.push(r);
        suddenDeath++;
        winner = suddenDeathWinner(r, tied);
        if (winner) {
          over = true;
          break;
        }
      }
    }
  }
  return {
    used,
    played,
    total,
    suddenDeath,
    tied,
    suddenDeathWinner: winner,
    scores,
    over,
  };
}

function pointsStandings(
  rules: MatchRules,
  players: string[],
  all: RoundSummary[],
): StandingRow[] {
  const m = pointsMatch(rules, all);
  const scoring = rules.scoring ?? "wins";
  const main = m.used.slice(0, m.played);
  const last = m.used.at(-1);
  const lastRank = (id: string) => {
    const at = last?.result.ranking.indexOf(id) ?? -1;
    return at < 0 ? Number.POSITIVE_INFINITY : at;
  };
  const sd = m.suddenDeathWinner;
  const rows = players.map((id) => {
    const points = m.scores.get(id) ?? 0;
    return {
      id,
      value: points,
      points,
      times: m.used.map((r) => roundTime(r.result, id)),
      roundPoints: main.map((r) =>
        id in r.result.players ? roundScore(scoring, r, id) : null,
      ),
      wins: main.filter((r) => winnerOf(r) === id).length,
      place: 0,
    };
  });
  const ahead = (a: StandingRow, b: StandingRow) =>
    a.points > b.points || (a.points === b.points && a.id === sd);
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      Number(b.id === sd) - Number(a.id === sd) ||
      lastRank(a.id) - lastRank(b.id),
  );
  for (const r of rows)
    r.place = 1 + rows.filter((o) => o !== r && ahead(o, r)).length;
  return rows;
}

function asRules(rules: MatchRules | MatchFormat): MatchRules {
  return typeof rules === "string" ? { format: rules, target: 3 } : rules;
}

/** 종합 순위. 앞선 순서로 */
export function standings(
  match: MatchRules | MatchFormat,
  players: string[],
  all: RoundSummary[],
): StandingRow[] {
  const rules = asRules(match);
  const format = rules.format;
  if (format === "points") return pointsStandings(rules, players, all);
  const rounds = decidedRounds(all);
  const rows = players.map((id) => {
    const times = rounds.map((r) => roundTime(r.result, id));
    const wins = rounds.filter((r) => winnerOf(r) === id).length;
    let value: number | null;
    if (format === "ao5") value = averageOf5(times);
    else if (format === "firstTo") value = wins;
    else {
      const last = rounds.at(-1);
      value = last ? roundTime(last.result, id) : null;
    }
    return { id, value, times, wins, points: 0, roundPoints: [], place: 0 };
  });
  const lastRank = (id: string) => {
    const last = rounds.at(-1)?.result.ranking.indexOf(id) ?? -1;
    return last < 0 ? Number.POSITIVE_INFINITY : last;
  };
  rows.sort((a, b) => {
    if (format === "firstTo")
      return b.wins - a.wins || lastRank(a.id) - lastRank(b.id);
    const av = a.value ?? Number.POSITIVE_INFINITY;
    const bv = b.value ?? Number.POSITIVE_INFINITY;
    return av - bv || lastRank(a.id) - lastRank(b.id);
  });
  rows.forEach((r, i) => {
    r.place = i + 1;
  });
  return rows;
}

/** 경기가 끝났나 */
export function matchOver(match: MatchRules, all: RoundSummary[]): boolean {
  const { format, target } = match;
  if (format === "points") return pointsMatch(match, all).over;
  const rounds = decidedRounds(all);
  if (format === "single") return rounds.length >= 1;
  if (format === "ao5") return rounds.length >= 5;
  const wins = new Map<string, number>();
  for (const r of rounds) {
    const w = winnerOf(r);
    if (w) wins.set(w, (wins.get(w) ?? 0) + 1);
  }
  return [...wins.values()].some((n) => n >= target);
}
