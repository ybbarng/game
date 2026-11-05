import type { Metadata } from "next";

import { SolveApp } from "@/cube/components/SolveApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 제한 도전" },
  description:
    "시간이나 수에 체력바를 두고 큐브를 맞춘다. 단계를 지날 때마다 시간이 채워지고, 지난 단계와 남은 체력으로 점수를 낸다.",
};

export default function CubeChallengePage() {
  return <SolveApp mode="solo" challenge />;
}
