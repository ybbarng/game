import type { Metadata } from "next";

import { CubeGuideApp } from "@/cube/components/CubeGuideApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 사이트 쓰는 법" },
  description:
    "큐브 맞추기 화면 쓰는 법: 표기(R·U·F와 ' ·2) 읽기, 키 배치(두 손·표기) 고르기, 키 익히기, 수 보고 치기·키 보고 맞히기 연습, 처음 맞추기로 이어 가기.",
};

export default function CubeIntroPage() {
  return <CubeGuideApp />;
}
