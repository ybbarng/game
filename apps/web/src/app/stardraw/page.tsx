import type { Metadata, Viewport } from "next";

import { StardrawApp } from "@/stardraw/components/StardrawApp";

export const metadata: Metadata = {
  title: { absolute: "하늘의 별 따기 · Stardraw" },
  applicationName: "하늘의 별 따기",
  appleWebApp: {
    capable: true,
    title: "하늘의 별 따기",
    statusBarStyle: "black-translucent",
  },
  description:
    "카노푸스 우주국이 다음에 빛날 별을 가장 잘 예측하는 우주인을 찾고 있습니다. 서울 하늘의 밝은 별 45개 가운데 다음에 빛날 별 6개를 맞혀 보세요. 어느 별이 빛날지는 우주국도 미리 알 수 없습니다.",
  // 이야기 말만(docs/41 4절). 「로또」는 미리보기·검색 결과에서 정체가 먼저 드러나 뺐다(2026-11-03 사용자)
  keywords: [
    "하늘의 별 따기",
    "Stardraw",
    "카노푸스 우주국",
    "별",
    "별자리",
    "우주인",
  ],
};

/** 안드로이드 위아래 막대 색. 밤하늘 바탕(#070d19)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#070d19" };

export default function StardrawPage() {
  return <StardrawApp />;
}
