// 3×3 처음 맞추기의 경우별 정해진 길(beginner-path.ts)을 엔진으로 확인한다.
// 1. 무작위로 섞은 큐브를 규칙만으로(모양 판정 → 정해진 쥐기·공식·횟수) 단계마다 진행해 끝까지 맞춘다.
// 2. 마지막 층 네 단계는 나올 수 있는 모양을 모두 만들어 경우마다 정해진 수로 끝나는지 본다.
import { faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  EDGE_SWAP,
  nextStep,
  PATH_STAGES,
  type PathStageId,
  type PathStep,
  type Pick,
  play,
  reps,
  runStage,
  stepMoves,
  TWIST,
  TWIST_BACK,
  YELLOW_CROSS,
  YELLOW_CROSS_BACK,
} from "./beginner-path";
import { goalMet, stateForRule } from "./judge";

const UP_STAGES: PathStageId[] = ["cross", "corners"];
const DOWN_STAGES: PathStageId[] = [
  "second",
  "yellow-cross",
  "edges",
  "corner-place",
  "corner-twist",
];

/** 씨앗으로 정하는 「어느 것부터」(여러 차례로 해도 끝나는지) */
function seededPick(seed: number): Pick {
  let x = seed * 2654435761;
  return (n) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % n;
  };
}

const count = (steps: PathStep[], alg: string) =>
  steps.reduce((k, st) => k + st.alg.split(alg).length - 1, 0);

function solveByPath(start: PuzzleState, pick: Pick) {
  const runs: Partial<Record<PathStageId, PathStep[]>> = {};
  let s = start;
  for (const id of [...UP_STAGES, "flip" as const, ...DOWN_STAGES]) {
    if (id === "flip") {
      s = play(s, "z2");
      continue;
    }
    const r = runStage(id, s, pick);
    runs[id] = r.steps;
    s = r.state;
    const stage = PATH_STAGES.find((x) => x.id === id);
    expect(goalMet(3, s, stage?.goal ?? "solved"), id).toBe(true);
  }
  return { end: s, runs };
}

describe("무작위 섞기를 규칙만으로 끝까지", () => {
  const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
  const seen = new Map<PathStageId, Set<string>>();

  it("50개 모두 맞춰지고, 단계마다 공식 횟수가 정해진 만큼이다", () => {
    for (const seed of SEEDS) {
      const start = stateForRule("random-cross", seed);
      const { end, runs } = solveByPath(start, seededPick(seed));
      expect(goalMet(3, end, "solved"), `${seed}`).toBe(true);
      for (const [id, steps] of Object.entries(runs)) {
        const set = seen.get(id as PathStageId) ?? new Set<string>();
        for (const st of steps) set.add(st.caseId);
        seen.set(id as PathStageId, set);
      }
      const r = runs as Record<PathStageId, PathStep[]>;
      // 노란 십자: 많아야 두 번(점 → ㄱ자 → 십자)
      expect(
        count(r["yellow-cross"], YELLOW_CROSS) +
          count(r["yellow-cross"], YELLOW_CROSS_BACK),
      ).toBeLessThanOrEqual(2);
      // 옆면 맞추기·코너 자리: 많아야 두 번
      expect(count(r.edges, EDGE_SWAP)).toBeLessThanOrEqual(2);
      expect(
        count(r["corner-place"], CORNER_CYCLE) +
          count(r["corner-place"], CORNER_CYCLE_BACK),
      ).toBeLessThanOrEqual(2);
      // 코너 방향: 돌아간 코너마다 두 번
      for (const st of r["corner-twist"])
        if (st.caseId !== "align")
          expect(count([st], TWIST) + count([st], TWIST_BACK), `${seed}`).toBe(
            2,
          );
    }
  });

  it("50개를 지나며 모든 경우를 한 번 이상 만났다", () => {
    for (const stage of PATH_STAGES) {
      const got = seen.get(stage.id) ?? new Set();
      for (const c of stage.cases)
        expect(got.has(c.id), `${stage.id} ${c.id}`).toBe(true);
    }
  });
});

/** 시작 큐브에서 같은 상태 열쇠를 지우며 모양을 모은다 */
function collect(
  starts: PuzzleState[],
  gens: string[],
  key: (s: PuzzleState) => string,
  depth: number,
): PuzzleState[] {
  const out = new Map<string, PuzzleState>();
  let layer = starts;
  for (const s of starts) out.set(key(s), s);
  for (let d = 0; d < depth; d++) {
    const next: PuzzleState[] = [];
    for (const s of layer)
      for (const g of gens) {
        const t = play(s, g);
        const k = key(t);
        if (out.has(k)) continue;
        out.set(k, t);
        next.push(t);
      }
    layer = next;
  }
  return [...out.values()];
}

const stickers = (s: PuzzleState, idx: number[]) =>
  idx.map((i) => faceColorsKey(s)[i]).join("");
const faceColorsKey = (s: PuzzleState) => Array.from(faceColors(3, s));
/** 윗층 스티커(윗면 9 + 옆면 윗줄 12) */
const TOP = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47,
];

function stageSteps(stage: PathStageId, s: PuzzleState): PathStep[] {
  return runStage(stage, s).steps;
}

describe("마지막 층: 나올 수 있는 모양 모두", () => {
  const solvedDown = play(solvedCube(3), "z2");

  it("노란 십자: 엣지 방향 8가지(점 1·ㄱ자 4·일자 2·십자 1), 점은 두 번, 나머지는 한 번", () => {
    // 아래 두 층을 지키는 윗층 공식으로 모양을 모은다
    const shapes = collect(
      [solvedDown],
      ["U", YELLOW_CROSS],
      (s) =>
        [1, 3, 5, 7].map((i) => (faceColorsKey(s)[i] === 3 ? 1 : 0)).join(""),
      8,
    );
    expect(shapes.length).toBe(8);
    for (const s of shapes) {
      const steps = stageSteps("yellow-cross", s);
      const first = steps[0]?.caseId;
      expect(steps.length).toBe(first === "dot" ? 2 : first ? 1 : 0);
      // 점은 한 번 치면 ㄱ자가 앞·오른쪽에 생겨, 늘 U2로 뒤·왼쪽에 쥔다
      if (first === "dot")
        expect(steps[1]).toMatchObject({ caseId: "ell", hold: "U2" });
    }
  });

  it("옆면 맞추기: 윗층 엣지 자리 24가지, 이웃은 한 번, 마주 봄은 앞·뒤로 쥐고 한 번 → 늘 U' 뒤 y'로 이웃 → 한 번", () => {
    const yellowEdges = (s: PuzzleState) =>
      [19, 10, 46, 37].map((i) => faceColorsKey(s)[i]).join("");
    const shapes = collect([solvedDown], ["U", EDGE_SWAP], yellowEdges, 10);
    expect(shapes.length).toBe(24);
    for (const s of shapes) {
      const steps = stageSteps("edges", s);
      const ids = steps.map((x) => x.caseId);
      const swaps = count(steps, EDGE_SWAP);
      if (ids[0] === "opposite") {
        expect(swaps).toBe(2);
        expect(ids[1]).toBe("next");
        expect(steps[1]?.hold).toBe("U' y'");
      } else expect(swaps).toBeLessThanOrEqual(1);
      expect(goalMet(3, runStage("edges", s).state, "yellow-edges")).toBe(true);
    }
  });

  it("코너 자리: 엣지가 맞은 뒤 코너 자리 12가지, 제자리 하나는 한 번, 없음은 두 번", () => {
    const corners = (s: PuzzleState) =>
      [8, 9, 20, 6, 18, 38, 0, 36, 47, 2, 45, 11]
        .map((i) => faceColorsKey(s)[i])
        .join("");
    const shapes = collect(
      [solvedDown],
      [CORNER_CYCLE, `y ${CORNER_CYCLE} y'`],
      corners,
      8,
    );
    // 방향은 상관없이 자리만: 4! / 2 = 12
    const places = new Set(
      shapes.map((s) =>
        [0, 1, 2, 3]
          .map((k) =>
            [
              [8, 9, 20],
              [6, 18, 38],
              [0, 36, 47],
              [2, 45, 11],
            ][k]
              ?.map((i) => faceColorsKey(s)[i])
              .sort()
              .join(""),
          )
          .join("|"),
      ),
    );
    expect(places.size).toBe(12);
    for (const s of shapes) {
      const steps = stageSteps("corner-place", s);
      const ids = steps.map((x) => x.caseId);
      if (ids[0] === "none") expect(ids.length).toBe(2);
      else expect(ids.length).toBeLessThanOrEqual(1);
      expect(
        goalMet(3, runStage("corner-place", s).state, "ll-corners-placed"),
      ).toBe(true);
    }
  });

  it("코너 방향: 방향 27가지, 돌아간 코너마다 두 번, 끝에 윗면 돌리기", () => {
    const starts: PuzzleState[] = [];
    // 코너마다 「돌리기 2번」을 0·1·2번(합이 3의 배수), 다음 코너로는 U. 네 번째 U로 처음 자리에 돌아온다
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        for (let c = 0; c < 3; c++) {
          const d = (6 - a - b - c) % 3;
          const alg = [a, b, c, d]
            .map((k) => `${reps(TWIST, 2 * k)} U`)
            .join(" ");
          starts.push(play(solvedDown, alg));
        }
    const keys = new Set(starts.map((s) => stickers(s, TOP)));
    expect(keys.size).toBe(27);
    for (const s of starts) {
      const steps = stageSteps("corner-twist", s);
      for (const st of steps)
        if (st.caseId !== "align")
          expect(count([st], TWIST) + count([st], TWIST_BACK)).toBe(2);
      expect(goalMet(3, runStage("corner-twist", s).state, "solved")).toBe(
        true,
      );
    }
  });
});

describe("첫 두 층: 조각 하나의 모든 자리", () => {
  it("흰 십자: 흰-초록 엣지가 갈 수 있는 24자리(제자리 포함)마다, 어느 차례로 해도 끝난다", () => {
    // 흰-초록 엣지만 흩고 나머지 흰 엣지는 제자리(아래층·가운데 층 수만 써서 모은다)
    const starts = collect(
      [solvedCube(3)],
      ["F", "D", "y F y'", "y' F y", "y2 F y2"],
      (s) => {
        const col = faceColorsKey(s);
        // 흰-초록 자리·방향 열쇠
        const edges = [
          [5, 10],
          [7, 19],
          [3, 37],
          [1, 46],
          [32, 16],
          [28, 25],
          [30, 43],
          [34, 52],
          [23, 12],
          [21, 41],
          [50, 39],
          [48, 14],
        ];
        const k = edges.findIndex(
          ([a, b]) =>
            (col[a as number] === 0 && col[b as number] === 2) ||
            (col[a as number] === 2 && col[b as number] === 0),
        );
        const flip = col[(edges[k] as number[])[0] as number] === 0 ? 0 : 1;
        return `${k}:${flip}`;
      },
      9,
    );
    expect(starts.length).toBe(24);
    for (const s0 of starts) {
      for (const seedPick of [1, 2, 3]) {
        const pick = seededPick(seedPick);
        let s = s0;
        let guard = 0;
        for (;;) {
          const st = nextStep("cross", s, pick);
          if (!st) break;
          s = play(s, stepMoves(st));
          expect(++guard).toBeLessThanOrEqual(16);
        }
        expect(goalMet(3, s, "white-cross")).toBe(true);
      }
    }
  });

  it("첫 층 코너: 흰-초록-빨강 코너가 갈 수 있는 24자리(제자리 포함)마다, 어느 차례로 해도 끝난다", () => {
    const CORNERS = [
      [8, 9, 20],
      [6, 18, 38],
      [0, 36, 47],
      [2, 45, 11],
      [29, 26, 15],
      [27, 44, 24],
      [33, 53, 42],
      [35, 17, 51],
    ];
    const starts = collect(
      [solvedCube(3)],
      [TWIST, "D", `y ${TWIST} y'`, `y' ${TWIST} y`, `y2 ${TWIST} y2`],
      (s) => {
        const col = faceColorsKey(s);
        const k = CORNERS.findIndex(
          (c) =>
            c
              .map((i) => col[i])
              .sort()
              .join() === "0,1,2",
        );
        const ori = (CORNERS[k] as number[]).findIndex((i) => col[i] === 0);
        return `${k}:${ori}`;
      },
      8,
    );
    expect(starts.length).toBe(24);
    for (const s0 of starts)
      for (const seedPick of [1, 2, 3]) {
        const pick = seededPick(seedPick);
        // 흰 십자는 이 수들로 흐트러지지 않는다
        expect(goalMet(3, s0, "white-cross")).toBe(true);
        const r = runStage("corners", s0, pick, 16);
        expect(goalMet(3, r.state, "first-layer")).toBe(true);
      }
  });
});
