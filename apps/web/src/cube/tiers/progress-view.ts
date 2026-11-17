/**
 * 기록 화면에서 티어를 정한 5판과 다음 판 목표를 보이는 도우미(docs/47 14-8). 사이트 혼자 맞추기 기록 칸(`SolveApp`),
 * Cubie 기록 창 사이트 화면(`MiniCubeApp` `RecordsPanel`), 티어 화면(`TierShowcase`)이 함께 쓰고, 앱 네이티브 창은 같은 글을
 * `apps/cubie/Sources/CubieCore/RecordsSheet.swift`·`TierSheet.swift`에 둔다(`native-windows-text.test.ts`가 본다).
 */
import { formatMs } from "../records";
import {
  bestFiveDetail,
  type NextSolve,
  type Timeable,
  tierName,
} from "./rank";

type Numbered = Timeable & { no?: number };

/** 티어를 정한 5판을 기록 줄에 짚기 */
export interface BestFiveView {
  /** 최고 5판 평균(ms) */
  ms: number;
  /** 그 5판의 가장 오래된·새 번호(「7~11번」) */
  first: number;
  last: number;
  /** 번호 → 그 판의 몫: 평균에 든 판(`in`), 빠진 가장 빠른 판(`fast`)·가장 느린 판(`slow`) */
  marks: ReadonlyMap<number, "in" | "fast" | "slow">;
}

/** 기록(새것이 앞, 번호 있음)과 따로 남겨 둔 최고 5판에서 티어를 정한 5판. 없거나 번호를 모르면 null */
export function bestFiveView(
  records: readonly Numbered[],
  bestFive: readonly Numbered[] = [],
): BestFiveView | null {
  const d = bestFiveDetail(records, bestFive);
  if (!d) return null;
  const five =
    d.from === "list" ? records.slice(d.at, d.at + 5) : bestFive.slice(0, 5);
  const nos = five.map((r) => r.no);
  if (nos.some((no) => no === undefined)) return null;
  const marks = new Map<number, "in" | "fast" | "slow">();
  for (const [i, r] of five.entries())
    marks.set(
      r.no as number,
      i === d.fast ? "fast" : i === d.slow ? "slow" : "in",
    );
  const list = nos as number[];
  return {
    ms: d.ms,
    first: Math.min(...list),
    last: Math.max(...list),
    marks,
  };
}

/** 「7~11번」 */
export function rangeText(v: Pick<BestFiveView, "first" | "last">): string {
  return `${v.first}~${v.last}번`;
}

/** 기록 화면 요약의 이름(최근 n판과 티어를 정한 최고 5판을 이름으로 가른다) */
export const RECENT5_LABEL = "최근 5판 평균";
export const RECENT12_LABEL = "최근 12판 평균";
export const BEST5_LABEL = "최고 5판 평균";

/**
 * 다음 판 목표 글: 「다음 판 2:51.56 안이면 브론즈 I」, 「다음 판을 맞추면 브론즈 I」,
 * 「다음 판 하나로는 브론즈 I에 못 닿아요. 최고 5판 평균을 5.09초 줄여야 해요.」
 */
export function nextSolveText(s: NextSolve): string {
  const to = tierName(s.to);
  if (s.kind === "within") return `다음 판 ${formatMs(s.ms)} 안이면 ${to}`;
  if (s.kind === "any") return `다음 판을 맞추면 ${to}`;
  return `다음 판 하나로는 ${to}에 못 닿아요. 최고 5판 평균을 ${formatMs(s.gapMs)}초 줄여야 해요.`;
}
