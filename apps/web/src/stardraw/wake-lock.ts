"use client";

import { useEffect } from "react";

/**
 * 관측(추첨 연출) 동안 화면이 어두워지거나 꺼지지 않게(2026-11-03 사용자). 브라우저의 화면 깨우기 잠금(Screen Wake Lock)을
 * `active`인 동안만 잡는다. 탭을 떠나면 브라우저가 잠금을 풀므로 다시 보이면 다시 잡는다. 지원하지 않거나(옛 사파리 등)
 * 거절되면(절전 모드 등) 아무 일도 하지 않는다 — 화면이 평소처럼 꺼질 뿐 관측은 그대로다
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    if (!nav?.wakeLock) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const take = async () => {
      if (!alive || document.visibilityState !== "visible") return;
      if (lock && !lock.released) return;
      try {
        const next = await nav.wakeLock.request("screen");
        if (alive) lock = next;
        else void next.release().catch(() => {});
      } catch {
        // 지원하지만 거절됨(절전 모드, 권한 정책 등): 그냥 넘어간다
      }
    };
    const onVisible = () => void take();
    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
