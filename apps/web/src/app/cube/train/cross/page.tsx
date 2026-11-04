import type { Metadata } from "next";

import { CrossTrainApp } from "@/cube/components/CrossTrainApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 십자 훈련" },
  description:
    "섞인 큐브를 살펴보고 몇 수 안에 십자를 만드는지 잰다. 색·어려움·수 제한·살펴보기 시간을 골라 연습.",
};

export default function CubeCrossTrainPage() {
  return <CrossTrainApp />;
}
