import type { Metadata } from "next";

import { CubeLab } from "@/cube/lab/CubeLab";

export const metadata: Metadata = {
  title: { absolute: "큐브 그리기 시험" },
  robots: { index: false, follow: false },
};

/**
 * 큐브 3D 그리기·키보드 조작 시험 화면(docs/47 12절). 숨은 주소: 게임 목록·메뉴에 링크가 없고 검색에 싣지 않는다.
 */
export default function CubeLabPage() {
  return <CubeLab />;
}
