// 구간 기록 보이기(docs/51 1-2). 이정표는 여러 해법의 단계를 한 목록에 두어, 한 수에 여럿이 함께 켜지기도 한다
// (윗층만 어긋난 상태는 십자·F2L·첫 블록이 한꺼번에). 같은 순간에 켜진 것은 칩 하나로 묶고, 다 맞춘 순간(윗층)에
// 함께 켜진 것은 윗층만 남긴다(맞춘 큐브는 모든 단계를 지나므로 따로 보일 까닭이 없다).
import { milestoneLabel } from "@game/cube-engine";

import type { Split } from "../records";

export interface SplitGroup {
  /** 이 순간 켜진 이정표(목록 차례) */
  readonly ids: readonly string[];
  /** 대표 단계: 이 순간 켜진 것 가운데 가장 나아간 단계(칩 이름) */
  readonly main: string;
  /** 칩 이름: 가장 나아간 단계 하나 + 나머지 수(「둘째 층 +6」). 칩이 한 줄을 넘지 않게 */
  readonly label: string;
  /** 모두 늘어놓은 이름(「십자 · F2L 1/4 · …」, 자세히 볼 때) */
  readonly full: string;
  /** 맞추기 시작부터 ms */
  readonly ms: number;
  /** 앞 묶음부터 걸린 시간(구간) */
  readonly lap: number;
}

/**
 * 한 순간에 여럿이 켜졌을 때 칩에 크게 쓸 단계: 맞춘 큐브에 더 가까운 단계일수록 높다(층별 차례를 바탕으로
 * 루·ZZ·코너 먼저 단계를 비슷한 진행 자리에 끼웠다)
 */
export const MILESTONE_RANK: Readonly<Record<string, number>> = {
  centers: 10,
  edges: 20,
  cross: 30,
  corners: 40,
  eoline: 45,
  f2l1: 50,
  roux1: 55,
  f2l2: 60,
  layer1: 65,
  f2l3: 70,
  roux2: 75,
  layer2: 80,
  oll: 90,
  ll: 100,
};

export function groupSplits(splits: readonly Split[]): SplitGroup[] {
  const byMs = new Map<number, string[]>();
  for (const s of splits) byMs.set(s.ms, [...(byMs.get(s.ms) ?? []), s.id]);
  const out: SplitGroup[] = [];
  let prev = 0;
  for (const ms of [...byMs.keys()].sort((a, b) => a - b)) {
    const all = byMs.get(ms) ?? [];
    const ids = all.includes("ll") ? ["ll"] : all;
    const main = ids.reduce((a, b) =>
      (MILESTONE_RANK[b] ?? 0) > (MILESTONE_RANK[a] ?? 0) ? b : a,
    );
    out.push({
      ids,
      main,
      label: `${milestoneLabel(main)}${ids.length > 1 ? ` +${ids.length - 1}` : ""}`,
      full: ids.map(milestoneLabel).join(" · "),
      ms,
      lap: ms - prev,
    });
    prev = ms;
  }
  return out;
}
