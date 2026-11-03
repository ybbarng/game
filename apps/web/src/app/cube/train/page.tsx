import type { Metadata } from "next";

import { TrainApp } from "@/cube/components/TrainApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 공식 훈련" },
  description:
    "OLL·PLL·F2L·오르테가 상황을 무작위로 내고 맞춘 시간을 잰다. 필요한 칸만 보이게 가리기도.",
};

export default function CubeTrainPage() {
  return <TrainApp />;
}
