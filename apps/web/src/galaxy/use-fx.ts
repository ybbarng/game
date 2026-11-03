"use client";

import { useEffect, useState } from "react";

import type { Timeline } from "./fx";

/**
 * 지금 걸음의 연출이 시작한 뒤 지난 시간(ms). 연출이 도는 동안만 화면 그리기마다 다시 그린다.
 * 연출이 없으면 늘 끝난 시간(그대로 결과)
 */
export function useFxElapsed(timeline: Timeline, start: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (timeline.total <= 0) return;
    let frame = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      if (t - start < timeline.total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [timeline, start]);
  if (timeline.total <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - start);
}
