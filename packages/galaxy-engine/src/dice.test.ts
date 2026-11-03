import { sha256Hex } from "@game/yut-engine";
import { describe, expect, it } from "vitest";
import { STAR_SQUARES } from "./board";
import {
  bidCommitment,
  dealStars,
  diceFrom,
  drawIndex,
  HashStream,
  rollHash,
} from "./dice";

describe("함께 정하는 난수", () => {
  it("두 눈은 1~6이 고르게 나온다(6,000번, 기댓값의 ±10%)", () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 3000; i++) {
      const [a, b] = diceFrom(rollHash(i, [sha256Hex(`x${i}`)]));
      counts[a - 1] = (counts[a - 1] ?? 0) + 1;
      counts[b - 1] = (counts[b - 1] ?? 0) + 1;
    }
    for (const c of counts) {
      expect(c).toBeGreaterThan(900);
      expect(c).toBeLessThan(1100);
    }
  });

  it("굴림 해시는 번호와 모든 고리에 따라 바뀐다", () => {
    const a = sha256Hex("a");
    const b = sha256Hex("b");
    expect(rollHash(0, [a, b])).not.toBe(rollHash(1, [a, b]));
    expect(rollHash(0, [a, b])).not.toBe(rollHash(0, [b, a]));
    expect(rollHash(3, [a, b])).toBe(rollHash(3, [a, b]));
  });

  it("공문 뽑기는 남은 장 수 안의 번호이고 같은 고리면 같다", () => {
    for (let n = 1; n <= 16; n++) {
      const link = sha256Hex(`card${n}`);
      const i = drawIndex(n, link);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(n);
      expect(drawIndex(n, link)).toBe(i);
    }
  });

  it("해시를 다 읽으면 이어서 다시 해시해 뽑는다", () => {
    const stream = new HashStream(sha256Hex("long"));
    const values = Array.from({ length: 40 }, () => stream.below(1000));
    expect(values.every((v) => v >= 0 && v < 1000)).toBe(true);
    expect(() => stream.below(0)).toThrow();
  });

  it("시작 별은 겹치지 않게 자리마다 나눈다", () => {
    const hands = dealStars(sha256Hex("deal"), STAR_SQUARES, [0, 1, 2, 3], 2);
    const all = hands.flat();
    expect(hands.every((h) => h.length === 2)).toBe(true);
    expect(new Set(all).size).toBe(8);
    expect(all.every((sq) => STAR_SQUARES.includes(sq))).toBe(true);
  });

  it("입찰 약속은 번호·값·소금이 모두 같아야 같다", () => {
    const salt = "0".repeat(32);
    const h = bidCommitment(2, 150, salt);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(bidCommitment(2, 150, salt)).toBe(h);
    expect(bidCommitment(3, 150, salt)).not.toBe(h);
    expect(bidCommitment(2, 160, salt)).not.toBe(h);
  });
});
