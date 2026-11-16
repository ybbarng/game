import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { createRng, nextInt } from "@game/mighty-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { goalMet } from "../learn/judge";
import { applyToLocation, crossDepth, MOVE_COUNT, moveName } from "./solver";
import {
  applyToCorner,
  CORNER_LOCATIONS,
  ROTATIONS,
  rotateCorner,
  rotateLocation,
  solveXCross,
} from "./xcross";

const apply = (s: PuzzleState, text: string) =>
  text.trim() ? applyMoves(3, s, parseMoves(3, text)) : s;

function randomMoves(seed: number, length: number): string {
  const rng = createRng(seed);
  const out: string[] = [];
  let last = -1;
  while (out.length < length) {
    const m = nextInt(rng, MOVE_COUNT);
    if (Math.floor(m / 3) === last) continue;
    last = Math.floor(m / 3);
    out.push(moveName(m));
  }
  return out.join(" ");
}

/**
 * 표와 상관없이 스티커 색으로 본 X십자: 색 x가 든 엣지 넷, 그리고 x가 든 코너 하나와 그 코너의 다른 두 색 엣지가
 * 모두 제자리·바른 방향(스티커마다 그 면 센터 색)
 */
function xcrossDone(state: PuzzleState, x: number): boolean {
  const topo = cubeTopology(3);
  const colors = faceColors(3, state);
  const center = new Array<number>(6);
  for (const p of topo.pieces)
    if (p.kind === "center") {
      const s = p.stickers[0] as number;
      center[topo.stickers[s]?.face as number] = colors[s] as number;
    }
  const ok = (p: (typeof topo.pieces)[number]) =>
    p.stickers.every(
      (s) => colors[s] === center[topo.stickers[s]?.face as number],
    );
  const has = (p: (typeof topo.pieces)[number]) =>
    p.stickers.map((s) => colors[s] as number);
  const crossEdges = topo.pieces.filter(
    (p) => p.kind === "edge" && has(p).includes(x),
  );
  if (!crossEdges.every(ok)) return false;
  return topo.pieces.some((c) => {
    if (c.kind !== "corner" || !has(c).includes(x) || !ok(c)) return false;
    const pair = has(c).filter((k) => k !== x);
    const edge = topo.pieces.find(
      (e) =>
        e.kind === "edge" &&
        pair.every((k) => has(e).includes(k)) &&
        e.stickers.length === 2,
    );
    return !!edge && ok(edge);
  });
}

/** 길이 `len`인 모든 수(같은 면 잇달아 없이)로 X십자가 되는지 */
function anyOfLength(state: PuzzleState, x: number, len: number): boolean {
  const rec = (s: PuzzleState, left: number, last: number): boolean => {
    if (left === 0) return xcrossDone(s, x);
    for (let m = 0; m < MOVE_COUNT; m++) {
      if (Math.floor(m / 3) === last) continue;
      if (rec(apply(s, moveName(m)), left - 1, Math.floor(m / 3))) return true;
    }
    return false;
  };
  return rec(state, len, -1);
}

describe("X십자 상태 옮기기", () => {
  it("큐브 돌리기는 서로 다른 24가지", () => {
    expect(new Set(ROTATIONS.map((s) => s.join())).size).toBe(24);
  });

  it("코너 스티커 자리는 24곳이고 수 하나는 그 자리를 서로 바꾼다", () => {
    expect(CORNER_LOCATIONS).toHaveLength(24);
    for (let m = 0; m < MOVE_COUNT; m++) {
      const to = CORNER_LOCATIONS.map((_, i) => applyToCorner(m, i));
      expect(new Set(to).size).toBe(24);
    }
  });

  it("돌려 쥔 뒤 수를 두는 것과 수를 둔 뒤 돌려 쥐는 것이 같은 자리가 된다", () => {
    for (const sigma of ROTATIONS)
      for (let m = 0; m < MOVE_COUNT; m++) {
        const mm = (sigma[Math.floor(m / 3)] as number) * 3 + (m % 3);
        for (let i = 0; i < 24; i++) {
          expect(rotateLocation(sigma, applyToLocation(m, i))).toBe(
            applyToLocation(mm, rotateLocation(sigma, i)),
          );
          expect(rotateCorner(sigma, applyToCorner(m, i))).toBe(
            applyToCorner(mm, rotateCorner(sigma, i)),
          );
        }
      }
  });
});

describe("X십자 최적 풀이", () => {
  it("맞춘 큐브는 모든 색이 0수", () => {
    for (let x = 0; x < 6; x++)
      expect(solveXCross(solvedCube(3), x).depth).toBe(0);
  });

  it("짝 하나만 빼내면 남은 칸 셋 가운데 하나로 이미 X십자라 0수", () => {
    // 흰 면 아래 쥐고 앞-오른쪽 칸 짝을 빼냈다
    const s = apply(solvedCube(3), "z2 R U' R'");
    const r = solveXCross(s, 0);
    expect(r.depth).toBe(0);
    expect(r.solutions[0]?.moves).toEqual([]);
  });

  it("짝 넷을 모두 흐트러뜨리면 십자보다 길고, 내놓은 해는 그 길이로 X십자를 만든다", () => {
    const s = apply(solvedCube(3), "z2 R U R' L' U' L R' U' R L U L'");
    const r = solveXCross(s, 0);
    expect(r.depth).toBeGreaterThan(crossDepth(s, 0));
    for (const sol of r.solutions) {
      expect(sol.moves).toHaveLength(r.depth);
      const after = apply(s, sol.moves.join(" "));
      expect(xcrossDone(after, 0)).toBe(true);
      // 흰 면 아래 쥔 방향이라 배우기 목표 「십자」·「칸 짝」으로도 맞다
      expect(goalMet(3, after, "cross")).toBe(true);
      expect(
        (["FR", "FL", "BR", "BL"] as const).some((k) =>
          goalMet(3, after, `f2l-pair:${k}`),
        ),
      ).toBe(true);
    }
  });

  it.each([1, 2, 3])(
    "짧은 섞기(씨앗 %i): 해는 X십자를 만들고, 그보다 한 수 짧은 수로는 어느 칸도 안 된다",
    (seed) => {
      const s = apply(solvedCube(3), randomMoves(seed, 5));
      for (const x of [0, 3]) {
        const r = solveXCross(s, x);
        expect(r.depth).toBeLessThanOrEqual(5);
        expect(r.depth).toBeGreaterThanOrEqual(crossDepth(s, x));
        const first = r.solutions[0];
        expect(first).toBeDefined();
        expect(xcrossDone(apply(s, first?.moves.join(" ") ?? ""), x)).toBe(
          true,
        );
        if (r.depth > 0) expect(anyOfLength(s, x, r.depth - 1)).toBe(false);
      }
    },
  );

  it("대회 길이 섞기: 모든 색에서 해가 X십자를 만들고 짝 색은 십자 색의 옆 색", () => {
    const s = apply(
      solvedCube(3),
      "D2 F2 U' B2 L2 D B2 U2 R2 U' F' L' D' F2 R' U2 B L F' D'",
    );
    for (let x = 0; x < 6; x++) {
      const r = solveXCross(s, x, { limit: 2 });
      expect(r.depth).toBeGreaterThanOrEqual(crossDepth(s, x));
      expect(r.depth).toBeLessThanOrEqual(11);
      for (const sol of r.solutions) {
        expect(xcrossDone(apply(s, sol.moves.join(" ")), x)).toBe(true);
        expect(sol.pair).not.toContain(x);
        expect(sol.pair).not.toContain((x + 3) % 6);
      }
    }
  });
});
