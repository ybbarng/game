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
  CROSS_DOWN,
  CROSS_DOWN_FAR,
  CROSS_DOWN_L,
  CROSS_DOWN_MOVE,
  CROSS_DOWN_R,
  CROSS_FLIP,
  CROSS_FLIP_R,
  CROSS_FLIPPED,
  CROSS_FLIPPED_TRY,
  CROSS_MIDDLE,
  CROSS_MIDDLE_L,
  CROSS_MIDDLE_SIDE,
  CROSS_SIDE,
  CROSS_SIDE_MOVE,
  CROSS_SIDE_TRY,
  CROSS_TOP_WRONG,
  CROSS_TOP_WRONG_TRY,
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

  it("쪽: 아랫면 → 윗면 → 되돌리기 → 옆면 돌렸다 되돌리기 → 고르기", () => {
    const [safe, danger, undo, side, quiz] = lesson.steps;
    // 옆면(앞면)을 돌리면 십자가 어긋나고, 같은 면을 되돌리면 다시 맞는다(흐트러뜨렸다 되돌리는 꼴)
    expect(side?.kind).toBe("turn");
    expect(side?.alg).toBe("F F'");
    expect(cross(play(3, "F", start))).toBe(false);
    expect(cross(play(3, "F F'", start))).toBe(true);
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

  // 상황마다 글(where·쪽 글)이 말하는 자리, 그 자리의 색, 흰 스티커가 보는 면
  const PLACES: [string, { setup: string }, FaceLetter[], number[], number][] =
    [
      ["아래-앞, 흰색 아래", CROSS_DOWN, ["D", "F"], [0, 2], F.D],
      ["흰-빨강 빨강 센터 밑", CROSS_DOWN_R, ["D", "R"], [0, 1], F.D],
      ["흰-주황 주황 센터 밑", CROSS_DOWN_L, ["D", "L"], [0, 4], F.D],
      ["아래-오른쪽, 흰색 아래", CROSS_DOWN_MOVE, ["D", "R"], [0, 2], F.D],
      ["아래-앞, 흰색 앞", CROSS_FLIP, ["D", "F"], [0, 2], F.F],
      ["흰-빨강 빨강 센터 밑, 흰색 옆", CROSS_FLIP_R, ["D", "R"], [0, 1], F.R],
      ["아래-오른쪽, 흰색 오른쪽", CROSS_SIDE, ["D", "R"], [0, 2], F.R],
      ["아래-뒤, 흰색 뒤", CROSS_SIDE_MOVE, ["D", "B"], [0, 2], F.B],
      [
        "흰-주황 아래-오른쪽, 흰색 오른쪽",
        CROSS_SIDE_TRY,
        ["D", "R"],
        [0, 4],
        F.R,
      ],
      ["앞-오른쪽, 흰색 앞", CROSS_MIDDLE, ["F", "R"], [0, 2], F.F],
      ["앞-왼쪽, 흰색 왼쪽", CROSS_MIDDLE_L, ["F", "L"], [0, 2], F.L],
      ["앞-오른쪽, 흰색 오른쪽", CROSS_MIDDLE_SIDE, ["F", "R"], [0, 2], F.R],
      ["제자리에서 뒤집힘", CROSS_FLIPPED, ["U", "F"], [0, 2], F.F],
      ["흰-빨강 제자리에서 뒤집힘", CROSS_FLIPPED_TRY, ["U", "R"], [0, 1], F.R],
      ["흰-초록이 흰-빨강 자리", CROSS_TOP_WRONG, ["U", "R"], [0, 2], F.U],
      ["흰-빨강이 위-앞", CROSS_WRONG_TOP, ["U", "F"], [0, 1], F.U],
      ["흰-주황이 위-오른쪽", CROSS_WRONG_TOP_TRY, ["U", "R"], [0, 4], F.U],
    ];

  it("글이 말하는 엣지 자리와 흰색이 보는 쪽", () => {
    for (const [name, c, at, colors, white] of PLACES) {
      const s = play(3, c.setup);
      expect(colorsAt(3, s, at), name).toEqual(colors);
      expect(faceOf(3, s, at, WHITE), name).toBe(white);
    }
  });

  it("경우별 모범 답은 힌트(경우별 정해진 길)가 내는 수와 같다", () => {
    for (const c of [
      CROSS_DOWN,
      CROSS_DOWN_R,
      CROSS_DOWN_L,
      CROSS_DOWN_MOVE,
      CROSS_DOWN_FAR,
      CROSS_FLIP,
      CROSS_FLIP_R,
      CROSS_SIDE,
      CROSS_SIDE_MOVE,
      CROSS_SIDE_TRY,
      CROSS_MIDDLE,
      CROSS_MIDDLE_L,
      CROSS_MIDDLE_SIDE,
      CROSS_FLIPPED,
      CROSS_FLIPPED_TRY,
      CROSS_TOP_WRONG,
      CROSS_TOP_WRONG_TRY,
      CROSS_WRONG_TOP,
      CROSS_WRONG_TOP_TRY,
    ]) {
      const plan = makeHintPlan("cross", play(3, c.setup));
      expect(plan?.moves.join(" "), c.alg).toBe(c.alg);
    }
  });

  it("단원의 흰 십자 모범 답은 y·D·F와, 같은 공식 안에서 되돌리는 오른쪽 면(R F' R'·R' D' R)만 쓴다", () => {
    for (const step of lesson.steps) {
      if (!step.alg) continue;
      const rest = step.alg.replaceAll("R F' R'", "").replaceAll("R' D' R", "");
      expect(rest, step.alg).toMatch(/^([FDy]['2]? ?|\s)*$/);
    }
  });

  it("고르기: 아래-앞에서 흰색이 앞이면 F2로 올려도 제자리에서 뒤집혀 들어간다", () => {
    const s = play(3, "F2", play(3, CROSS_FLIP.setup));
    expect(goalMet(3, s, "white-cross")).toBe(false);
    expect(colorsAt(3, s, ["U", "F"])).toEqual([0, 2]);
    expect(faceOf(3, s, ["U", "F"], WHITE)).toBe(F.F);
  });

  it("고르기: 아래-오른쪽에서 흰색이 오른쪽이면 R부터 친다(D부터 치면 아래-뒤로 비켜나 R F' R'로 맞지 않는다)", () => {
    const s = play(3, CROSS_SIDE.setup);
    const ok = (alg: string) => goalMet(3, play(3, alg, s), "white-cross");
    expect(ok("R F' R'")).toBe(true);
    expect(colorsAt(3, play(3, "D", s), ["D", "B"])).toEqual([0, 2]);
    for (const wrong of ["D R F' R'", "F2"])
      expect(ok(wrong), wrong).toBe(false);
  });

  it("고르기: 흰 엣지 셋을 올린 큐브에서 아랫면은 몇 번 돌려도 셋이 그대로이고, 오른쪽 면·윗면은 흐트러뜨린다", () => {
    const s = play(3, CROSS_SIDE_MOVE.setup);
    const placed = (t: PuzzleState) =>
      (
        [
          ["U", "R"],
          ["U", "B"],
          ["U", "L"],
        ] as FaceLetter[][]
      ).filter(
        (at) =>
          faceOf(3, t, at, WHITE) === F.U &&
          colorsAt(3, t, at)[1] === F[at[1] as FaceLetter],
      ).length;
    expect(placed(s)).toBe(3);
    for (const d of ["D", "D'", "D2"]) expect(placed(play(3, d, s)), d).toBe(3);
    expect(placed(play(3, "R", s))).toBe(2);
    expect(placed(play(3, "U", s))).toBe(0);
  });
});

describe("둘째 층", () => {
  it("박힌 엣지: 앞-오른쪽 칸에 앞-왼쪽 칸의 엣지", () => {
    const step = lessonOf("333-second-layer").steps.find((x) =>
      x.body.includes("앞-왼쪽 자리의 엣지"),
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

  it("2×2 한눈에 첫 단계는 조각 단원과 겹치는 코너 찾기가 아니다", () => {
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
