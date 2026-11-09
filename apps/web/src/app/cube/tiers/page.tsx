import type { Metadata } from "next";

import { TiersApp } from "@/cube/tiers/TiersApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 티어표" },
  description:
    "2×2~7×7 큐브 맞추기 속도 티어(아이언~챌린저). 크기마다 최고 Ao5로 매기고, 위쪽 티어는 WCA 대회 기록 분포로 정했다.",
};

export default function CubeTiersPage() {
  return <TiersApp />;
}
