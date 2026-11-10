"use client";

import { useEffect, useState } from "react";

import { MORE_SETS } from "../practice/stages";
import { PracticeApp } from "./PracticeApp";
import { TrainApp } from "./TrainApp";

/**
 * `/cube/train`이 여는 화면(docs/47 16-9). 기본은 공식 연습. 「더 보기」의 옛 묶음(오르테가·패리티·블라인드 공식)과
 * 내 공식의 「내 목록 훈련」(`?pick=mine`), `?mode=free`는 옛 자유 훈련(상황 고르기·약한 것·내 목록)으로 연다.
 */
export function isFreeTrain(search: string): boolean {
  const q = new URLSearchParams(search);
  const set = q.get("set");
  return (
    q.get("mode") === "free" ||
    q.get("pick") === "mine" ||
    (set !== null && (MORE_SETS as string[]).includes(set))
  );
}

export function TrainRoute() {
  const [free, setFree] = useState<boolean | null>(null);
  useEffect(() => setFree(isFreeTrain(window.location.search)), []);
  if (free === null)
    return <div data-game="cube" className="min-h-dvh bg-neutral-900" />;
  return free ? <TrainApp /> : <PracticeApp />;
}
