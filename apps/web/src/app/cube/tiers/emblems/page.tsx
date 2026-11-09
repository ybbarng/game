import type { Metadata } from "next";

import { EmblemPreview } from "@/cube/tiers/EmblemPreview";

export const metadata: Metadata = {
  title: { absolute: "큐브 티어 엠블럼 미리보기" },
  robots: { index: false, follow: false },
};

/**
 * 티어 엠블럼 열 개를 크기별로 한눈에 견주는 개발용 화면. 숨은 주소: 메뉴에 링크가 없고 검색에 싣지 않는다.
 * `?hdr=1`이면 SDR 화면에서도 HDR 층(멈춘 반짝임 점)을 겹쳐 자리를 본다.
 */
export default function CubeTierEmblemsPage() {
  return <EmblemPreview />;
}
