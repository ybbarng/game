// @vitest-environment node
import { describe, expect, it } from "vitest";

import { serialOf } from "./identity";
import { ART_H, ART_W, keyArt } from "./key-art";

/** 정해 둔 공개 열쇠(원시 P-256 꼴: 04 ‖ 64바이트) */
const key = (i: number) => {
  const k = new Uint8Array(65);
  k[0] = 4;
  for (let j = 1; j < 65; j++) k[j] = (i * 53 + j * 7) & 255;
  return k;
};

describe("등록증 뒷면 별 무늬", () => {
  it("같은 등록번호면 같은 그림, 다른 열쇠면 다른 그림", () => {
    const a = serialOf(key(1));
    expect(keyArt(a)).toEqual(keyArt(Uint8Array.from(a)));
    expect(keyArt(a)).not.toEqual(keyArt(serialOf(key(2))));
  });

  it("공개 열쇠를 받지 않는다(공유본 주소에 열쇠가 없어도 같은 그림)", () => {
    expect(() => keyArt(key(1))).toThrow();
  });

  it("별은 판 안에 있고, 밝은 별 일곱이 한 줄 별자리로 이어진다", () => {
    const art = keyArt(serialOf(key(3)));
    expect(art.stars).toHaveLength(20);
    for (const s of art.stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(ART_W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(ART_H);
    }
    expect(art.lines).toHaveLength(6);
    expect(new Set(art.lines.flat())).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(art.hue).toBeGreaterThanOrEqual(0);
    expect(art.hue).toBeLessThan(360);
  });
});
