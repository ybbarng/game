import type { Metadata } from "next";

import { CubeMapApp } from "@/cube/components/CubeMapApp";

export const metadata: Metadata = {
  title: { absolute: "큐브 기능 지도" },
  description:
    "큐브 맞추기의 모든 화면을 한 쪽에: 사이트 쓰는 법, 처음 맞추기, 해법 익히기, 공식 훈련, 혼자 맞추기, 대결, 패턴, 티어표, 타이머.",
};

export default function CubeMapPage() {
  return <CubeMapApp />;
}
