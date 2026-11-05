import { useEffect, useState } from "react";

/** 기기 설정 「움직임 줄이기」(`prefers-reduced-motion: reduce`). 바뀌면 따라 바뀐다. 미리 그린 HTML은 false */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
