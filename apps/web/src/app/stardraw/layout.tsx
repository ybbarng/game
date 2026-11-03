import type { Metadata } from "next";
import type { ReactNode } from "react";

import { WebviewBand } from "@/stardraw/components/InAppNotice";

/**
 * 하늘의 별 따기 링크 미리보기(카카오톡·메신저가 읽는 og:title·og:description). 이것이 없으면 별 따기의 모든 주소가
 * 게임 센터의 미리보기(「게임 · Games」, 「방장도 남의 패를 모르게」)로 보였다(2026-11-03 클로즈 베타 점검).
 * 그림은 같은 폴더의 opengraph-image가 아래 주소 모두에 붙는다. 이야기 말만 쓴다(docs/41 4절)
 */
export const metadata: Metadata = {
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "하늘의 별 따기",
    title: "하늘의 별 따기",
    description:
      "로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요? 서울 하늘의 밝은 별 45개 가운데 다음에 빛날 별 6개를 맞혀 보세요.",
  },
};

/** 별 따기 모든 화면: 웹뷰에서 패스키가 안 될 것 같으면 위쪽 띠(docs/36 11-54) */
export default function StardrawLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WebviewBand />
      {children}
    </>
  );
}
