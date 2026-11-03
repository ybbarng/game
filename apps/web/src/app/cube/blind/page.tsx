import type { Metadata } from "next";

import { SolveApp } from "@/cube/components/SolveApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 블라인드" },
  description:
    "보고 외운 뒤 스티커가 모두 가려진 큐브를 키보드로 맞춘다. 외우기·맞추기 시간을 나눠 잰다.",
};

export default function CubeBlindPage() {
  return <SolveApp mode="blind" />;
}
