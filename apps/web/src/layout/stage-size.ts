"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * 판 무대(화면 전체를 덮는 절대 좌표 층)의 크기. `computeLayout`에 넣는다(마이티·하트·화투 공통).
 * ResizeObserver가 없는 곳(jsdom 단위 시험)은 창 크기를 쓴다
 */
export function useStageSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") {
      setSize({ width: window.innerWidth, height: window.innerHeight });
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
