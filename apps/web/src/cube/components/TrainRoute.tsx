"use client";

import { useEffect, useState } from "react";

import { isFreeTrain } from "../practice/stages";
import { PracticeApp } from "./PracticeApp";
import { TrainApp } from "./TrainApp";

/** `/cube/train`이 여는 화면(docs/47 16-9). 기본은 공식 연습, 옛 묶음·내 목록·`?mode=free`는 자유 훈련 */
export function TrainRoute() {
  const [free, setFree] = useState<boolean | null>(null);
  useEffect(() => setFree(isFreeTrain(window.location.search)), []);
  if (free === null)
    return <div data-game="cube" className="min-h-dvh bg-neutral-900" />;
  return free ? <TrainApp /> : <PracticeApp />;
}
