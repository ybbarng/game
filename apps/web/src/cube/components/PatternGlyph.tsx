"use client";

import { createContext, useContext } from "react";

import {
  type CubeLook,
  PATTERN_INK,
  patternShape,
  type StickerPattern,
} from "../item-look";

/**
 * 아이템전 화면 방해(색 뒤집기·흑백 화면)를 키 그림까지 함께 칠하게 넘기는 값(docs/47 9-7). 없으면 보통 색.
 * 큐브 장면·큐브 그림(SVG)은 색과 무늬를 속성으로 받고, 키 그림(`KeyPaint`)만 이것을 읽는다
 */
export const CubeLookContext = createContext<CubeLook | null>(null);

export function useCubeLook(): CubeLook | null {
  return useContext(CubeLookContext);
}

const INK = `#${PATTERN_INK.toString(16).padStart(6, "0")}`;

/**
 * SVG 무늬(점·고리). 칸 한 변 = 1인 자리에 그리므로 `transform`으로 칸에 맞춘다(비스듬한 면이면 타원이 된다).
 * 방향이 없어 칸이 돌아가도 같아 보인다
 */
export function PatternGlyph({
  pattern,
  transform,
}: {
  pattern: StickerPattern;
  transform: string;
}) {
  const s = patternShape(pattern);
  if (s.dots.length === 0 && s.rings.length === 0) return null;
  return (
    <g transform={transform} data-pattern={pattern} pointerEvents="none">
      {s.dots.map((d) => (
        <circle key={`d${d.x}-${d.y}`} cx={d.x} cy={d.y} r={d.r} fill={INK} />
      ))}
      {s.rings.map((r) => (
        <circle
          key={`r${r.x}-${r.y}`}
          cx={r.x}
          cy={r.y}
          r={r.r}
          fill="none"
          stroke={INK}
          strokeWidth={r.w}
        />
      ))}
    </g>
  );
}
