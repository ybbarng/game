// 4×4·5×5 센터와 4×4 마지막 엣지 짝 넷의 경우별 정해진 길(docs/47 16-15): 무작위 상태를 규칙만으로 끝내는지 엔진으로 본다.
import {
  cubeTopology,
  faceColors,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  CENTER_IN,
  CENTER_IN_DOWN,
  CROSS_IN,
  CROSS_IN_DOWN,
  DROP_FROM_DOWN,
  DROP_FROM_UP,
  EDGE_FLIP,
  LAST_EDGE_WINGS,
  nextCenterStep,
  nextFirstEdge,
  nextLastEdge,
  type Pick,
  pairedSlots,
  playN,
  runCenters,
  runEdges444,
  runLastEdges,
  STORE_UP,
  stepMovesBig,
} from "./big-path";
import { centersSolved, stateForRule, unpairedEdgeLines } from "./judge";
import {
  CENTER_DOWN,
  CENTER_HOLD,
  CENTER_LAST_TWO,
  CENTER_LAST_TWO_SETUP,
  CENTER_YELLOW,
  CENTER_YELLOW_SETUP,
  CROSS_ONE,
  EDGE_DROP_CASE,
  EDGE_FLIP_CASE,
  EDGE_HIGH_CASE,
  EDGE_PAIR_DOWN,
  LAST_TWO_HOLD,
} from "./lessons-big";
import { YAU_PAIR } from "./lessons-yau";
import { setupFor } from "./notation";

/** 씨앗마다 다른 고르는 차례(결정적) */
function pickFrom(seed: number): Pick {
  let x = seed * 2654435761;
  return (count) => {
    x = (x * 1103515245 + 12345) >>> 0;
    return x % count;
  };
}

/** 센터 블럭 칸(면마다)의 색 */
function centerColorsByFace(n: number, s: PuzzleState): Set<number>[] {
  const topo = cubeTopology(n);
  const col = faceColors(n, s);
  const out = [0, 1, 2, 3, 4, 5].map(() => new Set<number>());
  topo.pieces.forEach((p) => {
    if (p.kind !== "center" && p.kind !== "innerCenter") return;
    for (const st of p.stickers)
      out[topo.stickers[st]?.face as number]?.add(col[st] as number);
  });
  return out;
}

/** 맞춘 큐브에 같은 큐브 돌리기를 한 것의 면 색 */
function frame(n: number, turns: string): number[] {
  const c = faceColors(n, playN(n, solvedCube(n), turns));
  return [0, 1, 2, 3, 4, 5].map((f) => c[f * n * n] as number);
}

/** 넣는 면(위)의 그 색 센터 블럭 수. 5×5는 무리(구석 쪽 x·십자 쪽 t)마다 */
function upCount(
  n: number,
  s: PuzzleState,
  color: number,
  orbit: "x" | "t",
): number {
  const col = faceColors(n, s);
  const edge = (v: number) => v === 1 || v === n - 2;
  let k = 0;
  for (let r = 1; r < n - 1; r++)
    for (let c = 1; c < n - 1; c++) {
      const isX = n === 4 || (edge(r) && edge(c));
      const isT = n === 5 && edge(r) !== edge(c);
      if ((orbit === "x" ? isX : isT) && col[r * n + c] === color) k++;
    }
  return k;
}

describe.each([
  { n: 4 as const, name: "4×4" },
  { n: 5 as const, name: "5×5" },
])("$name 센터", ({ n }) => {
  const SEEDS = Array.from({ length: n === 4 ? 30 : 20 }, (_, i) => i + 1);

  it("무작위 상태를 규칙만으로 끝내고, 면 색 차례가 흰 위·초록 앞의 표준 배치다", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const start = randomCubeState(n, seed);
      const r = runCenters(n, start, pickFrom(seed));
      expect(centersSolved(n, r.state)).toBe(true);
      const byFace = centerColorsByFace(n, r.state);
      const fc = frame(n, r.turns);
      byFace.forEach((set, f) => {
        expect([...set]).toEqual([fc[f]]);
      });
      for (const st of r.steps) seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual(
      n === 4 ? ["down", "side"] : ["cross-down", "cross-side", "down", "side"],
    );
  });

  it("공식 한 번에 넣는 면의 센터 블럭이 꼭 하나 늘고, 앞에서 맞춘 면은 그대로다", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const r = runCenters(n, randomCubeState(n, seed), pickFrom(seed));
      let s = randomCubeState(n, seed);
      for (const st of r.steps) {
        const held = playN(n, s, st.hold);
        const cross = st.caseId.startsWith("cross");
        const orbit = cross ? "t" : "x";
        const before = upCount(n, held, st.color as number, orbit);
        const xBefore = upCount(n, held, st.color as number, "x");
        const otherBefore = centerColorsByFace(n, held);
        s = playN(n, held, st.alg);
        expect(upCount(n, s, st.color as number, orbit)).toBe(before + 1);
        // 십자 쪽 공식은 이미 넣은 구석 쪽 센터 블럭을 건드리지 않는다
        if (cross) expect(upCount(n, s, st.color as number, "x")).toBe(xBefore);
        // 윗면·앞면(옆면 공식)·아랫면(아래 공식) 말고는 센터 블럭이 그대로다
        const touched =
          st.alg === CENTER_IN || st.alg === CROSS_IN ? [0, 2] : [0, 3];
        const after = centerColorsByFace(n, s);
        for (const f of [0, 1, 2, 3, 4, 5]) {
          if (touched.includes(f)) continue;
          expect([...(after[f] as Set<number>)].sort()).toEqual(
            [...(otherBefore[f] as Set<number>)].sort(),
          );
        }
      }
    }
  });

  it("공식은 넷뿐이다: 옆면·아랫면에서 넣기(5×5는 십자 쪽 둘 더)", () => {
    const algs = new Set<string>();
    for (const seed of SEEDS.slice(0, 5))
      for (const st of runCenters(n, randomCubeState(n, seed)).steps)
        algs.add(st.alg);
    expect([...algs].sort()).toEqual(
      (n === 4
        ? [CENTER_IN, CENTER_IN_DOWN]
        : [CENTER_IN, CENTER_IN_DOWN, CROSS_IN, CROSS_IN_DOWN]
      ).sort(),
    );
  });
});

describe("4×4 마지막 엣지 짝 넷", () => {
  const topo = cubeTopology(4);
  const wings = new Set(Object.values(LAST_EDGE_WINGS).flat());
  const keep = topo.pieces.map((_, i) => i).filter((i) => !wings.has(i));
  /** 센터가 맞고 위·아래 층 엣지 여덟이 묶였고, 가운데 줄 넷의 날개 여덟만 섞인 상태 */
  const lastFour = (seed: number) => randomCubeState(4, seed, { keep });

  it("무작위 50개를 규칙만으로 묶고, 센터와 위·아래 층 엣지는 그대로 묶여 있다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const r = runLastEdges(lastFour(seed), pickFrom(seed));
      expect(unpairedEdgeLines(4, r.state)).toBe(0);
      expect(centersSolved(4, r.state)).toBe(true);
      for (const st of r.steps) seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual(["flip", "high", "low"]);
  });

  it("Dw·Uw 경우는 공식 한 번에 앞-오른쪽 줄을 묶고, 이미 묶인 줄을 풀지 않는다. 뒤집기 뒤에는 늘 Dw 경우다", () => {
    for (let seed = 1; seed <= 50; seed++) {
      let s = lastFour(seed);
      for (;;) {
        const st = nextLastEdge(s, pickFrom(seed));
        if (!st) break;
        const held = playN(4, s, st.hold);
        const before = pairedSlots(held);
        expect(before).not.toContain("FR");
        s = playN(4, held, st.alg);
        const after = pairedSlots(s);
        for (const sl of before) expect(after).toContain(sl);
        if (st.caseId === "flip") {
          expect(st.alg).toBe(EDGE_FLIP);
          expect(nextLastEdge(s)?.caseId).toBe("low");
        } else expect(after).toContain("FR");
      }
    }
  });

  it("공식은 많아야 여섯 번이다(줄 넷 가운데 마지막 줄은 앞 줄을 묶을 때 함께 묶인다)", () => {
    for (let seed = 51; seed <= 80; seed++) {
      const r = runLastEdges(lastFour(seed));
      expect(r.steps.length).toBeLessThanOrEqual(6);
      for (const st of r.steps)
        expect(stepMovesBig(st)).toMatch(/R U R' F R' F' R/);
    }
  });
});

describe("4×4 엣지 열둘(처음 여덟 → 마지막 넷)", () => {
  const centersOnly = (seed: number) =>
    randomCubeState(4, seed, {
      keep: cubeTopology(4)
        .pieces.map((p, i) => ({ p, i }))
        .filter(({ p }) => p.kind === "center" || p.kind === "innerCenter")
        .map(({ i }) => i),
    });

  it("센터만 맞은 무작위 40개를 규칙만으로 다 묶고, 처음 여덟의 경우를 모두 만난다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = runEdges444(centersOnly(seed));
      expect(unpairedEdgeLines(4, r.state)).toBe(0);
      expect(centersSolved(4, r.state)).toBe(true);
      for (const st of r.steps)
        if (st.stage === "444-first-edges") seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual([
      "drop-down",
      "drop-up",
      "flip",
      "high",
      "low",
      "store",
      "turn-over",
    ]);
  });

  it("걸음마다 묶인 줄 수가 줄지 않고, 짝 맞추기 공식 뒤에는 앞-오른쪽이 묶이거나(Dw·Uw) Dw·Uw 경우로 넘어간다(뒤집기)", () => {
    for (let seed = 41; seed <= 70; seed++) {
      let s = centersOnly(seed);
      for (let guard = 0; guard < 80; guard++) {
        const st = nextFirstEdge(s);
        if (!st) break;
        const before = 12 - unpairedEdgeLines(4, s);
        s = playN(4, s, stepMovesBig(st));
        expect(centersSolved(4, s)).toBe(true);
        expect(12 - unpairedEdgeLines(4, s)).toBeGreaterThanOrEqual(before);
        if (st.caseId === "low" || st.caseId === "high")
          expect(pairedSlots(s)).toContain("FR");
        if (st.caseId === "flip")
          expect(["low", "high"]).toContain(nextFirstEdge(s)?.caseId);
        if (st.caseId === "drop-up" || st.caseId === "drop-down")
          expect(["low", "high", "flip"]).toContain(nextFirstEdge(s)?.caseId);
      }
    }
  });

  it("공식은 단원이 알린 것뿐이다: 올리기 R U R', 내리기 L' U' L·L D L', x2, 엣지 뒤집기를 쓴 Dw·Uw 경우", () => {
    const r = runEdges444(centersOnly(99));
    for (const st of r.steps)
      expect([
        STORE_UP,
        DROP_FROM_UP,
        DROP_FROM_DOWN,
        "x2",
        EDGE_FLIP,
      ]).toContain(st.alg.replace(/^[UD]w['2]? | [UD]w['2]?$/g, ""));
  });
});

describe("단원 해 보기의 모범 답 = 규칙이 그 상황에서 내는 수", () => {
  const solve = (n: 4 | 5, setup: string) =>
    runCenters(n, playN(n, solvedCube(n), setup))
      .steps.map(stepMovesBig)
      .join(" ");

  it("4×4 흰 센터 블럭 하나(그대로·F와 U로 쥐고·아랫면에서)", () => {
    expect(solve(4, setupFor(CENTER_IN))).toBe(CENTER_IN);
    expect(solve(4, setupFor(CENTER_HOLD))).toBe(CENTER_HOLD);
    expect(solve(4, setupFor(CENTER_DOWN))).toBe(CENTER_DOWN);
  });

  it("4×4 처음 엣지: 두 짝이 모두 위 층이면 L' U' L로 내리고 Dw 경우(규칙이 낸 수 그대로, 다 묶인다)", () => {
    const s = playN(4, solvedCube(4), setupFor(EDGE_DROP_CASE));
    const r = runEdges444(s);
    expect(r.steps.map((x) => x.caseId)).toEqual(["drop-up", "low"]);
    expect(r.steps.map(stepMovesBig).join(" ")).toBe(EDGE_DROP_CASE);
    expect(unpairedEdgeLines(4, r.state)).toBe(0);
  });

  it("4×4 노란 센터: 노란 면을 위로 쥐고(x2) 오른쪽 옆면에서 y로 가져온다", () => {
    const s = playN(4, solvedCube(4), CENTER_YELLOW_SETUP);
    const st = nextCenterStep(4, s, {
      color: 3,
      turns: "x2",
      done: [0],
      orbit: "x",
    });
    expect(st && stepMovesBig(st)).toBe(CENTER_YELLOW);
    expect(centersSolved(4, playN(4, s, CENTER_YELLOW))).toBe(true);
  });

  it("4×4 마지막 두 면: 파란 면 위·흰 면 오른쪽이면 앞이 주황 면이고, 공식 한 번에 두 면이 함께 맞는다", () => {
    const s = playN(4, solvedCube(4), CENTER_LAST_TWO_SETUP);
    const st = nextCenterStep(4, s, {
      color: 5,
      turns: LAST_TWO_HOLD,
      done: [0, 3, 2, 1],
      orbit: "x",
    });
    expect(st && stepMovesBig(st)).toBe(CENTER_LAST_TWO);
    expect(frame(4, LAST_TWO_HOLD).slice(0, 3)).toEqual([5, 0, 4]);
    expect(centersSolved(4, playN(4, s, CENTER_LAST_TWO))).toBe(true);
  });

  it("단원 글의 옆면 쥐기(흰 면 위·초록 앞에서 초록 x y, 빨강 z' y2, 파랑 x' y')는 그 면이 위·흰 면이 오른쪽", () => {
    for (const [turns, color] of [
      ["x y", 2],
      ["z' y2", 1],
      ["x' y'", 5],
    ] as const) {
      const fc = frame(4, turns);
      expect([fc[0], fc[1]]).toEqual([color, 0]);
    }
  });

  it("야우 엣지 짝(Uw' 엣지 뒤집기 Uw)과 묶은 줄 올리기(R U R')는 아래 층 엣지(흰 십자)와 센터를 그대로 둔다", () => {
    const n = 4;
    const base = playN(n, solvedCube(n), "z2");
    const bottom = (s: PuzzleState) => {
      const col = faceColors(n, s);
      const out: number[] = [];
      // 아래 층 엣지 칸(아랫면과 옆면 맨 아래 줄에서 코너 칸을 뺀 것)
      const corner = (r: number, c: number) =>
        (r === 0 || r === n - 1) && (c === 0 || c === n - 1);
      for (let i = 0; i < n * n; i++)
        if (!corner(Math.floor(i / n), i % n))
          out.push(col[3 * n * n + i] as number);
      for (const f of [1, 2, 4, 5])
        for (let c = 1; c < n - 1; c++)
          out.push(col[f * n * n + (n - 1) * n + c] as number);
      return out.join();
    };
    for (const alg of [YAU_PAIR, "R U R'", `Dw ${EDGE_FLIP} Dw'`]) {
      const s = playN(n, base, alg);
      expect(bottom(s), alg).toBe(bottom(base));
      expect(centersSolved(n, s), alg).toBe(true);
    }
  });

  it("5×5 대각선 쪽 하나와 십자 쪽 하나", () => {
    expect(solve(5, setupFor(CENTER_IN))).toBe(CENTER_IN);
    expect(solve(5, setupFor(CROSS_ONE))).toBe(CROSS_ONE);
  });

  it("4×4 엣지: Dw 경우, 위 날개 경우 → Dw 경우, 엣지 뒤집기 → Dw 경우", () => {
    const run = (alg: string) =>
      runLastEdges(playN(4, solvedCube(4), setupFor(alg)));
    for (const [alg, ids] of [
      [EDGE_PAIR_DOWN, "low"],
      [EDGE_HIGH_CASE, "high,low"],
      [EDGE_FLIP_CASE, "flip,low"],
    ] as const) {
      const r = run(alg);
      expect(r.steps.map(stepMovesBig).join(" ")).toBe(alg);
      expect(r.steps.map((s) => s.caseId).join()).toBe(ids);
    }
  });

  it("4×4 엣지: 묶은 줄 올리기 R U R'은 앞-오른쪽 줄을 위-앞으로, 위-뒤 엣지를 앞-오른쪽으로 옮기고 센터는 그대로", () => {
    const topo = cubeTopology(4);
    const s = playN(4, solvedCube(4), "R U R'");
    const wingColors = (c: Uint8Array, faces: number[]) =>
      topo.pieces
        .filter(
          (p) =>
            p.kind === "wing" &&
            faces.every((f) =>
              p.stickers.some((st) => topo.stickers[st]?.face === f),
            ),
        )
        .map((p) =>
          p.stickers
            .map((st) => c[st] as number)
            .sort()
            .join(),
        )
        .sort();
    const col = faceColors(4, s);
    const base = faceColors(4, solvedCube(4));
    // 위-앞(U F) 자리에 맞춘 상태의 앞-오른쪽(F R) 날개 둘, 앞-오른쪽 자리에 위-뒤(U B) 날개 둘
    expect(wingColors(col, [0, 2])).toEqual(wingColors(base, [2, 1]));
    expect(wingColors(col, [2, 1])).toEqual(wingColors(base, [0, 5]));
    expect(centersSolved(4, s)).toBe(true);
  });

  it("마지막 넷 연습 상황(4x4-last-four-edges)을 규칙으로 묶고, 둘만 남으면 공식 한 번에 둘 다 묶인다", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = stateForRule("4x4-last-four-edges", seed);
      expect(unpairedEdgeLines(4, runLastEdges(s).state)).toBe(0);
    }
    const wings = new Set(Object.values(LAST_EDGE_WINGS).flat());
    const keep = cubeTopology(4)
      .pieces.map((_, i) => i)
      .filter((i) => !wings.has(i));
    for (let seed = 1; seed <= 50; seed++) {
      let s = randomCubeState(4, seed, { keep });
      for (;;) {
        const st = nextLastEdge(s);
        if (!st) break;
        const open = 4 - pairedSlots(playN(4, s, st.hold)).length;
        s = playN(4, s, stepMovesBig(st));
        if (open === 2 && st.caseId !== "flip")
          expect(pairedSlots(s).length).toBe(4);
      }
    }
  });
});
