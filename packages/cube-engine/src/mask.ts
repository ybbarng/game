import type { PuzzleState } from "@game/puzzle-core";
import { cubeGroups } from "./groups";
import { stickerFace } from "./state";
import { cubeTopology, OPPOSITE_FACE, U } from "./topology";

/**
 * 가리기(마스크, docs/47 2-3). 스티커 번호마다 보임·까맣게·회색.
 * 스티커 번호에 붙으므로 조각이 움직이면 가리기도 따라간다.
 * 화면은 `maskAtSlots`로 자리마다의 값을 얻어 칠한다.
 */
export type StickerVisibility = "visible" | "hidden" | "gray";
export type StickerMask = readonly StickerVisibility[];

/** 고른 조각들의 스티커만 보이고 나머지는 `rest` */
export function maskFromPieces(
  n: number,
  visiblePieces: readonly number[],
  rest: StickerVisibility = "hidden",
): StickerVisibility[] {
  const topo = cubeTopology(n);
  const out = new Array<StickerVisibility>(topo.stickerCount).fill(rest);
  for (const p of visiblePieces) {
    for (const s of topo.pieces[p]?.stickers ?? []) out[s] = "visible";
  }
  return out;
}

export type StageMaskName = "cross" | "f2l" | "oll" | "pll" | "all-hidden";

/**
 * 단계 마스크.
 * - cross: 십자 모서리와 가운데만 보임, 나머지 까맣게
 * - f2l: F2L(십자·첫 층 꼭짓점·가운데 층 모서리·가운데)만 보임, 나머지 까맣게
 * - oll: 마지막 층 색(crossFace 맞은편, 기본 노랑) 스티커만 보임, 나머지 회색
 * - pll: 마지막 층 조각과 가운데가 보임, 나머지 회색
 * - all-hidden: 모두 까맣게(블라인드)
 */
export function stageMask(
  n: number,
  name: StageMaskName,
  crossFace: number = U,
): StickerVisibility[] {
  const g = cubeGroups(n, crossFace);
  const topo = cubeTopology(n);
  switch (name) {
    case "cross":
      return maskFromPieces(n, [...g.cross, ...g.centers], "hidden");
    case "f2l":
      return maskFromPieces(n, g.f2l, "hidden");
    case "oll": {
      const top = OPPOSITE_FACE[crossFace as 0] as number;
      return topo.stickers.map((_, s) =>
        stickerFace(n, s) === top ? "visible" : "gray",
      );
    }
    case "pll":
      return maskFromPieces(n, [...g.lastLayer, ...g.centers], "gray");
    case "all-hidden":
      return new Array<StickerVisibility>(topo.stickerCount).fill("hidden");
  }
}

/** 자리마다 칠할 값(자리 i에 있는 스티커의 마스크 값) */
export function maskAtSlots(
  state: PuzzleState,
  mask: StickerMask,
): StickerVisibility[] {
  return Array.from(state.perm, (sticker) => mask[sticker] ?? "visible");
}
