import { describe, expect, it } from "vitest";

import {
  contrast,
  ladderRing,
  MINE_PLATE,
  PAGE_BG,
  RING_MIN_CONTRAST,
  RING_WIDTH,
  TIER_RING,
} from "./ladderRing";
import { TIER_IDS } from "./table";

describe("사다리 고른 칸 테두리(2026-11-14 사용자 「테두리 안 보이는데?」)", () => {
  it("명도 대비 계산: 흰·검정 21, 같은 색 1", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#2e2e2e", "#2e2e2e")).toBe(1);
  });

  it("열 티어 모두 테두리 색이 어두운 바탕과 내 티어 배경 판 둘 다에 대해 3:1 이상", () => {
    for (const t of TIER_IDS) {
      const c = TIER_RING[t];
      expect(contrast(c, PAGE_BG), `${t} 바탕`).toBeGreaterThanOrEqual(
        RING_MIN_CONTRAST,
      );
      expect(contrast(c, MINE_PLATE), `${t} 판`).toBeGreaterThanOrEqual(
        RING_MIN_CONTRAST,
      );
    }
  });

  it("보고 있는 칸만 3px 테두리와 바깥 빛", () => {
    expect(RING_WIDTH).toBe(3);
    expect(ladderRing("diamond", true)).toContain(
      `0 0 0 3px ${TIER_RING.diamond}`,
    );
    expect(ladderRing("diamond", true)).toContain("20px");
    expect(ladderRing("diamond", false)).toBeUndefined();
  });
});
