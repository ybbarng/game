import type { Metadata, Viewport } from "next";

import { StarColors } from "@/stardraw/components/StarColors";

export const metadata: Metadata = {
  title: { absolute: "별의 색 · Stardraw" },
  description:
    "별 색은 표면 온도가 정한다. 초록·분홍 별이 없는 까닭과, 번호 공은 진하게·하늘의 별빛은 실제처럼 칠한 까닭을 직접 움직여 보며 알아본다.",
};

export const viewport: Viewport = { themeColor: "#070d19" };

export default function Page() {
  return <StarColors />;
}
