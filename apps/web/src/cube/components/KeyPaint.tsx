"use client";

import { type CSSProperties, useEffect, useState } from "react";

import {
  calmTint,
  HOME_ORIENT,
  KEY_CALM,
  KEY_LOOK_DEFAULT,
  KEY_LOOK_STORAGE,
  type KeyLookStyle,
  type KeyPaint,
  keyPaint,
  type Orient,
  parseKeyLook,
} from "../keys/key-colors";
import { hexColor, useCubeSettings } from "../settings";

/**
 * 키 그림의 면 색(2026-11-04, `keys/key-colors.ts`). 2026-11-05 두 번 고쳤다.
 * 1. 「눈이 아파」: 꽉 채우던 칸을 옅은 바탕 + 색 테두리 + 아래 띠로.
 * 2. 「아직 너무 어지러움」: 칸 바탕·테두리는 무채색, 면 색은 작은 표시 하나(기본 아래선, `KeyLookStyle`)에만 쓴다.
 *    반대 방향(')은 같은 색을 흐리게, x·y·z·M·E·S(큐브 돌리기·가운데 층)는 색을 쓰지 않는다.
 * 설정 「키 그림에 면 색」을 끄면 표시도 없다.
 */

export interface KeyLook {
  paint: KeyPaint;
  style: KeyLookStyle;
  /** 면 색(면 돌리기만). x·y·z·M·E·S는 null */
  color: string | null;
  /** 칸 바탕(`tint` 안만) */
  cell: CSSProperties;
}

/** 이 기기에서 견주어 보는 안(localStorage `cube.keyLook`). 없으면 권하는 안 */
export function useKeyLookStyle(): KeyLookStyle {
  const [style, setStyle] = useState<KeyLookStyle>(KEY_LOOK_DEFAULT);
  useEffect(() => {
    const read = () => {
      try {
        setStyle(parseKeyLook(localStorage.getItem(KEY_LOOK_STORAGE)));
      } catch {
        setStyle(KEY_LOOK_DEFAULT);
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);
  return style;
}

/** 지금 설정의 색으로 동작 하나를 칠하는 함수. 설정에서 껐으면 null을 돌려준다 */
export function useKeyLook(
  n: number,
  orient: Orient = HOME_ORIENT,
): (action: string | undefined) => KeyLook | null {
  const { colors, keyColors } = useCubeSettings();
  const style = useKeyLookStyle();
  return (action) => {
    if (!keyColors || !action) return null;
    const p = keyPaint(n, orient, action);
    if (!p) return null;
    if (p.kind === "sweep") return { paint: p, style, color: null, cell: {} };
    const rgb = colors[p.color] ?? 0;
    return {
      paint: p,
      style,
      color: hexColor(rgb),
      cell:
        style === "tint"
          ? { backgroundColor: hexColor(calmTint(rgb, p.prime)) }
          : {},
    };
  };
}

/** 칸 글자의 밝기: 반대 방향은 한 단계 흐리게(색이 아니라 밝기로 구별) */
export function labelTone(look: KeyLook | null): string {
  return look?.paint.prime ? "text-white/60" : "text-white/90";
}

/** 면 색 표시 하나: 아래선 또는 점. 반대 방향은 같은 색을 흐리게. 큐브 돌리기·가운데 층과 `tint` 안은 없다 */
export function KeyMark({ look }: { look: KeyLook | null }) {
  if (!look?.color || look.style === "tint") return null;
  const prime = look.paint.prime;
  const style: CSSProperties = {
    backgroundColor: look.color,
    opacity: prime ? KEY_CALM.primeMark : 1,
  };
  return (
    <span
      data-key-mark={`${look.style}${prime ? "'" : ""}`}
      className={
        look.style === "dot"
          ? "absolute top-1 right-1 h-1.5 w-1.5 rounded-full"
          : "absolute inset-x-[22%] bottom-1 h-0.5 rounded-full"
      }
      style={style}
      aria-hidden
    />
  );
}

/** `data-key-paint` 값(시험이 본다): 면 색 번호(반대면 '), 큐브 돌리기·가운데 층은 sweep */
export function paintAttr(look: KeyLook | null): string | undefined {
  if (!look) return undefined;
  return look.paint.kind === "face"
    ? `${look.paint.color}${look.paint.prime ? "'" : ""}`
    : "sweep";
}
