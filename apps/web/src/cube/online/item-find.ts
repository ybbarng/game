// 찾아 주기(아이템전, docs/47 9-7): 다음 이정표에 아직 안 맞은 조각 하나와 넣을 곳. 첫 화면 연출의 강조(`piece-marks.ts`)를 그대로 쓴다.
// 화면에만 보이는 도움이라 다른 기기와 맞추지 않는다. 고르는 규칙은 한 가지로 정해 둔다(결정적).
import type { PuzzleState } from "@game/puzzle-core";

import {
  slotStickers,
  unitSolved,
  unitStickers,
  unitsForStage,
} from "../piece-marks";

/**
 * 3×3: 십자 엣지(흰 엣지) 가운데 안 맞은 첫 조각, 십자가 다 맞았으면 F2L 짝(흰 코너 + 엣지) 가운데 안 맞은 첫 짝.
 * 「첫」은 `unitsForStage`의 차례(조각 번호 차례)다. 두 층이 다 맞았으면 null(빛낼 것이 없다)
 */
export function findMarksOf(
  state: PuzzleState,
): { found: number[]; slot: number[] } | null {
  for (const stage of ["cross", "f2l-1"]) {
    const unit = unitsForStage(3, stage)?.find((u) => !unitSolved(state, u));
    if (unit)
      return { found: unitStickers(unit), slot: slotStickers(state, unit) };
  }
  return null;
}
