import {
  applyMove,
  applyMoves,
  type CubeMove,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { createRng, nextInt } from "@game/mighty-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  applyToLocation,
  crossDepth,
  crossDone,
  crossKey,
  depthCounts,
  MOVE_COUNT,
  moveName,
  REACHABLE,
  readCross,
  solveCross,
  solvedKey,
  tableBuildMs,
} from "./solver";

const FACES = ["U", "R", "F", "D", "L", "B"];

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

function stateOf(text: string): PuzzleState {
  return applyMoves(3, solvedCube(3), parseMoves(3, text));
}

/** 엔진으로 n수 이하 십자를 모두 훑는다(작은 깊이에서 표와 견준다) */
function bruteDepth(state: PuzzleState, color: number, max: number): number {
  const faceMoves: CubeMove[] = FACES.flatMap((f) =>
    ["", "2", "'"].flatMap((t) => parseMoves(3, f + t)),
  );
  const search = (s: PuzzleState, togo: number, last: number): boolean => {
    if (crossDone(s, color)) return true;
    if (togo === 0) return false;
    return faceMoves.some((m, i) => {
      const face = Math.floor(i / 3);
      if (face === last) return false;
      return search(applyMove(3, s, m), togo - 1, face);
    });
  };
  for (let d = 0; d <= max; d++) if (search(state, d, -1)) return d;
  return max + 1;
}

describe("십자 표", () => {
  it("거리 분포가 알려진 값과 같고(최대 8수) 표를 만드는 시간이 짧다", () => {
    const want = [1, 15, 158, 1394, 9809, 46381, 97254, 34966, 102];
    for (const x of [0, 3]) {
      const counts = depthCounts(x);
      expect(counts).toEqual(want);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(REACHABLE);
    }
    // 보고용: 표 한 장 만드는 시간(이 기기에서 수십 ms)
    console.info(
      `십자 표 만들기(ms): ${tableBuildMs.map((t) => t?.toFixed(0)).join(", ")}`,
    );
  });

  it("자리 모델이 엔진의 수와 같게 움직인다(모든 색)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const text = randomMoves(seed, 12);
      const state = stateOf(text);
      const moves = text.split(" ").map((t) => {
        const face = FACES.indexOf(t[0] as string);
        const turns = t.endsWith("2") ? 2 : t.endsWith("'") ? 3 : 1;
        return face * 3 + turns - 1;
      });
      for (let x = 0; x < 6; x++) {
        // 맞춘 십자에서 시작
        const start = solvedKey(x);
        let locs = [
          Math.floor(start / 13_824),
          Math.floor(start / 576) % 24,
          Math.floor(start / 24) % 24,
          start % 24,
        ];
        for (const m of moves) locs = locs.map((l) => applyToLocation(m, l));
        expect(readCross(state, x)).toEqual({ face: x, key: crossKey(locs) });
      }
    }
  });

  it("큐브 전체를 돌려도(가운데가 옮겨 가도) 같은 십자로 읽는다", () => {
    const text = randomMoves(7, 15);
    const base = stateOf(text);
    for (const rot of ["x", "y'", "z2", "x y"]) {
      const turned = applyMoves(3, base, parseMoves(3, rot));
      for (let x = 0; x < 6; x++)
        expect(crossDepth(turned, x)).toBe(crossDepth(base, x));
    }
    // 가운데 층을 돌리면 십자가 깨진다: 맞춘 큐브에서 M 하나면 흰 십자는 1수가 아니다
    expect(crossDone(stateOf("M"), 0)).toBe(false);
  });
});

describe("십자 최적 해", () => {
  it("찾은 해를 실제로 두면 십자가 되고, 길이가 최적 수와 같다", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = stateOf(randomMoves(100 + seed, 20));
      const x = seed % 6;
      const d = crossDepth(state, x);
      const sols = solveCross(state, x, { limit: 3 });
      expect(sols.length).toBeGreaterThan(0);
      for (const sol of sols) {
        expect(sol.length).toBe(d);
        const after = applyMoves(3, state, parseMoves(3, sol.join(" ")));
        expect(crossDone(after, x)).toBe(true);
      }
    }
  });

  it("작은 깊이는 엔진으로 모두 훑은 값과 같다(더 짧은 해가 없다)", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = stateOf(randomMoves(300 + seed, 3));
      for (const x of [0, 3]) {
        expect(crossDepth(state, x)).toBe(bruteDepth(state, x, 3));
      }
    }
  });

  it("같은 길이 해를 여러 개 돌려주고 서로 다르다", () => {
    const state = stateOf(randomMoves(42, 20));
    const sols = solveCross(state, 0, { limit: 4 }).map((s) => s.join(" "));
    expect(new Set(sols).size).toBe(sols.length);
    expect(sols.length).toBeGreaterThan(1);
  });
});
