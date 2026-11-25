import { describe, expect, it } from "vitest";

import { notationKeymap, twoHandKeymap } from "../input/keymaps";
import { placeCase } from "../practice/place";
import { cubieKeymap, cubieUses } from "./cubie-keys";
import { placeBubbleLines } from "./place";

describe("상황 놓기 말풍선", () => {
  const km = twoHandKeymap();
  const t = placeCase("pll", "pll-t", km);
  if (!t) throw new Error("자료");

  it("접혀 있으면 「단계 · 상황 이름」 한 줄만", () => {
    expect(placeBubbleLines({ placed: t, revealed: false }, km)).toEqual([
      { text: "PLL · T 퍼뮤", style: "title" },
    ]);
  });

  it("펼치면 공식(수 표기)과 그 키(키캡 낱말) 줄을 가른다", () => {
    const lines = placeBubbleLines({ placed: t, revealed: true }, km);
    expect(lines.map((l) => l.style)).toEqual(["title", "alg", "keys"]);
    expect(lines[1]?.text).toBe(t.alg);
    const spans = lines[2]?.spans ?? [];
    // 두 손 배치: R = I, U = J
    expect(spans[0]).toEqual({ text: "I", style: "key" });
    expect(spans[1]).toEqual({ text: " · ", style: "plain" });
    expect(spans[2]).toEqual({ text: "J", style: "key" });
    expect(
      spans.every((s) => ["key", "plain", "arrow"].includes(s.style)),
    ).toBe(true);
  });
});

describe("Cubie가 쓰는 키", () => {
  it("맞춘 상태로는 Shift+Enter를 쓰고 아무것도 함께 누르지 않은 Esc 자리는 뺀다, 살펴보기는 쓰지 않는다", () => {
    for (const k of [twoHandKeymap(), notationKeymap()]) {
      const resets = cubieKeymap(k).bindings.filter(
        (b) => b.action === "reset",
      );
      expect(resets).toEqual([{ code: "Enter", shift: true, action: "reset" }]);
      expect(
        cubieKeymap(k).bindings.some((b) => b.action === "inspectionSkip"),
      ).toBe(false);
    }
    expect(cubieUses({ code: "Escape", shift: true, action: "reset" })).toBe(
      true,
    );
    expect(cubieUses({ code: "Escape", action: "reset" })).toBe(false);
  });
});
