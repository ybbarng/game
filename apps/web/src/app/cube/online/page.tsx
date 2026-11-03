import type { Metadata } from "next";

import { CubeOnlineApp } from "@/cube/online/CubeOnlineApp";

// 아직 게임 목록에 올리지 않았다(docs/47 12절). 올릴 때 검색 막기를 푼다
export const metadata: Metadata = {
  title: { absolute: "큐브 온라인 경주" },
  robots: { index: false, follow: false },
};

export default function CubeOnlinePage() {
  return <CubeOnlineApp />;
}
