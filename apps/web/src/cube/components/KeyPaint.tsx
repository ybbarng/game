"use client";

import type { CSSProperties } from "react";
import { COLOR_PATTERNS, GRAY, patternStyle, shownColor } from "../item-look";
import {
  calmLine,
  calmTint,
  HOME_ORIENT,
  KEY_CALM,
  type KeyMarkShape,
  type KeyPaint,
  keyMarkShape,
  keyPaint,
  type Orient,
  stripedColor,
  stripeImage,
} from "../keys/key-colors";
import { hexColor, useCubeSettings } from "../settings";
import { useCubeLook } from "./PatternGlyph";

/**
 * 키 그림의 면 색(2026-11-04, `keys/key-colors.ts`, docs/47 4-5). 2026-11-05에 여러 번 고쳐 지금은 한 모양이다.
 * - 면 돌리기(넓게·안쪽 층 포함): 칸 바탕에 그 면 색을 옅게. 선은 없다
 * - x·y·z: 무채색 칸에 축 면 색 점선 / M·E·S: 무채색 칸에 따라 도는 면 색 가운데 짧은 선
 * - 선 색은 같은 면 색을 칸 바탕과 섞은 색(`calmLine`)이라 옅은 바탕과 한 식구로 보인다
 * - 색약 친화·높은 대비 배색은 가까운 색 한 면(`KEY_STRIPE`)의 칸 바탕에 옅은 사선 무늬
 * - 반대 방향(')은 같은 색을 흐리게(바탕 더 옅게, 글자·선 60%)
 * 설정 「키 그림에 면 색」을 끄면 바탕도 선도 없다.
 */

export interface KeyLook {
  paint: KeyPaint;
  /** 선 색(x·y·z·M·E·S). 같은 면 색을 칸 바탕과 섞은 색 */
  line: string;
  /** 칸 바탕(면 돌리기만) */
  cell: CSSProperties;
  /** 칸 바탕에 사선 무늬가 있다(색약 친화·높은 대비 배색의 한 면) */
  striped: boolean;
}

/** 지금 설정의 색으로 동작 하나를 칠하는 함수. 설정에서 껐으면 null을 돌려준다 */
export function useKeyLook(
  n: number,
  orient: Orient = HOME_ORIENT,
): (action: string | undefined) => KeyLook | null {
  const { colors, colorScheme, keyColors } = useCubeSettings();
  // 아이템전 화면 방해(docs/47 9-7): 색 뒤집기면 맞은편 색 번호로, 흑백 화면이면 같은 회색 + 색 번호의 무늬로 칠한다
  const look = useCubeLook();
  return (action) => {
    if (!keyColors || !action) return null;
    const p = keyPaint(n, orient, action);
    if (!p) return null;
    const shown = shownColor(p.color, look);
    const rgb = look?.gray ? GRAY : (colors[shown] ?? 0);
    const face = p.kind === "face";
    const striped = face && !look?.gray && stripedColor(colorScheme, shown);
    const pattern = face && look?.gray ? COLOR_PATTERNS[shown] : undefined;
    return {
      paint: p,
      line: hexColor(calmLine(rgb)),
      striped,
      cell: face
        ? {
            backgroundColor: hexColor(calmTint(rgb, p.prime)),
            ...(striped ? { backgroundImage: stripeImage(rgb, p.prime) } : {}),
            ...(pattern ? patternStyle(pattern) : {}),
          }
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
 * 끝이 잘린 점이 없다. 휴대폰 34px 칸(선 길이 약 19px)에도 점 셋이 떨어져 보인다.
 */
const DOT_PX = 3;
const DOT_GAP_PX = 2;

function markBox(shape: KeyMarkShape): string {
  // 점선은 칸 너비의 56%(양옆 22%), 짧은 선은 20%(양옆 40%)
  return shape === "short"
    ? "absolute inset-x-[40%] bottom-1 h-[3px] rounded-full"
    : "absolute inset-x-[22%] bottom-1 h-[3px] rounded-full";
}

/**
 * x·y·z·M·E·S의 선 하나(면 돌리기는 바탕으로 칠하니 선이 없다). 반대 방향은 같은 색·같은 모양을 흐리게.
 */
export function KeyMark({ look }: { look: KeyLook | null }) {
  if (!look) return null;
  const shape = keyMarkShape(look.paint);
  if (shape === "solid") return null;
  const prime = look.paint.prime;
  const opacity = prime ? KEY_CALM.primeMark : 1;
  const style: CSSProperties =
    shape === "dotted"
      ? {
          backgroundImage: `radial-gradient(circle, ${look.line} ${DOT_PX / 2}px, transparent ${DOT_PX / 2 + 0.5}px)`,
          backgroundSize: `${DOT_PX + DOT_GAP_PX}px ${DOT_PX}px`,
          backgroundRepeat: "space no-repeat",
          backgroundPosition: "center",
          borderRadius: 0,
          opacity,
        }
      : { backgroundColor: look.line, opacity };
  return (
    <span
      data-key-mark={prime ? "'" : ""}
      data-key-mark-shape={shape}
      className={markBox(shape)}
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
