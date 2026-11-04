import { solveRoux, solveZZ } from "@game/cube-ai";
import {
  applyMoves,
  parseMoves,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { goalMet, stepStart } from "./judge";
import { ROUX } from "./lessons-roux";
import { YAU_444 } from "./lessons-yau";
import { PETRUS, ZZ } from "./lessons-zz";
import type { GoalName } from "./types";

const play = (n: number, s: PuzzleState, alg: string) =>
  applyMoves(n, s, parseMoves(n, alg));
const held = (alg: string) => play(3, solvedCube(3), `z2 ${alg}`);
const met = (alg: string, goal: GoalName) => goalMet(3, held(alg), goal);

describe("루 판정", () => {
  it("M은 두 블록·CMLL을 지키지만 가운데가 옆으로 가 EO가 아니다", () => {
    expect(met("M", "roux-sb")).toBe(true);
    expect(met("M", "cmll")).toBe(true);
    expect(met("M", "lse-eo")).toBe(false);
    expect(met("M2", "lse-eo")).toBe(true);
    expect(met("M2", "lse-ulur")).toBe(true);
    expect(met("M2", "solved")).toBe(false);
  });

  it("윗면 돌리기 하나는 봐주고, 앞면을 돌리면 첫 블록이 깨진다", () => {
    expect(met("U", "lse-ulur")).toBe(true);
    // L은 왼쪽 층을 통째로 돌려 블록 모양은 그대로다. F는 깬다
    expect(met("L", "roux-fb")).toBe(true);
    expect(met("F", "roux-fb")).toBe(false);
    expect(met("R", "roux-fb")).toBe(true);
    expect(met("R", "roux-sb")).toBe(false);
    expect(met("R U R'", "cmll")).toBe(false);
  });

  it("M U M'은 모서리 방향을 바꾼다", () => {
    expect(met("M U M'", "cmll")).toBe(true);
    expect(met("M U M'", "lse-eo")).toBe(false);
    expect(met("M U2 M'", "lse-eo")).toBe(true);
  });
});

describe("ZZ·페트루스 판정", () => {
  it("F·B 4분의 1 돌리기만 모서리 방향을 바꾼다", () => {
    expect(met("R U L D", "eo")).toBe(true);
    expect(met("F", "eo")).toBe(false);
    expect(met("F2 B2", "eo")).toBe(true);
    expect(met("R U L", "eoline")).toBe(true);
    expect(met("D", "eoline")).toBe(false);
    expect(met("R U R'", "zz-left")).toBe(true);
    expect(met("L U L'", "zz-left")).toBe(false);
  });

  it("페트루스 블록은 왼쪽-뒤-아래", () => {
    expect(met("R U F", "petrus-222")).toBe(true);
    expect(met("D", "petrus-222")).toBe(false);
    expect(met("R U", "petrus-223")).toBe(true);
    expect(met("F", "petrus-223")).toBe(false);
  });
});

describe("야우 판정", () => {
  const play4 = (alg: string) => play(4, solvedCube(4), alg);
  it("흰·노랑 가운데와 십자 모서리 줄을 센다", () => {
    expect(goalMet(4, play4("Rw"), "yau-ud-centers")).toBe(false);
    expect(goalMet(4, play4("Uw"), "yau-ud-centers")).toBe(true);
    // Uw는 흰 십자 줄을 통째로 돌려 서로의 차례는 그대로다
    expect(goalMet(4, play4("Uw"), "yau-cross3")).toBe(true);
    // 바깥 R은 흰 십자 줄 하나만 옮긴다(가운데는 그대로)
    expect(goalMet(4, play4("R"), "yau-centers")).toBe(true);
    expect(goalMet(4, play4("R"), "yau-cross")).toBe(false);
    expect(goalMet(4, play4("R F"), "yau-cross3")).toBe(false);
  });
});

describe("새 해법 시연", () => {
  // 시연 수는 풀이 함수 결과를 옮겨 적은 것이다. 시연을 끝까지 두면 같은 단원 다음 해 보기의 목표가 된다
  const pairs = [ROUX, ZZ, PETRUS, YAU_444].flatMap((course) =>
    course.lessons.flatMap((lesson) =>
      lesson.steps.flatMap((step, i) => {
        if (step.kind !== "demo" || !step.alg) return [];
        const next = lesson.steps.slice(i + 1).find((s) => s.kind === "try");
        if (!next?.goal) return [];
        return [{ id: lesson.id, lesson, step, goal: next.goal }];
      }),
    ),
  );

  it("열 개 넘게 있다", () => {
    expect(pairs.length).toBeGreaterThan(10);
  });

  it.each(pairs)("$id: $step.body", ({ lesson, step, goal }) => {
    const n = lesson.size;
    const start = stepStart(lesson, step, 1);
    expect(goalMet(n, play(n, start, step.alg as string), goal)).toBe(true);
  });
});

/** 풀이 함수의 단계 경계마다 배우기 판정이 그 단계를 맞았다고 본다(두 쪽을 서로 확인) */
function stagesMeet(
  solve: (s: PuzzleState) => {
    moves: string[];
    stages: { name: string; end: number }[];
  },
  want: Record<string, GoalName>,
  seed: number,
) {
  const start = randomCubeState(3, seed);
  const r = solve(start);
  for (const st of r.stages) {
    const goal = want[st.name];
    if (!goal) continue;
    const s = play(3, start, r.moves.slice(0, st.end).join(" "));
    expect(goalMet(3, s, goal), `${seed} ${st.name}`).toBe(true);
  }
}

describe("풀이 함수와 판정이 맞는다", () => {
  it.each([1, 2, 3, 4])("루 %i", (seed) => {
    stagesMeet(
      solveRoux,
      {
        fb: "roux-fb",
        sb: "roux-sb",
        cmll: "cmll",
        "lse-eo": "lse-eo",
        "lse-ulur": "lse-ulur",
        "lse-ep": "solved",
      },
      seed,
    );
  });

  it.each([1, 2, 3, 4])("ZZ %i", (seed) => {
    stagesMeet(
      solveZZ,
      {
        eoline: "eoline",
        "zz-left": "zz-left",
        "zz-right": "f2l",
        oll: "oll",
        pll: "solved",
      },
      seed,
    );
  });
});
