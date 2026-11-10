import type { Metadata } from "next";

import { CubeRedirect } from "@/cube/nav/CubeRedirect";

export const metadata: Metadata = {
  title: { absolute: "큐브 패턴" },
  robots: { index: false },
};

/** 옛 주소: 모양 만들기는 패턴의 「만들기」 탭으로 옮겼다(docs/47 16-6) */
export default function CubeShapePage() {
  return <CubeRedirect to="/cube/patterns?tab=make" label="패턴 만들기로" />;
}
