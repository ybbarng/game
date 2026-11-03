import { statesEqual } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { applyMoves, invertMoves, moveGeometry } from "./move";
import { parseMoves } from "./notation";
import { faceColors, isSolved, solvedCube } from "./state";
import { cubeTopology, F, L, R, stickerGeometry, U } from "./topology";

const SIZES = [2, 3, 4, 5] as const;

function run(n: number, text: string) {
  return applyMoves(n, solvedCube(n), parseMoves(n, text));
}

/** 면 f 의 줄 r 칸 c 에 보이는 색 */
function colorAt(n: number, text: string, f: number, r: number, c: number) {
  return faceColors(n, run(n, text))[f * n * n + r * n + c];
}

describe("생김새", () => {
  it.each(SIZES)("%i×%i 조각 수와 궤도", (n) => {
    const t = cubeTopology(n);
    expect(t.stickers).toHaveLength(6 * n * n);
    // 겉에 보이는 조각 수 = n³ - (n-2)³
    expect(t.pieces).toHaveLength(n ** 3 - (n - 2) ** 3);
    const total = t.orbits.reduce((s, o) => s + o.pieces.length, 0);
    expect(total).toBe(t.pieces.length);
  });
});

describe("3D 좌표", () => {
  it("조각 중심은 원점 가운데·간격 1, 스티커는 표면 위", () => {
    const g2 = stickerGeometry(2);
    expect(g2[0]).toMatchObject({
      face: U,
      center: [-0.5, 0.5, -0.5],
      position: [-0.5, 1, -0.5],
      axis: "y",
      sign: 1,
    });
    const g3 = stickerGeometry(3);
    // R 면 가운데 줄 첫 칸(앞쪽)
    expect(g3[R * 9 + 3]).toMatchObject({
      center: [1, 0, 1],
      position: [1.5, 0, 1],
      axis: "x",
      sign: 1,
    });
    // B 면 왼쪽 위(바깥에서 볼 때) = 오른쪽 위 뒤 꼭짓점
    expect(g3[5 * 9]?.center).toEqual([1, 1, -1]);
    expect(stickerGeometry(4).map((s) => s.center[0])).toContain(1.5);
  });
});

describe("수 적용", () => {
  it.each(SIZES)("%i×%i 모든 층의 수를 4번 돌리면 제자리", (n) => {
    for (const axis of ["x", "y", "z"] as const) {
      for (let l = 1; l <= n; l++) {
        const m = { axis, from: l, to: l, turns: 1 } as const;
        const s = applyMoves(n, solvedCube(n), [m, m, m, m]);
        expect(statesEqual(s, solvedCube(n))).toBe(true);
      }
    }
  });

  it.each(SIZES)("%i×%i R U R' U' 6번은 제자리", (n) => {
    const s = run(n, "R U R' U' ".repeat(6));
    expect(statesEqual(s, solvedCube(n))).toBe(true);
  });

  it("R은 앞면 오른쪽 줄을 위로 올린다", () => {
    // R 뒤 위 면 오른쪽 줄은 초록(앞에서 올라온 것)
    expect(colorAt(3, "R", U, 0, 2)).toBe(F);
    // U 뒤 앞면 윗줄은 오른쪽 면 색
    expect(colorAt(3, "U", F, 0, 0)).toBe(R);
    // F 뒤 오른쪽 면 왼쪽 줄은 위 면 색
    expect(colorAt(3, "F", R, 0, 0)).toBe(U);
    // L 은 위 면 왼쪽 줄을 앞으로 내린다 → 앞면 왼쪽 줄은 위 면 색
    expect(colorAt(3, "L", F, 1, 0)).toBe(U);
    // M 은 L 방향
    expect(colorAt(3, "M", F, 1, 1)).toBe(U);
  });

  it.each(SIZES)("%i×%i 거꾸로 수열을 이어 두면 제자리", (n) => {
    const moves = parseMoves(n, "R U2 F' Lw D B2 x y' Rw' z");
    const s = applyMoves(
      n,
      applyMoves(n, solvedCube(n), moves),
      invertMoves(moves),
    );
    expect(statesEqual(s, solvedCube(n))).toBe(true);
    expect(isSolved(n, applyMoves(n, solvedCube(n), moves))).toBe(false);
  });

  it("넓게 돌리기 = 바깥층 + 안쪽 층", () => {
    expect(statesEqual(run(4, "Rw"), run(4, "R 2R"))).toBe(true);
    expect(statesEqual(run(5, "3Rw2"), run(5, "R2 2R2 3R2"))).toBe(true);
    expect(statesEqual(run(5, "r"), run(5, "Rw"))).toBe(true);
    expect(statesEqual(run(3, "M"), run(3, "2L"))).toBe(true);
    expect(statesEqual(run(5, "2-3Rw"), run(5, "2R 3R"))).toBe(true);
  });

  it("큐브 돌리기 = 모든 층", () => {
    expect(statesEqual(run(3, "x"), run(3, "R M' L'"))).toBe(true);
    expect(statesEqual(run(4, "y"), run(4, "U 2U 2D' D'"))).toBe(true);
    expect(statesEqual(run(2, "z"), run(2, "F B'"))).toBe(true);
    expect(statesEqual(run(2, "Rw"), run(2, "x"))).toBe(true);
  });

  it("그리기 정보: 움직이는 조각과 각도", () => {
    const g = moveGeometry(3, parseMoves(3, "R")[0] as never);
    expect(g.pieces).toHaveLength(9);
    expect(g.axis).toEqual([1, 0, 0]);
    expect(g.angle).toBeCloseTo(-Math.PI / 2);
    const g2 = moveGeometry(4, parseMoves(4, "Lw'")[0] as never);
    expect(g2.pieces).toHaveLength(16 + 12);
    expect(g2.angle).toBeCloseTo(-Math.PI / 2);
    expect(moveGeometry(3, parseMoves(3, "x")[0] as never).pieces).toHaveLength(
      26,
    );
  });

  it("방향(twist): 가운데는 U 4번 뒤 제자리, U 한 번 뒤 1 돈다", () => {
    const center = 4; // 3×3 U 면 가운데
    expect(run(3, "U").twist[center]).toBe(3);
    expect(run(3, "U'").twist[center]).toBe(1);
    expect(run(3, "U2").twist[center]).toBe(2);
    // 큐브를 돌려도 같은 면 위 스티커들은 같이 돈다
    const s = run(3, "x");
    const lFace = L * 9;
    const tw = [...s.twist.slice(lFace, lFace + 9)];
    expect(new Set(tw).size).toBe(1);
  });
});
