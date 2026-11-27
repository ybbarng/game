// 쥐는 기준 조각 강조(2026-11-27 사용자 「잡는 기준이 되는 것들은 큐브 그림에서 강조해 눈으로 바로 알아보게」,
// docs/47 16-33). 쪽 자료의 `focus`(시작 상태에서 보이는 자리 이름: UFR·UB·F …)를 그 자리에 든 조각의 스티커 정체마다
// 「focus」 표시(노란 고리)로 바꾼다. 표시는 조각에 붙어 돌리기를 따라 다닌다(시연·문제 그림 여럿에서 같은 조각).
import { cubeTopology, pieceName } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import type { StickerMarks } from "../bridge";
import type { MarkTone } from "../view/types";

const sorted = (s: string) => [...s].sort().join("");

/** 자리 이름(면 글자 차례는 상관없다) → 조각 자리 번호. 없으면 -1 */
export function placeByName(n: number, name: string): number {
  const want = sorted(name);
  const count = cubeTopology(n).pieces.length;
  for (let p = 0; p < count; p++)
    if (sorted(pieceName(n, p)) === want) return p;
  return -1;
}

/** 그 자리들에 든 조각을 강조하는 칸 표시(스티커 정체마다). 이름이 없으면 null */
export function focusMarks(
  n: number,
  state: PuzzleState,
  names: readonly string[] | undefined,
): StickerMarks | null {
  if (!names?.length) return null;
  const topo = cubeTopology(n);
  const out: (MarkTone | null)[] = new Array(topo.stickerCount).fill(null);
  for (const name of names) {
    const p = placeByName(n, name);
    if (p < 0) throw new Error(`자리 이름을 모른다: ${name}`);
    for (const s of topo.pieces[p]?.stickers ?? [])
      out[state.perm[s] as number] = "focus";
  }
  return out;
}
