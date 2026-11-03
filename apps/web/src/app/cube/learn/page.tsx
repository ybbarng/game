import type { Metadata } from "next";

import { LearnApp } from "@/cube/components/LearnApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 배우기" },
  description:
    "처음부터 끝까지 따라 하는 큐브 초보자 해법(2×2~5×5), 프리드리히(CFOP), 블라인드. 설명·시연·직접 해보기.",
};

export default function CubeLearnPage() {
  return <LearnApp />;
}
