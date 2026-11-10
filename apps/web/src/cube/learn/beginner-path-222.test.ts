// 2×2의 경우별 정해진 길(beginner-path-222.ts)을 엔진으로 확인한다.
// 1. 무작위로 섞은 2×2를 규칙만으로(모양 판정 → 정해진 쥐기·공식·횟수) 단계마다 진행해 끝까지 맞춘다.
//    2×2 처음 맞추기(첫 층 → 윗면 → 위 층 자리)와 3×3을 아는 사람의 2×2(첫 층 → 코너 자리 → 코너 방향) 둘 다.
// 2. 마지막 층은 나올 수 있는 모양을 모두 만들어 경우마다 정해진 수로 끝나는지 본다.
import { solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import { CORNER_CYCLE, TWIST } from "./beginner-path";
import {
  BEGINNER_222_STAGES,
  FROM333_222_STAGES,
  nextStep222,
  PATH_222_STAGES,
  type Path222StageId,
  type Pick,
  play,
  runStage222,
  solve222,
  stepMoves222,
  TOP_FACE,
  TOP_FACE_BACK,
  TOP_SWAP,
} from "./beginner-path-222";
import { goalMet, stateForRule } from "./judge";
import { BEGINNER_222 } from "./lessons-222";
import { FROM_333_222 } from "./lessons-222-from333";
import { invertAlg } from "./notation";

function seededPick(seed: number): Pick {
  let x = seed * 2654435761;
  return (n) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % n;
  };
}

const goalOf = (id: Path222StageId) =>
  PATH_222_STAGES.find((s) => s.id === id)?.goal ?? "solved";

describe("무작위 2×2를 규칙만으로 끝까지", () => {
  const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
  for (const [name, stages] of [
    ["2×2 처음 맞추기", BEGINNER_222_STAGES],
    ["3×3을 아는 사람의 2×2", FROM333_222_STAGES],
  ] as const)
    it(`${name}: 50개 모두 맞고, 단계마다 목표가 된다`, () => {
      const seen = new Map<string, Set<string>>();
      for (const seed of SEEDS) {
        const start = stateForRule("2x2-random", seed);
        const { state, steps } = solve222(start, stages, seededPick(seed));
        expect(goalMet(2, state, "solved"), `${seed}`).toBe(true);
        // 단계마다 목표: 한 단계씩 다시 진행하며 확인
        let s = start;
        for (const [k, id] of stages.entries()) {
          if (k === 1) s = play(s, "z2");
          s = runStage222(id, s, seededPick(seed)).state;
          expect(goalMet(2, s, goalOf(id)), `${seed} ${id}`).toBe(true);
        }
        for (const [k, id] of stages.entries()) {
          const set = seen.get(id) ?? new Set<string>();
          for (const st of steps[k] ?? []) set.add(st.caseId);
          seen.set(id, set);
        }
      }
      // 무작위 섞기로 첫 층의 경우를 만난다. 흰 코너가 모두 위 층에서 돌아간 시작(start-top)은 드물어 아래에서 따로 본다
      expect([...(seen.get("first-layer") ?? [])].sort()).toEqual(
        PATH_222_STAGES.find((s) => s.id === "first-layer")
          ?.cases.map((c) => c.id)
          .filter((id) => id !== "start-top")
          .sort(),
      );
    });
});

/** 첫 층이 맞은 2×2(흰 면 아래)에서 이 풀이로 풀리는 상황 */
const flipped = (solution: string) =>
  play(solvedCube(2), `z2 ${invertAlg(solution)}`);

describe("윗면: 모양 일곱 × 윗면 넷", () => {
  // 2×2 윗면 모양 일곱(오르테가 OLL과 같은 차례): 수네·거꾸로 수네·H·파이·U·T·나비넥타이
  const SHAPES = [
    TOP_FACE,
    TOP_FACE_BACK,
    "R2 U2 R U2 R2",
    "F R U R' U' R U R' U' F'",
    "F R U R' U' F'",
    "R U R' U' R' F R F'",
    "F R' F' R U R U' R'",
  ];
  it("경우마다 정해진 수로 윗면이 끝나고, 공식은 많아야 두 번", () => {
    for (const shape of SHAPES)
      for (const u of ["", "U", "U2", "U'"]) {
        const s = play(flipped(shape), u);
        const r = runStage222("top-face", s);
        expect(goalMet(2, r.state, "2x2-top-face"), `${shape} ${u}`).toBe(true);
        const formulas = r.steps.reduce(
          (k, st) =>
            k +
            st.alg.split(TOP_FACE).length -
            1 +
            st.alg.split(TOP_FACE_BACK).length -
            1,
          0,
        );
        expect(formulas).toBeLessThanOrEqual(2);
        // 이어지는 경우는 자료의 next와 같다
        const first = r.steps[0];
        const c = PATH_222_STAGES.find((x) => x.id === "top-face")?.cases.find(
          (x) => x.id === first?.caseId,
        );
        if (c?.next) expect(r.steps[1]?.caseId).toMatch(/^one-/);
        else expect(r.steps).toHaveLength(1);
      }
  });
});

describe("위 층 자리와 코너 자리: 자리 바꿈 셋 × 윗면 넷", () => {
  const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
  const Y = "F R U' R' U' R U R' F' R U R' U' R' F R F'";
  it("위 층 자리: 바른 짝 하나면 공식 한 번, 없으면 두 번", () => {
    for (const [perm, times] of [
      ["", 0],
      [T, 1],
      [Y, 2],
    ] as const)
      for (const u of ["", "U", "U2", "U'"]) {
        const r = runStage222("top-layer", play(flipped(perm), u));
        expect(goalMet(2, r.state, "solved"), `${perm} ${u}`).toBe(true);
        const n = r.steps.reduce(
          (k, st) => k + st.alg.split(TOP_SWAP).length - 1,
          0,
        );
        expect(n, `${perm} ${u}`).toBe(times);
      }
  });
  it("코너 자리(3×3을 아는 사람): 공식이나 거꾸로를 많아야 두 번", () => {
    for (const perm of ["", T, Y])
      for (const u of ["", "U", "U2", "U'"]) {
        const r = runStage222("corner-place", play(flipped(perm), u));
        expect(goalMet(2, r.state, "2x2-corners-placed")).toBe(true);
        expect(r.steps.length).toBeLessThanOrEqual(2);
      }
    // 대각 바꿈은 제자리가 없는 곳에서 한 번 친 뒤 하나인 곳
    const d = runStage222("corner-place", flipped(Y));
    expect(d.steps.map((s) => s.caseId)[0]).toBe("none");
    expect(d.steps[0]?.alg).toBe(CORNER_CYCLE);
  });
  it("코너 방향(3×3을 아는 사람): 돌아간 코너마다 코너 돌리기 두 번", () => {
    const s = flipped(
      `${TWIST} ${TWIST} U ${TWIST} ${TWIST} ${TWIST} ${TWIST} U'`,
    );
    const r = runStage222("corner-twist", s);
    expect(goalMet(2, r.state, "solved")).toBe(true);
    expect(r.steps.map((x) => x.caseId)).toEqual(
      expect.arrayContaining(["right", "front"]),
    );
  });
});

describe("첫 층: 흰 코너가 모두 위 층에서 돌아가 있을 때", () => {
  it("하나를 앞-오른쪽 위로 쥐고 두 번 돌려 기준으로 삼은 뒤 끝난다", () => {
    const tw2 = `${TWIST} ${TWIST}`;
    const tw4 = `${tw2} ${tw2}`;
    const s = play(solvedCube(2), `${tw2} U ${tw4} U ${tw2} U ${tw4} U`);
    const r = runStage222("first-layer", s);
    expect(r.steps[0]?.caseId).toBe("start-top");
    expect(goalMet(2, r.state, "2x2-first-layer")).toBe(true);
  });
});

describe("끝난 단계는 걸음이 없다", () => {
  it("맞춘 2×2", () => {
    const s = solvedCube(2);
    expect(nextStep222("first-layer", s)).toBeNull();
    expect(nextStep222("top-face", play(s, "z2"))).toBeNull();
    expect(nextStep222("top-layer", play(s, "z2"))).toBeNull();
    expect(nextStep222("corner-place", play(s, "z2"))).toBeNull();
    expect(nextStep222("corner-twist", play(s, "z2"))).toBeNull();
  });
});

// 단원의 시연·해 보기 모범 답이 규칙이 같은 상황에서 내는 수와 같은지(단원 글과 규칙이 한 길)
describe("단원 모범 답 = 규칙이 낸 수", () => {
  const STAGE_OF: Record<string, Path222StageId> = {
    "222-first-layer-up": "first-layer",
    "222-top-face": "top-face",
    "222-top-layer": "top-layer",
    "222-from333-first-layer-up": "first-layer",
    "222-from333-corner-place": "corner-place",
    "222-from333-corner-twist": "corner-twist",
  };
  const norm = (a: string) => a.trim().split(/\s+/).join(" ");
  for (const course of [BEGINNER_222, FROM_333_222])
    for (const lesson of course.lessons) {
      const stage = STAGE_OF[lesson.id];
      if (!stage) continue;
      it(`${course.title} · ${lesson.title}`, () => {
        let checked = 0;
        for (const st of lesson.steps) {
          if (st.kind !== "try" && st.kind !== "demo") continue;
          if (!st.alg || !st.setup || !("alg" in st.setup)) continue;
          const start = play(solvedCube(2), st.setup.alg);
          const r = runStage222(stage, start);
          expect(norm(r.steps.map(stepMoves222).join(" ")), st.body).toBe(
            norm(st.alg),
          );
          checked++;
        }
        expect(checked).toBeGreaterThan(0);
      });
    }
});
