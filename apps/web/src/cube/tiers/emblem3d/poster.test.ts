import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BIG_SIZE,
  DRAFT_SIZE,
  emblemSize,
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

describe("3D 엠블럼 대기 그림(고정 규칙 2-1절, docs/47 14-7)", () => {
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

  it("열 티어 × 바탕 둘: 금속 다섯은 보통 칸, 보석 다섯은 생김새가 보이게 큰 칸", () => {
    expect(POSTERS).toHaveLength(20);
    expect(POSTERS.filter((p) => p.size === DRAFT_SIZE)).toHaveLength(10);
    expect(POSTERS.filter((p) => p.size === BIG_SIZE)).toHaveLength(10);
    expect(emblemSize("gold")).toBe(DRAFT_SIZE);
    expect(emblemSize("master")).toBe(BIG_SIZE);
  });

  it("남은 그림은 목록에 있는 것뿐(쓰지 않는 그림을 남기지 않는다)", () => {
    const want = new Set(POSTERS.map(posterFile));
    const have = readdirSync(join(PUBLIC, POSTER_DIR)).filter((f) =>
      f.endsWith(".webp"),
    );
    expect(have.filter((f) => !want.has(f))).toEqual([]);
  });

  it("칸에 맞는 그림만 고른다: 크기·바탕이 다르면 없다(그때만 SVG)", () => {
    expect(posterSrc("diamond", BIG_SIZE, undefined)).toBe(
      `${POSTER_DIR}/diamond-dark.webp`,
    );
    expect(posterSrc("gold", DRAFT_SIZE, POSTER_PAGE.light)).toBe(
      `${POSTER_DIR}/gold-light.webp`,
    );
    expect(posterSrc("ruby" as never, DRAFT_SIZE, undefined)).toBeNull();
    // 찍지 않은 크기·바탕
    expect(posterSrc("diamond", DRAFT_SIZE, undefined)).toBeNull();
    expect(posterSrc("diamond", BIG_SIZE, "#123456")).toBeNull();
  });
});
