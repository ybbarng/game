// 구간 기록 보이기(docs/51 1-2). 이정표는 여러 해법의 단계를 한 목록에 두어, 한 수에 여럿이 함께 켜지기도 한다
// (윗층만 어긋난 상태는 십자·F2L·첫 블록이 한꺼번에). 같은 순간에 켜진 것은 칩 하나로 묶고, 다 맞춘 순간(윗층)에
// 함께 켜진 것은 윗층만 남긴다(맞춘 큐브는 모든 단계를 지나므로 따로 보일 까닭이 없다).
import { milestoneLabel } from "@game/cube-engine";

import type { Split } from "../records";

export interface SplitGroup {
  /** 이 순간 켜진 이정표(목록 차례) */
  readonly ids: readonly string[];
  /** 칩 이름(「첫 블록 · 십자」) */
  readonly label: string;
  /** 맞추기 시작부터 ms */
  readonly ms: number;
  /** 앞 묶음부터 걸린 시간(구간) */
  readonly lap: number;
}

export function groupSplits(splits: readonly Split[]): SplitGroup[] {
  const byMs = new Map<number, string[]>();
  for (const s of splits) byMs.set(s.ms, [...(byMs.get(s.ms) ?? []), s.id]);
  const out: SplitGroup[] = [];
  let prev = 0;
  for (const ms of [...byMs.keys()].sort((a, b) => a - b)) {
    const all = byMs.get(ms) ?? [];
    const ids = all.includes("ll") ? ["ll"] : all;
    out.push({
      ids,
      label: ids.map(milestoneLabel).join(" · "),
      ms,
      lap: ms - prev,
    });
    prev = ms;
  }
  return out;
}
