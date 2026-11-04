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
  A_PERM,
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
  SEXY,
  STUCK_CORNER,
} from "./lessons-333";
import { setupFor } from "./notation";
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
const centerOf = (n: number, s: PuzzleState, f: FaceLetter) =>
  faceColors(n, s)[F[f] * n * n + (n * n - 1) / 2] as number;

const WHITE = F.U;
const YELLOW = F.D;

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

  it("글이 말하는 모서리 자리와 흰색이 보는 쪽", () => {
    const at = (sol: string) => play(3, setupFor(sol));
    // 가운데 줄 앞-오른쪽: 흰색이 오른쪽 / 앞
    expect(faceOf(3, at(CROSS_MIDDLE.alg), ["F", "R"], WHITE)).toBe(F.R);
    expect(faceOf(3, at(CROSS_MIDDLE_R.alg), ["F", "R"], WHITE)).toBe(F.F);
    expect(faceOf(3, at(CROSS_GUARD.alg), ["F", "R"], WHITE)).toBe(F.R);
    // 흰-빨강인데 빨강이 앞면에 붙음
    expect(faceOf(3, at(CROSS_GUARD.alg), ["F", "R"], F.R)).toBe(F.F);
    // 흰-초록인데 초록이 오른쪽 면에 붙음
    expect(faceOf(3, at(CROSS_GUARD_TRY.alg), ["F", "R"], F.F)).toBe(F.R);
    // 아래층 흰색 옆
    expect(faceOf(3, at(CROSS_DOWN_SIDE.alg), ["D", "F"], WHITE)).toBe(F.F);
    expect(faceOf(3, at(CROSS_DOWN_SIDE_TRY.alg), ["D", "R"], WHITE)).toBe(F.R);
    // 윗층 제자리에서 뒤집힘
    expect(colorsAt(3, at(CROSS_FLIPPED.alg), ["U", "F"])).toEqual([0, 2]);
    expect(faceOf(3, at(CROSS_FLIPPED.alg), ["U", "F"], WHITE)).toBe(F.F);
    expect(colorsAt(3, at(CROSS_FLIPPED_TRY.alg), ["U", "R"])).toEqual([0, 1]);
    expect(faceOf(3, at(CROSS_FLIPPED_TRY.alg), ["U", "R"], WHITE)).toBe(F.R);
    // 윗층 흰색 위, 엉뚱한 자리
    expect(colorsAt(3, at(CROSS_WRONG_TOP.alg), ["U", "R"])).toEqual([0, 2]);
    expect(faceOf(3, at(CROSS_WRONG_TOP.alg), ["U", "R"], WHITE)).toBe(F.U);
    expect(colorsAt(3, at(CROSS_WRONG_TOP_TRY.alg), ["U", "F"])).toEqual([
      0, 1,
    ]);
  });

  it("고르기: 가운데 줄은 옆색이 붙은 면을 돌려 올린다", () => {
    const s = play(3, setupFor(CROSS_MIDDLE_R.alg));
    const ok = (alg: string) => goalMet(3, play(3, alg, s), "white-cross");
    expect(ok("R")).toBe(true);
    for (const wrong of ["F", "F'", "U", "U'"]) expect(ok(wrong)).toBe(false);
  });

  it("고르기: 아래층 흰색 옆을 반 바퀴로 올리면 뒤집혀 올라간다", () => {
    const s = play(3, `${setupFor(CROSS_DOWN_SIDE.alg)} F2`);
    expect(colorsAt(3, s, ["U", "F"])).toEqual([0, 2]);
    expect(faceOf(3, s, ["U", "F"], WHITE)).toBe(F.F);
  });
});

describe("첫 층 꼭짓점", () => {
  const held = (alg: string) => play(3, setupFor(alg, "z2"));

  it("뒤집은 뒤 오른쪽 가운데는 주황", () => {
    expect(centerOf(3, play(3, "z2"), "R")).toBe(F.L);
  });

  it("두 옆색으로 고른 칸이 그 꼭짓점의 제자리다", () => {
    const done = play(3, "z2");
    // 흰-초록-주황 → 아래-앞-오른쪽, 흰-파랑-빨강 → 아래-뒤-왼쪽
    expect(colorsAt(3, done, ["D", "F", "R"])).toEqual([0, 2, 4]);
    expect(colorsAt(3, done, ["D", "B", "L"])).toEqual([0, 1, 5]);
    const step = lessonOf("333-first-corners").steps.find(
      (s) => s.find?.at?.join() === "D,F,R",
    );
    expect(step?.find?.at).toEqual(["D", "F", "R"]);
  });

  it("U'를 치면 흰-초록-주황이 넣을 칸 바로 위에 온다", () => {
    const s = play(3, "U'", held(`U' ${SEXY}`));
    expect(colorsAt(3, s, ["U", "F", "R"])).toEqual([0, 2, 4]);
  });

  it("제 칸에서 돌아감: 흰색이 오른쪽이면 두 번, 앞이면 네 번", () => {
    const two = held(`${SEXY} ${SEXY}`);
    expect(colorsAt(3, two, ["D", "F", "R"])).toEqual([0, 2, 4]);
    expect(faceOf(3, two, ["D", "F", "R"], WHITE)).toBe(F.R);
    const four = held(`${SEXY} ${SEXY} ${SEXY} ${SEXY}`);
    expect(faceOf(3, four, ["D", "F", "R"], WHITE)).toBe(F.F);
    for (const [s, k] of [
      [two, 2],
      [four, 4],
    ] as const) {
      expect(
        goalMet(3, play(3, Array(k).fill(SEXY).join(" "), s), "first-layer"),
      ).toBe(true);
      expect(goalMet(3, play(3, SEXY, s), "first-layer")).toBe(false);
    }
  });

  it("박힌 꼭짓점: 앞-왼쪽 아래 칸에 다른 흰 꼭짓점이 있다", () => {
    const s = held(STUCK_CORNER);
    const c = colorsAt(3, s, ["D", "F", "L"]);
    expect(c).toContain(WHITE);
    expect(c).not.toEqual([0, 1, 2]); // 흰-빨강-초록(제자리 조각)이 아니다
    expect(goalMet(3, s, "white-cross")).toBe(true);
  });
});

describe("둘째 층·마지막 층", () => {
  it("박힌 모서리: 앞-오른쪽 칸에 앞-왼쪽 칸의 모서리", () => {
    const step = lessonOf("333-second-layer").steps.find((x) =>
      x.body.includes("다른 칸(앞-왼쪽)"),
    );
    if (!step?.setup || !("alg" in step.setup)) throw new Error("단계 없음");
    const s = play(3, step.setup.alg);
    // 앞-왼쪽 칸 조각 = 초록·빨강 (흰 면 아래로 쥐면 왼쪽이 빨강)
    expect(colorsAt(3, s, ["F", "R"])).toEqual([1, 2]);
  });

  it("ㄱ자 노란 모서리는 왼쪽과 뒤", () => {
    const s = play(3, setupFor("F U R U' R' F'", "z2"));
    const up = (["L", "R", "F", "B"] as const).filter(
      (f) => faceOf(3, s, ["U", f], YELLOW) === F.U,
    );
    expect(up.sort()).toEqual(["B", "L"]);
  });

  it("노란 면 쥐는 법: 0개는 U로 노랑이 왼쪽, 2개는 U'로 노랑이 앞", () => {
    const zero = play(3, setupFor("R U2 R' U' R U R' U' R U' R'", "z2"));
    expect(faceOf(3, play(3, "U", zero), ["U", "F", "L"], YELLOW)).toBe(F.L);
    const two = play(3, setupFor("F' r U R' U' r' F R", "z2"));
    expect(faceOf(3, play(3, "U'", two), ["U", "F", "L"], YELLOW)).toBe(F.F);
  });

  it("A퍼뮤는 앞-왼쪽 꼭짓점만 그대로 둔다, U퍼뮤는 뒤 모서리만 그대로 둔다", () => {
    const moved = (alg: string, at: FaceLetter[][]) => {
      const s = play(3, setupFor(alg, "z2"));
      const after = play(3, alg, s);
      return at.map(
        (a) => colorsAt(3, s, a).join() !== colorsAt(3, after, a).join(),
      );
    };
    expect(
      moved(A_PERM, [
        ["U", "F", "L"],
        ["U", "F", "R"],
        ["U", "B", "L"],
        ["U", "B", "R"],
      ]),
    ).toEqual([false, true, true, true]);
    expect(
      moved("R U' R U R U R U' R' U' R2", [
        ["U", "F"],
        ["U", "R"],
        ["U", "B"],
        ["U", "L"],
      ]),
    ).toEqual([true, true, false, true]);
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

  it("2×2 살펴보기 첫 단계는 조각 단원과 겹치는 꼭짓점 찾기가 아니다", () => {
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
  it("가운데만 보이는 큐브에서 찾은 꼭짓점의 세 칸만 보이게 된다", () => {
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
