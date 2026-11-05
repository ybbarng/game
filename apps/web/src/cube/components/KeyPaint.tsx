"use client";

import { type CSSProperties, useEffect, useState } from "react";

import {
  calmTint,
  HOME_ORIENT,
  KEY_CALM,
  KEY_LOOK_DEFAULT,
  KEY_LOOK_STORAGE,
  type KeyLookStyle,
  type KeyMarkShape,
  type KeyPaint,
  keyMarkShape,
  keyPaint,
  type Orient,
  parseKeyLook,
} from "../keys/key-colors";
import { hexColor, useCubeSettings } from "../settings";

/**
 * 키 그림의 면 색(2026-11-04, `keys/key-colors.ts`). 2026-11-05 두 번 고쳤다.
 * 1. 「눈이 아파」: 꽉 채우던 칸을 옅은 바탕 + 색 테두리 + 아래 띠로.
 * 2. 「아직 너무 어지러움」: 칸 바탕·테두리는 무채색, 면 색은 작은 표시 하나(기본 아래선, `KeyLookStyle`)에만 쓴다.
 *    반대 방향(')은 같은 색을 흐리게.
 * 3. 「x, y, z는 표시할 방법이 마땅치 않았나?」: x·y·z는 그 축 면 색 점선, M·E·S는 따라 도는 면 색 짧은 선.
 * 설정 「키 그림에 면 색」을 끄면 표시도 없다.
 */

export interface KeyLook {
  paint: KeyPaint;
  style: KeyLookStyle;
  /** 표시 색. x·y·z·M·E·S는 빌린 면 색(`keys/key-colors.ts` `SWEEP_FACE`) */
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
    const rgb = colors[p.color] ?? 0;
    return {
      paint: p,
      style,
      color: hexColor(rgb),
      cell:
        style === "tint" && p.kind === "face"
          ? { backgroundColor: hexColor(calmTint(rgb, p.prime)) }
          : {},
    };
  };
}

/** 칸 글자의 밝기: 반대 방향은 한 단계 흐리게(색이 아니라 밝기로 구별) */
export function labelTone(look: KeyLook | null): string {
  return look?.paint.prime ? "text-white/60" : "text-white/90";
}

/**
 * 점선의 점(2026-11-05). 지름은 선 굵기(3px)와 같고 한 칸 5px 안에 하나, `space`로 남는 길이를 고르게 나눠
 * 끝이 잘린 점이 없다. 휴대폰 34px 칸(선 길이 약 19px)에도 점 셋이 떨어져 보여 실선과 헷갈리지 않는다.
 */
const DOT_PX = 3;
const DOT_GAP_PX = 2;

function markBox(shape: KeyMarkShape): string {
  // 실선은 칸 너비의 56%(양옆 22%), 짧은 선은 그 1/3쯤(양옆 40%)
  return shape === "short"
    ? "absolute inset-x-[40%] bottom-1 h-[3px] rounded-full"
    : "absolute inset-x-[22%] bottom-1 h-[3px] rounded-full";
}

/**
 * 면 색 표시 하나. 반대 방향은 같은 색·같은 모양을 흐리게.
 * 모양으로 무리를 나눈다: 면 돌리기 실선, x·y·z 점선(그 축 면 색), M·E·S 가운데 짧은 선(따라 도는 면 색).
 * 옅은 바탕 안은 면 돌리기를 바탕으로 칠하니 실선이 없고, 점선·짧은 선은 아래선 안과 똑같이 둔다(바탕은 무채색).
 * 점 안은 면 돌리기만 점을 둔다.
 */
export function KeyMark({ look }: { look: KeyLook | null }) {
  if (!look?.color) return null;
  const shape = keyMarkShape(look.paint);
  if (look.style === "tint" && shape === "solid") return null;
  if (look.style === "dot" && shape !== "solid") return null;
  const prime = look.paint.prime;
  const opacity = prime ? KEY_CALM.primeMark : 1;
  const style: CSSProperties =
    shape === "dotted"
      ? {
          backgroundImage: `radial-gradient(circle, ${look.color} ${DOT_PX / 2}px, transparent ${DOT_PX / 2 + 0.5}px)`,
          backgroundSize: `${DOT_PX + DOT_GAP_PX}px ${DOT_PX}px`,
          backgroundRepeat: "space no-repeat",
          backgroundPosition: "center",
          borderRadius: 0,
          opacity,
        }
      : { backgroundColor: look.color, opacity };
  return (
    <span
      data-key-mark={`${look.style}${prime ? "'" : ""}`}
      data-key-mark-shape={shape}
      className={
        look.style === "dot" && shape === "solid"
          ? "absolute top-1 right-1 h-1.5 w-1.5 rounded-full"
          : markBox(shape)
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
