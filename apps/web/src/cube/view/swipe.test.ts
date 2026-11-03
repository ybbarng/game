import { formatMove } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import type { Vec3 } from "./geometry";
import { cellOfPoint, type SwipeHit, swipeToMove } from "./swipe";

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];
const RIGHT: Vec3 = [1, 0, 0];
const LEFT: Vec3 = [-1, 0, 0];
const TOWARD_FRONT: Vec3 = [0, 0, 1];

/** 밀기 → 표기(엔진 표기로 확인한다) */
function notation(
  n: number,
  hit: SwipeHit | null,
  swipe: Vec3,
  toward: Vec3 = TOWARD_FRONT,
): string | null {
  const m = swipeToMove(n, hit, swipe, toward);
  return m ? formatMove(n, m) : null;
}

describe("cellOfPoint", () => {
  it("앞면 오른쪽 위 칸", () => {
    expect(cellOfPoint(3, [1.2, 1.3, 1.5])).toEqual({
      center: [1, 1, 1],
      normal: "+z",
    });
  });
  it("윗면 가운데, 짝수 큐브의 칸", () => {
    expect(cellOfPoint(3, [0.1, 1.5, -0.2])).toEqual({
      center: [0, 1, 0],
      normal: "+y",
    });
    expect(cellOfPoint(4, [-1.9, 0.3, 2])).toEqual({
      center: [-1.5, 0.5, 1.5],
      normal: "+z",
    });
  });
  it("모서리 끝의 점도 큐브 안 칸으로 자른다", () => {
    expect(cellOfPoint(3, [1.5, -1.5, 1.6]).center).toEqual([1, -1, 1]);
  });
});

describe("swipeToMove: 칸 위를 밀면 그 층이 민 방향으로", () => {
  const front = (x: number, y: number): SwipeHit => ({
    center: [x, y, 1],
    normal: "+z",
  });
  it("앞면 오른쪽 줄을 위로 밀면 R, 아래로 밀면 R'", () => {
    expect(notation(3, front(1, 0), UP)).toBe("R");
    expect(notation(3, front(1, -1), DOWN)).toBe("R'");
  });
  it("앞면 왼쪽 줄을 아래로 밀면 L, 가운데 줄은 M", () => {
    expect(notation(3, front(-1, 1), DOWN)).toBe("L");
    expect(notation(3, front(0, 0), DOWN)).toBe("M");
  });
  it("앞면 맨 위 줄을 왼쪽으로 밀면 U, 맨 아래 줄을 오른쪽으로 밀면 D", () => {
    expect(notation(3, front(0, 1), LEFT)).toBe("U");
    expect(notation(3, front(1, -1), RIGHT)).toBe("D");
  });
  it("비스듬히 밀면 면 위의 더 큰 쪽을 고르고, 면을 뚫는 성분은 버린다", () => {
    expect(notation(3, front(1, 0), [0.3, 1, 5])).toBe("R");
    expect(notation(3, front(1, 1), [-1, 0.4, -3])).toBe("U");
  });
  it("윗면을 앞으로 당기면 그 줄이 앞으로(R'), 오른쪽 면을 위로 밀면 F'", () => {
    const top: SwipeHit = { center: [1, 1, 0], normal: "+y" };
    expect(notation(3, top, [0, 0, 1])).toBe("R'");
    const right: SwipeHit = { center: [1, 0, 1], normal: "+x" };
    expect(notation(3, right, UP)).toBe("F'");
  });
  it("4×4 안쪽 층은 2R 같은 한 층 수", () => {
    const hit: SwipeHit = { center: [0.5, 0.5, 1.5], normal: "+z" };
    expect(notation(4, hit, UP)).toBe("2R");
  });
  it("면 위로 움직임이 없으면 수가 없다", () => {
    expect(notation(3, front(1, 1), [0, 0, 1])).toBeNull();
  });
});

describe("swipeToMove: 빈 곳을 밀면 큐브 전체", () => {
  it("앞에서 보고 오른쪽으로 밀면 y', 위로 밀면 x", () => {
    expect(notation(3, null, RIGHT)).toBe("y'");
    expect(notation(3, null, LEFT)).toBe("y");
    expect(notation(3, null, UP)).toBe("x");
    expect(notation(3, null, DOWN)).toBe("x'");
  });
  it("위에서 내려다보며 오른쪽으로 밀면 윗면이 오른쪽으로 가는 z", () => {
    expect(notation(3, null, RIGHT, [0, 1, 0])).toBe("z");
  });
  it("비스듬히 보아도 가장 가까운 축으로", () => {
    const toward: Vec3 = [0.5, 0.45, 0.74];
    expect(notation(3, null, [0.83, 0, -0.56], toward)).toBe("y'");
  });
});
