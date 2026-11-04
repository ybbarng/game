import type { Metadata } from "next";

import { CubeVsApp } from "@/cube/online/CubeVsApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 컴퓨터와 대결" },
  description: "단계를 고른 컴퓨터와 같은 섞기로 나란히 큐브를 맞춘다.",
};

export default function CubeVsPage() {
  return <CubeVsApp />;
}
