import type { Metadata } from "next";

import { CubeIntroApp } from "@/cube/components/CubeIntroApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 처음 오셨나요" },
  description:
    "큐브 맞추기 안내: 표기(R·U·F와 ' ·2) 읽기, 키 배치(두 손·표기), 15초 살펴보기와 시간 규칙, 배우기로 이어 가기.",
};

export default function CubeIntroPage() {
  return <CubeIntroApp />;
}
