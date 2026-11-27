// 「가리기」 보기의 원칙(2026-11-27 사용자, docs/47 16-33): 앞 단계까지 맞춘 조각은 색으로, 이번 단계에서 볼 조각은
// 색으로, 나머지만 까맣거나 회색으로. 신광사 해법 강의는 단계마다 앞 단계 조각이 가려지지 않는지, 다른 강의의 노란 면
// 단계(가리기 「f2l-oll」·「ll-twist」)는 시작 상태가 정말 아래 두 층이 맞은 상태인지 본다.
import {
  applyMoves,
  cubeGroups,
  cubeTopology,
  parseMoves,
  solvedCube,
  U,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { COURSES } from "./courses";
import { goalMet, maskFor } from "./judge";
import { TWIST_FIRST_333 } from "./lessons-twist-first";

const g = cubeGroups(3, U);
const topo = cubeTopology(3);
const all = topo.pieces.map((_, p) => p);

/** 강마다 앞 단계까지 맞춘 조각(이번 단계 조각은 각 가리기가 따로 보인다) */
const EARLIER: Record<string, readonly number[]> = {
  "333-tf-cross": g.centers,
  "333-tf-corners": [...g.cross, ...g.centers],
  "333-tf-second": [...g.cross, ...g.firstLayerCorners, ...g.centers],
  "333-tf-eo": g.f2l,
  "333-tf-ep": g.f2l,
  "333-tf-twist": [...g.f2l, ...g.lastLayerEdges],
  "333-tf-place": all,
};

describe("신광사 해법: 가리기는 앞 단계까지 맞춘 조각을 가리지 않는다", () => {
  for (const lesson of TWIST_FIRST_333.lessons) {
    it(lesson.title, () => {
      const want = EARLIER[lesson.id] as readonly number[];
      const hidden: string[] = [];
      lesson.steps.forEach((step, i) => {
        const mask = maskFor(3, step.mask);
        if (!mask) return;
        for (const p of want)
          if (
            (topo.pieces[p]?.stickers ?? []).some((s) => mask[s] !== "visible")
          )
            hidden.push(`${i + 1}번 쪽(${step.mask}) 조각 ${p}`);
      });
      expect(hidden).toEqual([]);
    });
  }

  it("코너 방향은 윗층 코너 블럭의 노란 칸을 보이고 다른 칸은 회색이다", () => {
    const mask = maskFor(3, "ll-twist") ?? [];
    for (const p of g.lastLayerCorners) {
      const vis = (topo.pieces[p]?.stickers ?? []).map((s) => mask[s]);
      expect(vis.filter((v) => v === "visible").length).toBe(1);
      expect(vis.filter((v) => v === "gray").length).toBe(2);
    }
  });
});

describe("다른 강의 노란 면 단계(「f2l-oll」·「ll-twist」)는 아래 두 층이 맞은 상태에서 쓴다", () => {
  for (const course of COURSES)
    for (const lesson of course.lessons) {
      if (lesson.size !== 3) continue;
      lesson.steps.forEach((step, i) => {
        if (step.mask !== "f2l-oll" && step.mask !== "ll-twist") return;
        if (!step.setup || !("alg" in step.setup)) return;
        const alg = step.setup.alg;
        it(`${lesson.id} ${i + 1}번`, () => {
          const s = applyMoves(3, solvedCube(3), parseMoves(3, alg));
          expect(goalMet(3, s, "f2l")).toBe(true);
        });
      });
    }
});
