import {
  centerTwists,
  cubeTopology,
  edgeFlips,
  faceColors,
  isSolvable,
  parseMoves,
  pieceName,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { PARITY_4X4 } from "../learn/algs-big";
import {
  CENTER_HALF_TURN,
  COMMUTATOR_EXAMPLES,
  ORDER_PRESETS,
  SUPERFLIP,
} from "./examples";
import {
  changedPieces,
  commutator,
  invariants,
  invertText,
  orderOf,
  pieceCycles,
  rotatePieceInPlace,
  stateAfter,
  swapPieces,
} from "./pieces";
import { sizeFacts } from "./sizes";

const piece = (n: number, name: string) => {
  const i = cubeTopology(n).pieces.findIndex(
    (_, q) => pieceName(n, q) === name,
  );
  if (i < 0) throw new Error(name);
  return i;
};

describe("뽑아서 다시 끼우기", () => {
  const s0 = solvedCube(3);

  it("모서리 하나 뒤집기는 못 푼다(뒤집힘 합 홀수)", () => {
    const s = rotatePieceInPlace(3, s0, piece(3, "UF"));
    const v = invariants(3, s);
    expect(v.flipSum).toBe(1);
    expect(v.twistSum).toBe(0);
    expect(v.solvable).toBe(false);
  });

  it("꼭짓점 하나 비틀기는 못 푼다, 반대로 하나 더 비틀면 풀린다", () => {
    const a = rotatePieceInPlace(3, s0, piece(3, "UFR"));
    expect(invariants(3, a).twistSum % 3).not.toBe(0);
    expect(invariants(3, a).solvable).toBe(false);
    const b = rotatePieceInPlace(3, a, piece(3, "UFL"), 2);
    expect(invariants(3, b).twistSum % 3).toBe(0);
    expect(invariants(3, b).solvable).toBe(true);
  });

  it("비틀기 두 번은 반대 방향 한 번과 같다", () => {
    const q = piece(3, "DBL");
    const twice = rotatePieceInPlace(3, rotatePieceInPlace(3, s0, q), q);
    expect(rotatePieceInPlace(3, s0, q, 2).perm).toEqual(twice.perm);
    expect(rotatePieceInPlace(3, twice, q).perm).toEqual(s0.perm);
  });

  it("조각 둘만 맞바꾸면 못 푼다, 꼭짓점 둘·모서리 둘을 함께 바꾸면 풀린다", () => {
    const e = swapPieces(3, s0, piece(3, "UF"), piece(3, "UR"));
    const ve = invariants(3, e);
    expect([ve.edgeParity, ve.cornerParity, ve.flipSum]).toEqual([1, 0, 0]);
    expect(ve.solvable).toBe(false);
    const c = swapPieces(3, s0, piece(3, "UFR"), piece(3, "UBR"));
    expect(invariants(3, c).twistSum % 3).toBe(0);
    expect(invariants(3, c).solvable).toBe(false);
    const both = swapPieces(3, e, piece(3, "UFR"), piece(3, "UBR"));
    expect(invariants(3, both).solvable).toBe(true);
  });

  it("다른 층 모서리끼리 바꿔도 방향 기준이 맞는다", () => {
    const s = swapPieces(3, s0, piece(3, "UF"), piece(3, "FR"));
    expect(invariants(3, s).flipSum).toBe(0);
    const s2 = swapPieces(3, s0, piece(3, "UFR"), piece(3, "DBL"));
    expect(invariants(3, s2).twistSum % 3).toBe(0);
  });
});

describe("방향과 짝 계기", () => {
  it("면 돌리기를 아무리 해도 규칙이 지켜진다", () => {
    const algs = ["R", "F", "R U F' D2 L B'", "U R2 F' D L' B2 U' R F2"];
    for (const alg of algs) {
      const v = invariants(3, stateAfter(3, alg));
      expect(v.twistSum % 3).toBe(0);
      expect(v.flipSum % 2).toBe(0);
      expect(v.cornerParity).toBe(v.edgeParity);
      expect(v.centerTurnSum % 2).toBe(v.cornerParity);
    }
  });

  it("F 한 번은 모서리 넷을 뒤집고 짝을 홀로 바꾼다", () => {
    const v = invariants(3, stateAfter(3, "F"));
    expect(v.flipSum).toBe(4);
    expect(v.cornerParity).toBe(1);
    expect(v.edgeParity).toBe(1);
    expect(v.centerTurnSum % 4).not.toBe(0);
  });

  it("가운데 하나만 180° 돌리는 공식", () => {
    const s = stateAfter(3, CENTER_HALF_TURN);
    const topo = cubeTopology(3);
    // 색 자리는 모두 맞다
    expect(Array.from(faceColors(3, s))).toEqual(
      Array.from(faceColors(3, solvedCube(3))),
    );
    expect(Array.from(s.perm)).toEqual(Array.from(solvedCube(3).perm));
    const turns = centerTwists(3, s).map((c) => c.twist);
    expect(turns.filter((t) => t !== 0)).toEqual([2]);
    const u = centerTwists(3, s).find(
      (c) =>
        topo.stickers[topo.pieces[c.piece]?.stickers[0] as number]?.face === 0,
    );
    expect(u?.twist).toBe(2);
  });
});

describe("신의 수", () => {
  it("슈퍼플립 공식은 20수이고 모든 모서리만 제자리에서 뒤집는다", () => {
    expect(parseMoves(3, SUPERFLIP)).toHaveLength(20);
    const s = stateAfter(3, SUPERFLIP);
    expect(edgeFlips(3, s).every((e) => e.flip === 1)).toBe(true);
    expect(changedPieces(3, s)).toEqual({ edge: 12 });
    // 모서리는 모두 제자리(뒤집혔을 뿐)
    const cycles = pieceCycles(3, parseMoves(3, SUPERFLIP));
    for (const c of cycles) expect(c.cycles).toEqual([]);
    expect(isSolvable(3, s)).toBe(true);
  });
});

describe("되풀이하면 돌아온다", () => {
  it("알려진 차수", () => {
    expect(orderOf(3, parseMoves(3, "R U R' U'"))).toBe(6);
    expect(orderOf(3, parseMoves(3, "R U"))).toBe(105);
    expect(orderOf(3, parseMoves(3, "R"))).toBe(4);
    expect(orderOf(3, parseMoves(3, "R2 U2"))).toBe(6);
    expect(orderOf(3, parseMoves(3, "R U2 D' B D'"))).toBe(1260);
    expect(orderOf(3, parseMoves(3, SUPERFLIP))).toBe(2);
  });

  it("미리 고른 묶음의 차수가 표와 같다", () => {
    for (const p of ORDER_PRESETS) {
      expect(orderOf(3, parseMoves(3, p.alg))).toBe(p.order);
    }
  });

  it("차수만큼 되풀이하면 맞춘 상태로 돌아온다", () => {
    const one = "R U R' U' ";
    expect(Array.from(stateAfter(3, one.repeat(6)).perm)).toEqual(
      Array.from(solvedCube(3).perm),
    );
    expect(Array.from(stateAfter(3, one.repeat(3)).perm)).not.toEqual(
      Array.from(solvedCube(3).perm),
    );
  });
});

describe("교환자", () => {
  it("거꾸로 글", () => {
    expect(invertText("R U2 F'")).toBe("F U2' R'".replace("U2'", "U2"));
    expect(commutator("R", "U")).toBe("R U R' U'");
  });

  it("예시의 바뀐 조각 수가 표와 같다", () => {
    for (const ex of COMMUTATOR_EXAMPLES) {
      const changed = changedPieces(3, stateAfter(3, commutator(ex.a, ex.b)));
      expect({ ...changed, center: undefined }).toEqual({
        ...ex.changed,
        center: undefined,
      });
    }
  });

  it("서로 안 닿는 두 면은 교환자가 아무것도 안 바꾼다", () => {
    expect(changedPieces(3, stateAfter(3, commutator("R", "L")))).toEqual({});
  });
});

describe("크기와 패리티", () => {
  it("4×4: 날개 고리 하나, 안쪽 한 층은 날개 4개 한 고리(홀)", () => {
    const f = sizeFacts(4);
    expect(f.wingOrbits).toBe(1);
    expect(f.midges).toBe(false);
    expect(f.slices).toEqual([
      { move: "2R", wings: [[4]], midges: [], corners: [] },
    ]);
    expect([f.ollParity, f.pllParity, f.pairingParity]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("5×5: 가운데 모서리가 있어 3×3 단계 패리티는 없고 짝짓기 때 생긴다", () => {
    const f = sizeFacts(5);
    expect(f.wingOrbits).toBe(1);
    expect(f.midges).toBe(true);
    expect(f.slices[0]?.wings).toEqual([[4]]);
    expect([f.ollParity, f.pllParity, f.pairingParity]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("6×6·7×7: 날개 고리 둘, 층마다 한 고리만 홀로 바뀐다", () => {
    for (const n of [6, 7]) {
      const f = sizeFacts(n);
      expect(f.wingOrbits).toBe(2);
      expect(f.midges).toBe(n === 7);
      expect(f.slices.map((s) => s.wings.map((w) => w.length))).toEqual([
        [1, 0],
        [0, 1],
      ]);
      for (const s of f.slices) expect(s.corners).toEqual([]);
    }
  });

  it("바깥 면 R은 꼭짓점 4-고리 하나, 날개는 4-고리 둘(짝)", () => {
    const c = pieceCycles(4, parseMoves(4, "R"));
    expect(c.find((x) => x.kind === "corner")?.cycles).toEqual([4]);
    expect(c.find((x) => x.kind === "wing")?.cycles).toEqual([4, 4]);
  });

  it("4×4 패리티 공식이 만드는 모양", () => {
    const solved = faceColors(4, solvedCube(4));
    const diff = (alg: string) => {
      const c = faceColors(4, stateAfter(4, alg));
      return c.filter((v, i) => v !== solved[i]).length;
    };
    // OLL 패리티(둘째 공식): 한 모서리 짝만 뒤집힘 = 칸 4개
    expect(diff(PARITY_4X4[0]?.algs[1] as string)).toBe(4);
    // PLL 패리티: 맞은편 두 모서리 짝 맞바꿈 = 옆면 칸 4개
    expect(diff(PARITY_4X4[1]?.algs[0] as string)).toBe(4);
  });
});
