"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { FX } from "../fx-timing";

/**
 * 밀어 올려 내는 물건(예측서 `Sheet`, 등록증 `IdFlyer`)의 끌기 판정. 끌면 손을 따라오고(위로만, 아래로는 조금만
 * 늘어난다), 손을 떼면 다음 가운데 하나면 낸다: 제자리 누르기(TAP_SLOP 안), 일정 거리(FX.swipeDistance) 넘게 올림,
 * 빠르게 위로 튕김(FX.swipeVelocity), 마우스로 위로 끌었음.
 *
 * PC(2026-11-03 사용자 제보: 빨리 끌거나 마우스가 벗어나면 제출이 안 됐다, docs/36 11-58):
 * - 속도는 손을 떼기 직전 SPEED_WINDOW 안의 움직임으로 잰다. 예전에는 마지막 움직임 한 번과 뗀 자리를 비교해,
 *   빨리 튕기면 둘이 같은 자리라 속도 0으로 읽혀 거리가 모자라면 제자리로 돌아왔다.
 * - 마우스로 위로 끌었으면(TAP_SLOP 넘게) 거리·속도와 상관없이 낸다. 마우스는 휴대폰처럼 실수로 쓸리는 일이 없다.
 * - 붙잡기가 풀리거나(창 밖에서 뗌) 취소되면 마지막으로 본 자리에서 뗀 것으로 본다. 누르기(탭)로는 보지 않는다
 */
export const TAP_SLOP = 8;
const SPEED_WINDOW = 100;

type Sample = { y: number; t: number };

export function useSwipeUp(enabled: boolean, onSwiped: () => void) {
  /** 끄는 중이면 누른 자리에서 움직인 거리(그림에 쓰는 값), 아니면 null */
  const [drag, setDrag] = useState<number | null>(null);
  /** 누른 자리, 마우스인지, 마지막으로 본 자리, 최근 SPEED_WINDOW 남짓의 움직임 */
  const start = useRef<{
    y: number;
    mouse: boolean;
    last: Sample;
    trail: Sample[];
  }>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const at = { y: e.clientY, t: e.timeStamp };
    start.current = {
      y: e.clientY,
      mouse: e.pointerType === "mouse",
      last: at,
      trail: [at],
    };
    setDrag(0);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    s.last = { y: e.clientY, t: e.timeStamp };
    s.trail.push(s.last);
    // 창보다 오래된 움직임은 버리되 하나는 남긴다(창 바로 앞 자리부터 잰다)
    while (
      s.trail.length > 2 &&
      e.timeStamp - (s.trail[1]?.t ?? 0) > SPEED_WINDOW
    )
      s.trail.shift();
    const dy = e.clientY - s.y;
    setDrag(dy < 0 ? dy : dy * 0.2);
  };
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    setDrag(null);
    // 뗀 자리: pointerup이면 그 자리, 취소·붙잡기 풀림이면 마지막으로 본 자리
    const released = e.type === "pointerup";
    const y = released ? e.clientY : s.last.y;
    const t = released ? e.timeStamp : s.last.t;
    const dy = y - s.y;
    const first = s.trail.find((p) => t - p.t <= SPEED_WINDOW) ?? s.last;
    const v = (y - first.y) / Math.max(1, t - first.t);
    const tap = Math.abs(dy) <= TAP_SLOP && released;
    const mouseUp = s.mouse && dy < -TAP_SLOP;
    if (tap || mouseUp || -dy > FX.swipeDistance || v < -FX.swipeVelocity)
      onSwiped();
  };
  return {
    drag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
    },
  };
}
