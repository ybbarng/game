import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "지금 회차 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 지금 회차: 예측 중이면 답안지, 마감부터 관측이 끝날 때까지는 관측지(2026-11-02 사용자) */
export default function StardrawNowPage() {
  return <StardrawApp page="now" />;
}
