import { describe, expect, it } from "vitest";

import { presetKeymap, twoHandKeymap } from "../input/keymaps";
import { algKeySpans, moveKeySpans, spansText } from "./key-spans";

// 코어 `cubie-native` `key_spans` 시험과 같은 예(두 손: R = I, R2 = I I, U' = F, 표기: 2R = 2 → R)
describe("말풍선의 수 표기와 키 낱말(docs/47 4-4 「수 표기와 키」)", () => {
  const two = twoHandKeymap();

  it("수마다 키는 키캡 하나씩, 수 사이는 「 · 」", () => {
    const spans = algKeySpans(two, 3, ["R", "U'", "R2"]);
    expect(spans).toEqual([
      { text: "I", style: "key" },
      { text: " · ", style: "plain" },
      { text: "F", style: "key" },
      { text: " · ", style: "plain" },
      { text: "I", style: "key" },
      { text: " ", style: "plain" },
      { text: "I", style: "key" },
    ]);
    expect(spansText(spans)).toBe("I · F · I I");
  });

  it("한 수의 다른 키로 넘어가면 차례 화살", () => {
    const spans = algKeySpans(presetKeymap("notation"), 4, ["2R"]);
    expect(spans.map((x) => x.style)).toEqual(["key", "arrow", "key"]);
    expect(spansText(spans)).toBe("2 → R");
  });

  it("키가 없는 수는 「?」", () => {
    expect(moveKeySpans(null)).toEqual([{ text: "?", style: "plain" }]);
  });
});
