import type { Metadata } from "next";

import { ShapeSoloApp } from "@/cube/components/ShapeSoloApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 모양 만들기" },
  description:
    "목표 모양을 보고 맞춘 큐브(또는 섞인 큐브)에서 그 모양을 만든다. 체커보드·큐브 속 큐브 등 모양마다 가장 빠른 기록이 남는다.",
};

export default function CubeShapePage() {
  return <ShapeSoloApp />;
}
