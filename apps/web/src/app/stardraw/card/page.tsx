import type { Metadata, ResolvingMetadata, Viewport } from "next";

import { CardCopyView } from "@/stardraw/components/CardCopyView";

const DESCRIPTION =
  "카노푸스 우주국 우주인 등록증의 공유본입니다. 장부에 등록된 우주인인지 함께 보여 드립니다.";

/** 링크 미리보기: 제목·설명만 공유본에 맞게 바꾸고 그림은 별 따기 공통 그림을 그대로 쓴다(openGraph를 통째로 쓰면 그림이 빠진다) */
export async function generateMetadata(
  _: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const og = (await parent).openGraph;
  return {
    title: { absolute: "우주인 등록증 공유본 · 하늘의 별 따기" },
    description: DESCRIPTION,
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "하늘의 별 따기",
      ...(og?.images ? { images: og.images } : {}),
      title: "우주인 등록증 · 하늘의 별 따기",
      description: DESCRIPTION,
    },
  };
}

export const viewport: Viewport = { themeColor: "#070d19" };

/** 등록증 공유본(읽기 전용, docs/36 11-66). 주소는 /stardraw/card?c=v1.<값> */
export default function StardrawCardPage() {
  return <CardCopyView />;
}
