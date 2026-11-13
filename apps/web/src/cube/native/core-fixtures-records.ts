/**
 * Rust 코어 공통 시험 자료: Cubie 기록 창 맨 위 요약(사이트 `mini/store.ts` `summarize` → 최고·평균·5번 평균·12번 평균).
 * Cubie 네이티브 기록 창(`NativeRecordsWindow`)이 코어 `summary.rs`로 같은 값을 그린다. 꼴과 다시 쓰는 법은
 * `core-fixtures.ts` 머리말과 같다.
 */
import { createRng, nextInt } from "@game/mighty-engine";
import type { MiniRecord } from "../mini/store";
import { summarize } from "../mini/store";
import { fixtureJson } from "./core-fixtures";

type Rec = { ms: number | null; penalty: number; hints?: number };

/** 요약이 보는 칸만 둔 기록(나머지 칸은 요약에 쓰지 않는다) */
const asRecords = (list: Rec[]) => list as unknown as MiniRecord[];

export function buildSummary(): string {
  const rng = createRng(4021);
  const cases: unknown[] = [];
  const push = (records: Rec[]) => {
    const s = summarize(asRecords(records));
    cases.push({
      records,
      best: s.best,
      mean: s.mean,
      // undefined(모자람)는 JSON에 없으므로 "-"로 적는다
      ao5: s.ao5 === undefined ? "-" : s.ao5,
      ao12: s.ao12 === undefined ? "-" : s.ao12,
    });
  };
  // 경계: 빈 목록, 반올림(.5), DNF 하나(빼는 쪽)·둘, 벌점, 딱 5판·12판
  push([]);
  push([{ ms: null, penalty: 0 }]);
  push([
    { ms: 1001, penalty: 0 },
    { ms: 1002, penalty: 0 },
  ]);
  push([
    { ms: 10_005, penalty: 0 },
    { ms: null, penalty: 0 },
    { ms: 9_000, penalty: 2000 },
    { ms: 12_000, penalty: 0 },
    { ms: 8_000, penalty: 0 },
  ]);
  push([
    { ms: null, penalty: 0 },
    { ms: null, penalty: 0 },
    { ms: 30_000, penalty: 0 },
    { ms: 31_000, penalty: 0 },
    { ms: 32_000, penalty: 0 },
  ]);
  push([
    { ms: 10_000, penalty: 0 },
    { ms: 10_001, penalty: 0 },
    { ms: 10_002, penalty: 0 },
    { ms: 10_000, penalty: 0 },
    { ms: 99_999, penalty: 0 },
  ]);
  // 무작위: 0~30판, 6%는 DNF, 8%는 +2, 시간은 3초~10분 넘게
  for (let k = 0; k < 40; k++) {
    const count = nextInt(rng, 31);
    const records: Rec[] = Array.from({ length: count }, () => {
      const r = nextInt(rng, 100);
      if (r < 6) return { ms: null, penalty: 0 };
      return {
        ms: 3000 + nextInt(rng, 700_000),
        penalty: r < 14 ? 2000 : 0,
        ...(r >= 96 ? { hints: 1 } : {}),
      };
    });
    push(records);
  }
  return fixtureJson(
    {
      what: 'Cubie 기록 창 요약(기록 새것이 앞, ms null = DNF): best·mean(맞춘 판이 없으면 null), ao5·ao12(모자라면 "-", DNF면 null)',
    },
    cases,
  );
}
