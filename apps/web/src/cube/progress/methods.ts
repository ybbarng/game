// 내 해법 고르기와 이론 최고(docs/51 1-2·2-2). 화면을 모르는 순수 함수다(고른 해법 저장만 localStorage).
//
// 이정표(`milestonesOf`)는 여러 해법의 단계를 한 목록에 두고, 판마다 처음 지난 시각을 모두 기록에 남긴다(`splits`).
// 해법을 고르면 칩·구간 골드·이론 최고를 그 해법의 단계(`methodPath`)만으로 본다. 기록 형식은 그대로라, 해법을 바꿔도
// 옛 기록의 구간이 그 해법 차례로 다시 읽힌다(고르기 전에 맞춘 판도 견줄 거리가 된다).
// 「자동」은 지금처럼 지난 이정표를 모두 보인다. 3×3·큰 큐브의 자동은 판마다 지나는 길이 달라 이론 최고가 없다.
// 2×2는 단계가 한 길(첫 층 → 윗면 → 윗층)뿐이라 고를 것이 없고, 자동이 곧 그 길이다.
import type { MilestoneId } from "@game/cube-engine";

import type { SolveRecord, Split } from "../records";
import { bestSegments } from "./gold";

export type SolveMethod = "auto" | "layer" | "cfop" | "roux" | "zz" | "corners";

export const SOLVE_METHODS: readonly SolveMethod[] = [
  "auto",
  "layer",
  "cfop",
  "roux",
  "zz",
  "corners",
];

export const METHOD_LABEL: Readonly<Record<SolveMethod, string>> = {
  auto: "자동",
  layer: "층별",
  cfop: "CFOP",
  roux: "루",
  zz: "ZZ",
  corners: "코너 먼저",
};

/** 3×3 해법의 단계(맞추는 차례). 큰 큐브는 앞에 센터·엣지 짝이 붙는다 */
const PATH_333: Readonly<Record<Exclude<SolveMethod, "auto">, MilestoneId[]>> =
  {
    layer: ["cross", "layer1", "layer2", "oll", "ll"],
    cfop: ["cross", "f2l1", "f2l2", "f2l3", "layer2", "oll", "ll"],
    roux: ["roux1", "roux2", "ll"],
    zz: ["eoline", "layer2", "oll", "ll"],
    corners: ["corners", "ll"],
  };

/** 그 크기에서 고를 수 있는 해법(맨 앞이 자동). 큰 큐브의 3×3 단계는 층별·CFOP만 본다 */
export function methodsFor(n: number): readonly SolveMethod[] {
  if (n === 2) return ["auto"];
  if (n === 3) return SOLVE_METHODS;
  return ["auto", "layer", "cfop"];
}

/** 그 크기에서 못 고르는 해법은 자동으로 */
export function usableMethod(n: number, method: SolveMethod): SolveMethod {
  return methodsFor(n).includes(method) ? method : "auto";
}

/** 해법의 단계 차례. 판마다 길이 다른 자동(3×3·큰 큐브)은 null */
export function methodPath(
  n: number,
  method: SolveMethod,
): readonly MilestoneId[] | null {
  const m = usableMethod(n, method);
  if (n === 2) return ["layer1", "oll", "ll"];
  if (m === "auto") return null;
  const path = PATH_333[m];
  return n === 3 ? path : ["centers", "edges", ...path];
}

/** 해법의 단계만 남긴 구간 기록(자동은 그대로) */
export function methodSplits(
  n: number,
  method: SolveMethod,
  splits: readonly Split[],
): Split[] {
  const path = methodPath(n, method);
  if (!path || n === 2) return [...splits];
  return splits.filter((s) => path.includes(s.id as MilestoneId));
}

/** 해법의 단계만 남긴 옛 기록들의 구간 최고(구간 골드가 견줄 값) */
export function methodBests(
  n: number,
  method: SolveMethod,
  records: readonly SolveRecord[],
): Map<string, number> {
  const path = methodPath(n, method);
  return bestSegments(
    records,
    path ? (id) => path.includes(id as MilestoneId) : undefined,
  );
}

export interface TheoryPart {
  /** 구간 이름(「앞 단계>이 단계」, `segmentsOf`와 같은 꼴) */
  readonly key: string;
  /** 이 단계 */
  readonly id: MilestoneId;
  /** 그 구간의 가장 짧은 기록(ms). 아직 없으면 null */
  readonly ms: number | null;
}

export interface TheoryBest {
  readonly parts: readonly TheoryPart[];
  /** 모든 구간의 최고를 더한 값. 한 구간이라도 없으면 null */
  readonly total: number | null;
}

/**
 * 이론 최고(스피드런의 「골드를 다 모은 합」): 해법의 단계 차례대로 구간마다 가장 짧았던 기록을 더한다.
 * 구간은 앞 단계를 지난 때부터 이 단계를 지난 때까지다. 한 수에 단계 둘을 함께 지난 판은 그 사이 구간이 따로
 * 없으니(`segmentsOf`가 둘을 한 칩으로 묶는다) 그 두 구간에는 쓰지 않는다. 자동(길이 판마다 다름)은 null
 */
export function theoryBest(
  n: number,
  method: SolveMethod,
  records: readonly SolveRecord[],
): TheoryBest | null {
  const path = methodPath(n, method);
  if (!path) return null;
  const best = methodBests(n, method, records);
  let prev = "start";
  const parts = path.map((id) => {
    const key = `${prev}>${id}`;
    prev = id;
    return { key, id, ms: best.get(key) ?? null };
  });
  const total = parts.every((p) => p.ms !== null)
    ? parts.reduce((sum, p) => sum + (p.ms as number), 0)
    : null;
  return { parts, total };
}

// ── 고른 해법 저장(이 기기, 혼자 맞추기·대결 함께) ──────────────

const KEY = "cube.method.v1";

export function parseMethod(text: string | null): SolveMethod {
  return SOLVE_METHODS.includes(text as SolveMethod)
    ? (text as SolveMethod)
    : "auto";
}

export function loadMethod(): SolveMethod {
  try {
    return parseMethod(localStorage.getItem(KEY));
  } catch {
    return "auto";
  }
}

export function saveMethod(method: SolveMethod): void {
  try {
    localStorage.setItem(KEY, method);
  } catch {
    // 저장하지 못해도 이번 화면에서는 고른 대로 보인다
  }
}
