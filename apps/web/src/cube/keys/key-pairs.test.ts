import { describe, expect, it } from "vitest";

import { bind, presetKeymap } from "../input/keymaps";
import {
  handLayersText,
  heldLayers,
  resetHandLayers,
  setHandLayers,
  usesHandLayers,
} from "./hand-layers";
import { FINGER_HOMES } from "./key-pairs";

describe("키 그림 손가락 자리", () => {
  it("손가락 자리는 F·J에 검지", () => {
    expect(FINGER_HOMES.find((f) => f.code === "KeyF")?.finger).toBe("검지");
    expect(FINGER_HOMES.find((f) => f.code === "KeyJ")?.hand).toBe("right");
  });
});

describe("손이 잡은 층 수", () => {
  it("알린 크기에서만 읽히고, 되돌리면 1·1", () => {
    setHandLayers(5, { left: 1, right: 3 });
    expect(heldLayers(5)).toEqual({ left: 1, right: 3 });
    expect(heldLayers(4)).toEqual({ left: 1, right: 1 });
    resetHandLayers();
    expect(heldLayers(5)).toEqual({ left: 1, right: 1 });
    expect(handLayersText({ left: 2, right: 3 })).toBe(
      "층 수 왼손 2 · 오른손 3",
    );
  });

  it("층 수 키가 있는 배치(옛 사용자 배치)·큰 큐브만 손 표시", () => {
    // 2026-11-12부터 「두 손」에는 층 수 키가 없다(숫자 = 깊이)
    expect(usesHandLayers(presetKeymap("twoHand"), 4)).toBe(false);
    expect(usesHandLayers(presetKeymap("notation"), 5)).toBe(false);
    const old = bind(presetKeymap("twoHand"), { code: "Digit7" }, "layers:R+");
    expect(usesHandLayers(old, 4)).toBe(true);
    expect(usesHandLayers(old, 3)).toBe(false);
  });
});
