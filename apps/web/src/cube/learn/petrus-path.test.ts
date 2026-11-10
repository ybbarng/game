// 페트루스 엣지 블럭 놓기(petrus-path.ts): 24가지 시작(자리 12 × 방향 2)마다 경우 셋으로 제자리에 놓고, 앞에서 놓은 조각을 지킨다.
import { solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { edgeAt, PETRUS_EDGES, placePetrusEdge } from "./petrus-path";
import { play3 } from "./zz-path";

const ALL = [
  "U",
  "U'",
  "U2",
  "R",
  "R'",
  "R2",
  "F",
  "F'",
  "F2",
  "L",
  "L'",
  "L2",
  "B",
  "B'",
  "B2",
  "D",
  "D'",
  "D2",
];

/** 그 엣지 블럭을 열두 자리·두 방향 모두로 보낸 상태(맞춘 큐브에서 짧은 수로) */
function allStarts(colors: [number, number]): PuzzleState[] {
  const seen = new Map<string, PuzzleState>();
  let frontier = [solvedCube(3)];
  const key = (s: PuzzleState) => {
    const w = edgeAt(s, colors);
    return `${w.slot}:${w.yellow}`;
  };
  seen.set(key(frontier[0] as PuzzleState), frontier[0] as PuzzleState);
  for (let d = 0; d < 4 && seen.size < 24; d++) {
    const next: PuzzleState[] = [];
    for (const s of frontier)
      for (const m of ALL) {
        const t = play3(s, m);
        const k = key(t);
        if (!seen.has(k)) {
          seen.set(k, t);
          next.push(t);
        }
      }
    frontier = next;
  }
  return [...seen.values()];
}

describe("페트루스 엣지 블럭 놓기", () => {
  // 앞에서 놓은 조각의 자리(②는 아래-왼쪽, 2×2×3은 아래-왼쪽·아래-뒤·뒤-왼쪽)에서는 시작하지 않는다
  const TAKEN: Record<string, string[]> = {
    dl: [],
    db: ["DL"],
    df: ["DL", "BD", "BL"],
  };
  const startsFor = (e: (typeof PETRUS_EDGES)[number]) =>
    allStarts(e.colors).filter(
      (s) => !(TAKEN[e.id] ?? []).includes(edgeAt(s, e.colors).slot),
    );

  it.each(PETRUS_EDGES)(
    "$id: 시작 모두(24가지에서 앞에서 놓은 자리를 뺀 것) 제자리에 노랑이 아래로 든다",
    (e) => {
      const starts = startsFor(e);
      expect(starts).toHaveLength(24 - 2 * (TAKEN[e.id] ?? []).length);
      for (const s of starts) {
        const t = play3(s, placePetrusEdge(s, e));
        expect(edgeAt(t, e.colors)).toEqual({ slot: e.home, yellow: "D" });
      }
    },
  );

  it("②는 ①(아래-왼쪽)을, 2×2×3의 엣지는 2×2×2 블록 엣지 셋을 옮기지 않는다", () => {
    const [dl, db, df] = PETRUS_EDGES as [
      (typeof PETRUS_EDGES)[0],
      (typeof PETRUS_EDGES)[0],
      (typeof PETRUS_EDGES)[0],
    ];
    const keep = (s: PuzzleState, list: [number, number][]) =>
      list.map((c) => JSON.stringify(edgeAt(s, c))).join();
    // 맞춘 큐브에서 놓을 엣지 블럭만 흩뜨린 상태들: 쓰는 수(놓기 규칙의 수)는 지킬 조각을 건드리지 않아야 한다
    for (const [e, guard] of [
      [db, [dl.colors]],
      [df, [dl.colors, db.colors, [4, 5] as [number, number]]],
    ] as const) {
      for (const s of startsFor(e)) {
        const moves = placePetrusEdge(s, e);
        const base = solvedCube(3);
        // 놓기 수를 맞춘 큐브에 거꾸로 쳐도(시작을 만든 수와 상관없이) 지킬 조각이 그대로인지 본다
        const t = play3(base, moves);
        expect(keep(t, [...guard])).toBe(keep(base, [...guard]));
      }
    }
  });
});
