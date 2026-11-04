"use client";

import type { CSSProperties } from "react";

import {
  HOME_ORIENT,
  type KeyPaint,
  keyPaint,
  keyTone,
  type Orient,
} from "../keys/key-colors";
import { hexColor, useCubeSettings } from "../settings";

/**
 * 키 그림의 면 색(2026-11-04, `keys/key-colors.ts`). 2026-11-05부터 칸을 꽉 채우지 않는다(「눈이 아파」): 면 돌리기
 * 키는 어두운 바탕에 그 면 색을 옅게 섞고, 면 색 그대로는 칸 아래 띠에만 쓴다. 반대 방향(')은 더 옅게 + 띠를
 * 끊는다(무늬라 색약이어도 구별). x·y·z·M·E·S는 회색 바탕에 「보내는 면 색 ▸ 받는 면 색」 두 색 띠(반대는 끊긴 띠).
 * 섞는 비율은 `KEY_TONE` 한 곳. 설정 「키 그림에 면 색」을 끄면 칠하지 않는다.
 */

/** 칠한 칸의 글자색(어느 칸이든 밝은 글자) */
const KEY_INK = "rgba(255,255,255,0.92)";

/** 끊긴 띠(반대 방향): 띠 색을 4px 칠하고 3px 비운다 */
const dashed = (color: string): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`,
});
const solid = (color: string): CSSProperties => ({ backgroundColor: color });

export interface KeyLook {
  paint: KeyPaint;
  /** 칸 바탕 */
  style: CSSProperties;
  /** 글자색 */
  ink: string;
}

/** 지금 설정의 색으로 동작 하나를 칠하는 함수. 설정에서 껐으면 null을 돌려준다 */
export function useKeyLook(
  n: number,
  orient: Orient = HOME_ORIENT,
): (action: string | undefined) => KeyLook | null {
  const { colors, keyColors } = useCubeSettings();
  return (action) => {
    if (!keyColors || !action) return null;
    const p = keyPaint(n, orient, action);
    if (!p) return null;
    if (p.kind === "sweep") return { paint: p, style: {}, ink: KEY_INK };
    const tone = keyTone(colors[p.color] ?? 0, p.prime);
    return {
      paint: p,
      style: {
        backgroundColor: hexColor(tone.fill),
        borderColor: hexColor(tone.border),
      },
      ink: KEY_INK,
    };
  };
}

/**
 * 칸 아래 띠: 면 돌리기는 그 면 색 하나, x·y·z·M·E·S는 두 색 화살. 반대 방향은 끊긴 띠
 */
export function KeyBar({ look }: { look: KeyLook | null }) {
  const { colors } = useCubeSettings();
  if (!look) return null;
  const p = look.paint;
  const fill = (c: number) =>
    (p.prime ? dashed : solid)(hexColor(colors[c] ?? 0));
  if (p.kind === "face")
    return (
      <span
        data-key-bar={p.prime ? "dashed" : "solid"}
        className="absolute inset-x-1 bottom-0.5 h-1 rounded-full"
        style={fill(p.color)}
        aria-hidden
      />
    );
  return (
    <span
      data-key-sweep={`${p.from}-${p.to}`}
      data-key-bar={p.prime ? "dashed" : "solid"}
      className="absolute inset-x-0.5 bottom-0.5 flex h-1.5 items-center gap-px"
      aria-hidden
    >
      <span className="h-full flex-1 rounded-l-sm" style={fill(p.from)} />
      <span className="text-[7px] leading-none text-white/70">▸</span>
      <span className="h-full flex-1 rounded-r-sm" style={fill(p.to)} />
    </span>
  );
}
