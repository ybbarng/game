import type { Metadata, Viewport } from "next";

import { CubeHome } from "@/cube/components/CubeHome";

export const metadata: Metadata = {
  title: { absolute: "큐브 맞추기 · Cube" },
  applicationName: "큐브 맞추기",
  appleWebApp: {
    capable: true,
    title: "큐브 맞추기",
    statusBarStyle: "black-translucent",
  },
  description:
    "키보드나 휴대폰으로 돌리는 3D 큐브 맞추기. 혼자 맞추기·실물 타이머·블라인드·배우기(초보자 해법부터 CFOP까지)·공식 훈련, 컴퓨터와 대결, 친구와는 서버 없이 같은 섞기로 대결.",
  keywords: ["큐브", "큐브 맞추기", "3x3 큐브", "큐브 타이머", "스피드 큐브"],
};

/** 안드로이드 위아래 막대 색. 큐브 화면 바탕(neutral-900)과 맞춘다 */
export const viewport: Viewport = { themeColor: "#171717" };

export default function CubeHomePage() {
  return <CubeHome />;
}
