import type { Metadata } from "next";

import { CubeVsApp } from "@/cube/online/CubeVsApp";

// 아직 게임 목록에 올리지 않았다(docs/47 12절). 올릴 때 검색 막기를 푼다
export const metadata: Metadata = {
  title: { absolute: "큐브 컴퓨터와 경주" },
  robots: { index: false, follow: false },
};

export default function CubeVsPage() {
  return <CubeVsApp />;
}
