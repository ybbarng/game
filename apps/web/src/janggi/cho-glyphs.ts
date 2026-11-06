import type { Kind } from "@game/janggi-engine";
import { KADAGADEN_CHO_GLYPHS } from "./cho-glyphs-kadagaden";

/**
 * 초 편 알 글자(楚·車·包·馬·象·士·卒). 한국 장기알처럼 흘려 쓴 붓글씨 모양을 채운 윤곽으로 그린다(docs/22).
 * 윤곽은 Kadagaden 장기알 세트(CC BY 4.0, cho-glyphs-kadagaden.ts)에서 옮겼다. 그 그림의 馬는 위아래가 뒤집혀 있어
 * 180도 돌려 쓴다(돌리면 실제 알처럼 위 고리, 가운데 己, 아래 가로획).
 */

export type ChoGlyph = {
  /** 윤곽의 [x, y, 너비, 높이](`transform`까지 넣은 경로 좌표) */
  readonly box: readonly [number, number, number, number];
  /** 채워 그릴 윤곽 */
  readonly d: string;
  /** 경로에 붙이는 변환(원본 그림의 변환, 馬의 180도 회전) */
  readonly transform?: string;
  /** 원본 그림이 윤곽에 두른 같은 색 테두리 굵기(경로 좌표) */
  readonly stroke?: number;
};

/** 판과 아이콘이 쓰는 초 글자 */
export const CHO_GLYPHS: Record<Kind, ChoGlyph> = KADAGADEN_CHO_GLYPHS;

/** 출처 표기 링크. 장기 첫 화면 바닥글 위 한 줄(JanggiApp의 `credit`)에 쓴다 */
export const CHO_GLYPH_CREDIT = {
  source: "https://github.com/Kadagaden/chess-pieces",
  license: "https://creativecommons.org/licenses/by/4.0/",
} as const;

/**
 * 윤곽을 가운데 (cx, cy)에, 긴 변이 size가 되게 놓는 SVG transform
 */
export function fitGlyph(
  glyph: ChoGlyph,
  cx: number,
  cy: number,
  size: number,
): string {
  const [x, y, w, h] = glyph.box;
  const s = size / Math.max(w, h);
  const fit = `translate(${cx} ${cy}) scale(${s}) translate(${-(x + w / 2)} ${-(y + h / 2)})`;
  return glyph.transform ? `${fit} ${glyph.transform}` : fit;
}
