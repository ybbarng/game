import type { Metadata } from "next";

import { SolveApp } from "@/cube/components/SolveApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 혼자 맞추기" },
  description:
    "키보드로 3D 큐브를 섞고 맞춰 시간을 잰다(2×2~7×7). 15초 살펴보기, 5번·12번 평균.",
};

export default function CubeSoloPage() {
  return <SolveApp mode="solo" />;
}
