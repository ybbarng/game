// 쥐는 기준 강조(2026-11-27 사용자 「잡는 기준이 되는 것들은 큐브 그림에서 강조해 눈으로 바로 알아보게」,
// docs/47 16-33). 쪽 자료의 `focus`(시작 상태에서 보이는 자리 이름: UFR·UB·F …)를 「focus」 표시(노란 고리)로 바꾼다.
// 이름은 두 가지다(2026-11-27 사용자 「맞추고 싶은 위치가 FU 위치로 오게」).
// - 조각(「UFR」): 시작 상태에서 그 자리에 든 조각. 표시는 조각에 붙어 돌리기를 따라 다닌다.
// - 자리(「@UF」): 시작 상태에서 그 자리를 둘러싼 센터 블럭들이 만나는 자리. 큐브 전체 돌리기는 따라가고, 층을 돌려
//   든 조각이 바뀌면 고리는 자리에 남는다(지금 상태 `now`에서 다시 찾는다).
import { cubeTopology, faceColors, pieceName } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import type { StickerMarks } from "../bridge";
import type { MarkTone } from "../view/types";

const sorted = (s: string) => [...s].sort().join("");
const FACE_LETTERS = "URFDLB";

/** 자리 고리 이름(「@UF」)인지 */
export const isSlotFocus = (name: string) => name.startsWith("@");

/** 자리 이름(면 글자 차례는 상관없다) → 조각 자리 번호. 없으면 -1 */
export function placeByName(n: number, name: string): number {
  const want = sorted(name);
  const count = cubeTopology(n).pieces.length;
  for (let p = 0; p < count; p++)
    if (sorted(pieceName(n, p)) === want) return p;
  return -1;
}

/** 면 f의 센터 색(홀수 크기만) */
function centerColor(n: number, s: PuzzleState, f: string): number {
  if (n % 2 === 0) throw new Error("자리 고리는 홀수 크기 큐브만");
  const mid = (n * n - 1) / 2;
  return faceColors(n, s)[FACE_LETTERS.indexOf(f) * n * n + mid] as number;
}

/** 자리 고리가 지금(`now`) 가리키는 자리 이름: 시작 상태에서 그 자리를 둘러싼 센터 색들이 지금 보는 면 */
export function slotNow(
  n: number,
  start: PuzzleState,
  name: string,
  now: PuzzleState,
): string {
  const faces = [...name.slice(1)];
  const colors = faces.map((f) => centerColor(n, start, f));
  return colors
    .map((c) => {
      const f = [...FACE_LETTERS].find((x) => centerColor(n, now, x) === c);
      if (!f) throw new Error(`센터 색을 못 찾는다: ${c}`);
      return f;
    })
    .join("");
}

/**
 * 그 이름들을 강조하는 칸 표시(스티커 정체마다). 조각 이름은 시작 상태 `start`에서 그 자리에 든 조각, 자리 이름은 지금
 * 상태 `now`(기본은 시작 상태)에서 그 자리에 든 조각에 둔다. 이름이 없으면 null
 */
export function focusMarks(
  n: number,
  start: PuzzleState,
  names: readonly string[] | undefined,
  now: PuzzleState = start,
): StickerMarks | null {
  if (!names?.length) return null;
  const topo = cubeTopology(n);
  const out: (MarkTone | null)[] = new Array(topo.stickerCount).fill(null);
  for (const name of names) {
    const slot = isSlotFocus(name);
    const at = slot ? slotNow(n, start, name, now) : name;
    const p = placeByName(n, at);
    if (p < 0) throw new Error(`자리 이름을 모른다: ${name}`);
    const state = slot ? now : start;
    for (const s of topo.pieces[p]?.stickers ?? [])
      out[state.perm[s] as number] = "focus";
  }
  return out;
}

/** 이름에 자리 고리가 있어 층을 돌릴 때마다 다시 칠해야 하는지 */
export const focusMoves = (names: readonly string[] | undefined) =>
  !!names?.some(isSlotFocus);
