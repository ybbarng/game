"use client";

import { useLayoutEffect, useRef, useState } from "react";

/*
 * 나눠 주기 앞뒤의 공통 흐름(docs/05 4.12): 나눠 주는 동안 컴퓨터 기다리기, 다 나눈 뒤 받은 패를 손패 가운데에서
 * 펼치기. 나눠 주는 연출 자체는 `DealAnimation`
 */

/** 받은 패 한 장이 펼쳐지는 시간(ms) */
export const SPREAD_MS = 300;

/** `i`번째 카드가 펼쳐지기 시작하는 때(ms). 왼쪽부터 조금씩 늦게, 300ms까지 */
export function spreadDelay(i: number): number {
  return Math.min(i * 25, 300);
}

/** 이 기기에서 도는 나눠 주기 연출이 끝나기까지 남은 시간(ms, 없으면 0) */
export function dealHoldLeft(
  dealing: { until: number } | null,
  now = Date.now(),
): number {
  return dealing ? Math.max(0, dealing.until - now) : 0;
}

/**
 * 나눠 주는 연출이 끝난 뒤 `next`를 부른다(`left`가 0이 될 때까지 다시 기다린다). 판 상태를 늦추지 않고 컴퓨터만
 * 기다리게 해, 연출이 판정 시간을 건드리지 않는다
 */
export function afterDeal(left: () => number, next: () => void): void {
  const ms = left();
  if (ms > 0) setTimeout(() => afterDeal(left, next), ms);
  else next();
}

/**
 * 받은 패 펼치기: 나눠 주기(`dealing`)가 끝나면 손패가 가운데에 모였다가(`gathered`) 제자리로 펼쳐진다
 * (`spreading`, 카드마다 `spreadDelay`). 하트·마이티는 손패 카드의 `from`(받은 자리)으로 같은 모습을 낸다
 */
export function useHandSpread(
  dealing: boolean,
): "idle" | "gathered" | "spreading" {
  const [spread, setSpread] = useState<"idle" | "gathered" | "spreading">(
    "idle",
  );
  const was = useRef(false);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = dealing;
    if (!before || dealing) return;
    setSpread("gathered");
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setSpread("spreading"));
    });
    const end = setTimeout(
      () => setSpread("idle"),
      spreadDelay(Number.POSITIVE_INFINITY) + SPREAD_MS + 100,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(end);
    };
  }, [dealing]);
  return spread;
}
