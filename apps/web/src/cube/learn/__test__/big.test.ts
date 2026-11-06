import { describe, expect, it } from "vitest";
import { courseById } from "..";
import { EDGES_5X5, PARITY_4X4 } from "../algs-big";
import { belowTopIntact, centersSolved, unpairedEdges } from "./big";
import { apply, colorMap, diffStickers, isSolved, key, solved } from "./sim";

const find = <T extends { id: string }>(list: T[], id: string) => {
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

// 위-앞 엣지의 두 날개가 뒤집혔나(윗면 칸이 앞면 색, 앞면 칸이 윗면 색)
const ufFlipped = (n: number) => (alg: string) => {
  const m = n - 1;
  const c = apply(solved(n), alg);
  // 날개만(5×5의 센터 블럭 x=0은 뺀다)
  const wings = c.stickers.filter(
    (s) =>
      s.pos[1] === m &&
      s.pos[2] === m &&
      Math.abs(s.pos[0]) < m &&
      s.pos[0] !== 0,
  );
  return wings.every((s) =>
    s.normal[1] === 1 ? s.color === 2 : s.color === 0,
  );
};

describe("4×4 패리티", () => {
  it("OLL 패리티: 아래 두 층을 지키고 위-앞 엣지를 뒤집는다", () => {
    for (const alg of find(PARITY_4X4, "parity-4x4-oll").algs) {
      const c = apply(solved(4), alg);
      expect(belowTopIntact(c), alg).toBe(true);
      expect(ufFlipped(4)(alg), alg).toBe(true);
      expect(unpairedEdges(c), alg).toBe(0);
    }
    // 둘째 공식은 그 엣지만 뒤집는다(스티커 네 칸)
    expect(
      diffStickers(
        apply(solved(4), find(PARITY_4X4, "parity-4x4-oll").algs[1] as string),
      ),
    ).toHaveLength(4);
  });

  it("PLL 패리티: 위-앞·위-뒤 엣지만 맞바꾼다", () => {
    const alg = find(PARITY_4X4, "parity-4x4-pll").algs[0] as string;
    const d = diffStickers(apply(solved(4), alg));
    expect(d).toHaveLength(4);
    expect(
      d.every(
        (s) =>
          s.pos[1] === 3 &&
          Math.abs(s.pos[0]) === 1 &&
          Math.abs(s.pos[2]) === 3,
      ),
    ).toBe(true);
  });
});

describe("5×5 마지막 엣지", () => {
  it("날개 뒤집기: 위-앞 날개 넷만 바뀐다", () => {
    const alg = find(EDGES_5X5, "edges-5x5-flip").algs[0] as string;
    expect(diffStickers(apply(solved(5), alg))).toHaveLength(4);
    expect(ufFlipped(5)(alg)).toBe(true);
  });

  it("두 엣지 묶기: 센터를 지키고 엣지 둘만 묶음이 바뀐다(4×4에서도 같다)", () => {
    const alg = find(EDGES_5X5, "edges-5x5-pair").algs[0] as string;
    for (const n of [4, 5]) {
      const c = apply(solved(n), alg);
      expect(centersSolved(c), `${n}`).toBe(true);
      expect(unpairedEdges(c), `${n}`).toBe(2);
    }
  });
});

describe("4×4 패리티 단계의 그림", () => {
  it("축소법·야우 끝내기의 상황은 노란 면이 위(흰 면 아래)이고, 시연 공식으로 풀린다", () => {
    for (const [course, lessonId] of [
      ["444-reduction", "444-as-333"],
      ["444-yau", "yau-finish"],
    ] as const) {
      const lesson = courseById(course)?.lessons.find((l) => l.id === lessonId);
      expect(lesson, lessonId).toBeDefined();
      for (const step of lesson?.steps ?? []) {
        if (!step.setup || !("alg" in step.setup)) continue;
        const where = `${lessonId}: ${step.body.slice(0, 24)}`;
        const s = apply(solved(4), step.setup.alg);
        // 색 번호 3 = 맞춘 상태의 D(노랑)
        expect(colorMap(s).get(key([1, 3, 1], [0, 1, 0])), where).toBe(3);
        if (step.alg) expect(isSolved(apply(s, step.alg)), where).toBe(true);
      }
    }
  });
});
