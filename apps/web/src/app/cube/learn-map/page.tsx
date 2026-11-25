import type { Metadata } from "next";

import { SolveMapApp } from "@/cube/components/SolveMapApp";

// 시안(2026-11-25): 다른 화면에서 잇지 않는다. 사용자가 고르면 배우기 첫 화면으로 옮기고 이 주소는 지운다
export const metadata: Metadata = {
  title: { absolute: "큐브 해법 지도" },
  description:
    "다 섞인 큐브에서 다 맞은 큐브까지 해법마다의 길과 걸음별 공식 수·평균 수.",
  robots: { index: false },
};

export default function CubeLearnMapPage() {
  return <SolveMapApp />;
}
