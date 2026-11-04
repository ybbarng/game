"use client";

import type { CSSProperties } from "react";

import {
  HOME_ORIENT,
  inkOn,
  type KeyPaint,
  keyPaint,
  type Orient,
} from "../keys/key-colors";
import { hexColor, useCubeSettings } from "../settings";

/**
 * 키 그림의 면 색(2026-11-04, `keys/key-colors.ts`). 면 돌리기 키는 그 면 색으로 꽉 채우고, 반대 방향(')은 같은 색을
 * 연하게 + 빗금(색약이어도 무늬로 구별), x·y·z·M·E·S는 회색 바탕에 「보내는 면 색 → 받는 면 색」 두 색 화살.
 * 설정 「키 그림에 면 색」을 끄면 칠하지 않는다.
 */

/** 반대 방향 빗금 */
const HATCH =
  "repeating-linear-gradient(135deg, rgba(0,0,0,0.42) 0 3px, transparent 3px 7px)";
/** 페이지 바탕(neutral-900) */
const PAGE = 0x171717;

function blend(rgb: number, alpha: number): number {
  const ch = (shift: number) =>
    Math.round(
      ((rgb >> shift) & 255) * alpha + ((PAGE >> shift) & 255) * (1 - alpha),
    );
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

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
    if (p.kind === "sweep") return { paint: p, style: {}, ink: "#fff" };
    const rgb = colors[p.color] ?? 0;
    if (!p.prime)
      return {
        paint: p,
        style: { backgroundColor: hexColor(rgb), borderColor: hexColor(rgb) },
        ink: inkOn(rgb),
      };
    const soft = blend(rgb, 0.5);
    return {
      paint: p,
      style: {
        backgroundColor: hexColor(soft),
        backgroundImage: HATCH,
        borderColor: hexColor(rgb),
      },
      ink: inkOn(soft),
    };
  };
}

/** x·y·z·M·E·S의 두 색 화살(칸 아래 작은 띠) */
export function SweepBar({ look }: { look: KeyLook | null }) {
  const { colors } = useCubeSettings();
  if (look?.paint.kind !== "sweep") return null;
  const { from, to, prime } = look.paint;
  const sw = (c: number) => ({
    backgroundColor: hexColor(colors[c] ?? 0),
    ...(prime ? { backgroundImage: HATCH } : {}),
  });
  return (
    <span
      data-key-sweep={`${from}-${to}`}
      className="absolute inset-x-0.5 bottom-0.5 flex h-1.5 items-center gap-px"
      aria-hidden
    >
      <span className="h-full flex-1 rounded-l-sm" style={sw(from)} />
      <span className="text-[7px] leading-none text-white/80">▸</span>
      <span className="h-full flex-1 rounded-r-sm" style={sw(to)} />
    </span>
  );
}
