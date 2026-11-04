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
import { maskFor } from "./judge";
import { A_PERM, SEXY, SUNE } from "./lessons-333";

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

  it.each([SEXY, SUNE, A_PERM, `${A_PERM} U ${A_PERM}`])(
    "%s는 2×2와 3×3의 꼭짓점을 똑같이 옮긴다",
    (alg) => {
      expect(cornerColors(2, alg)).toEqual(cornerColors(3, alg));
    },
  );

  it("단원마다 3×3의 어느 단계와 같은지 첫머리에 적는다", () => {
    for (const [id, name] of [
      ["222-from333-first-layer", "첫 층 꼭짓점"],
      ["222-from333-yellow-face", "노란 면"],
      ["222-from333-yellow-corners", "위 꼭짓점 자리"],
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

  it("꼭짓점 가리기: 3×3에서 꼭짓점 8 × 3칸만 보인다", () => {
    const m = maskFor(3, "corners") ?? [];
    expect(m.filter((v) => v === "visible")).toHaveLength(24);
  });
});
