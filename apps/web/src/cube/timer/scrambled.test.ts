import { faceColors, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { backSideState, scrambledState } from "./scrambled";

/** 면 번호 차례 U R F D L B */
const U = 0;
const R = 1;
const F = 2;
const D = 3;
const L = 4;
const B = 5;

describe("섞기 그림", () => {
  it("뒤쪽 그림은 위에 아래(D), 앞에 왼쪽(L), 오른쪽에 뒤(B)를 보인다", () => {
    for (const n of [2, 3, 4, 5]) {
      const colors = faceColors(n, backSideState(n, solvedCube(n)));
      // 면마다 한 칸(맞춘 큐브라 면 전체가 같은 색)
      const at = (face: number) => colors[face * n * n];
      expect([at(U), at(F), at(R)]).toEqual([D, L, B]);
    }
  });

  it("앞·뒤 그림의 위·앞·오른쪽을 합치면 여섯 면 모두 나온다(섞기 그대로)", () => {
    const n = 3;
    const state = scrambledState(n, "R U R' U' F2 D L' B");
    const front = faceColors(n, state);
    const back = faceColors(n, backSideState(n, state));
    const shown = [U, F, R].flatMap((f) => [
      ...front.slice(f * 9, f * 9 + 9),
      ...back.slice(f * 9, f * 9 + 9),
    ]);
    // 색마다 9장씩, 모두 54장
    for (let c = 0; c < 6; c++)
      expect(shown.filter((x) => x === c)).toHaveLength(9);
  });
});
