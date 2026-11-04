import { describe, expect, it } from "vitest";

import { presetKeymap } from "../input/keymaps";
import {
  handLayersText,
  heldLayers,
  resetHandLayers,
  setHandLayers,
  usesHandLayers,
} from "./hand-layers";
import { FINGER_HOMES, facePairs, pairPath } from "./key-pairs";

describe("키 그림 짝 잇기", () => {
  it("「두 손」의 같은 면 두 키", () => {
    const pairs = facePairs(presetKeymap("twoHand"));
    const of = (f: string) => pairs.find((p) => p.face === f);
    expect(of("R")).toMatchObject({ cw: "KeyI", ccw: "KeyK" });
    expect(of("L")).toMatchObject({ cw: "KeyD", ccw: "KeyE" });
    expect(of("U")).toMatchObject({ cw: "KeyJ", ccw: "KeyF" });
    expect(pairs).toHaveLength(6);
    // 「표기」는 반대가 Shift라 조합 키 없는 짝이 없다
    expect(facePairs(presetKeymap("notation"))).toHaveLength(0);
  });

  it("선은 키 글을 피해 틈으로 돈다", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    // 같은 줄: 아래 틈(10 + 2)으로
    expect(pairPath(a, { x: 30, y: 0, w: 10, h: 10 }, 4)).toBe(
      "M5 10 V12 H35 V10",
    );
    // 다른 줄: 위 키 아래 → 두 줄 사이 → 아래 키 위
    expect(pairPath({ x: 30, y: 14, w: 10, h: 10 }, a, 4)).toBe(
      "M5 10 V12 H35 V14",
    );
  });

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

  it("층 수 키가 있는 배치·큰 큐브만 손 표시", () => {
    expect(usesHandLayers(presetKeymap("twoHand"), 4)).toBe(true);
    expect(usesHandLayers(presetKeymap("twoHand"), 3)).toBe(false);
    expect(usesHandLayers(presetKeymap("notation"), 5)).toBe(false);
  });
});
