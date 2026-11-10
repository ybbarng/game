import type { Metadata } from "next";

import { PatternsHub } from "@/cube/components/PatternsHub";

export const metadata: Metadata = {
  title: { absolute: "큐브 패턴" },
  description:
    "맞춘 큐브에 공식 하나로 만드는 예쁜 무늬. 체커보드·여섯 점·큐브 속 큐브·슈퍼플립 등을 한 수씩 보고, 목표 모양을 시간 재며 만들고, 모양마다 기록을 남긴다.",
};

export default function CubePatternsPage() {
  return <PatternsHub />;
}
