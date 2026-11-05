import { isSolved, type MilestoneId, milestonesOf } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import type { RaceResult } from "@/net/race/types";
import { loadRecords, resultMs, type SolveRecord } from "../records";

/**
 * 실력 차 균형(핸디캡, docs/51 4절, docs/47 9-5). 방장이 대기실에서 사람마다 고른다. 컴퓨터는 단계로 이미 맞추니
 * 사람에게만 둔다.
 * - 출발 늦추기: 그 사람은 풀림 뒤 k초가 지나야 첫 수를 둔다(대결 틀 `startDelayMs`가 막고 확인한다).
 * - 목표 다르게: 그 이정표(`milestonesOf`)에 닿은 수에서 끝난다. 닿은 시각이 기록이다.
 * - 점수 다르게: 순위를 「내 평균 대비 몇 %」로 매긴다. 평균은 각 기기가 알린 값이라 친구끼리 믿는 모드다.
 * - 도움 다르게(docs/47 9-8): 그 사람 화면에서만 힌트·펼친 그림을 열거나 닫고, 「가리고 맞추기」면 풀린 뒤 큐브를 가린다.
 *   각 기기가 스스로 그리므로 아무도 확인할 수 없다(친구끼리 믿는 모드). 같은 설정을 쓰는지만 지문으로 맞춰 본다.
 * 모두 판을 열 때 방 상태에서 정해 고정하고(`activeHandicap`), 판정 설정 지문에 넣어 기기끼리 맞춰 본다(`room.ts`).
 */

export interface Handicap {
  /** 사람 아이디 → 출발 늦추기(초, 1~30) */
  delay?: Record<string, number>;
  /** 사람 아이디 → 목표 이정표(완성이 아닌 것) */
  goal?: Record<string, MilestoneId>;
  /** 「평균 대비」 순위 */
  score?: "avg";
  /** 사람 아이디 → 도움(없으면 지금처럼: 펼친 그림·거울은 자기 설정대로, 힌트 없음) */
  help?: Record<string, Help>;
}

/**
 * 도움(docs/51 4절 「도움 다르게」). 판정은 바꾸지 않고 그 사람 화면만 바꾼다.
 * - `hint`: 힌트 허용(3×3은 배우기 두 단계 힌트, 펼친 그림·거울도 자기 설정대로)
 * - `plain`: 3D만(펼친 그림·거울 끔)
 * - `blind`: 가리고 맞추기(살펴보기 동안 보고, 풀리면 맞출 때까지 모든 스티커를 가린다)
 */
export type Help = "hint" | "plain" | "blind";

export const HELPS: readonly Help[] = ["hint", "plain", "blind"];

/** 대기실·결과 상자에 적는 도움 이름. 힌트는 3×3만 있어 다른 크기는 「펼친 그림 허용」 */
export function helpLabel(n: number, help: Help): string {
  if (help === "hint") return n === 3 ? "힌트 허용" : "펼친 그림 허용";
  return help === "plain" ? "3D만" : "가리고 맞추기";
}

export const MAX_DELAY_SEC = 30;

/** 고를 수 있는 출발 늦추기(초, 1초 단위) */
export const DELAY_CHOICES: readonly number[] = Array.from(
  { length: MAX_DELAY_SEC + 1 },
  (_, k) => k,
);

/** 크기마다 고를 수 있는 목표(완성 앞 단계, 차례대로). 이름은 목표로 부를 때의 말 */
const GOALS: Record<number, readonly { id: MilestoneId; label: string }[]> = {
  2: [
    { id: "layer1", label: "첫 층" },
    { id: "oll", label: "윗면" },
  ],
  3: [
    { id: "cross", label: "십자" },
    { id: "layer1", label: "첫 층" },
    { id: "layer2", label: "첫 두 층" },
    { id: "oll", label: "윗면" },
  ],
  4: [
    { id: "centers", label: "센터" },
    { id: "edges", label: "엣지 짝" },
  ],
  5: [
    { id: "centers", label: "센터" },
    { id: "edges", label: "엣지 짝" },
  ],
};

export function goalChoices(
  n: number,
): readonly { id: MilestoneId; label: string }[] {
  return GOALS[n] ?? [];
}

export function goalLabel(n: number, goal: MilestoneId | undefined): string {
  if (!goal) return "완성";
  return goalChoices(n).find((g) => g.id === goal)?.label ?? goal;
}

/** 그 목표에 닿았나(목표가 없으면 다 맞춤). 어느 색·어느 면이든 이정표 판정 그대로 */
export function goalReached(
  n: number,
  state: PuzzleState,
  goal: MilestoneId | undefined,
): boolean {
  if (isSolved(n, state)) return true;
  return goal !== undefined && milestonesOf(n, state).includes(goal);
}

/** 받은 핸디캡 모양 확인(방 상태). 고를 수 없는 값이면 그 방 상태를 버린다 */
export function handicapOk(h: unknown, n: number): boolean {
  if (h === undefined) return true;
  if (typeof h !== "object" || h === null || Array.isArray(h)) return false;
  const x = h as Handicap;
  if (x.score !== undefined && x.score !== "avg") return false;
  if (x.delay !== undefined) {
    if (typeof x.delay !== "object" || x.delay === null) return false;
    for (const v of Object.values(x.delay))
      if (!Number.isInteger(v) || v < 0 || v > MAX_DELAY_SEC) return false;
  }
  if (x.goal !== undefined) {
    if (typeof x.goal !== "object" || x.goal === null) return false;
    const ids = new Set(goalChoices(n).map((g) => g.id));
    for (const v of Object.values(x.goal))
      if (!ids.has(v as MilestoneId)) return false;
  }
  if (x.help !== undefined) {
    if (typeof x.help !== "object" || x.help === null) return false;
    for (const v of Object.values(x.help))
      if (!HELPS.includes(v as Help)) return false;
  }
  return true;
}

/** 크기별 평균(ms) 모양 확인. 키는 크기("2"~"5"), 값은 1ms~1시간 */
export function averagesOk(v: unknown): v is Record<string, number> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.entries(v).every(
    ([k, ms]) =>
      ["2", "3", "4", "5"].includes(k) &&
      typeof ms === "number" &&
      Number.isFinite(ms) &&
      ms >= 1 &&
      ms <= 3_600_000,
  );
}

/** 받은 평균을 정한 모양만 남긴다(손님이 보낸 `cube-hello`) */
export function cleanAverages(v: unknown): Record<string, number> | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return;
  const out: Record<string, number> = {};
  for (const [k, ms] of Object.entries(v))
    if (averagesOk({ [k]: ms })) out[k] = Math.round(ms as number);
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 평균에 쓰는 최근 기록 수와, 평균을 내려면 있어야 하는 맞춘 판 수 */
const AVERAGE_OF = 12;
const AVERAGE_MIN = 3;

/**
 * 내 평균(ms): 같은 크기 혼자 맞추기 최근 12판 가운데 맞춘 판(벌점 포함)의 평균. 맞춘 판이 셋 아래면 없음
 * (대결의 「평균 대비」와 출발 늦추기 추천에 쓴다. 대회 평균과 달리 DNF를 빼고 맞춘 판만 본다)
 */
export function recentAverage(
  records: readonly Pick<SolveRecord, "ms" | "penalty">[],
): number | null {
  const times = records
    .slice(0, AVERAGE_OF)
    .map(resultMs)
    .filter((t): t is number => t !== null);
  if (times.length < AVERAGE_MIN) return null;
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

/** 이 기기의 크기별 내 평균(ms, 키 "2"~"5"). 평균이 하나도 없으면 undefined */
export function localAverages(): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const n of [2, 3, 4, 5]) {
    const avg = recentAverage(loadRecords("solo", n));
    if (avg !== null) out[String(n)] = avg;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * 출발 늦추기 추천(초): 가장 느린 평균에 맞춰 빠른 사람이 그 차이만큼 늦게 출발한다(30초까지, 초 단위로 반올림).
 * 평균이 없는 사람은 0
 */
export function recommendDelays(
  averages: Record<string, number | null | undefined>,
): Record<string, number> {
  const known = Object.entries(averages).filter(
    (e): e is [string, number] => typeof e[1] === "number",
  );
  const out: Record<string, number> = {};
  if (known.length < 2) return out;
  const slowest = Math.max(...known.map(([, ms]) => ms));
  for (const [id, ms] of known) {
    const k = Math.min(MAX_DELAY_SEC, Math.round((slowest - ms) / 1000));
    if (k > 0) out[id] = k;
  }
  return out;
}

/** 판을 열 때 정해 고정하는 그 판의 핸디캡(사람 참가자 것만, 0초·완성은 뺀다) */
export interface ActiveHandicap {
  delaySec: Record<string, number>;
  goal: Record<string, MilestoneId>;
  /** 「평균 대비」면 사람마다 평균(ms, 없으면 null). 평균 대비가 아니면 없다 */
  avg?: Record<string, number | null>;
  /** 사람마다 도움(고른 사람만). 아무도 고르지 않았으면 없다 */
  help?: Record<string, Help>;
}

/**
 * 방 상태의 핸디캡을 이 판 참가자에 맞춰 고친다. 「평균 대비」는 완성 기록끼리 견주므로 목표 다르게와 함께 쓰지 않는다
 * (평균 대비가 이긴다). 5판 평균(시간 평균)과도 함께 쓰지 않는다
 */
export function activeHandicap(
  h: Handicap | undefined,
  humans: readonly string[],
  opts: { ao5: boolean; averageOf: (id: string) => number | null },
): ActiveHandicap {
  const delaySec: Record<string, number> = {};
  const goal: Record<string, MilestoneId> = {};
  const help: Record<string, Help> = {};
  const sorted = [...humans].sort();
  const score = h?.score === "avg" && !opts.ao5;
  for (const id of sorted) {
    const d = h?.delay?.[id];
    if (d !== undefined && d > 0) delaySec[id] = d;
    const g = h?.goal?.[id];
    if (g !== undefined && !score) goal[id] = g;
    const a = h?.help?.[id];
    if (a !== undefined) help[id] = a;
  }
  const out: ActiveHandicap = { delaySec, goal };
  // 도움을 아무도 고르지 않았으면 칸을 두지 않는다(예전 판 기록·지문 그대로)
  if (Object.keys(help).length > 0) out.help = help;
  if (score) {
    const avg: Record<string, number | null> = {};
    for (const id of sorted) avg[id] = opts.averageOf(id);
    out.avg = avg;
  }
  return out;
}

export function hasHandicap(a: ActiveHandicap | undefined): boolean {
  return (
    !!a &&
    (Object.keys(a.delaySec).length > 0 ||
      Object.keys(a.goal).length > 0 ||
      a.avg !== undefined ||
      a.help !== undefined)
  );
}

/** 결과 상자·점수판에 함께 적는 핸디캡 글 */
export function handicapTags(
  a: ActiveHandicap | undefined,
  n: number,
  id: string,
): string[] {
  if (!a) return [];
  const tags: string[] = [];
  const d = a.delaySec[id];
  if (d) tags.push(`+${d}초 늦게 출발`);
  const g = a.goal[id];
  if (g) tags.push(`목표: ${goalLabel(n, g)}`);
  const help = a.help?.[id];
  if (help) tags.push(helpLabel(n, help));
  return tags;
}

/**
 * 도움이 이 화면에 지금 하는 일. 판정이 아니라 보이기만 한다(각 기기가 스스로 그린다).
 * - `back`: 펼친 그림·거울(「3D만」이면 끈다)
 * - `hint`: 두 단계 힌트(3×3 「힌트 허용」, 살펴보기·맞추는 동안)
 * - `hidden`: 모든 스티커를 가린다(「가리고 맞추기」: 풀린 뒤 내가 맞추는 동안. 맞추거나 판이 끝나면 다시 보인다)
 */
export function helpScreen(
  help: Help | undefined,
  n: number,
  now: { phase: string; playing: boolean },
): { back: boolean; hint: boolean; hidden: boolean } {
  const solving = now.playing && now.phase === "race";
  return {
    back: help !== "plain",
    hint:
      help === "hint" &&
      n === 3 &&
      now.playing &&
      (now.phase === "inspect" || now.phase === "race"),
    hidden: help === "blind" && solving,
  };
}

/** 그 사람의 도움(없으면 undefined = 지금처럼) */
export function helpOf(
  a: ActiveHandicap | undefined,
  id: string,
): Help | undefined {
  return a?.help?.[id];
}

/** 「평균 대비」의 기준: 알린 평균, 없으면 이 경기에서 처음 맞춘 판의 인정 시간 */
export interface Baseline {
  ms: number;
  from: "avg" | "first";
}

/**
 * 「평균 대비」 점수(낮을수록 좋다, 인정 시간 ÷ 기준 − 1)와 그 점수로 다시 매긴 순위.
 * - 기준은 그 사람이 알린 평균. 평균이 없으면 이 경기에서 처음 맞춘(순위 있는) 판의 인정 시간을 기준으로 삼는다
 *   (그 판은 0%). 그 전 판(못 맞춘 판)은 점수가 없다.
 * - `prior`는 이 경기의 앞선 판(판정 없음·열지 못한 판은 빼고 넘긴다), 차례대로. 모든 기기가 같은 판 결과를 가지므로
 *   같은 값이 나온다.
 * - 맞추고 순위에 든 사람끼리만 점수로 다시 줄 세우고(같은 점수는 인정 시간 → 아이디), 그 뒤(순위 없음·DNF·기권)는 그대로.
 */
export function scoreByAverage(
  result: RaceResult,
  avg: Record<string, number | null>,
  prior: readonly RaceResult[],
): {
  ranking: string[];
  score: Record<string, number>;
  baseline: Record<string, Baseline>;
} {
  const ranked = (r: RaceResult, id: string) => {
    const p = r.players[id];
    return p?.status === "done" && !p.unranked && p.accepted !== undefined
      ? p.accepted
      : null;
  };
  const score: Record<string, number> = {};
  const baseline: Record<string, Baseline> = {};
  if (result.noDecision || result.cancelled)
    return { ranking: result.ranking, score, baseline };
  for (const id of Object.keys(result.players)) {
    const a = avg[id];
    let base: Baseline | null = null;
    if (typeof a === "number" && a > 0) base = { ms: a, from: "avg" };
    else
      for (const r of [...prior, result]) {
        const t = ranked(r, id);
        if (t !== null && t > 0) {
          base = { ms: t, from: "first" };
          break;
        }
      }
    if (!base) continue;
    baseline[id] = base;
    const t = ranked(result, id);
    if (t !== null) score[id] = t / base.ms - 1;
  }
  const head = result.ranking.filter((id) => id in score);
  const tail = result.ranking.filter((id) => !(id in score));
  head.sort(
    (x, y) =>
      (score[x] as number) - (score[y] as number) ||
      (ranked(result, x) as number) - (ranked(result, y) as number) ||
      (x < y ? -1 : x > y ? 1 : 0),
  );
  return { ranking: [...head, ...tail], score, baseline };
}

/** 「평균 대비 −12%」 */
export function ratioText(score: number): string {
  const pct = Math.round(score * 100);
  if (pct === 0) return "평균 대비 0%";
  return `평균 대비 ${pct < 0 ? "−" : "+"}${Math.abs(pct)}%`;
}
