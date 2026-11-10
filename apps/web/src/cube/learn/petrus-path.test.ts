// 페트루스 엣지 블럭 놓기(petrus-path.ts): 24가지 시작(자리 12 × 방향 2)마다 경우 셋으로 제자리에 놓고, 앞에서 놓은 조각을 지킨다.
// 엣지 방향 고치기: 2×2×3 블록만 맞은 무작위 상태를 규칙만으로 끝내고, 블록을 지키며, 나쁜 엣지 수의 절반 번에 끝낸다.
import { cubeTopology, randomCubeState, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { methodGoalMet } from "./judge-methods";
import {
  PETRUS_EO_FOUR,
  PETRUS_EO_FOUR_ANSWER,
  PETRUS_EO_TWO,
  PETRUS_EO_TWO_ANSWER,
  petrusEoMoves,
} from "./lessons-zz";
import { invertAlg } from "./notation";
import {
  edgeAt,
  nextPetrusEo,
  PETRUS_EDGES,
  type PetrusEoStep,
  placePetrusEdge,
  runPetrusEo,
  stepMovesPetrusEo,
} from "./petrus-path";
import { badEdges, play3 } from "./zz-path";

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

// ── 엣지 방향 고치기 ─────────────────────────────────────────────
/** 2×2×3 블록 조각(위·오른쪽 면에 닿지 않는 조각) */
const BLOCK = (() => {
  const topo = cubeTopology(3);
  return topo.pieces
    .map((p, i) => ({
      i,
      faces: p.stickers.map((st) => topo.stickers[st]?.face),
    }))
    .filter(({ faces }) => !faces.includes(0) && !faces.includes(1))
    .map(({ i }) => i);
})();

describe("페트루스 엣지 방향 고치기", () => {
  it("F' U F · F' U2 F · F' U' F는 블록을 지키고 앞-오른쪽과 위-오른쪽·위-뒤·위-왼쪽 엣지 블럭 하나의 방향만 바꾼다", () => {
    const flips: [string, string][] = [
      ["F' U F", "UR"],
      ["F' U2 F", "UB"],
      ["F' U' F", "UL"],
    ];
    for (const [alg, partner] of flips) {
      const t = play3(solvedCube(3), alg);
      expect(methodGoalMet(3, t, "petrus-223")).toBe(true);
      // 맞춘 큐브에서 치면 나쁜 엣지는 공식이 지나간 두 조각뿐이다
      expect(badEdges(t)).toHaveLength(2);
      // 거꾸로 친 상태(나쁜 엣지가 앞-오른쪽과 짝 자리)에서 규칙은 바로 그 공식을 고른다
      const st = runPetrusEo(play3(solvedCube(3), invertAlg(alg))).steps;
      expect(st).toHaveLength(1);
      expect(st[0]?.partner).toBe(partner.toLowerCase());
      expect(st[0]?.alg).toBe(alg);
    }
  });

  it("무작위 300개(2×2×3 블록만 맞음): 규칙만으로 엣지 방향을 끝내고, 걸음마다 블록을 지키고 나쁜 엣지가 꼭 둘 줄며, 모든 경우를 만난다", () => {
    const fills = new Set<string>();
    const partners = new Set<string>();
    const counts = new Set<number>();
    for (let seed = 1; seed <= 300; seed++) {
      let s = randomCubeState(3, seed, { keep: BLOCK });
      const start = badEdges(s).length;
      counts.add(start);
      let n = 0;
      for (;;) {
        const st: PetrusEoStep | null = nextPetrusEo(s);
        if (!st) break;
        n++;
        fills.add(st.fill);
        partners.add(st.partner);
        // 블록 밖 수는 R·U뿐, 공식은 F' U^k F
        expect(st.hold).toMatch(/^[RU2' ]*$/);
        expect(st.alg).toMatch(/^F' U[2']? F$/);
        const before = badEdges(s).length;
        s = play3(s, stepMovesPetrusEo(st));
        expect(badEdges(s).length, `씨앗 ${seed}`).toBe(before - 2);
        expect(methodGoalMet(3, s, "petrus-223"), `씨앗 ${seed}`).toBe(true);
      }
      expect(n, `씨앗 ${seed}`).toBe(start / 2);
      expect(methodGoalMet(3, s, "eo")).toBe(true);
    }
    expect([...counts].sort()).toEqual([0, 2, 4, 6]);
    expect([...fills].sort()).toEqual(["ready", "right", "top", "top-right"]);
    expect([...partners].sort()).toEqual(["br", "dr", "ub", "uf", "ul", "ur"]);
  });

  it("단원 해 보기 둘의 모범 답 = 규칙이 낸 수, 상황은 2×2×3 블록이 맞고 나쁜 엣지 둘·넷", () => {
    expect(PETRUS_EO_TWO_ANSWER).toBe("R F' U' F");
    expect(PETRUS_EO_FOUR_ANSWER).toBe("F' U' F R2 U' F' U F");
    // 본문이 짚는 나쁜 엣지 자리: 둘은 아래-오른쪽·위-왼쪽, 넷은 앞-오른쪽·위-왼쪽·뒤-오른쪽·위-앞
    const where = (s: PuzzleState) =>
      badEdges(s)
        .map((f) =>
          f
            .map((x) => "URFDLB"[x])
            .sort()
            .join(""),
        )
        .sort();
    for (const [setup, answer, bad] of [
      [PETRUS_EO_TWO, PETRUS_EO_TWO_ANSWER, ["DR", "LU"]],
      [PETRUS_EO_FOUR, PETRUS_EO_FOUR_ANSWER, ["BR", "FR", "FU", "LU"]],
    ] as const) {
      const s = play3(solvedCube(3), setup);
      expect(methodGoalMet(3, s, "petrus-223")).toBe(true);
      expect(where(s)).toEqual([...bad]);
      expect(answer).toBe(petrusEoMoves(setup));
      const t = play3(s, answer);
      expect(methodGoalMet(3, t, "eo")).toBe(true);
      expect(methodGoalMet(3, t, "petrus-223")).toBe(true);
    }
  });
});
