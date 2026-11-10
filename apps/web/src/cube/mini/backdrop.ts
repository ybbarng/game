/**
 * Cubie 앱의 투명 창에서 큐브 뒤에 까는 은은한 받침(docs/47 15절). 바탕화면과 섞여 큐브가 묻히지 않게, 큐브와 보이는
 * 거울 판 둘레에 가운데가 살짝 어둡고 가장자리로 사라지는 둥근 그림자와 넓고 부드러운 밝은 테를 둔다. 밝은 바탕은 어두운
 * 빛이, 어두운 바탕은 밝은 테가 큐브 자리를 갈라 준다. 창 네모 가장자리가 드러나지 않게 받침은 창 안에서 다 사라진다.
 */

/** 받침의 진하기. 「구별될 정도」로 밝은·어두운·사진 바탕에서 찍어 견줘 골랐다 */
export const BACKDROP = {
  /** 가운데 어두운 빛(검정의 불투명도) */
  shade: 0.26,
  /** 밝은 테(흰색의 불투명도). 가늘면 어두운 바탕에서 원 선으로 보여 넓고 부드럽게 둔다 */
  rim: 0.08,
  /** 큐브·거울 사각형보다 얼마나 넓게 퍼지는가(반지름 배수) */
  spread: 1.3,
} as const;

type Rect = { x: number; y: number; w: number; h: number };

/** 받침 타원이 들어가는 사각형(캔버스 안 CSS px). 큐브·거울 사각형을 감싸고, 창(w×h) 안에 다 들어오게 줄인다 */
export function backdropBox(
  rects: readonly Rect[],
  width: number,
  height: number,
): Rect | null {
  if (rects.length === 0 || width <= 0 || height <= 0) return null;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  const cx = Math.min(Math.max((x0 + x1) / 2, 0), width);
  const cy = Math.min(Math.max((y0 + y1) / 2, 0), height);
  const rx = Math.min(((x1 - x0) / 2) * BACKDROP.spread, cx, width - cx);
  const ry = Math.min(((y1 - y0) / 2) * BACKDROP.spread, cy, height - cy);
  if (!(rx > 0 && ry > 0)) return null;
  return { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
}

/** 받침 그림(CSS background). 타원 칸에 꼭 맞는 둥근 그라데이션 둘: 어두운 빛과 바깥쪽의 부드러운 밝은 테 */
export function backdropBackground(): string {
  const { shade, rim } = BACKDROP;
  return [
    `radial-gradient(closest-side, transparent 50%, rgba(255,255,255,${rim}) 74%, transparent 97%)`,
    `radial-gradient(closest-side, rgba(0,0,0,${shade}) 0%, rgba(0,0,0,${(shade * 0.75).toFixed(3)}) 55%, rgba(0,0,0,0) 100%)`,
  ].join(", ");
}
