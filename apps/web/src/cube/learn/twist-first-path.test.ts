// 3×3 초보자(코너 방향 먼저, 신광사 해법)의 마지막 두 걸음 경우별 정해진 길(twist-first-path.ts)을 엔진으로 확인한다
// (docs/47 16-33).
// 1. 무작위로 섞은 큐브를 단원 규칙만으로(옆면 맞추기까지는 beginner-path.ts) 끝까지 맞춘다.
// 2. 두 걸음마다 나올 수 있는 모양을 모두 만들어, 경우마다 정해진 수로 끝나고 적어 둔 「다음 경우」로 넘어가는지,
//    위 엣지와 아래 두 층이 내내 그대로인지 본다.
// 3. 코너 방향 관계도(beginner-cases.ts TWIST_FLOW)가 엔진으로 친 결과와 같은지 본다.
import { faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { TWIST_FLOW } from "./beginner-cases";
import { type PathStageId, play, runStage } from "./beginner-path";
import { goalMet, stateForRule } from "./judge";
import {
  CORNER_A,
  CORNER_B,
  CORNER_TURN,
  nextTwistFirstStep,
  runTwistFirstStage,
  TWIST_FIRST_ORDER,
  TWIST_FIRST_STAGES,
  type TwistFirstStageId,
  type TwistFirstStep,
  twistFirstCase,
  twistFirstMoves,
} from "./twist-first-path";

const LOWER: PathStageId[] = [
  "cross",
  "corners",
  "second",
  "yellow-cross",
  "edges",
];

/** 공식이 걸음들에 몇 번 들었나 */
const count = (steps: TwistFirstStep[], alg: string) =>
  steps.reduce((k, st) => k + st.alg.split(alg).length - 1, 0);

/** 위 엣지 넷이 제자리·바른 방향(윗면 돌리기 없이)이고 아래 두 층이 맞음 */
function edgesHome(s: PuzzleState): boolean {
  if (!goalMet(3, s, "f2l")) return false;
  const c = faceColors(3, s);
  return (
    [1, 3, 5, 7].every((i) => c[i] === 3) &&
    [
      [19, 2],
      [10, 1],
      [46, 5],
      [37, 4],
    ].every(([i, f]) => c[i as number] === c[(f as number) * 9 + 4])
  );
}

function solveByRules(start: PuzzleState) {
  let s = start;
  for (const id of LOWER) {
    if (id === "second") s = play(s, "z2");
    s = runStage(id, s).state;
  }
  const runs = {} as Record<TwistFirstStageId, TwistFirstStep[]>;
  for (const id of TWIST_FIRST_ORDER) {
    const r = runTwistFirstStage(id, s);
    runs[id] = r.steps;
    for (const st of r.steps) {
      s = play(s, twistFirstMoves(st));
      expect(edgesHome(s), `${id} ${st.caseId}`).toBe(true);
    }
    const goal = TWIST_FIRST_STAGES.find((x) => x.id === id)?.goal;
    expect(goalMet(3, s, goal ?? "solved"), id).toBe(true);
  }
  return { end: s, runs };
}

const down = () => play(solvedCube(3), "z2");
const key = (s: PuzzleState) => Array.from(faceColors(3, s)).join("");

/** 맞춘 큐브에서 수들을 이어 쳐 나오는 모양을 모두 모은다(같은 스티커 배치는 하나) */
function collect(gens: string[], depth: number): PuzzleState[] {
  const out = new Map<string, PuzzleState>([[key(down()), down()]]);
  let layer = [...out.values()];
  for (let d = 0; d < depth; d++) {
    const next: PuzzleState[] = [];
    for (const s of layer)
      for (const g of gens) {
        const t = play(s, g);
        if (out.has(key(t))) continue;
        out.set(key(t), t);
        next.push(t);
      }
    layer = next;
  }
  return [...out.values()];
}

/** 걸음마다 적어 둔 「다음 경우」가 실제 다음 걸음(또는 끝)과 맞는지 */
function nextMatches(stage: TwistFirstStageId, s0: PuzzleState) {
  let s = s0;
  for (;;) {
    const st = nextTwistFirstStep(stage, s);
    if (!st) return;
    s = play(s, twistFirstMoves(st));
    const want = twistFirstCase(stage, st.caseId).next;
    const got = nextTwistFirstStep(stage, s)?.caseId ?? "done";
    const ok = want === undefined ? got === "done" : want.includes(got);
    expect(
      ok,
      `${stage} ${st.caseId} → ${got}(적은 것 ${want?.join("·") ?? "끝"})`,
    ).toBe(true);
  }
}

describe("무작위 섞기를 규칙만으로 끝까지", () => {
  it("50개 모두 맞춰지고, 코너 방향 공식은 많아야 세 번, 코너 위치 공식은 많아야 두 번이며, 위 엣지는 내내 그대로이고 모든 경우를 만난다", () => {
    const seen = new Map<TwistFirstStageId, Set<string>>();
    for (let seed = 1; seed <= 50; seed++) {
      const { end, runs } = solveByRules(stateForRule("random-cross", seed));
      expect(goalMet(3, end, "solved"), `${seed}`).toBe(true);
      expect(count(runs.twist, CORNER_TURN), `${seed}`).toBeLessThanOrEqual(3);
      expect(
        count(runs.place, CORNER_A) + count(runs.place, CORNER_B),
        `${seed}`,
      ).toBeLessThanOrEqual(2);
      for (const [id, steps] of Object.entries(runs)) {
        const set = seen.get(id as TwistFirstStageId) ?? new Set<string>();
        for (const st of steps) set.add(st.caseId);
        seen.set(id as TwistFirstStageId, set);
      }
    }
    const missing = TWIST_FIRST_STAGES.flatMap((st) =>
      st.cases
        .filter((c) => !seen.get(st.id)?.has(c.id))
        .map((c) => `${st.id} ${c.id}`),
    );
    expect(missing).toEqual([]);
  });

  it("코너 위치 연습 섞기(코너 자리만 섞임)도 규칙대로 끝까지 맞는다", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = stateForRule("ll-corners-unplaced", seed);
      expect(goalMet(3, s, "oll"), `${seed}`).toBe(true);
      const r = runTwistFirstStage("place", s);
      expect(goalMet(3, r.state, "solved"), `${seed}`).toBe(true);
    }
  });
});

describe("두 걸음: 나올 수 있는 모양 모두", () => {
  it("코너 방향: 방향 27가지, 공식은 많아야 세 번, 다음 경우가 적은 대로이고 위 엣지는 그대로다", () => {
    const shapes = collect(
      [CORNER_TURN, `y ${CORNER_TURN} y'`, `y2 ${CORNER_TURN} y2`],
      8,
    );
    const orient = new Set(
      shapes.map((s) => {
        const c = faceColors(3, s);
        return [0, 2, 6, 8, 9, 11, 18, 20, 36, 38, 45, 47]
          .map((i) => (c[i] === 3 ? 1 : 0))
          .join("");
      }),
    );
    expect(orient.size).toBe(27);
    for (const s of shapes) {
      expect(edgesHome(s)).toBe(true);
      const r = runTwistFirstStage("twist", s);
      expect(goalMet(3, r.state, "oll")).toBe(true);
      expect(edgesHome(r.state)).toBe(true);
      expect(count(r.steps, CORNER_TURN)).toBeLessThanOrEqual(3);
      nextMatches("twist", s);
    }
  });

  it("코너 위치: 코너 자리 12가지(방향 맞음), 하나는 A나 B 한 번, 없으면 두 번이고 위 엣지는 그대로다", () => {
    const shapes = collect([CORNER_A, `y ${CORNER_A} y'`], 8);
    const places = new Set(
      shapes.map((s) => {
        const c = faceColors(3, s);
        return [8, 9, 20, 6, 18, 38, 0, 36, 47, 2, 45, 11]
          .map((i) => c[i])
          .join("");
      }),
    );
    expect(places.size).toBe(12);
    for (const s of shapes) {
      const r = runTwistFirstStage("place", s);
      expect(goalMet(3, r.state, "solved")).toBe(true);
      const ids = r.steps.map((x) => x.caseId);
      expect(ids.length).toBe(ids[0] === "none" ? 2 : ids.length ? 1 : 0);
      nextMatches("place", s);
    }
  });
});

describe("코너 방향 관계도", () => {
  const stateOf = (alg: string) => play(solvedCube(3), alg);

  it("모양마다 그림은 그 경우의 쥐기 그대로이고, 공식을 한 번 치면 적어 둔 모양이 된다", () => {
    for (const n of TWIST_FLOW) {
      const s = stateOf(n.alg);
      const first = nextTwistFirstStep("twist", s);
      if (n.id === "done") {
        expect(first).toBeNull();
        continue;
      }
      expect([first?.caseId, first?.hold], n.id).toEqual([n.id, ""]);
      const after = play(s, CORNER_TURN);
      const got = nextTwistFirstStep("twist", after)?.caseId ?? "done";
      expect(got, n.id).toBe(n.to);
    }
  });

  it("관계도는 코너 방향의 모든 경우와 다 맞음을 한 번씩 담는다", () => {
    expect(TWIST_FLOW.map((n) => n.id).sort()).toEqual(
      [...twistCases(), "done"].sort(),
    );
  });
});

const twistCases = () =>
  (TWIST_FIRST_STAGES.find((s) => s.id === "twist")?.cases ?? []).map(
    (c) => c.id,
  );
