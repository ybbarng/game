import type { PuzzleState } from "@game/puzzle-core";

import { faceGrid, stickersFromState } from "../bridge";
import { ALG_SETS } from "../learn/alg-sets";
import { maskFor } from "../learn/judge";
import type { AlgSet } from "../learn/types";
import { hexColor } from "../settings";
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
}: {
  set: AlgSet;
  n: number;
  state: PuzzleState;
  colors: readonly number[];
  className: string;
}) {
  // OLL 묶음은 노란 칸만 색으로(훈련 「가리기」와 같은 마스크), 나머지는 회색
  const maskName = ALG_SETS.find((s) => s.set === set)?.mask;
  const faces = faceGrid(
    n,
    state,
    maskName === "oll" ? maskFor(n, maskName) : null,
  );
  if (!TOP_SETS.has(set))
    return (
      <CubePoster
        n={n}
        stickers={stickersFromState(n, state)}
        colors={colors}
        width={200}
        height={200}
        shadow={false}
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
  const rects: { x: number; y: number; w: number; h: number; c: string }[] = [];
  for (let k = 0; k < n * n; k++)
    rects.push({
      x: o + (k % n) * cell,
      y: o + Math.floor(k / n) * cell,
      w: cell,
      h: cell,
      c: fill(U, k),
    });
  for (let i = 0; i < n; i++) {
    // 옆면 윗줄(row 0): 앞 F는 왼→오른, 오른 R은 앞→뒤, 뒤 B는 오른→왼, 왼 L은 뒤→앞
    rects.push({
      x: o + i * cell,
      y: o + size + gap,
      w: cell,
      h: strip,
      c: fill(F, i),
    });
    rects.push({
      x: o + size + gap,
      y: o + i * cell,
      w: strip,
      h: cell,
      c: fill(R, n - 1 - i),
    });
    rects.push({
      x: o + i * cell,
      y: 0,
      w: cell,
      h: strip,
      c: fill(B, n - 1 - i),
    });
    rects.push({ x: 0, y: o + i * cell, w: strip, h: cell, c: fill(L, i) });
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
    </svg>
  );
}
