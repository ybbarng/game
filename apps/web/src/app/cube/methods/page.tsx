import type { Metadata } from "next";

import { MethodsApp } from "@/cube/components/LearnApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 해법 익히기" },
  description:
    "큐브 해법을 골라 배우고 연습한다. 초보자 해법(2×2~5×5), 프리드리히(CFOP)·루·ZZ·페트루스·야우, 블라인드. 해법마다 단원과 공식 훈련·십자 훈련·내 공식.",
};

export default function CubeMethodsPage() {
  return <MethodsApp />;
}
