import { describe, expect, it } from "vitest";

import {
  applyMoveToStickers,
  coordOfLayer,
  cubiePositions,
  inMove,
  layerOfCoord,
  rotateVec,
  solvedStickers,
  stickersFromFaces,
} from "./geometry";
import type { CubeMove, Sticker } from "./types";

const R: CubeMove = { axis: "x", from: 1, to: 1, turns: 1 };
const U: CubeMove = { axis: "y", from: 1, to: 1, turns: 1 };
const F: CubeMove = { axis: "z", from: 1, to: 1, turns: 1 };

/** 면 f의 가운데(3×3) 칸 색 */
function colorAt(stickers: Sticker[], center: number[], normal: string) {
  return stickers.find(
    (s) => s.center.join() === center.join() && s.normal === normal,
  )?.color;
}

describe("큐브 좌표", () => {
  it("층 번호는 + 끝에서부터 센다", () => {
    expect(coordOfLayer(3, 1)).toBe(1);
    expect(coordOfLayer(3, 3)).toBe(-1);
    expect(coordOfLayer(4, 1)).toBe(1.5);
    expect(layerOfCoord(4, -0.5)).toBe(3);
  });

  it("겉 조각 수는 n³ - (n-2)³", () => {
    for (const n of [2, 3, 4, 5, 6, 7])
      expect(cubiePositions(n)).toHaveLength(n ** 3 - Math.max(0, n - 2) ** 3);
  });

  it("회전 방향: R은 앞을 위로, U는 앞을 왼쪽으로, F는 위를 오른쪽으로", () => {
    expect(rotateVec([0, 0, 1], "x", 1)).toEqual([0, 1, 0]);
    expect(rotateVec([0, 0, 1], "y", 1)).toEqual([-1, 0, 0]);
    expect(rotateVec([0, 1, 0], "z", 1)).toEqual([1, 0, 0]);
    expect(rotateVec([1, 2, 3], "x", 3)).toEqual(
      rotateVec(rotateVec(rotateVec([1, 2, 3], "x", 1), "x", 1), "x", 1),
    );
  });

  it("L={x,n,n,3}은 왼쪽 층만 돈다", () => {
    const L: CubeMove = { axis: "x", from: 3, to: 3, turns: 3 };
    expect(inMove(3, L, [-1, 0, 0])).toBe(true);
    expect(inMove(3, L, [0, 0, 0])).toBe(false);
  });
});

describe("스티커", () => {
  it("면 번호 배열을 읽는 차례: 펼친 그림에서 위 줄부터", () => {
    const faces = Array.from({ length: 6 }, (_, f) =>
      Array.from({ length: 4 }, (_, i) => f * 10 + i),
    );
    const s = stickersFromFaces(2, faces);
    // U의 첫 칸은 뒤-왼쪽, F의 첫 칸은 위-왼쪽, R의 첫 칸은 위-앞쪽
    expect(colorAt(s, [-0.5, 0.5, -0.5], "+y")).toBe(0);
    expect(colorAt(s, [-0.5, 0.5, 0.5], "+z")).toBe(20);
    expect(colorAt(s, [0.5, 0.5, 0.5], "+x")).toBe(10);
    expect(colorAt(s, [0.5, 0.5, -0.5], "-z")).toBe(50);
  });

  it("R 네 번이면 제자리, R 한 번이면 앞 색이 위로 간다", () => {
    const solved = solvedStickers(3);
    let s = solved;
    for (let i = 0; i < 4; i++) s = applyMoveToStickers(3, s, R);
    expect(s).toEqual(solved);
    const once = applyMoveToStickers(3, solved, R);
    expect(colorAt(once, [1, 1, 1], "+y")).toBe(2); // F 초록이 위로
    // U·F도 하나씩
    expect(colorAt(applyMoveToStickers(3, solved, U), [-1, 1, 1], "-x")).toBe(
      2,
    );
    expect(colorAt(applyMoveToStickers(3, solved, F), [1, 1, 1], "+x")).toBe(0);
  });
});
