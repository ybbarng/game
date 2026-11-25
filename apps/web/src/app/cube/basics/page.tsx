import type { Metadata } from "next";

import { BasicsApp } from "@/cube/components/BasicsApp";

export const metadata: Metadata = {
  title: { absolute: "큐브의 기초" },
  description:
    "큐브를 이루는 조각(센터·엣지·코너 블럭)과 가운데 축, 면을 돌릴 때 조각이 움직이는 법, 돌리기를 적는 표기. 키 익히기와 핑거 트릭.",
};

export default function CubeBasicsPage() {
  return <BasicsApp />;
}
