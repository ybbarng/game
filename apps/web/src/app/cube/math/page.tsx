import type { Metadata } from "next";

import { CubeMathApp } from "@/cube/components/math/CubeMathApp";

export const metadata: Metadata = {
  title: { absolute: "큐브의 수학" },
  description:
    "큐브에 숨은 수학을 직접 해 보며: 섞는 경우의 수(2×2~5×5), 뽑아서 다시 끼우면 12개 중 1개만 맞출 수 있는 까닭, 방향과 홀짝의 규칙, 큰 큐브에만 생기는 모양, 신의 수, 되풀이와 차수, 교환자.",
};

export default function CubeMathPage() {
  return <CubeMathApp />;
}
