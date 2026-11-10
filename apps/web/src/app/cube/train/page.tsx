import type { Metadata } from "next";

import { TrainRoute } from "@/cube/components/TrainRoute";

export const metadata: Metadata = {
  title: { absolute: "큐브 공식 연습" },
  description:
    "뜨는 공식을 따라 치며 이어 맞춘다. 십자·초보자 2층·3층부터 F2L·OLL·PLL까지, 키보드로 치기 쉬운 공식으로. 외워서 치기와 자유 훈련도.",
};

export default function CubeTrainPage() {
  return <TrainRoute />;
}
