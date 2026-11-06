import type { Kind } from "@game/janggi-engine";
import { HAND_CHO_GLYPHS } from "./cho-glyphs-hand";
import { KADAGADEN_CHO_GLYPHS } from "./cho-glyphs-kadagaden";
import { WIKIMEDIA_CHO_GLYPHS } from "./cho-glyphs-wikimedia";

/**
 * 초 편 알 글자(楚·車·包·馬·象·士·卒). 한국 장기알처럼 흘려 쓴 붓글씨 모양을 채운 윤곽으로 그린다(docs/22).
 * 세 안을 견주는 중이라 안마다 원본 파일을 따로 두었다. 판이 쓰는 것은 `CHO_GLYPHS`(지금 안 1).
 * - 안 1 `wikimedia`: 위키미디어 공용 Janggi.svg 윤곽 일곱(CC BY-SA 3.0, cho-glyphs-wikimedia.ts)
 * - 안 2 `kadagaden`: Kadagaden 장기알 윤곽 일곱(CC BY 4.0, cho-glyphs-kadagaden.ts)
 * - 안 3 `hand`: 일곱 글자 모두 직접 그린 붓 획(cho-glyphs-hand.ts, 저장소 라이선스)
 * 두 그림의 馬는 위아래가 뒤집혀 올라가 있어 180도 돌려 쓴다(돌리면 실제 알처럼 위 고리, 가운데 己, 아래 가로획).
 */

export type ChoGlyph = {
  /** 윤곽의 [x, y, 너비, 높이](`transform`까지 넣은 경로 좌표) */
  readonly box: readonly [number, number, number, number];
  /** 채워 그릴 윤곽 */
  readonly d: string;
  /** 원본 그림이 경로에 붙여 둔 변환 */
  readonly transform?: string;
  /** 원본 그림이 윤곽에 두른 같은 색 테두리 굵기(경로 좌표) */
  readonly stroke?: number;
};

export type ChoGlyphSet = "wikimedia" | "kadagaden" | "hand";

export const CHO_GLYPH_SETS: Record<ChoGlyphSet, Record<Kind, ChoGlyph>> = {
  wikimedia: WIKIMEDIA_CHO_GLYPHS,
  kadagaden: KADAGADEN_CHO_GLYPHS,
  hand: HAND_CHO_GLYPHS,
};

/** 판과 아이콘이 쓰는 안 */
export const CHO_GLYPHS = CHO_GLYPH_SETS.wikimedia;

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
