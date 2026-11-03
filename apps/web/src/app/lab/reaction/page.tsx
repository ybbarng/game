import type { Metadata } from "next";

import { ReactionLab } from "@/lab/ReactionLab";

export const metadata: Metadata = {
  title: { absolute: "반응 측정실" },
  robots: { index: false, follow: false },
};

/**
 * 공정한 동시 판정 측정 화면(docs/43 5절). 숨은 주소: 게임 목록·메뉴에 링크가 없고 검색에 싣지 않는다.
 * 운영에도 둔다(실제 휴대폰에서 E1을 열어 볼 수 있게).
 */
export default function ReactionLabPage() {
  return <ReactionLab />;
}
