import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "관측 시간표 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/** 관측 시간표: 앞으로의 예측 접수·관측 시각 */
export default function StardrawTimetablePage() {
  return <StardrawApp page="timetable" />;
}
