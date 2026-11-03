import type { Metadata } from "next";

import { FingersApp } from "@/cube/components/FingersApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 핑거 트릭" },
  description:
    "실물 큐브를 들고 손가락 쓰는 법을 반복 연습한다. 수마다 손가락 표기, 반복마다 시간·초당 수, 박자 소리.",
};

export default function CubeFingersPage() {
  return <FingersApp />;
}
