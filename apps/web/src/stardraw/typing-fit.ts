import { useCallback, useEffect, useState } from "react";

/**
 * 관측지에서 말하는 동안 키보드 위에 담기(docs/36 11-61). 휴대폰에서 입력 칸에 커서를 넣으면 키보드가 올라와 페이지가
 * 밀리고 하늘 위쪽(별똥별이 떨어지는 자리)이 화면 밖으로 나갔다(2026-11-03 사용자). 입력 칸에 초점이 있고 키보드가 올라와
 * 보이는 높이가 줄어든 동안만, 관측지를 키보드 위에 남은 칸(visualViewport)에 맞춰 다시 놓는다
 */

/** 창 높이와 보이는 높이의 차이가 이만큼(px) 넘어야 키보드가 올라온 것으로 본다(주소 줄이 접히는 정도는 넘지 않는다) */
export const KEYBOARD_MIN_PX = 120;

/** 말하는 동안 보이는 칸(layout viewport 기준 px). position:fixed 칸을 이 자리에 놓는다 */
export interface TypingFit {
  top: number;
  height: number;
  width: number;
}

/** visualViewport에서 쓰는 값만 */
export interface ViewportLike {
  height: number;
  width: number;
  offsetTop: number;
  scale: number;
}

/**
 * 말하는 동안의 칸. 초점이 없거나, 키보드가 없거나(PC), 확대해 보는 중이면(확대도 보이는 높이를 줄인다) null
 */
export function typingFit(
  focused: boolean,
  innerHeight: number,
  vv: ViewportLike | null,
): TypingFit | null {
  if (!focused || !vv) return null;
  if (Math.abs(vv.scale - 1) > 0.01) return null;
  if (innerHeight - vv.height <= KEYBOARD_MIN_PX) return null;
  return {
    top: Math.round(vv.offsetTop),
    height: Math.round(vv.height),
    width: Math.round(vv.width),
  };
}

/** 말하는 동안 얼굴 한 줄의 얼굴 크기와 사이(px, RoomView의 size-9·gap-1.5와 같다) */
export const ROW_FACE_PX = 36;
export const ROW_FACE_GAP_PX = 6;

/**
 * 말하는 동안 얼굴 한 줄에 놓을 얼굴 수. 칸 너비(좌우 여백을 뺀 것)에 들어가는 자리 수에서, 넘치면 +n 자리 하나를 뺀다.
 * 평소 상한(max)을 넘지 않는다
 */
export function rowFaceLimit(
  inner: number,
  people: number,
  max: number,
): number {
  const slots = Math.max(
    1,
    Math.floor((inner + ROW_FACE_GAP_PX) / (ROW_FACE_PX + ROW_FACE_GAP_PX)),
  );
  const cap = Math.min(slots, max);
  return people > cap ? Math.max(0, cap - 1) : cap;
}

function readViewport(): ViewportLike | null {
  const vv = typeof window === "undefined" ? undefined : window.visualViewport;
  if (!vv) return null;
  return {
    height: vv.height,
    width: vv.width,
    offsetTop: vv.offsetTop,
    scale: vv.scale,
  };
}

/**
 * 입력 칸에 넘길 onFocus·onBlur와 지금 칸(fit). visualViewport가 없으면 늘 null(아무것도 바꾸지 않는다).
 * 키보드가 오르내리거나 보이는 칸이 밀리면(resize·scroll) 다시 잰다
 */
export function useTypingFit(): {
  fit: TypingFit | null;
  onFocus: () => void;
  onBlur: () => void;
} {
  const [focused, setFocused] = useState(false);
  const [fit, setFit] = useState<TypingFit | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!focused || !vv) {
      setFit(null);
      return;
    }
    const measure = () => {
      const next = typingFit(true, window.innerHeight, readViewport());
      setFit((prev) =>
        prev &&
        next &&
        prev.top === next.top &&
        prev.height === next.height &&
        prev.width === next.width
          ? prev
          : next,
      );
    };
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, [focused]);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { fit, onFocus, onBlur };
}
