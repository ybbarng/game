import type { Metadata } from "next";

import { AlgsApp } from "@/cube/components/AlgsApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 공식 모음" },
  description:
    "OLL·PLL·F2L·오르테가 공식을 상황별로 모아 보고, 내 공식을 넣어 쓴다. 넣는 공식은 그 상황을 푸는지 바로 확인한다.",
};

export default function CubeAlgsPage() {
  return <AlgsApp />;
}
