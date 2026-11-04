import type { Metadata } from "next";

import { PatternsApp } from "@/cube/components/PatternsApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 패턴 만들기" },
  description:
    "맞춘 큐브에 공식 하나로 만드는 예쁜 무늬. 체커보드·여섯 점·큐브 속 큐브·슈퍼플립 등을 한 수씩 보고 직접 만들어 본다.",
};

export default function CubePatternsPage() {
  return <PatternsApp />;
}
