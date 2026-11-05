// 구간 골드(docs/51 2-2, 스피드런의 골드 스플릿). 화면을 모르는 순수 함수다.
//
// 구간 = 칩 하나(같은 순간 켜진 이정표 묶음, `groupSplits`)가 앞 칩부터 걸린 시간(`lap`). 같은 구간끼리만 견준다:
// 구간의 이름은 「앞 칩의 대표 단계 > 이 칩의 대표 단계」(첫 칩은 「시작 > …」). 그래서 층별의 첫 층 > 둘째 층과
// CFOP의 F2L 3/4 > 둘째 층처럼 길이가 다른 구간이 섞이지 않는다.
// 견주는 옛 기록은 같은 크기·같은 방식(혼자 맞추기)의 이 기기 기록이고(`loadRecords(mode, n)`), 해법은 지금 「자동」 하나다.
// 구간 기록 칸(`splits`)이 없는 옛 기록은 건너뛴다. 처음 만난 구간은 견줄 것이 없어 골드가 아니다.

import {
  parseSplits,
  resultMs,
  type SolveRecord,
  type Split,
} from "../records";
import { groupSplits } from "./splits";

export interface Segment {
  /** 「앞 대표 단계>이 대표 단계」 */
  readonly key: string;
  /** 이 칩의 시각(맞추기 시작부터 ms). 칩을 찾는 열쇠 */
  readonly ms: number;
  /** 구간 길이(ms) */
  readonly lap: number;
}

export function segmentsOf(splits: readonly Split[]): Segment[] {
  let prev = "start";
  return groupSplits(splits).map((g) => {
    const s = { key: `${prev}>${g.main}`, ms: g.ms, lap: g.lap };
    prev = g.main;
    return s;
  });
}

/** 옛 기록들의 구간마다 가장 짧았던 길이 */
export function bestSegments(
  records: readonly SolveRecord[],
): Map<string, number> {
  const best = new Map<string, number>();
  for (const r of records) {
    if (!r.splits) continue;
    for (const s of segmentsOf(parseSplits(r.splits))) {
      const b = best.get(s.key);
      if (b === undefined || s.lap < b) best.set(s.key, s.lap);
    }
  }
  return best;
}

/** 지금 판의 골드 칩(칩 시각 ms의 모음): 같은 구간의 옛 최고보다 짧다 */
export function goldSplits(
  splits: readonly Split[],
  best: ReadonlyMap<string, number>,
): Set<number> {
  const out = new Set<number>();
  for (const s of segmentsOf(splits)) {
    const b = best.get(s.key);
    if (b !== undefined && s.lap < b) out.add(s.ms);
  }
  return out;
}

/** 개인 최고인가: 옛 기록 가운데 맞춘 것이 있고, 이번 시간(벌점 포함)이 그 모두보다 짧다 */
export function isPersonalBest(
  ms: number | null,
  prior: readonly SolveRecord[],
): boolean {
  if (ms === null) return false;
  let best: number | null = null;
  for (const r of prior) {
    const t = resultMs(r);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best !== null && ms < best;
}
