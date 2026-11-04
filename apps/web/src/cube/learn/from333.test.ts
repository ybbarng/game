// 「3×3을 아는 사람의 2×2」: 3×3 공식이 2×2 꼭짓점을 똑같이 움직이는지, 과정 자리와 단원 첫머리를 엔진으로 확인한다.
// 해 보기(상황 → 모범 답 → 목표)는 judge.test.ts·__test__/lessons.test.ts가 모든 과정에 대해 본다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  pieceName,
  piecesOfKind,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { COURSES } from "./index";
import { goalMet, maskFor, placedTopCorners, stateForRule } from "./judge";
import {
  DIAGONAL_222,
  DIAGONAL_222_SOLVE,
  NEIGHBORS_222_SOLVE,
} from "./lessons-222-from333";
import {
  CORNER_CYCLE,
  CORNER_TWIST,
  CORNERS_NONE,
  reps,
  STUCK_CORNER_UP,
  TWIST_TWO,
} from "./lessons-333";
import { setupFor } from "./notation";

/** 꼭짓점 자리 이름(UFR 등) → 그 자리 칸들의 (면, 색) */
function cornerColors(n: number, alg: string): Map<string, string> {
  const s = applyMoves(n, solvedCube(n), parseMoves(n, alg));
  const colors = faceColors(n, s);
  const topo = cubeTopology(n);
  const out = new Map<string, string>();
  for (const p of piecesOfKind(n, "corner")) {
    const v = (topo.pieces[p]?.stickers ?? [])
      .map((i) => `${topo.stickers[i]?.face}:${colors[i]}`)
      .sort()
      .join(" ");
    out.set(pieceName(n, p), v);
  }
  return out;
}

describe("3×3을 아는 사람의 2×2", () => {
  const course = COURSES.find((c) => c.id === "222-from333");

  it("2×2 묶음에서 초보자 다음 자리, 3×3 초보자를 마치면 추천", () => {
    const two = COURSES.filter((c) => c.size === 2).map((c) => c.id);
    expect(two.slice(0, 2)).toEqual(["222-beginner", "222-from333"]);
    expect(course?.recommendAfter).toBe("333-beginner");
  });

  it.each([
    CORNER_TWIST,
    reps(CORNER_TWIST, 3),
    CORNER_CYCLE,
    CORNERS_NONE,
    STUCK_CORNER_UP,
    `z2 ${TWIST_TWO}`,
  ])("%s는 2×2와 3×3의 꼭짓점을 똑같이 옮긴다", (alg) => {
    expect(cornerColors(2, alg)).toEqual(cornerColors(3, alg));
  });

  it("단원마다 3×3의 어느 단계와 같은지 첫머리에 적는다", () => {
    for (const [id, name] of [
      ["222-from333-first-layer-up", "첫 층 꼭짓점"],
      ["222-from333-corner-place", "꼭짓점 자리"],
      ["222-from333-corner-twist", "꼭짓점 방향"],
    ]) {
      const l = course?.lessons.find((x) => x.id === id);
      expect(l?.steps[0]?.body, id).toContain(`3×3에서 했던 「${name}」`);
      // 3×3 단원 이름과 같다
      expect(
        COURSES.find((c) => c.id === "333-beginner")?.lessons.some(
          (x) => x.title === name,
        ),
      ).toBe(true);
    }
  });

  const p2 = (alg: string, s = solvedCube(2)) =>
    alg.trim() ? applyMoves(2, s, parseMoves(2, alg)) : s;
  const U4 = ["", "U", "U2", "U'"];
  const Y4 = ["", "y", "y2", "y'"];
  const byU = (s: ReturnType<typeof solvedCube>) =>
    U4.map((k) => placedTopCorners(2, p2(k, s)));

  it("꼭짓점 자리 고르기: 제자리 둘 → U로 하나", () => {
    const s = p2(setupFor(`U ${CORNER_CYCLE}`, "z2"));
    expect(placedTopCorners(2, s)).toBe(2);
    expect(placedTopCorners(2, p2("U", s))).toBe(1);
  });

  it("대각 바꿈은 어느 U에서도 제자리가 꼭 하나가 아니고, 0인 자리에서 한 번 하면 하나인 자리가 생긴다", () => {
    const s = p2(setupFor(DIAGONAL_222, "z2"));
    expect(byU(s)).not.toContain(1);
    const zero = U4.find((k) => placedTopCorners(2, p2(k, s)) === 0) as string;
    for (const y of Y4)
      expect(byU(p2(`${zero} ${y} ${CORNER_CYCLE}`, s)), y).toContain(1);
    expect(goalMet(2, p2(DIAGONAL_222_SOLVE, s), "2x2-corners-placed")).toBe(
      true,
    );
    // 모범 답의 첫 U는 제자리 0인 자리, 한 번 뒤 제자리 하나
    expect(placedTopCorners(2, p2("U", s))).toBe(0);
    expect(placedTopCorners(2, p2(`U ${CORNER_CYCLE}`, s))).toBe(1);
  });

  it("이웃 둘 바뀜은 U 한 번으로 제자리 하나", () => {
    const s = p2(setupFor("R U R' U' R' F R2 U' R' U' R U R' F'", "z2"));
    expect(placedTopCorners(2, p2("U", s))).toBe(1);
    expect(goalMet(2, p2(NEIGHBORS_222_SOLVE, s), "2x2-corners-placed")).toBe(
      true,
    );
  });

  it("첫 층만 맞은 2×2: 제자리 하나인 U 자리가 있거나, 없으면 0인 자리에서 한 번 하면 생긴다", () => {
    for (let seed = 1; seed <= 24; seed++) {
      const s = stateForRule("2x2-first-layer-solved", seed);
      const counts = byU(s);
      if (counts.includes(1) || counts.includes(4)) continue;
      const zero = U4.find((k) => placedTopCorners(2, p2(k, s)) === 0);
      expect(zero, `${seed}`).toBeDefined();
      const t = p2(`${zero} ${CORNER_CYCLE}`, s);
      expect(
        byU(t).some((c) => c === 1 || c === 4),
        `${seed}`,
      ).toBe(true);
    }
  });

  it("꼭짓점 방향: 2×2에서도 두 번 → U → 네 번 → U'로 끝난다", () => {
    const s = p2(setupFor(TWIST_TWO, "z2"));
    expect(goalMet(2, p2(reps(CORNER_TWIST, 2), s), "2x2-first-layer")).toBe(
      false,
    );
    expect(goalMet(2, p2(TWIST_TWO, s), "solved")).toBe(true);
  });

  it("꼭짓점 가리기: 3×3에서 꼭짓점 8 × 3칸만 보인다", () => {
    const m = maskFor(3, "corners") ?? [];
    expect(m.filter((v) => v === "visible")).toHaveLength(24);
  });
});
