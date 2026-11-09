import type { Metadata, Viewport } from "next";

import { MiniCubeApp } from "@/cube/mini/MiniCubeApp";

export const metadata: Metadata = {
  title: { absolute: "Cubie" },
  description:
    "작은 창에 띄워 두고 수시로 맞추는 큐브(맥 앱 Cubie의 화면). 큐브와 거울만 보이고 시간은 기록에서 본다.",
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: "#0a0a0a" };

export default function CubeMiniPage() {
  return <MiniCubeApp />;
}
