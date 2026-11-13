import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HERO_SIZE,
  LADDER_SIZE,
  POSTER_DIR,
  POSTER_DPR,
  POSTER_PAGE,
  POSTERS,
  posterFile,
  posterSrc,
  SPRITE_AMP,
  SPRITE_DIR,
  SPRITE_FRAMES,
  SPRITE_FRONT,
  SPRITE_YAWS,
  spriteFile,
} from "./poster";
import {
  STILL_CSS,
  STILL_DIR,
  STILL_DPR,
  STILLS,
  stillFile,
  stillSrc,
  stillStep,
} from "./still";

const PUBLIC = join(__dirname, "../../../../public");
const CUBIE = join(__dirname, "../../../../../cubie/Resources/Emblems");
declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, T>;
  }
}
// 찍기 스크립트를 import.meta.glob(?raw)으로 읽어 모듈 그래프에 잡히게 한다(스크립트가 바뀌면 `vitest --changed`가 이 시험을 돈다)
const SCRIPT_SOURCE = Object.values(
  import.meta.glob<string>("../../../../scripts/render-emblem-posters.mjs", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0] as string;

/** PNG 그림의 가로·세로와 알파가 있는지(색 형식 6 = RGBA) */
function pngInfo(b: Buffer): { w: number; h: number; alpha: boolean } {
  expect(b.toString("ascii", 1, 4)).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 6 };
}

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
  it("열 티어 모두 있고, 내 티어 3D 칸과 같은 크기(2배 화소)다", () => {
    expect(POSTERS).toHaveLength(10);
    for (const t of POSTERS) {
      const file = join(PUBLIC, POSTER_DIR, posterFile(t));
      expect(webpSize(readFileSync(file)), posterFile(t)).toEqual([
        HERO_SIZE * POSTER_DPR,
        HERO_SIZE * POSTER_DPR,
      ]);
    }
  });

  it("남은 그림은 목록에 있는 것뿐(쓰지 않는 그림을 남기지 않는다)", () => {
    const want = new Set(POSTERS.map(posterFile));
    const have = readdirSync(join(PUBLIC, POSTER_DIR)).filter((f) =>
      f.endsWith(".webp"),
    );
    expect(have.filter((f) => !want.has(f))).toEqual([]);
  });

  it("칸에 맞는 그림만 고른다: 크기·바탕이 다르면 없다(그때는 작은 로딩 표시)", () => {
    expect(posterSrc("diamond", HERO_SIZE, undefined)).toBe(
      `${POSTER_DIR}/diamond-dark.webp`,
    );
    expect(posterSrc("gold", HERO_SIZE, POSTER_PAGE)).toBe(
      `${POSTER_DIR}/gold-dark.webp`,
    );
    expect(posterSrc("ruby" as never, HERO_SIZE, undefined)).toBeNull();
    expect(posterSrc("diamond", LADDER_SIZE, undefined)).toBeNull();
    expect(posterSrc("diamond", HERO_SIZE, "#f5f5f5")).toBeNull();
  });
});

describe("진열 칸 그림(각도별 장을 이어 붙인 그림)", () => {
  it("열 티어 모두 있고, 사다리 칸 크기(2배 화소)의 장이 좌우 각 수만큼 가로로 이어진다", () => {
    for (const t of POSTERS) {
      const px = LADDER_SIZE * POSTER_DPR;
      expect(
        webpSize(readFileSync(join(PUBLIC, SPRITE_DIR, spriteFile(t)))),
        spriteFile(t),
      ).toEqual([px * SPRITE_FRAMES, px]);
    }
    const want = new Set(POSTERS.map(spriteFile));
    expect(
      readdirSync(join(PUBLIC, SPRITE_DIR)).filter((f) => !want.has(f)),
    ).toEqual([]);
  });

  it("각은 정면 둘레로 고르게, 가운데 장이 정면", () => {
    expect(SPRITE_YAWS).toHaveLength(SPRITE_FRAMES);
    expect(SPRITE_YAWS[SPRITE_FRONT]).toBeCloseTo(0, 9);
    expect(SPRITE_YAWS[0]).toBeCloseTo(-SPRITE_AMP, 9);
    expect(SPRITE_YAWS[SPRITE_FRAMES - 1]).toBeCloseTo(SPRITE_AMP, 9);
  });

  it("찍기 스크립트의 크기·각 수가 poster.ts와 같다", () => {
    const script = SCRIPT_SOURCE;
    expect(script).toContain(`const HERO_SIZE = ${HERO_SIZE};`);
    expect(script).toContain(`const LADDER_SIZE = ${LADDER_SIZE};`);
    expect(script).toContain(`const SPRITE_FRAMES = ${SPRITE_FRAMES};`);
    expect(script).toContain(`const SPRITE_AMP = ${SPRITE_AMP};`);
  });
});

describe("3D 엠블럼 정지 그림(docs/47 14-7 「정지 그림」)", () => {
  it("열 티어 × 세 단계가 모두 있고, 단계 크기의 두 배 화소다", () => {
    expect(STILLS).toHaveLength(30);
    for (const s of STILLS) {
      const file = join(PUBLIC, STILL_DIR, stillFile(s));
      const px = STILL_CSS[s.step] * STILL_DPR;
      expect(webpSize(readFileSync(file)), stillFile(s)).toEqual([px, px]);
    }
  });

  it("남은 그림은 목록에 있는 것뿐", () => {
    const want = new Set(STILLS.map(stillFile));
    const have = readdirSync(join(PUBLIC, STILL_DIR));
    expect(have.filter((f) => !want.has(f))).toEqual([]);
  });

  it("칸보다 크거나 같은 가장 작은 단계를 고른다", () => {
    expect(stillStep(18)).toBe("s");
    expect(stillStep(28)).toBe("s");
    expect(stillStep(32)).toBe("s");
    expect(stillStep(48)).toBe("m");
    expect(stillStep(64)).toBe("m");
    expect(stillStep(112)).toBe("l");
    expect(stillStep(300)).toBe("l");
    expect(stillSrc("master", 28)).toBe(`${STILL_DIR}/master-s.webp`);
  });

  it("Cubie에 묶는 PNG는 같은 길로 찍은 투명 그림(32pt 64px, 64pt 128px)", () => {
    for (const s of STILLS.filter((x) => x.step === "s")) {
      const small = pngInfo(readFileSync(join(CUBIE, `${s.tier}.png`)));
      expect(small).toEqual({ w: 64, h: 64, alpha: true });
      const big = pngInfo(readFileSync(join(CUBIE, "big", `${s.tier}.png`)));
      expect(big).toEqual({ w: 128, h: 128, alpha: true });
    }
  });
});
