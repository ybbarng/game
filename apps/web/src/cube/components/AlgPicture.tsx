import type { PuzzleState } from "@game/puzzle-core";

import {
  faceGrid,
  marksAtSlots,
  type StickerMarks,
  stickersFromState,
} from "../bridge";
import { ALG_SETS } from "../learn/alg-sets";
import { maskFor } from "../learn/judge";
import type { AlgSet, MaskName } from "../learn/types";
import { hexColor } from "../settings";
import { MARK_COLOR, type MarkTone } from "../view/types";
import { CubePoster } from "./CubePoster";

/** 위에서 본 그림을 쓰는 묶음(마지막 층·2×2) */
const TOP_SETS: ReadonlySet<AlgSet> = new Set([
  "oll",
  "pll",
  "2look-oll",
  "2look-pll",
  "ortega-oll",
  "ortega-pbl",
]);

/** 그 묶음 그림이 윗면 평면도인지 */
export function isTopSet(set: AlgSet): boolean {
  return TOP_SETS.has(set);
}

const U = 0;
const R = 1;
const F = 2;
const L = 4;
const B = 5;

/**
 * 상황 그림. 마지막 층 묶음은 위에서 본 윗면 + 둘레 옆면 윗줄, 나머지(F2L)는 비스듬히 본 큐브(위·앞·오른쪽,
 * 넣을 칸이 앞-오른쪽이라 보통 공식 그림과 같다). 펼친 그림(전개도)은 쓰지 않는다(2026-11-05 사용자).
 * 칸 차례는 엔진과 같다: 윗면은 뒤→앞 줄, 왼→오른 칸. 옆면 윗줄은 윗면에 닿은 줄이다.
 */
export function AlgPicture({
  set,
  n,
  state,
  colors,
  className,
  mask,
  mirror = false,
  marks = null,
}: {
  /** 칸 표시(스티커 정체마다, 경우 표의 쥐는 기준 조각 고리) */
  marks?: StickerMarks | null;
  /** 비스듬한 큐브에 거울 판(배우기 경우 표, docs/47 16-37). 윗면 평면도에는 쓰지 않는다 */
  mirror?: boolean;
  set: AlgSet;
  n: number;
  state: PuzzleState;
  colors: readonly number[];
  className: string;
  /** 묶음 마스크 대신 쓸 가리기(예: 노란 십자 걸음은 엣지 블럭의 노랑만 「ll-cross」) */
  mask?: MaskName;
}) {
  // OLL 묶음은 노란 칸만 색으로(훈련 「가리기」와 같은 마스크), 나머지는 회색
  const setMask = ALG_SETS.find((s) => s.set === set)?.mask;
  const faces = faceGrid(
    n,
    state,
    mask ? maskFor(n, mask) : setMask === "oll" ? maskFor(n, setMask) : null,
  );
  if (!TOP_SETS.has(set))
    return (
      <CubePoster
        n={n}
        stickers={stickersFromState(
          n,
          state,
          mask ? maskFor(n, mask) : null,
          marks,
        )}
        colors={colors}
        width={200}
        height={200}
        shadow={false}
        mirror={mirror}
        className={className}
      />
    );
  const cell = 10;
  const strip = 3;
  const gap = 1.5;
  const o = strip + gap;
  const size = n * cell;
  const fill = (f: number, k: number) => {
    const c = faces[f]?.[k];
    return c === null || c === undefined ? "#555" : hexColor(colors[c] ?? 0);
  };
  const marked = marksAtSlots(state, marks);
  const nn = n * n;
  const rects: {
    x: number;
    y: number;
    w: number;
    h: number;
    c: string;
    mark: MarkTone | null;
  }[] = [];
  const push = (
    x: number,
    y: number,
    w: number,
    h: number,
    f: number,
    k: number,
  ) =>
    rects.push({
      x,
      y,
      w,
      h,
      c: fill(f, k),
      mark: marked?.[f * nn + k] ?? null,
    });
  for (let k = 0; k < nn; k++)
    push(o + (k % n) * cell, o + Math.floor(k / n) * cell, cell, cell, U, k);
  for (let i = 0; i < n; i++) {
    // 옆면 윗줄(row 0): 앞 F는 왼→오른, 오른 R은 앞→뒤, 뒤 B는 오른→왼, 왼 L은 뒤→앞
    push(o + i * cell, o + size + gap, cell, strip, F, i);
    push(o + size + gap, o + i * cell, strip, cell, R, n - 1 - i);
    push(o + i * cell, 0, cell, strip, B, n - 1 - i);
    push(0, o + i * cell, strip, cell, L, i);
  }
  const total = 2 * o + size;
  return (
    <svg
      viewBox={`-0.5 -0.5 ${total + 1} ${total + 1}`}
      className={className}
      role="img"
      aria-label="위에서 본 윗층"
      data-alg-picture
    >
      {rects.map((r, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: 칸 차례가 곧 자리
          key={i}
          x={r.x + 0.4}
          y={r.y + 0.4}
          width={r.w - 0.8}
          height={r.h - 0.8}
          rx={1.2}
          fill={r.c}
          stroke="#000"
          strokeWidth={0.5}
        />
      ))}
      {rects.map((r, i) =>
        r.mark ? (
          // 칸 표시(쥐는 기준 조각의 고리). 노란 칸 위에서도 보이게 검은 테 위에 표시 색을 겹친다
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: 칸 차례가 곧 자리
            key={`m${i}`}
            data-sticker-mark={r.mark}
            fill="none"
          >
            <rect
              x={r.x + 0.9}
              y={r.y + 0.9}
              width={r.w - 1.8}
              height={r.h - 1.8}
              rx={1}
              stroke="#000"
              strokeWidth={1.8}
            />
            <rect
              x={r.x + 0.9}
              y={r.y + 0.9}
              width={r.w - 1.8}
              height={r.h - 1.8}
              rx={1}
              stroke={hexColor(MARK_COLOR[r.mark])}
              strokeWidth={0.9}
            />
          </g>
        ) : null,
      )}
    </svg>
  );
}
