import {
  applyMoves,
  cubeTopology,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { randomScramble } from "./hero/loop";
import {
  SEARCH_ORDER,
  searchTurns,
  slotStickers,
  splitByUnits,
  unitSolved,
  unitStickers,
  unitsForStage,
  unitVisible,
} from "./piece-marks";

function seq(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const play = (s: PuzzleState, moves: string) =>
  applyMoves(3, s, parseMoves(3, moves));

const scrambled = (seed: number) =>
  play(solvedCube(3), randomScramble(seq(seed), 20, 3).join(" "));

describe("조각 묶음", () => {
  it("3×3의 단계마다 하나씩 넣는 묶음: 흰 엣지 넷, 흰 코너 넷, 둘째 층 엣지 넷, F2L 짝 넷", () => {
    const t = cubeTopology(3);
    const kinds = (stage: string) =>
      (unitsForStage(3, stage) ?? []).map((u) =>
        u.pieces.map((p) => t.pieces[p]?.kind).join("+"),
      );
    expect(kinds("cross")).toEqual(Array(4).fill("edge"));
    expect(kinds("corners")).toEqual(Array(4).fill("corner"));
    expect(kinds("middle")).toEqual(Array(4).fill("edge"));
    expect(kinds("f2l-1")).toEqual(Array(4).fill("corner+edge"));
    // 짝은 흰 코너와 그 옆 두 색의 엣지
    for (const u of unitsForStage(3, "f2l-2") ?? []) {
      const faces = u.pieces.map((p) =>
        (t.pieces[p]?.stickers ?? []).map((s) => t.stickers[s]?.face).sort(),
      );
      expect(faces[0]?.slice(1)).toEqual(faces[1]);
      expect(faces[0]?.[0]).toBe(0);
    }
    expect(unitsForStage(3, "oll")).toBeNull();
    expect(unitsForStage(4, "cross")).toBeNull();
  });

  it("맞춘 큐브는 모두 맞고, 큐브를 통째로 돌려도 맞음은 그대로다(센터 기준)", () => {
    for (const stage of ["cross", "corners", "middle", "f2l-1"])
      for (const u of unitsForStage(3, stage) ?? []) {
        expect(unitSolved(solvedCube(3), u)).toBe(true);
        expect(unitSolved(play(solvedCube(3), "x y2 z'"), u)).toBe(true);
      }
    const r = play(solvedCube(3), "R");
    // R은 흰-빨강 엣지를 옮긴다
    expect(
      (unitsForStage(3, "cross") ?? []).filter((u) => !unitSolved(r, u)),
    ).toHaveLength(1);
  });

  it("넣을 곳은 지금 그 자리에 있는 스티커, 찾은 조각은 그 조각의 스티커(정체)다", () => {
    const [u] = unitsForStage(3, "cross") ?? [];
    if (!u) throw new Error("묶음이 없다");
    const s = solvedCube(3);
    expect(slotStickers(s, u).sort()).toEqual(unitStickers(u).sort());
    // 큐브를 돌려도 정체는 그대로
    expect(slotStickers(play(s, "y"), u).sort()).toEqual(
      unitStickers(u).sort(),
    );
  });
});

describe("찾는 차례", () => {
  it("이미 보이면 돌리지 않고, 안 보이면 y를 한 번씩 돌려 처음 보이는 걸음에서 멈춘다", () => {
    let searched = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = scrambled(seed);
      for (const stage of ["cross", "corners", "middle", "f2l-1"])
        for (const u of unitsForStage(3, stage) ?? []) {
          const turns = searchTurns(s, [u]);
          if (!turns) throw new Error("찾지 못했다");
          // 차례는 SEARCH_ORDER의 앞부분이고, 위·앞·오른쪽만으로 y 세 번 안에 끝난다
          expect(turns).toEqual(SEARCH_ORDER.slice(0, turns.length));
          expect(turns.length).toBeLessThanOrEqual(3);
          let st = s;
          for (const t of turns) {
            expect(unitVisible(st, u)).toBe(false);
            st = play(st, t);
          }
          expect(unitVisible(st, u)).toBe(true);
          if (turns.length) searched++;
          // 같은 상태면 늘 같은 길
          expect(searchTurns(s, [u])).toEqual(turns);
        }
    }
    expect(searched).toBeGreaterThan(0);
  });

  it("F2L 짝은 코너나 엣지 하나만 보여도 찾은 것이다", () => {
    const pair = (unitsForStage(3, "f2l-1") ?? []).find((u) => {
      // 흰-파랑-주황 짝(맞춘 큐브에서 뒤-왼쪽 아래, 둘 다 안 보이는 자리)을 쓰려고 위로 뒤집은 상태에서 찾는다
      const s = play(solvedCube(3), "z2");
      return !unitVisible(s, u);
    });
    if (!pair) throw new Error("둘 다 안 보이는 짝이 없다");
    const s = play(solvedCube(3), "z2");
    const turns = searchTurns(s, [pair]) ?? [];
    expect(turns.length).toBeGreaterThan(0);
    const after = turns.reduce((st, t) => play(st, t), s);
    expect(unitVisible(after, pair)).toBe(true);
  });
});

describe("splitByUnits", () => {
  it("한 번에 짠 십자는 엣지가 맞은 걸음으로 나누고, 나누지 않으면 끝에서 한 묶음이다", () => {
    const units = unitsForStage(3, "cross") ?? [];
    // 흰 엣지 둘을 차례로 옮겼다 되돌리기: F'(흰-초록 빠짐) R'(흰-빨강 빠짐) 의 역 R F
    const start = play(solvedCube(3), "F' R'");
    const moves = ["R", "F"];
    const states = [start];
    for (const m of moves) states.push(play(states.at(-1) as PuzzleState, m));
    const split = splitByUnits(states, 0, 2, units, true);
    expect(split.map((g) => [g.at, g.units.length])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    const whole = splitByUnits(states, 0, 2, units);
    expect(whole.map((g) => [g.at, g.units.length])).toEqual([[2, 2]]);
  });
});
