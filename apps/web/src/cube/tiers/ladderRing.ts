import type { TierId } from "./table";

/**
 * 티어 사다리에서 「지금 위쪽 큰 칸에 보고 있는 칸」의 테두리(docs/47 14-7 「진열」).
 *
 * 2026-11-14 사용자 「테두리 안 보이는데?」: 2px 옅은 티어 색(다이아몬드 #7dd3fc 등)은 칸 그림의 비슷한 색 배경판과
 * 내 티어 배경 판 위에서 묻혔다. 그래서 3px로 굵게, 채도가 높은 티어 색으로, 바깥 빛을 키우고, 어두운 페이지 바탕과
 * 내 티어 배경 판 둘 다에 대해 명도 대비 `RING_MIN_CONTRAST` 이상을 시험으로 지킨다(`ladderRing.test.ts`).
 */

/** 테두리 두께(px) */
export const RING_WIDTH = 3;
/** 페이지 바탕(neutral-900)과 내 티어 배경 판(흰색 10%를 그 위에 얹은 색) */
export const PAGE_BG = "#171717";
export const MINE_PLATE = "#2e2e2e";
/** 테두리 색이 두 바탕 모두에 대해 지킬 명도 대비(WCAG, 큰 그림·선 기준 3:1) */
export const RING_MIN_CONTRAST = 3;

/** 티어 색(진하게: Tailwind 400~500 단계, 엠블럼 색 기운 그대로) */
export const TIER_RING: Readonly<Record<TierId, string>> = {
  iron: "#d6d3d1",
  bronze: "#fb923c",
  silver: "#f1f5f9",
  gold: "#facc15",
  platinum: "#2dd4bf",
  emerald: "#10b981",
  diamond: "#38bdf8",
  master: "#e879f9",
  grandmaster: "#f43f5e",
  challenger: "#fbbf24",
};

/** 보고 있는 칸 테두리: 티어 색 3px와 바깥 빛. 그 밖은 없음 */
export function ladderRing(tier: TierId, viewing: boolean): string | undefined {
  const c = TIER_RING[tier];
  return viewing
    ? `0 0 0 ${RING_WIDTH}px ${c}, 0 0 20px 3px ${c}99`
    : undefined;
}

/** sRGB 색(#rrggbb)의 상대 휘도(WCAG) */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255)
  );
}

/** 두 색의 명도 대비(1~21) */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [
    number,
    number,
  ];
  return (x + 0.05) / (y + 0.05);
}
