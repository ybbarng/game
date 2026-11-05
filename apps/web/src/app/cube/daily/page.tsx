import type { Metadata } from "next";

import { SolveApp } from "@/cube/components/SolveApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 오늘의 섞기" },
  description:
    "날마다 모두 같은 큐브 섞기를 하루 한 번 풀고, 시간과 구간을 공유 글로 견준다(3×3·2×2·4×4).",
};

export default function CubeDailyPage() {
  return <SolveApp mode="solo" daily />;
}
