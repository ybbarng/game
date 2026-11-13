import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GEM_STYLES } from "./gemStyle";
import {
  BIG_SIZE,
  DRAFT_SIZE,
  POSTER_DIR,
  POSTER_DPR,
  POSTER_PAGE,
  POSTERS,
  posterFile,
  posterSrc,
} from "./poster";

const PUBLIC = join(__dirname, "../../../../public");

/** WebP 그림의 가로·세로(VP8 손실·VP8L 무손실·VP8X 확장 머리) */
function webpSize(b: Buffer): [number, number] {
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WEBP");
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X")
    return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe("3D 엠블럼 대기 그림(고정 규칙 2-1절, docs/47 14-7 다섯째 시안)", () => {
  it("찍어 둘 그림이 모두 있고, 3D 칸과 같은 크기(2배 화소)다", () => {
    for (const p of POSTERS) {
      const file = join(PUBLIC, POSTER_DIR, posterFile(p));
      const [w, h] = webpSize(readFileSync(file));
      expect([w, h], posterFile(p)).toEqual([
        p.size * POSTER_DPR,
        p.size * POSTER_DPR,
      ]);
    }
  });

  it("열 티어 × 바탕 둘(보통 칸)과 에메랄드 시안 전부 × 바탕 둘(큰 칸)", () => {
    expect(POSTERS.filter((p) => p.size === DRAFT_SIZE)).toHaveLength(20);
    expect(POSTERS.filter((p) => p.size === BIG_SIZE)).toHaveLength(
      // 에메랄드는 모든 시안, 다른 보석 티어 넷은 아홉째 시안 다섯
      GEM_STYLES.length * 2 + 4 * 5 * 2,
    );
  });

  it("칸에 맞는 그림만 고른다: 크기·바탕·시안이 다르면 없다(그때만 SVG)", () => {
    expect(posterSrc("diamond", DRAFT_SIZE, undefined, null)).toBe(
      `${POSTER_DIR}/diamond-dark.webp`,
    );
    expect(posterSrc("gold", DRAFT_SIZE, POSTER_PAGE.light, null)).toBe(
      `${POSTER_DIR}/gold-light.webp`,
    );
    expect(posterSrc("emerald", BIG_SIZE, POSTER_PAGE.light, "b")).toBe(
      `${POSTER_DIR}/emerald-b-light.webp`,
    );
    // 앞 시안(a 등)은 에메랄드에만: 다른 티어는 시안 없는 그림
    expect(posterSrc("ruby" as never, DRAFT_SIZE, undefined, "a")).toBeNull();
    expect(posterSrc("diamond", DRAFT_SIZE, undefined, "a")).toBe(
      `${POSTER_DIR}/diamond-dark.webp`,
    );
    // 아홉째 시안은 모든 보석 티어에(큰 칸), 금속 티어는 시안 없음
    expect(posterSrc("diamond", BIG_SIZE, undefined, "n")).toBe(
      `${POSTER_DIR}/diamond-n-dark.webp`,
    );
    expect(posterSrc("grandmaster", BIG_SIZE, POSTER_PAGE.light, "o2")).toBe(
      `${POSTER_DIR}/grandmaster-o2-light.webp`,
    );
    expect(posterSrc("gold", DRAFT_SIZE, undefined, "n")).toBe(
      `${POSTER_DIR}/gold-dark.webp`,
    );
    // 찍지 않은 크기·바탕
    expect(posterSrc("diamond", 200, undefined, null)).toBeNull();
    expect(posterSrc("diamond", DRAFT_SIZE, "#123456", null)).toBeNull();
  });
});
