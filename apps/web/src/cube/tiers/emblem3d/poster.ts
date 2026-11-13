import { TIER_IDS, type TierId } from "../table";
import { styleOfTier } from "./gemStyle";

/**
 * 3D 엠블럼의 대기 그림(docs/47 14-7, 고정 규칙 2-1절). 3D가 뜨기 전·못 뜰 때 보이는 그림을 3D 장면에서 미리 찍어
 * 둔다(`scripts/render-emblem-posters.mjs` → `public/cube/tiers/emblem3d/`). 같은 카메라·같은 크기·같은 바탕·정면이라
 * 3D 첫 장으로 바뀌어도 자리와 생김새가 그대로다. 큐브 첫 화면 대기 그림(`cube/hero/poster.ts`)과 같은 방식이다.
 *
 * 2026-11-12 사용자 「그래픽 로드 전에 뜨는 이미지랑 후의 이미지랑 크기나 스타일 차이가 커서 이질적」: 예전에는
 * 72% 크기의 SVG 엠블럼(다른 각도·색·조명)을 보였다.
 */

export type PosterBg = "dark" | "light";

/** 미리보기 바탕: 어두운(neutral-900), 밝은(neutral-100). 배경판 가장자리가 이 색에 녹아든다 */
export const POSTER_PAGE: Record<PosterBg, string> = {
  dark: "#171717",
  light: "#f5f5f5",
};

/** 3D 큰 칸 한 변(CSS px): 금속 티어, 보석 티어(생김새가 보이게 크게) */
export const DRAFT_SIZE = 300;
export const BIG_SIZE = 440;
/** 찍는 화소 밀도(두 배 화면) */
export const POSTER_DPR = 2;

/** 이 티어의 3D 큰 칸 한 변 */
export function emblemSize(tier: TierId): number {
  return styleOfTier(tier) ? BIG_SIZE : DRAFT_SIZE;
}

export interface PosterSpec {
  tier: TierId;
  bg: PosterBg;
  size: number;
}

/** 찍어 둘 대기 그림 전부: 열 티어 × 바탕 둘(티어마다 그 티어 큰 칸 크기) */
export const POSTERS: readonly PosterSpec[] = TIER_IDS.flatMap((tier) =>
  (["dark", "light"] as const).map((bg) => ({
    tier,
    bg,
    size: emblemSize(tier),
  })),
);

export const posterFile = (p: PosterSpec): string => `${p.tier}-${p.bg}.webp`;

export const POSTER_DIR = "/cube/tiers/emblem3d";

/** 바탕색으로 어느 바탕 그림인지(모르는 색이면 null) */
export function posterBg(pageColor: string | undefined): PosterBg | null {
  const c = (pageColor ?? POSTER_PAGE.dark).toLowerCase();
  if (c === POSTER_PAGE.dark) return "dark";
  if (c === POSTER_PAGE.light) return "light";
  return null;
}

/** 이 칸에 맞는 대기 그림 주소. 찍어 둔 것이 없으면 null(그때만 SVG 엠블럼) */
export function posterSrc(
  tier: TierId,
  size: number,
  pageColor: string | undefined,
): string | null {
  const bg = posterBg(pageColor);
  if (!bg) return null;
  const hit = POSTERS.find(
    (p) => p.tier === tier && p.bg === bg && p.size === size,
  );
  return hit ? `${POSTER_DIR}/${posterFile(hit)}` : null;
}
