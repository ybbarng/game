import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { COURSES } from "./index";
import {
  demoOffersTurn,
  findHit,
  lookMet,
  pieceAtSticker,
  stepIsActive,
  stepPicture,
  stepProblem,
  stickerAtHit,
  turnProgress,
} from "./interact";
import type { Lesson } from "./types";

const play = (n: number, alg: string, s: PuzzleState = solvedCube(n)) =>
  applyMoves(n, s, parseMoves(n, alg));

/** 면 f(U R F D L B)의 줄 r 칸 c 스티커 자리 */
const at = (n: number, f: number, r: number, c: number) =>
  f * n * n + r * n + c;

describe("조각 찾기", () => {
  it("3D에서 누른 칸(조각 중심·법선)을 스티커 자리로 바꾼다", () => {
    // 앞면 가운데
    expect(stickerAtHit(3, [0, 0, 1], "+z")).toBe(at(3, 2, 1, 1));
    // 윗면 앞 가운데 칸(흰-초록 모서리의 흰 칸)
    expect(stickerAtHit(3, [0, 1, 1], "+y")).toBe(at(3, 0, 2, 1));
    expect(stickerAtHit(3, [0, 0, 0], "+y")).toBeNull();
  });

  it("조각 종류와 붙은 색을 안다(큰 큐브 날개는 모서리)", () => {
    expect(pieceAtSticker(3, solvedCube(3), at(3, 2, 1, 1))).toMatchObject({
      type: "center",
      colors: [2],
    });
    expect(pieceAtSticker(3, solvedCube(3), at(3, 0, 2, 1))).toMatchObject({
      type: "edge",
      colors: [0, 2],
    });
    expect(pieceAtSticker(3, solvedCube(3), at(3, 0, 2, 2))?.type).toBe(
      "corner",
    );
    expect(pieceAtSticker(4, solvedCube(4), at(4, 0, 3, 1))?.type).toBe("edge");
    expect(pieceAtSticker(4, solvedCube(4), at(4, 0, 1, 1))?.type).toBe(
      "center",
    );
  });

  it("색으로 찾으면 조각이 옮겨 간 자리에서 맞는다(어느 칸을 눌러도)", () => {
    const s = play(3, "F2");
    const target = { colors: ["U", "F"] as ("U" | "F")[] };
    // F2 뒤 흰-초록 모서리는 아래-앞
    const down = at(3, 3, 0, 1);
    const front = at(3, 2, 2, 1);
    expect(findHit(3, s, down, target)).not.toBeNull();
    expect(findHit(3, s, front, target)).toBe(findHit(3, s, down, target));
    // 원래 자리(위-앞)에는 이제 노랑-초록이 있다
    expect(findHit(3, s, at(3, 0, 2, 1), target)).toBeNull();
    expect(findHit(3, s, at(3, 2, 1, 1), { piece: "center" })).not.toBeNull();
    expect(findHit(3, s, front, { piece: "corner" })).toBeNull();
  });
});

describe("둘러보기", () => {
  it("큐브를 통째로 돌려 그 색 면이 그 자리로 왔는지 본다", () => {
    const goal = { color: "U", on: "D" } as const;
    expect(lookMet(3, solvedCube(3), goal)).toBe(false);
    expect(lookMet(3, play(3, "z2"), goal)).toBe(true);
    expect(lookMet(3, play(3, "x2"), goal)).toBe(true);
    expect(lookMet(2, play(2, "x2"), goal)).toBe(true);
    expect(lookMet(4, play(4, "x"), { color: "F", on: "U" })).toBe(true);
  });
});

describe("한 수 해 보기", () => {
  const start = solvedCube(3);
  it("공식의 몇 수째 모양인지, 다르면 -1", () => {
    expect(turnProgress(3, start, "R U", start)).toMatchObject({
      step: 0,
      total: 2,
      done: false,
    });
    expect(turnProgress(3, start, "R U", play(3, "R")).step).toBe(1);
    expect(turnProgress(3, start, "R U", play(3, "R U")).done).toBe(true);
    expect(turnProgress(3, start, "R U", play(3, "L")).step).toBe(-1);
  });

  it("결과 모양으로 보므로 R2를 R R로 쳐도 된다", () => {
    expect(turnProgress(3, start, "R2", play(3, "R R")).done).toBe(true);
    expect(turnProgress(3, start, "z2", play(3, "x2 y2")).done).toBe(true);
  });
});

describe("단계 그림과 시연 따라 하기", () => {
  const lesson: Lesson = {
    id: "t",
    size: 3,
    title: "t",
    summary: "",
    steps: [
      { kind: "text", body: "a" },
      {
        kind: "demo",
        body: "b",
        alg: "F2",
        setup: { alg: "F2" },
        mask: "cross",
      },
      { kind: "demo", body: "c", alg: "R" },
      {
        kind: "try",
        body: "d",
        alg: "F2",
        setup: { alg: "F2" },
        goal: "cross",
      },
      { kind: "text", body: "e", mask: "f2l" },
    ],
  };

  it("마스크가 없는 글 단계는 가장 가까운 단계의 마스크를 맞춘 큐브에 씌운다", () => {
    expect(stepPicture(lesson, 0)).toEqual({ setup: undefined, mask: "cross" });
    expect(stepPicture(lesson, 4)).toEqual({ setup: undefined, mask: "f2l" });
  });

  it("같은 해보기가 있는 시연에는 「직접 해 보기」를 붙이지 않는다", () => {
    expect(demoOffersTurn(lesson, 1)).toBe(false);
    expect(demoOffersTurn(lesson, 2)).toBe(true);
    expect(demoOffersTurn(lesson, 0)).toBe(false);
  });
});

describe("배우기 자료", () => {
  const steps = COURSES.flatMap((c) =>
    c.lessons.flatMap((l) =>
      l.steps.map((step, i) => ({ id: `${l.id}#${i}`, lesson: l, step })),
    ),
  );

  it("글만 읽고 넘기는 단계가 없다", () => {
    expect(
      steps.filter(({ step }) => step.kind === "text").map((s) => s.id),
    ).toEqual([]);
  });

  it("단원마다 직접 하는 단계가 있다", () => {
    for (const c of COURSES)
      for (const l of c.lessons)
        expect(l.steps.some(stepIsActive), l.id).toBe(true);
  });

  it("고르기 문제의 답이 고를 것 안에 있고 고를 것끼리 겹치지 않는다", () => {
    for (const { id, step } of steps) {
      if (!step.quiz) continue;
      expect(new Set(step.quiz.choices).size, id).toBe(
        step.quiz.choices.length,
      );
    }
  });

  it.each(steps)("$id 자료가 제 종류에 맞다", ({ lesson, step }) => {
    expect(stepProblem(lesson, step)).toBeNull();
  });

  it("한 수 해 보기는 시작 상황에서 끝까지 가면 통과한다", () => {
    for (const { lesson, step } of steps) {
      if (step.kind !== "turn" || !step.alg) continue;
      const n = lesson.size;
      const s0 =
        step.setup && "alg" in step.setup
          ? play(n, step.setup.alg)
          : solvedCube(n);
      expect(turnProgress(n, s0, step.alg, play(n, step.alg, s0)).done).toBe(
        true,
      );
    }
  });
});
