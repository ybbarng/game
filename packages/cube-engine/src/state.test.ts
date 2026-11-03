import { describe, expect, it } from "vitest";
import { cubeDef } from "./def";
import { applyMoves } from "./move";
import { parseMoves } from "./notation";
import { isSolved, solvedCube } from "./state";

const SIZES = [2, 3, 4, 5] as const;

function run(n: number, text: string) {
  return applyMoves(n, solvedCube(n), parseMoves(n, text));
}

describe("맞춤 판정", () => {
  it.each(SIZES.map((n) => [n, n]))("%i×%i 큐브 돌리기만 했으면 맞춤", (n) => {
    for (const text of ["x", "y'", "z2", "x y", "x2 z'", "y z x'"]) {
      expect(isSolved(n, run(n, text))).toBe(true);
      expect(isSolved(n, run(n, text), { orientCenters: true })).toBe(true);
    }
  });

  it.each(SIZES.map((n) => [n, n]))(
    "%i×%i 큐브를 돌린 채 섞고 풀면 맞춤",
    (n) => {
      // 큐브를 돌린 뒤 같은 물리적 면을 돌려 되돌린다: x 뒤의 U = 원래 F
      const s = run(n, "x U R U' R' x' R F R' F'");
      expect(isSolved(n, s)).toBe(true);
      expect(isSolved(n, run(n, "x U R"))).toBe(false);
    },
  );

  it("4×4 넓게 돌리기로 같은 모양이 되면 맞춤", () => {
    // Rw 와 Lw x 는 같은 결과
    expect(isSolved(4, run(4, "Rw Lw' x'"))).toBe(true);
    expect(isSolved(4, run(4, "Rw L' x'"))).toBe(false);
  });

  it("가운데 방향: 3×3 U 네 번 = 맞춤, 가운데만 돈 상태는 보통 판정으로만 맞춤", () => {
    expect(isSolved(3, run(3, "U U U U"), { orientCenters: true })).toBe(true);
    // 스티커 자리는 모두 맞고 윗면 가운데(자리 4)만 90° 돈 상태
    const twist = new Uint8Array(54);
    twist[4] = 1;
    const twisted = { perm: solvedCube(3).perm, twist };
    expect(isSolved(3, twisted)).toBe(true);
    expect(isSolved(3, twisted, { orientCenters: true })).toBe(false);
  });
});

describe("퍼즐 공통 계약", () => {
  it("cubeDef 로 섞고 거꾸로 풀면 맞춤", () => {
    const def = cubeDef(4);
    expect(def.id).toBe("cube4");
    expect(def.stickerCount).toBe(96);
    const moves = def.parse("Rw U2 3Fw' x");
    let s = def.solved();
    for (const m of moves) s = def.apply(s, m);
    expect(def.isSolved(s)).toBe(false);
    for (const m of def.invert(moves)) s = def.apply(s, m);
    expect(def.isSolved(s, { orientCenters: true })).toBe(true);
    expect(def.format(moves)).toBe("Rw U2 3Fw' x");
    expect(def.geometry.move(moves[0] as never).pieces).toHaveLength(28);
  });
});
