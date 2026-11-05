// 처음 맞추는 사람의 학습 흐름(docs/47 8-2 「흐름 보충」)에서 더한 시연·고르기 답·자리 찾기를 엔진으로 확인한다.
// 해 보기(상황 → 모범 답 → 목표)는 judge.test.ts가 모두 본다. 여기서는 글이 말하는 자리·방향이 맞는지 본다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  pieceFaces,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { COURSES } from "./index";
import { findHit, revealFound } from "./interact";
import { goalMet, maskFor } from "./judge";
import {
  CROSS_DOWN_SIDE,
  CROSS_DOWN_SIDE_TRY,
  CROSS_FLIPPED,
  CROSS_FLIPPED_TRY,
  CROSS_GUARD,
  CROSS_GUARD_TRY,
  CROSS_MIDDLE,
  CROSS_MIDDLE_R,
  CROSS_WRONG_TOP,
  CROSS_WRONG_TOP_TRY,
  SAFE_SETUP,
  SEXY,
} from "./lessons-333";
import { setupFor } from "./notation";
import { makeHintPlan } from "./taught-hint";
import type { FaceLetter, GoalName, Lesson } from "./types";

const F: Record<FaceLetter, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
const play = (n: number, alg: string, s: PuzzleState = solvedCube(n)) =>
  applyMoves(n, s, parseMoves(n, alg));

const lessonOf = (id: string): Lesson => {
  const l = COURSES.flatMap((c) => c.lessons).find((x) => x.id === id);
  if (!l) throw new Error(id);
  return l;
};

/** 자리(닿은 면)의 조각: 스티커마다 {놓인 면, 색} */
function slot(n: number, s: PuzzleState, faces: FaceLetter[]) {
  const want = faces.map((f) => F[f]).sort();
  const topo = cubeTopology(n);
  const i = topo.pieces.findIndex(
    (_, p) => pieceFaces(n, p).slice().sort().join() === want.join(),
  );
  const col = faceColors(n, s);
  const nn = n * n;
  return {
    piece: i,
    stickers: (topo.pieces[i]?.stickers ?? []).map((st) => ({
      face: Math.floor(st / nn),
      color: col[st] as number,
    })),
  };
}
/** 그 자리 조각에서 색 c가 놓인 면 */
const faceOf = (n: number, s: PuzzleState, at: FaceLetter[], c: number) =>
  slot(n, s, at).stickers.find((x) => x.color === c)?.face;
const colorsAt = (n: number, s: PuzzleState, at: FaceLetter[]) =>
  slot(n, s, at)
    .stickers.map((x) => x.color)
    .sort();

const WHITE = F.U;

describe("안전한 회전·위험한 회전", () => {
  const lesson = lessonOf("333-safe-turns");
  const cross = (s: PuzzleState) => goalMet(3, s, "white-cross");
  const start = play(3, SAFE_SETUP);

  it("시작 큐브는 흰 십자만 맞고 나머지는 흐트러졌다", () => {
    expect(cross(start)).toBe(true);
    expect(goalMet(3, start, "first-layer")).toBe(false);
  });

  it("반대 면(아랫면)은 어느 쪽으로 돌려도 십자가 그대로다", () => {
    for (const m of ["D", "D'", "D2"])
      expect(cross(play(3, m, start))).toBe(true);
  });

  it("맞춘 면(윗면)을 돌리면 십자가 어긋나고, 되돌리면 다시 맞는다", () => {
    for (const m of ["U", "U'", "U2"])
      expect(cross(play(3, m, start))).toBe(false);
    expect(cross(play(3, "U U'", start))).toBe(true);
  });

  it("단계: 아랫면 → 윗면 → 되돌리기 → 고르기", () => {
    const [safe, danger, undo, quiz] = lesson.steps;
    expect(safe?.kind).toBe("turn");
    expect(safe?.alg).toMatch(/^D/);
    expect(danger?.kind).toBe("turn");
    expect(danger?.alg).toMatch(/^U/);
    expect(undo?.kind).toBe("try");
    expect(undo?.goal).toBe("white-cross");
    const s = play(3, `${SAFE_SETUP} U`);
    expect(undo?.setup).toEqual({ alg: `${SAFE_SETUP} U` });
    expect(cross(s)).toBe(false);
    expect(cross(play(3, undo?.alg as string, s))).toBe(true);
    expect(quiz?.quiz?.choices[quiz.quiz.answer]).toMatch(/반대 면/);
  });
});

describe("흰 십자: 경우별 시연", () => {
  const lesson = lessonOf("333-white-cross");

  it("시연은 상황에서 아직 십자가 아니고, 시연 수를 두면 십자다", () => {
    for (const step of lesson.steps) {
      if (step.kind !== "demo" || !step.setup || !("alg" in step.setup))
        continue;
      const s = play(3, step.setup.alg);
      expect(goalMet(3, s, "white-cross"), step.body).toBe(false);
      expect(
        goalMet(3, play(3, step.alg as string, s), "white-cross"),
        step.body,
      ).toBe(true);
    }
  });

  it("글이 말하는 엣지 자리와 흰색이 보는 쪽", () => {
    const at = (c: { setup: string }) => play(3, c.setup);
    // 가운데 줄 앞-오른쪽: 흰색이 오른쪽 / 앞
    expect(faceOf(3, at(CROSS_MIDDLE), ["F", "R"], WHITE)).toBe(F.R);
    expect(faceOf(3, at(CROSS_MIDDLE_R), ["F", "R"], WHITE)).toBe(F.F);
    expect(faceOf(3, at(CROSS_GUARD), ["F", "R"], WHITE)).toBe(F.R);
    // 흰-빨강인데 빨강이 앞면에 붙음
    expect(faceOf(3, at(CROSS_GUARD), ["F", "R"], F.R)).toBe(F.F);
    // 흰-초록인데 초록이 오른쪽 면에 붙음
    expect(faceOf(3, at(CROSS_GUARD_TRY), ["F", "R"], F.F)).toBe(F.R);
    // 아래층 흰색 옆: 흰-빨강이 아래-오른쪽(흰색 오른쪽), 흰-초록이 아래-앞(흰색 앞)
    expect(colorsAt(3, at(CROSS_DOWN_SIDE), ["D", "R"])).toEqual([0, 1]);
    expect(faceOf(3, at(CROSS_DOWN_SIDE), ["D", "R"], WHITE)).toBe(F.R);
    expect(colorsAt(3, at(CROSS_DOWN_SIDE_TRY), ["D", "F"])).toEqual([0, 2]);
    expect(faceOf(3, at(CROSS_DOWN_SIDE_TRY), ["D", "F"], WHITE)).toBe(F.F);
    // 윗층 제자리에서 뒤집힘
    expect(colorsAt(3, at(CROSS_FLIPPED), ["U", "F"])).toEqual([0, 2]);
    expect(faceOf(3, at(CROSS_FLIPPED), ["U", "F"], WHITE)).toBe(F.F);
    expect(colorsAt(3, at(CROSS_FLIPPED_TRY), ["U", "R"])).toEqual([0, 1]);
    expect(faceOf(3, at(CROSS_FLIPPED_TRY), ["U", "R"], WHITE)).toBe(F.R);
    // 윗층 흰색 위, 엉뚱한 자리: 흰-빨강이 위-앞, 흰-주황이 위-오른쪽
    expect(colorsAt(3, at(CROSS_WRONG_TOP), ["U", "F"])).toEqual([0, 1]);
    expect(faceOf(3, at(CROSS_WRONG_TOP), ["U", "F"], WHITE)).toBe(F.U);
    expect(colorsAt(3, at(CROSS_WRONG_TOP_TRY), ["U", "R"])).toEqual([0, 4]);
  });

  it("경우별 모범 답은 힌트(배우는 방식 해법)가 내는 수와 같고, F·D·y만 쓴다", () => {
    for (const c of [
      CROSS_MIDDLE,
      CROSS_MIDDLE_R,
      CROSS_GUARD,
      CROSS_GUARD_TRY,
      CROSS_DOWN_SIDE,
      CROSS_DOWN_SIDE_TRY,
      CROSS_FLIPPED,
      CROSS_FLIPPED_TRY,
      CROSS_WRONG_TOP,
      CROSS_WRONG_TOP_TRY,
    ]) {
      const plan = makeHintPlan("cross", play(3, c.setup));
      expect(plan?.moves.join(" "), c.alg).toBe(c.alg);
      expect(c.alg).toMatch(/^([FDy]['2]? ?)+$/);
    }
  });

  it("단원의 흰 십자 모범 답은 모두 F·D·y만 쓴다", () => {
    for (const step of lesson.steps)
      if (step.alg) expect(step.alg, step.body).toMatch(/^([FDy]['2]? ?)+$/);
  });

  it("고르기: 가운데 줄은 옆색이 붙은 면을 앞으로 가져와 앞면으로 올린다", () => {
    const s = play(3, CROSS_MIDDLE_R.setup);
    const ok = (alg: string) => goalMet(3, play(3, alg, s), "white-cross");
    expect(ok("y F")).toBe(true);
    for (const wrong of ["F", "F'", "U", "U'"]) expect(ok(wrong)).toBe(false);
  });

  it("고르기: 아래층 흰색 옆을 반 바퀴로 올리면 뒤집혀 올라간다", () => {
    const s = play(3, `${CROSS_DOWN_SIDE.setup} R2`);
    expect(colorsAt(3, s, ["U", "R"])).toEqual([0, 1]);
    expect(faceOf(3, s, ["U", "R"], WHITE)).toBe(F.R);
  });
});

describe("둘째 층", () => {
  it("박힌 엣지: 앞-오른쪽 칸에 앞-왼쪽 칸의 엣지", () => {
    const step = lessonOf("333-second-layer").steps.find((x) =>
      x.body.includes("다른 칸(앞-왼쪽)"),
    );
    if (!step?.setup || !("alg" in step.setup)) throw new Error("단계 없음");
    const s = play(3, step.setup.alg);
    // 앞-왼쪽 칸 조각 = 초록·빨강 (흰 면 아래로 쥐면 왼쪽이 빨강)
    expect(colorsAt(3, s, ["F", "R"])).toEqual([1, 2]);
  });
});

describe("2×2 자리 정하기", () => {
  it("흰-초록-빨강 왼쪽 이웃은 흰-초록-주황", () => {
    expect(colorsAt(2, solvedCube(2), ["U", "F", "L"])).toEqual([0, 2, 4]);
  });

  it("흰 면을 아래로 뒤집으면 기준 흰-초록-빨강은 아래-앞-왼쪽", () => {
    const s = play(2, setupFor(SEXY, "z2"));
    expect(colorsAt(2, s, ["D", "F", "L"])).toEqual([0, 1, 2]);
  });

  it("2×2 살펴보기 첫 단계는 조각 단원과 겹치는 코너 찾기가 아니다", () => {
    const first = lessonOf("222-intro").steps[0];
    expect(first?.kind).toBe("quiz");
  });

  it("오르테가 둘째 단계 해 보기가 있다", () => {
    expect(
      lessonOf("222-ortega").steps.some(
        (s) => s.goal === ("2x2-both-faces" as GoalName),
      ),
    ).toBe(true);
  });
});

describe("찾은 조각 드러내기", () => {
  it("센터만 보이는 큐브에서 찾은 코너의 세 칸만 보이게 된다", () => {
    const s = play(3, "R");
    const mask = maskFor(3, "centers");
    const target = { colors: ["U", "F", "R"] as FaceLetter[] };
    let hit: number | null = null;
    for (let i = 0; i < 54 && hit === null; i++) hit = findHit(3, s, i, target);
    expect(hit).not.toBeNull();
    const shown = revealFound(3, s, mask, [hit as number]);
    const before = (mask ?? []).filter((v) => v === "visible").length;
    expect(shown?.filter((v) => v === "visible").length).toBe(before + 3);
    // 드러난 자리의 칸이 그 조각의 색이다(지금 자리 기준)
    const slots = cubeTopology(3).pieces[hit as number]?.stickers ?? [];
    for (const i of slots) expect(shown?.[s.perm[i] as number]).toBe("visible");
  });

  it("가리지 않았거나 찾은 것이 없으면 그대로", () => {
    const s = solvedCube(3);
    expect(revealFound(3, s, null, [3])).toBeNull();
    const mask = maskFor(3, "centers");
    expect(revealFound(3, s, mask, [])).toBe(mask);
  });
});
