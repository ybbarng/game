// 3×3 초보자(코너 방향 먼저)의 마지막 층 경우별 정해진 길(twist-first-path.ts)을 엔진으로 확인한다(docs/47 16-33).
// 1. 무작위로 섞은 큐브를 단원 규칙만으로(노란 십자까지는 beginner-path.ts) 끝까지 맞춘다.
// 2. 세 단계마다 나올 수 있는 모양을 모두 만들어, 경우마다 정해진 수로 끝나고 적어 둔 「다음 경우」로 넘어가는지 본다.
import { faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { type PathStageId, play, runStage } from "./beginner-path";
import { goalMet, stateForRule } from "./judge";
import {
  CORNER_SWAP,
  EDGE_CYCLE,
  EDGE_CYCLE_LEFT,
  nextTwistFirstStep,
  runTwistFirstStage,
  TWIST_FIRST_ORDER,
  TWIST_FIRST_STAGES,
  type TwistFirstStageId,
  type TwistFirstStep,
  twistFirstCase,
  twistFirstMoves,
  YELLOW_FACE,
  YELLOW_FACE_BACK,
} from "./twist-first-path";

const LOWER: PathStageId[] = ["cross", "corners", "second", "yellow-cross"];

/** 공식이 걸음들에 몇 번 들었나 */
const count = (steps: TwistFirstStep[], alg: string) =>
  steps.reduce((k, st) => k + st.alg.split(alg).length - 1, 0);

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
    s = r.state;
    const goal = TWIST_FIRST_STAGES.find((x) => x.id === id)?.goal;
    expect(goalMet(3, s, goal ?? "solved"), id).toBe(true);
  }
  return { end: s, runs };
}

/** 흰 면 아래로 쥔 맞춘 큐브 */
const solvedDown = () => play(solvedCube(3), "z2");
const key = (s: PuzzleState) => Array.from(faceColors(3, s)).join("");

/** 시작 큐브에서 공식들을 이어 쳐 나오는 모양을 모두 모은다(같은 스티커 배치는 하나) */
function collect(gens: string[], depth: number): PuzzleState[] {
  const out = new Map<string, PuzzleState>([[key(solvedDown()), solvedDown()]]);
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
    // 「다음 경우」가 윗면 돌리기만 남은 경우면 이미 맞아 끝났을 수도 있다
    const ok =
      want === undefined
        ? got === "done"
        : want.includes(got) ||
          (got === "done" &&
            want.some((w) => twistFirstCase(stage, w).times === 0));
    expect(
      ok,
      `${stage} ${st.caseId} → ${got}(적은 것 ${want?.join("·") ?? "끝"})`,
    ).toBe(true);
  }
}

describe("무작위 섞기를 규칙만으로 끝까지", () => {
  it("50개 모두 맞춰지고, 노란 면 공식·코너 바꾸기·엣지 돌리기는 단계마다 많아야 두 번이며, 모든 경우를 만난다", () => {
    const seen = new Map<TwistFirstStageId, Set<string>>();
    for (let seed = 1; seed <= 50; seed++) {
      const { end, runs } = solveByRules(stateForRule("random-cross", seed));
      expect(goalMet(3, end, "solved"), `${seed}`).toBe(true);
      expect(
        count(runs.face, YELLOW_FACE) + count(runs.face, YELLOW_FACE_BACK),
        `${seed}`,
      ).toBeLessThanOrEqual(2);
      expect(count(runs.corners, CORNER_SWAP), `${seed}`).toBeLessThanOrEqual(
        2,
      );
      expect(
        count(runs.edges, EDGE_CYCLE) + count(runs.edges, EDGE_CYCLE_LEFT),
        `${seed}`,
      ).toBeLessThanOrEqual(2);
      for (const [id, steps] of Object.entries(runs)) {
        const set = seen.get(id as TwistFirstStageId) ?? new Set<string>();
        for (const st of steps) set.add(st.caseId);
        seen.set(id as TwistFirstStageId, set);
      }
    }
    // 엣지 자리 「코너가 비켜남」은 단원 섞기(corners-placed)에서만 나온다(코너 자리가 윗면까지 맞추고 끝나서)
    const missing = TWIST_FIRST_STAGES.flatMap((st) =>
      st.cases
        .filter((c) => !seen.get(st.id)?.has(c.id))
        .map((c) => `${st.id} ${c.id}`),
    );
    expect(missing).toEqual(["edges turn"]);
  });

  it("엣지 자리 연습 섞기(코너까지 맞음, 윗면은 비켜날 수 있음)도 윗면을 돌린 뒤 끝까지 맞는다", () => {
    const ids = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const r = runTwistFirstStage(
        "edges",
        stateForRule("corners-placed", seed),
      );
      expect(goalMet(3, r.state, "solved"), `${seed}`).toBe(true);
      for (const st of r.steps) ids.add(st.caseId);
    }
    expect(ids.has("turn")).toBe(true);
  });
});

describe("세 단계: 나올 수 있는 모양 모두", () => {
  it("노란 면: 코너 방향 27가지(윗면 모양 여덟을 윗면 돌리기로 놓은 것), 공식은 많아야 두 번이고 다음 경우가 적은 대로다", () => {
    const shapes = collect(["U", YELLOW_FACE], 8).filter((s) =>
      goalMet(3, s, "yellow-cross"),
    );
    // 노란 스티커가 위를 보는 칸만 본 모양(코너 넷 × 세 방향, 합이 3의 배수)
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
      const r = runTwistFirstStage("face", s);
      expect(goalMet(3, r.state, "oll")).toBe(true);
      expect(
        count(r.steps, YELLOW_FACE) + count(r.steps, YELLOW_FACE_BACK),
      ).toBeLessThanOrEqual(2);
      nextMatches("face", s);
    }
  });

  it("코너 자리: 노란 면이 맞은 뒤 코너 자리 24가지, 바른 짝 한 면은 한 번, 없으면 두 번, 끝에 윗면 돌리기", () => {
    const shapes = collect(["U", CORNER_SWAP, `y ${CORNER_SWAP} y'`], 8);
    const places = new Set(
      shapes.map((s) => {
        const c = faceColors(3, s);
        return [8, 9, 20, 6, 18, 38, 0, 36, 47, 2, 45, 11]
          .map((i) => c[i])
          .join("");
      }),
    );
    expect(places.size).toBe(24);
    for (const s of shapes) {
      const r = runTwistFirstStage("corners", s);
      expect(goalMet(3, r.state, "yellow-corners")).toBe(true);
      const ids = r.steps.map((x) => x.caseId).filter((x) => x !== "align");
      expect(ids.length).toBe(ids[0] === "none" ? 2 : ids.length ? 1 : 0);
      nextMatches("corners", s);
    }
  });

  it("엣지 자리: 코너가 맞은 뒤 엣지 자리 12가지, 제자리 하나는 한 번, 없으면 두 번이고 위 코너는 내내 제자리다", () => {
    const edgeKey = (s: PuzzleState) => {
      const c = faceColors(3, s);
      return [19, 10, 46, 37].map((i) => c[i]).join("");
    };
    const shapes = collect([EDGE_CYCLE, `y ${EDGE_CYCLE} y'`], 6);
    expect(new Set(shapes.map(edgeKey)).size).toBe(12);
    for (const s of shapes) {
      const r = runTwistFirstStage("edges", s);
      expect(goalMet(3, r.state, "solved")).toBe(true);
      const ids = r.steps.map((x) => x.caseId);
      expect(ids.length).toBe(ids[0] === "none" ? 2 : ids.length ? 1 : 0);
      let t = s;
      for (const st of r.steps) {
        t = play(t, twistFirstMoves(st));
        expect(goalMet(3, t, "yellow-corners")).toBe(true);
      }
      nextMatches("edges", s);
    }
  });
});
