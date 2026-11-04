import {
  applyMoves,
  cubeTopology,
  isSolvable,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { ALG_SETS, COURSES } from "./index";
import {
  goalMet,
  makeTrainCase,
  maskFor,
  ruleSize,
  stateForRule,
  stepStart,
  unpairedEdgeLines,
} from "./judge";
import {
  GOALS,
  type GoalName,
  MASKS,
  type MaskName,
  SCRAMBLE_RULES,
  type ScrambleRule,
} from "./types";

const play = (n: number, s: PuzzleState, alg: string) =>
  applyMoves(n, s, parseMoves(n, alg));

const steps = COURSES.flatMap((c) =>
  c.lessons.flatMap((l) => l.steps.map((step) => ({ lesson: l, step }))),
);

describe("목표 판정", () => {
  it("맞춘 큐브는 그 크기에서 쓰는 목표를 모두 넘는다", () => {
    const bySize: Record<number, GoalName[]> = {
      2: [
        "solved",
        "2x2-first-layer",
        "2x2-top-face",
        "2x2-first-face",
        "2x2-both-faces",
      ],
      3: (Object.keys(GOALS) as GoalName[]).filter((g) => !g.startsWith("2x2")),
      4: [
        "solved",
        "centers",
        "edges-paired",
        "edges-ten",
        "edge-pair:UF",
        "yau-ud-centers",
        "yau-cross3",
        "yau-centers",
        "yau-cross",
      ],
      5: ["solved", "centers", "edges-paired", "edges-ten", "edge-pair:UF"],
    };
    for (const [n, goals] of Object.entries(bySize))
      for (const g of goals)
        expect(goalMet(Number(n), solvedCube(Number(n)), g), `${n} ${g}`).toBe(
          true,
        );
  });

  it("큐브를 어느 쪽으로 들든 같다(흰 면 아래 십자)", () => {
    const s = play(3, solvedCube(3), "z2 R U");
    expect(goalMet(3, s, "cross")).toBe(false);
    expect(goalMet(3, play(3, s, "U' R'"), "cross")).toBe(true);
    expect(goalMet(3, play(3, solvedCube(3), "x y2"), "solved")).toBe(true);
  });

  it("2×2는 가운데가 없어 어느 방향으로 들어도 첫 층을 알아본다", () => {
    const s = play(2, solvedCube(2), "x2 y U");
    expect(goalMet(2, s, "2x2-first-layer")).toBe(true);
    expect(goalMet(2, play(2, s, "R"), "2x2-first-layer")).toBe(false);
  });

  it("마지막 층: 윗면 돌리기 하나는 봐준다", () => {
    const s = play(3, solvedCube(3), "z2 U");
    expect(goalMet(3, s, "solved")).toBe(false);
    expect(goalMet(3, s, "ll")).toBe(true);
    expect(goalMet(3, s, "yellow-corners")).toBe(true);
  });
});

describe("단원 해보기: 상황 → 모범 답 → 목표", () => {
  const tries = steps.filter(
    ({ step }) =>
      step.kind === "try" &&
      step.setup !== undefined &&
      "alg" in step.setup &&
      step.alg !== undefined,
  );

  it("2×2~5×5 해보기가 마흔 개 넘게 있다", () => {
    expect(tries.length).toBeGreaterThan(40);
  });

  it.each(tries.map(({ lesson, step }) => ({ id: lesson.id, lesson, step })))(
    "$id",
    ({ lesson, step }) => {
      const n = lesson.size;
      const goal = step.goal as GoalName;
      const start = stepStart(lesson, step, 1);
      expect(goalMet(n, start, goal), `처음부터 목표: ${step.body}`).toBe(
        false,
      );
      expect(
        goalMet(n, play(n, start, step.alg as string), goal),
        step.body,
      ).toBe(true);
    },
  );
});

describe("스스로 섞기 규칙", () => {
  // 규칙마다 맞아 있어야 할 것(넘어야 할 목표)과 아직 아닌 것
  const keeps: Record<ScrambleRule, { yes: GoalName[]; no: GoalName[] }> = {
    "random-cross": { yes: [], no: ["white-cross"] },
    "bld-random": { yes: [], no: ["solved"] },
    "cross-solved": { yes: ["white-cross"], no: ["first-layer"] },
    "first-layer-solved": { yes: ["first-layer"], no: ["second-layer"] },
    "second-layer-solved": { yes: ["second-layer"], no: ["yellow-cross"] },
    "f2l-solved": { yes: ["f2l"], no: ["oll"] },
    "oll-solved": { yes: ["oll"], no: ["ll"] },
    "yellow-cross-solved": { yes: ["yellow-cross"], no: ["oll"] },
    "yellow-face-solved": { yes: ["oll"], no: ["yellow-corners"] },
    "corners-placed": { yes: ["yellow-corners"], no: ["ll"] },
    "white-cross-up": { yes: ["white-cross"], no: ["first-layer"] },
    "ll-cross-solved": { yes: ["yellow-cross"], no: ["yellow-edges"] },
    "ll-edges-solved": {
      yes: ["yellow-edges"],
      no: ["ll-corners-placed"],
    },
    "ll-corners-placed": { yes: ["ll-corners-placed"], no: ["solved"] },
    "2x2-corners-placed": {
      yes: ["2x2-corners-placed"],
      no: ["solved"],
    },
    "f2l-one-slot": {
      yes: ["cross", "f2l-pair:FL", "f2l-pair:BR", "f2l-pair:BL"],
      no: ["f2l-pair:FR"],
    },
    "2x2-random": { yes: [], no: ["2x2-first-layer"] },
    "2x2-first-layer-solved": {
      yes: ["2x2-first-layer"],
      no: ["2x2-top-face"],
    },
    "2x2-top-face-solved": { yes: ["2x2-top-face"], no: ["solved"] },
    "4x4-random": { yes: [], no: ["centers"] },
    "4x4-centers-solved": { yes: ["centers"], no: ["edges-paired"] },
    "4x4-reduced": { yes: ["edges-paired"], no: ["solved"] },
    "5x5-random": { yes: [], no: ["centers"] },
    "5x5-centers-solved": { yes: ["centers"], no: ["edges-paired"] },
    "5x5-two-edges-left": {
      yes: ["centers", "edges-ten"],
      no: ["edges-paired"],
    },
    "roux-fb-solved": { yes: ["roux-fb"], no: ["roux-sb"] },
    "roux-blocks-solved": { yes: ["roux-sb"], no: ["cmll"] },
    "roux-cmll-solved": { yes: ["cmll"], no: ["lse-eo"] },
    "roux-eo-solved": { yes: ["lse-eo"], no: ["lse-ulur"] },
    "roux-ulur-solved": { yes: ["lse-ulur"], no: ["solved"] },
    "zz-eoline-solved": { yes: ["eo", "eoline"], no: ["zz-left"] },
    "4x4-yau-ud-centers": { yes: ["yau-ud-centers"], no: ["yau-cross3"] },
    "4x4-yau-cross3": { yes: ["yau-cross3"], no: ["yau-centers"] },
    "4x4-yau-centers": { yes: ["yau-centers"], no: ["yau-cross"] },
    "4x4-yau-cross": { yes: ["yau-cross", "centers"], no: ["edges-paired"] },
  };

  it("규칙 이름을 모두 다룬다", () => {
    expect(Object.keys(keeps).sort()).toEqual(
      Object.keys(SCRAMBLE_RULES).sort(),
    );
  });

  it.each(Object.keys(SCRAMBLE_RULES) as ScrambleRule[])("%s", (rule) => {
    const n = ruleSize(rule);
    for (const seed of [1, 2, 3]) {
      const s = stateForRule(rule, seed);
      expect(isSolvable(n, s), `${seed}`).toBe(true);
      for (const g of keeps[rule].yes)
        expect(goalMet(n, s, g), `${seed} ${g}`).toBe(true);
      for (const g of keeps[rule].no)
        expect(goalMet(n, s, g), `${seed} ${g}`).toBe(false);
    }
    // 같은 씨앗이면 같은 상황
    expect(stateForRule(rule, 7).perm).toEqual(stateForRule(rule, 7).perm);
  });

  it("5×5 모서리 둘만 남음: 묶이지 않은 줄이 둘", () => {
    expect(unpairedEdgeLines(5, stateForRule("5x5-two-edges-left", 4))).toBe(2);
  });
});

describe("가리기", () => {
  it("이름마다 스티커 수만큼, all은 가리지 않음", () => {
    for (const n of [2, 3]) {
      for (const name of Object.keys(MASKS) as MaskName[]) {
        const m = maskFor(n, name);
        if (name === "all") expect(m).toBeNull();
        else expect(m?.length).toBe(cubeTopology(n).stickerCount);
      }
    }
  });

  it("첫 층 가리기: 3×3은 흰 십자·흰 꼭짓점·가운데 = 8 + 12 + 6 칸이 보인다", () => {
    const m = maskFor(3, "first-layer") ?? [];
    expect(m.filter((v) => v === "visible")).toHaveLength(8 + 12 + 6);
  });
});

describe("훈련 상황", () => {
  const cases = ALG_SETS.flatMap((set) =>
    set.cases
      .filter((c) => c.verified !== false)
      .map((c) => ({ id: c.id, set, c })),
  );

  it.each(cases)(
    "$id: 가리기·보통 모두 상황 → 모범 답 → 목표",
    ({ set, c }) => {
      for (const mode of ["mask", "normal"] as const) {
        for (const seed of [11, 12]) {
          const t = makeTrainCase(set, c, mode, seed);
          const where = `${mode} ${seed} ${t.answer}`;
          expect(goalMet(t.n, t.state, t.goal), `처음부터 ${where}`).toBe(
            false,
          );
          expect(
            goalMet(t.n, play(t.n, t.state, t.answer), t.goal),
            where,
          ).toBe(true);
          expect(t.mask === null, where).toBe(
            mode === "normal" || set.mask === "all",
          );
        }
      }
    },
  );
});
