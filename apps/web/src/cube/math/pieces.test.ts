import {
  centerTwists,
  cornerTwists,
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
  cycleParity,
  invariants,
  invertText,
  orderOf,
  pieceAtSlot,
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

  it("엣지 하나 뒤집기는 못 푼다(뒤집힘 합 홀수)", () => {
    const s = rotatePieceInPlace(3, s0, piece(3, "UF"));
    const v = invariants(3, s);
    expect(v.flipSum).toBe(1);
    expect(v.twistSum).toBe(0);
    expect(v.solvable).toBe(false);
  });

  it("코너 하나 비틀기는 못 푼다, 반대로 하나 더 비틀면 풀린다", () => {
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

  it("조각 둘만 맞바꾸면 못 푼다, 코너 둘·엣지 둘을 함께 바꾸면 풀린다", () => {
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

  it("다른 층 엣지끼리 바꿔도 방향 기준이 맞는다", () => {
    const s = swapPieces(3, s0, piece(3, "UF"), piece(3, "FR"));
    expect(invariants(3, s).flipSum).toBe(0);
    const s2 = swapPieces(3, s0, piece(3, "UFR"), piece(3, "DBL"));
    expect(invariants(3, s2).twistSum % 3).toBe(0);
  });
});

describe("방향과 홀짝 계기", () => {
  // 「방향과 홀짝」 카드: 바깥에서 볼 때 기준 칸이 시계 반대 방향으로 한 칸 옮겨 가 있으면 1, 시계 방향이면 2.
  // R 뒤 UFR에는 노란 칸이 앞(F)에 온다. UFR을 바깥에서 보면 위 → 오른쪽 → 앞이 시계 방향이라 위 → 앞은 시계 반대.
  it("코너 비틀림 1은 기준 칸이 시계 반대 방향으로 한 칸", () => {
    const tw = new Map(
      cornerTwists(3, stateAfter(3, "R")).map((c) => [
        pieceName(3, c.piece),
        c.twist,
      ]),
    );
    expect(tw.get("UFR")).toBe(1);
    // UBR을 바깥에서 보면 위 → 뒤 → 오른쪽이 시계 방향: 흰 칸이 뒤(B)로 가서 2
    expect(tw.get("UBR")).toBe(2);
  });

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

  it("F 한 번은 엣지 넷을 뒤집고 짝을 홀로 바꾼다", () => {
    const v = invariants(3, stateAfter(3, "F"));
    expect(v.flipSum).toBe(4);
    expect(v.cornerParity).toBe(1);
    expect(v.edgeParity).toBe(1);
    expect(v.centerTurnSum % 4).not.toBe(0);
  });

  it("센터 하나만 180° 돌리는 공식", () => {
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
  it("슈퍼플립 공식은 20수이고 모든 엣지만 제자리에서 뒤집는다", () => {
    expect(parseMoves(3, SUPERFLIP)).toHaveLength(20);
    const s = stateAfter(3, SUPERFLIP);
    expect(edgeFlips(3, s).every((e) => e.flip === 1)).toBe(true);
    expect(changedPieces(3, s)).toEqual({ edge: 12 });
    // 엣지는 모두 제자리(뒤집혔을 뿐)
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

  it("R U: 엣지 7-고리, 코너 5-고리(비틀려서 15번)", () => {
    const c = pieceCycles(3, parseMoves(3, "R U"));
    expect(c.find((x) => x.kind === "edge")?.cycles).toEqual([7]);
    expect(c.find((x) => x.kind === "corner")?.cycles).toEqual([5]);
    expect(orderOf(3, parseMoves(3, "R U R U R U R U R U"))).toBe(21);
  });

  it("R U: 코너 블럭 6개가 바뀌고, 5개 고리 밖의 1개는 제자리에서 비틀린다", () => {
    const s = stateAfter(3, "R U");
    expect(changedPieces(3, s).corner).toBe(6);
    const inPlace = cornerTwists(3, s).filter(
      (c) => pieceAtSlot(3, s, c.piece) === c.piece && c.twist !== 0,
    );
    expect(inPlace).toHaveLength(1);
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

  it("R과 U가 함께 움직이는 조각은 3개, 둘이 움직이는 조각은 13개", () => {
    const moved = (alg: string) => {
      const s = stateAfter(3, alg);
      const topo = cubeTopology(3);
      return new Set(
        topo.pieces.flatMap((p, q) =>
          p.kind !== "center" && p.stickers.some((x) => s.perm[x] !== x)
            ? [q]
            : [],
        ),
      );
    };
    const r = moved("R");
    const u = moved("U");
    expect([...r].filter((q) => u.has(q))).toHaveLength(3);
    expect(new Set([...r, ...u]).size).toBe(13);
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

  it("5×5: 가운데 엣지가 있어 3×3 단계 패리티는 없고 짝짓기 때 생긴다", () => {
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

  it("바깥 면 R은 코너 4-고리 하나, 날개는 4-고리 둘(짝)", () => {
    const c = pieceCycles(4, parseMoves(4, "R"));
    expect(c.find((x) => x.kind === "corner")?.cycles).toEqual([4]);
    expect(c.find((x) => x.kind === "wing")?.cycles).toEqual([4, 4]);
  });

  // 「섞는 경우의 수」 4×4 끝말: 코너 블럭의 홀짝은 센터 블럭 자리의 홀짝과 늘 함께 바뀌고, 안쪽 층은 날개 홀짝만 바꾼다
  it("4×4: 층 하나를 돌리면 코너와 센터 블럭의 홀짝이 함께 바뀌고, 안쪽 층은 날개 홀짝만 바꾼다", () => {
    for (const face of ["R", "U", "F", "L", "D", "B"]) {
      for (const alg of [face, `2${face}`]) {
        const by = (k: string) =>
          cycleParity(
            pieceCycles(4, parseMoves(4, alg)).find((c) => c.kind === k)
              ?.cycles ?? [],
          );
        expect(by("corner"), alg).toBe(by("innerCenter"));
        if (alg.startsWith("2")) {
          expect(by("corner"), alg).toBe(0);
          expect(by("wing"), alg).toBe(1);
        }
      }
    }
  });

  // 「섞는 경우의 수」 5×5 자리 홀짝 규칙: 정가운데 센터 블럭을 제자리에 두면 코너와 가운데 엣지 블럭의 홀짝이 같다
  it("5×5: 어느 층을 돌려도(가운데 층은 큐브 방향을 되돌려) 코너와 가운데 엣지 블럭의 홀짝이 같다", () => {
    for (const alg of [
      "R",
      "2R",
      "U 2F' L2 2D",
      "3R x'",
      "R 3R x' U 2B",
      "3U y' F",
    ]) {
      const s = stateAfter(5, alg);
      const v = invariants(5, s);
      expect(changedPieces(5, s).center, alg).toBeUndefined();
      expect(v.cornerParity, alg).toBe(v.edgeParity);
    }
  });

  it("4×4 패리티 공식이 만드는 모양", () => {
    const solved = faceColors(4, solvedCube(4));
    const diff = (alg: string) => {
      const c = faceColors(4, stateAfter(4, alg));
      return c.filter((v, i) => v !== solved[i]).length;
    };
    // OLL 패리티(둘째 공식): 한 엣지 짝만 뒤집힘 = 칸 4개
    expect(diff(PARITY_4X4[0]?.algs[1] as string)).toBe(4);
    // PLL 패리티: 맞은편 두 엣지 짝 맞바꿈 = 옆면 칸 4개
    expect(diff(PARITY_4X4[1]?.algs[0] as string)).toBe(4);
  });
});
