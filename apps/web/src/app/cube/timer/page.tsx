import type { Metadata, Viewport } from "next";

import { CubeTimerApp } from "@/cube/timer/CubeTimerApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 타이머" },
  description:
    "실물 큐브 시간 재기. 섞는 공식과 섞인 모습, 15초 살펴보기, 5번·12번·100번 평균, 블라인드 외우기·맞추기 나눠 재기.",
};

/** 안드로이드 위아래 막대 색. 화면 바탕(neutral-950)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function CubeTimerPage() {
  return <CubeTimerApp />;
}
