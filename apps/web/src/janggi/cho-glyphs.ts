import type { Kind } from "@game/janggi-engine";
import { type BrushStroke, brushOutline } from "./brush-outline";
import { WIKIMEDIA_CHO_GLYPHS } from "./cho-glyphs-wikimedia";

/**
 * 초 편 알 글자(楚·車·包·馬·象·士·卒). 한국 장기알처럼 흘려 쓴 붓글씨 모양을 채운 윤곽으로 그린다(docs/22).
 * - 楚·車·包·象·士·卒: 위키미디어 공용 Janggi.svg의 초 기물 윤곽을 그대로 쓴다(CC BY-SA 3.0, cho-glyphs-wikimedia.ts).
 * - 馬: 그 그림의 馬(「ろ」꼴)는 사용자가 보여 준 실제 알과 달라, 실제 알 사진(위 큰 굽은 획 안의 고리, 가운데 꺾인 획,
 *   아래 받치는 굵은 가로획)을 보고 이 저장소에서 붓 획으로 그렸다. 가운데 선과 굵기만 적고 윤곽은 brush-outline.ts가 만든다.
 */

/** 馬의 붓 획(100×100 칸, [x, y, 굵기]) */
const MA_STROKES: readonly BrushStroke[] = [
  // 오른쪽 위 깃발에서 시작해 왼쪽으로 크게 굽어 내려오는 획
  {
    pts: [
      [80, 7, 4],
      [73, 8.5, 5.5],
      [63.3, 9, 7],
      [50, 10.3, 9.7],
      [36.7, 15.8, 13.3],
      [29.7, 25.3, 15.3],
      [31.7, 34.5, 13],
      [40.8, 40, 9],
      [53.3, 42, 6],
      [64.2, 42.7, 4],
    ],
  },
  // 안쪽 고리
  {
    closed: true,
    pts: [
      [52, 25, 7.7],
      [57, 15.3, 5.7],
      [66.3, 13.7, 5],
      [71.3, 21.7, 5],
      [67.5, 33.3, 6],
      [57.5, 35.7, 7],
    ],
  },
  // 가운데: 비스듬히 내려와 왼쪽에서 아래 가로획으로 이어진다
  {
    pts: [
      [65, 43, 3],
      [53.3, 47, 6],
      [42.5, 50.8, 7.7],
      [37, 55.8, 7.7],
      [35.7, 64.2, 6.7],
    ],
  },
  // 가운데 가로획
  {
    pts: [
      [39.2, 55.8, 7.7],
      [53.3, 55, 9.7],
      [70, 53, 9.7],
      [78.3, 53.7, 6.7],
      [82.7, 57.5, 2],
    ],
  },
  // 아래 받침 가로획
  {
    pts: [
      [16.3, 65.3, 4.7],
      [22.5, 70.7, 10],
      [34.2, 73.7, 11],
      [55, 72, 9.7],
      [75, 68.7, 8.3],
      [90, 70.3, 2.7],
    ],
  },
];

export type ChoGlyph = {
  /** 윤곽의 [x, y, 너비, 높이](경로 좌표) */
  box: readonly [number, number, number, number];
  /** 채워 그릴 윤곽 */
  d: string;
};

export const CHO_GLYPHS: Record<Kind, ChoGlyph> = {
  ...WIKIMEDIA_CHO_GLYPHS,
  N: brushOutline(MA_STROKES),
};

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
  return `translate(${cx} ${cy}) scale(${s}) translate(${-(x + w / 2)} ${-(y + h / 2)})`;
}
