import {
  applyMoves,
  parseMoves,
  solvedCube,
  stageMask,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { stickersFromState } from "./bridge";
import { notationToMove } from "./input/actions";
import {
  applyMoveToStickers,
  solvedStickers,
  stickersFromFaces,
} from "./view/geometry";
import type { Sticker } from "./view/types";

/** 자리(조각 중심 + 방향)마다 색. 두 쪽 목록의 차례가 달라도 비교할 수 있게 */
function byPlace(stickers: readonly Sticker[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const s of stickers)
    out.set(`${s.center.map((v) => v * 2).join(",")}${s.normal}`, s.color);
  return out;
}

const ALGS: Record<number, string[]> = {
  2: ["R U F", "R U2 F' x y' z2", "L' D B2"],
  3: ["R U F", "R U R' U' M E' S2 x y z'", "Rw Uw' Fw2 L D B"],
  4: ["R U F", "Rw 2R' Uw2 3Fw L' D B x", "r u' f2"],
  5: ["R U F", "3Rw 2U' M S E2 Bw' y", "2L 3D' 3F2"],
};

describe("엔진 ↔ 3D 장면", () => {
  for (const [nText, algs] of Object.entries(ALGS)) {
    const n = Number(nText);
    for (const alg of algs) {
      it(`${n}×${n} ${alg}: 엔진 색 = 장면이 따라 돈 색`, () => {
        const moves = parseMoves(n, alg);
        const state = applyMoves(n, solvedCube(n), moves);
        let view = solvedStickers(n);
        for (const m of moves) view = applyMoveToStickers(n, view, m);
        expect(byPlace(stickersFromState(n, state))).toEqual(byPlace(view));
      });
    }
  }

  it("맞춘 상태는 장면의 맞춘 스티커와 같다(면 번호 차례·칸 차례가 같다)", () => {
    for (const n of [2, 3, 4, 5, 6, 7])
      expect(byPlace(stickersFromState(n, solvedCube(n)))).toEqual(
        byPlace(solvedStickers(n)),
      );
  });

  it("엔진의 자리 번호(면 × n² + 줄 × n + 칸)와 장면의 펼친 그림 차례가 같다", () => {
    const n = 3;
    const state = applyMoves(n, solvedCube(n), parseMoves(n, "R U F' D2"));
    const s = stickersFromState(n, state);
    const faces = Array.from({ length: 6 }, (_, f) =>
      s.slice(f * 9, f * 9 + 9).map((x) => x.color),
    );
    expect(byPlace(stickersFromFaces(n, faces))).toEqual(byPlace(s));
  });

  it("조작의 표기 읽기와 엔진의 표기 읽기가 같은 수를 낸다", () => {
    const cases: [number, string[]][] = [
      [2, ["R", "L'", "U2", "D", "F'", "B", "x", "y'", "z2"]],
      [3, ["R", "Rw'", "r", "M", "E'", "S2", "x'", "Lw2", "b"]],
      [4, ["2R", "3Rw'", "Rw", "r2", "2L'", "3Uw", "Dw'", "y"]],
      [5, ["3R", "3Rw2", "2B'", "M'", "E", "S", "Fw"]],
      [7, ["4R", "4Rw'", "3Lw", "2D2", "M"]],
    ];
    for (const [n, list] of cases)
      for (const text of list)
        expect(notationToMove(n, text), `${n} ${text}`).toEqual(
          parseMoves(n, text)[0],
        );
  });

  it("가리기: 모두 까맣게면 모든 스티커의 색이 null", () => {
    const n = 3;
    const state = applyMoves(n, solvedCube(n), parseMoves(n, "R U"));
    const s = stickersFromState(n, state, stageMask(n, "all-hidden"));
    expect(s.every((x) => x.color === null)).toBe(true);
    expect(s).toHaveLength(54);
  });
});
