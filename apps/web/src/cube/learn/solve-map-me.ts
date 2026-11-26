// 해법 지도·카드의 내 기록(시안 2026-11-25): 이미 있는 기록을 지도 길에 겹친다(내 위치 「나」 표시는 2026-11-26 지움). 새 저장 키는 만들지 않는다.
// - 진행: 배우기 진행 기록(cube.learn.v1, progress.ts)의 끝낸 단원·통과한 해 보기
// - 공식 연습: 상황별 기록(cube.train.v1, TrainBook)의 익숙한 상황 수(practice/deck.ts familiar)와 평균 시간
// - 혼자 맞추기: 구간 기록(cube.records.v1 splits)을 내 해법 단계(progress/methods.ts)로 읽은 구간 평균.
//   걸음의 몫(내 구간 평균 ÷ 내 전체 평균)을 그 걸음의 잰 수의 몫(MAP_MEASURE)과 견줘 잘하는·약한 걸음을 가른다.
import type { MilestoneId } from "@game/cube-engine";

import { familiar } from "../practice/deck";
import { PRACTICE_STAGES } from "../practice/stages";
import { segmentsOf } from "../progress/gold";
import { methodSplits, type SolveMethod } from "../progress/methods";
import { parseSplits, type SolveRecord } from "../records";
import { ALL_ALG_CASES } from "./alg-sets";
import { averageMs, type LearnProgress, type TrainBook } from "./progress";
import { MAP_MEASURE, type MapEdge, type MapMethod } from "./solve-map";

export type EdgeLearn = "done" | "started" | "none";

/** 길의 배우기 상태: 단원 하나라도 끝냈으면 done, 해 보기를 하나라도 통과했거나 열어 봤으면 started */
export function edgeLearn(edge: MapEdge, p: LearnProgress): EdgeLearn {
  const ls = edge.lessons.map((id) => p.lessons[id]);
  if (ls.some((l) => l?.done)) return "done";
  if (ls.some((l) => l && (l.passed.length > 0 || (l.acted?.length ?? 0) > 0)))
    return "started";
  return "none";
}

// ── 공식 연습 ──────────────────────────────────────────

/** 초보자 걸음 → 공식 연습 단계(그 단계의 상황이 그 걸음의 상황이다) */
const BEGINNER_STAGE: Readonly<Record<string, string>> = {
  cross: "beginner-cross",
  "second-layer": "beginner-second",
  "beginner-yellow-cross": "beginner-yellow-cross",
  "beginner-edges": "beginner-edges",
  "beginner-corner-place": "beginner-corners",
  "beginner-corner-twist": "beginner-twist",
};

/** 공식 연습 상황(연습 단계와 「더 보기」 자유 훈련 묶음: 오르테가·4×4 패리티 등) */
const PRACTICE_CASES = new Set([
  ...PRACTICE_STAGES.flatMap((s) => s.cases.map((c) => c.id)),
  ...ALL_ALG_CASES.map((c) => c.id),
]);

/** 길의 공식 연습 상황 id(공식 연습에 없는 걸음은 빈 목록) */
export function edgeCases(edge: MapEdge): string[] {
  const stage = BEGINNER_STAGE[edge.id];
  if (stage)
    return (
      PRACTICE_STAGES.find((s) => s.id === stage)?.cases.map((c) => c.id) ?? []
    );
  return (edge.formulas ?? []).filter((f) => PRACTICE_CASES.has(f));
}

export interface EdgeTrain {
  /** 익숙한 상황 수 / 전체 */
  familiar: number;
  total: number;
  /** 기록이 있는 상황들의 평균 시간 평균(ms) */
  avgMs: number | null;
}

/** 길의 공식 연습 기록. 공식 연습에 없는 걸음이거나 기록이 하나도 없으면 null */
export function edgeTrain(edge: MapEdge, book: TrainBook): EdgeTrain | null {
  const ids = edgeCases(edge);
  if (!ids.length) return null;
  const avgs = ids
    .map((id) => averageMs(book[id]))
    .filter((x): x is number => x !== null);
  const fam = ids.filter((id) => familiar(book[id])).length;
  if (!avgs.length && !fam) return null;
  return {
    familiar: fam,
    total: ids.length,
    avgMs: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null,
  };
}

// ── 혼자 맞추기 구간 ─────────────────────────────────────

/** 지도 해법 → 혼자 맞추기 내 해법(구간을 그 해법 단계로 읽는다) */
const SOLVE_METHOD: Partial<Record<MapMethod["id"], SolveMethod>> = {
  beginner: "layer",
  "two-look": "layer",
  cfop: "cfop",
  roux: "roux",
  zz: "zz",
  "corners-first": "corners",
  // 2×2는 단계가 한 길뿐이라 「자동」이 곧 그 길(progress/methods.ts)
  "222-beginner": "auto",
  "444-reduction": "layer",
  "444-yau": "yau",
  "555-reduction": "layer",
};

/** 지도 해법의 혼자 맞추기 내 해법(없으면 undefined) */
export const solveMethodOf = (m: MapMethod) => SOLVE_METHOD[m.id];

/** 길 → 그 걸음 하나만 덮는 구간(앞 이정표>이 이정표). 여러 걸음을 한 구간이 덮으면 넣지 않는다 */
const EDGE_SEGMENT: Readonly<Record<string, `${string}>${MilestoneId}`>> = {
  cross: "start>cross",
  "first-corners": "cross>layer1",
  "second-layer": "layer1>layer2",
  "f2l-pair-1": "cross>f2l1",
  "f2l-pair-2": "f2l1>f2l2",
  "f2l-pair-3": "f2l2>f2l3",
  "f2l-pair-4": "f2l3>layer2",
  oll: "layer2>oll",
  pll: "oll>ll",
  eoline: "start>eoline",
  "two-look-face": "layer2>oll",
  "roux-fb": "start>roux1",
  "roux-sb": "roux1>roux2",
  "cf-corners": "start>corners",
  "cf-edges": "corners>ll",
  "222-first-layer": "start>layer1",
  "222-top-face": "layer1>oll",
  "222-top-layer": "oll>ll",
  "444-centers": "start>centers",
  "444-edges": "centers>edges",
  "555-centers": "start>centers",
  "555-edges": "centers>edges",
  "yau-ud-centers": "start>centers2",
  "yau-cross3": "centers2>cross3",
  "yau-side-centers": "cross3>centers",
  "yau-last-cross": "centers>cross",
  "yau-edges": "cross>edges",
};

/** ZZ의 노란 면 걸음만 「아래 두 층>노란 면」 구간 하나와 같다(2단계는 노란 십자까지 그 구간에 든다) */
const segmentFor = (m: MapMethod, edgeId: string) =>
  edgeId === "two-look-face" && m.id !== "zz"
    ? undefined
    : EDGE_SEGMENT[edgeId];

export type EdgeSkill = "strong" | "weak" | "even";

export interface EdgeSolo {
  /** 내 구간 평균(ms) */
  avgMs: number;
  /** 판 수 */
  count: number;
  /** 잰 수의 몫과 견준 것(잰 수가 없으면 null) */
  skill: EdgeSkill | null;
}

/** 몫이 이만큼 크면 약한 걸음, 이만큼 작으면 잘하는 걸음 */
export const WEAK_RATIO = 1.25;
export const STRONG_RATIO = 0.8;

/** 해법 하나의 길마다 내 혼자 맞추기 구간 평균(그 해법 크기의 기록). 구간 기록이 없는 길은 넣지 않는다 */
export function methodSolo(
  m: MapMethod,
  records: readonly SolveRecord[],
): Map<string, EdgeSolo> {
  const out = new Map<string, EdgeSolo>();
  const sm = SOLVE_METHOD[m.id];
  if (!sm) return out;
  const n = m.size ?? 3;
  const done = records.filter((r) => r.n === n && r.ms !== null && r.splits);
  if (!done.length) return out;
  const laps = new Map<string, number[]>();
  for (const r of done)
    for (const seg of segmentsOf(methodSplits(n, sm, parseSplits(r.splits)))) {
      const xs = laps.get(seg.key) ?? [];
      xs.push(seg.lap);
      laps.set(seg.key, xs);
    }
  const total = done.reduce((a, r) => a + (r.ms as number), 0) / done.length;
  const measured = MAP_MEASURE.steps[m.id];
  const turns = MAP_MEASURE.turns[m.id];
  for (const id of m.edges) {
    const key = segmentFor(m, id);
    const xs = key ? laps.get(key) : undefined;
    if (!xs?.length) continue;
    const avgMs = xs.reduce((a, b) => a + b, 0) / xs.length;
    const want = measured?.[id];
    let skill: EdgeSkill | null = null;
    if (want !== undefined && turns) {
      const ratio = avgMs / total / (want / turns);
      skill =
        ratio >= WEAK_RATIO
          ? "weak"
          : ratio <= STRONG_RATIO
            ? "strong"
            : "even";
    }
    out.set(id, { avgMs, count: xs.length, skill });
  }
  return out;
}
