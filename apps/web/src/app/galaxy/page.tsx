import type { Metadata, Viewport } from "next";

import { GalaxyApp } from "@/galaxy/components/GalaxyApp";

export const metadata: Metadata = {
  title: { absolute: "은하 한 바퀴 · Galaxy Loop" },
  applicationName: "은하 한 바퀴",
  appleWebApp: {
    capable: true,
    title: "은하 한 바퀴",
    statusBarStyle: "black-translucent",
  },
  description:
    "주사위를 굴려 계절 하늘을 한 바퀴씩 돌며 실제 별을 사고 정거장을 짓는 2~4인 게임. 별자리를 이으면 이용료가 오르고, 하면서 별 이름과 별자리를 익힌다. 별빛은 판 안에서만 쓰는 점수다.",
  keywords: ["은하 한 바퀴", "Galaxy Loop", "별자리", "주사위 게임", "별"],
};

/** 안드로이드 위아래 막대 색. 은하 한 바퀴 화면 바탕(#070d1c)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#070d1c" };

export default function GalaxyPage() {
  return <GalaxyApp />;
}
