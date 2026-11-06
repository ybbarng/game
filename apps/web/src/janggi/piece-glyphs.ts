import type { Kind, Side } from "@game/janggi-engine";
import { KADAGADEN_GLYPHS } from "./piece-glyphs-kadagaden";

/**
 * 장기 기물 한자(초 楚·車·包·馬·象·士·卒, 한 漢·車·包·馬·象·士·兵). 한국 장기알처럼 초는 흘려 쓴 초서,
 * 한은 반듯한 해서다. 윤곽은 두 편 모두 Kadagaden 장기알 세트(CC BY 4.0, piece-glyphs-kadagaden.ts)에서 옮겼다(docs/22).
 */

export type PieceGlyph = {
  /** 윤곽의 [x, y, 너비, 높이](`transform`까지 넣은 경로 좌표) */
  readonly box: readonly [number, number, number, number];
  /** 채워 그릴 윤곽 */
  readonly d: string;
  /** 경로에 붙이는 변환(원본 그림의 변환) */
  readonly transform?: string;
  /** 원본 그림이 윤곽에 두른 같은 색 테두리 굵기(경로 좌표) */
  readonly stroke?: number;
};

/** 판과 아이콘이 쓰는 기물 한자 윤곽(편 → 기물) */
export const PIECE_GLYPHS: Record<
  Side,
  Record<Kind, PieceGlyph>
> = KADAGADEN_GLYPHS;

/** 출처 표기 링크. 장기 첫 화면 바닥글 위 한 줄(JanggiApp의 `credit`)에 쓴다 */
export const PIECE_GLYPH_CREDIT = {
  source: "https://github.com/Kadagaden/chess-pieces",
  license: "https://creativecommons.org/licenses/by/4.0/",
} as const;

/**
 * 윤곽을 가운데 (cx, cy)에, 긴 변이 size가 되게 놓는 SVG transform
 */
export function fitGlyph(
  glyph: PieceGlyph,
  cx: number,
  cy: number,
  size: number,
): string {
  const [x, y, w, h] = glyph.box;
  const s = size / Math.max(w, h);
  const fit = `translate(${cx} ${cy}) scale(${s}) translate(${-(x + w / 2)} ${-(y + h / 2)})`;
  return glyph.transform ? `${fit} ${glyph.transform}` : fit;
}
