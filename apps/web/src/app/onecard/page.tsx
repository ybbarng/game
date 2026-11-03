import type { Metadata, Viewport } from "next";

import { OnecardApp } from "@/onecard/components/OnecardApp";

export const metadata: Metadata = {
  title: { absolute: "원카드 · One Card" },
  applicationName: "원카드",
  appleWebApp: {
    capable: true,
    title: "원카드",
    statusBarStyle: "black-translucent",
  },
  description:
    "트럼프로 하는 원카드. 무늬나 숫자를 맞춰 먼저 다 내고, 한 장 남으면 가운데 더미를 탁 쳐서 원카드! 컴퓨터와 혼자 하기, PC와 휴대폰 모두.",
  keywords: ["원카드", "One Card", "트럼프", "카드게임", "원카드 외치기"],
};

/** 안드로이드 위아래 막대 색. 원카드 화면 바탕(#0b1533)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#0b1533" };

export default function OnecardPage() {
  return <OnecardApp />;
}
