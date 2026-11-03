import {
  faceColors,
  maskAtSlots,
  type StickerMask,
  stickerGeometry,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import type { Normal, Sticker } from "./view/types";

/**
 * 엔진 상태 → 3D 장면의 스티커(docs/47 2-2). 엔진이 기준이고 장면은 이 결과로 다시 칠하거나 수를 따라 돈다.
 *
 * 두 쪽의 뜻은 같다: 스티커의 `center`는 조각 중심(엔진 `stickerGeometry().center`), 색은 면 번호(U R F D L B).
 * `mask`가 있으면 "hidden"·"gray"인 스티커는 `color: null`(장면이 설정에 따라 검정·회색으로 칠한다).
 */
export function stickersFromState(
  n: number,
  state: PuzzleState,
  mask?: StickerMask | null,
): Sticker[] {
  const colors = faceColors(n, state);
  const visibility = mask ? maskAtSlots(state, mask) : null;
  return stickerGeometry(n).map((g) => ({
    center: g.center,
    normal: `${g.sign > 0 ? "+" : "-"}${g.axis}` as Normal,
    color:
      visibility && visibility[g.index] !== "visible"
        ? null
        : (colors[g.index] as number),
  }));
}

/** 펼친 그림용: 면 f(U R F D L B)의 칸 색(줄마다 왼쪽→오른쪽, 가림은 null) */
export function faceGrid(
  n: number,
  state: PuzzleState,
  mask?: StickerMask | null,
): (number | null)[][] {
  const colors = faceColors(n, state);
  const visibility = mask ? maskAtSlots(state, mask) : null;
  const nn = n * n;
  return Array.from({ length: 6 }, (_, f) =>
    Array.from({ length: nn }, (_, k) => {
      const i = f * nn + k;
      return visibility && visibility[i] !== "visible"
        ? null
        : (colors[i] as number);
    }),
  );
}
