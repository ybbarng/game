// ZZ EO라인 경우별 정해진 길(docs/47 16-15): 무작위 상태를 규칙만으로 끝내는지 엔진으로 본다.
import {
  cubeTopology,
  faceColors,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { methodGoalMet } from "./judge-methods";
import { EO_CHECK, EO_GATHER, EO_SCATTERED, ZZ_PAIR_BACK } from "./lessons-zz";
import { setupFor } from "./notation";
import { badEdges, nextEo, nextLine, play3, runZz } from "./zz-path";

const held = (seed: number) => play3(randomCubeState(3, seed), "z2");

describe("단원 해 보기의 모범 답 = 규칙이 낸 수", () => {
  it("나쁜 엣지 셋이 앞면, 하나가 위 층이면 U로 위-앞에 데려와 F", () => {
    expect(EO_GATHER).toBe("U F");
    const s = play3(solvedCube(3), setupFor("U F", "z2"));
    expect(badEdges(s)).toHaveLength(4);
  });

  it("흩어진 나쁜 엣지(F R B로 섞은 상황)를 규칙으로 고친다", () => {
    const s = play3(solvedCube(3), setupFor(EO_CHECK, "z2"));
    expect(methodGoalMet(3, play3(s, EO_SCATTERED), "eo")).toBe(true);
  });

  it("오른쪽 블록 뒤 칸: 엣지 블럭 위-오른쪽, 코너 블럭 뒤-오른쪽 위에서 U' R' U R로 들어간다", () => {
    expect(ZZ_PAIR_BACK).toBe("U' R' U R");
    // 흰 면 아래(z2)에서 오른쪽은 주황(4), 뒤는 파랑(5): 위-오른쪽 엣지 블럭은 파랑-주황
    const s = play3(solvedCube(3), setupFor(ZZ_PAIR_BACK, "z2"));
    const col = faceColors(3, s);
    const topo = cubeTopology(3);
    const at = (faces: number[]) =>
      topo.pieces
        .find(
          (p) =>
            p.stickers.length === faces.length &&
            faces.every((f) =>
              p.stickers.some((st) => topo.stickers[st]?.face === f),
            ),
        )
        ?.stickers.map((st) => col[st] as number)
        .sort()
        .join();
    expect(at([0, 1])).toBe([4, 5].join());
    expect(at([0, 1, 5])).toBe([0, 4, 5].join());
  });
});

describe("페트루스 블록 요령의 수(lessons-zz.ts 글)", () => {
  const topo = cubeTopology(3);
  const F2N: Record<string, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
  /** 맞춘 큐브의 그 자리 조각이 수 뒤에 가는 자리(면 글자) */
  const goesTo = (from: string, move: string) => {
    const faces = [...from].map((c) => F2N[c] as number);
    const p = topo.pieces.findIndex(
      (x) =>
        x.stickers.length === faces.length &&
        faces.every((f) =>
          x.stickers.some((st) => topo.stickers[st]?.face === f),
        ),
    );
    const colorsOf = (c: Uint8Array, i: number) =>
      (topo.pieces[i]?.stickers ?? [])
        .map((st) => c[st] as number)
        .sort()
        .join();
    const want = colorsOf(faceColors(3, solvedCube(3)), p);
    const now = faceColors(3, play3(solvedCube(3), move));
    const q = topo.pieces.findIndex(
      (x, i) => x.stickers.length === faces.length && colorsOf(now, i) === want,
    );
    return (topo.pieces[q]?.stickers ?? [])
      .map((st) => "URFDLB"[topo.stickers[st]?.face as number])
      .sort()
      .join("");
  };
  const sorted = (x: string) => [...x].sort().join("");

  it("2×2×2 ①: 가운데 층 엣지를 위 층으로(앞-왼쪽 L', 뒤-왼쪽 L, 앞-오른쪽 R, 뒤-오른쪽 R')", () => {
    for (const [from, m] of [
      ["FL", "L'"],
      ["BL", "L"],
      ["FR", "R"],
      ["BR", "R'"],
    ])
      expect(goesTo(from as string, m as string)).toContain("U");
  });

  it("2×2×2 ②: 뒤-왼쪽은 B로 바로 아래-뒤, 나머지는 위 층으로. 아래-왼쪽(①)은 그대로", () => {
    expect(goesTo("BL", "B")).toBe(sorted("DB"));
    for (const [from, m] of [
      ["FL", "F"],
      ["FR", "R"],
      ["BR", "R'"],
      ["DF", "F2"],
      ["DR", "R2"],
    ]) {
      expect(goesTo(from as string, m as string)).toContain("U");
      expect(goesTo("DL", m as string)).toBe(sorted("DL"));
    }
    expect(goesTo("DL", "B")).toBe(sorted("DL"));
  });

  it("2×2×3 ①: 앞-왼쪽 F', 앞-오른쪽 F로 바로 아래-앞, 뒤쪽 2×2×2는 그대로", () => {
    expect(goesTo("FL", "F'")).toBe(sorted("DF"));
    expect(goesTo("FR", "F")).toBe(sorted("DF"));
    for (const m of ["F", "F'", "F2", "R'", "R2", "U"])
      for (const block of ["DL", "DB", "BL", "DLB"])
        expect(goesTo(block, m)).toBe(sorted(block));
  });
});

describe("ZZ EO라인", () => {
  it("무작위 300개: 엣지 방향을 규칙만으로 고치고, F 한 번마다 나쁜 엣지가 둘 이상 줄거나 둘에서 넷이 된다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      let s = held(seed);
      for (let guard = 0; ; guard++) {
        const st = nextEo(s);
        if (!st) break;
        expect(guard, `씨앗 ${seed}`).toBeLessThan(8);
        seen.add(st.caseId);
        const before = badEdges(s).length;
        s = play3(s, `${st.hold} ${st.alg}`);
        const after = badEdges(s).length;
        if (before === 2) expect(after).toBe(4);
        else expect(after).toBeLessThanOrEqual(before - 2);
      }
      expect(methodGoalMet(3, s, "eo")).toBe(true);
    }
    expect([...seen].sort()).toEqual([
      "eo-four",
      "eo-four-around",
      "eo-two-both",
      "eo-two-none",
      "eo-two-one",
    ]);
  });

  it("엣지 방향 뒤 줄 엣지 둘을 규칙만으로 놓아 EO라인이 된다(방향은 그대로)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const eo = runZz(held(seed), nextEo).state;
      const r = runZz(eo, nextLine, 4);
      for (const st of r.steps) seen.add(st.caseId);
      expect(methodGoalMet(3, r.state, "eoline")).toBe(true);
    }
    expect([...seen].sort()).toEqual([
      "line-bottom",
      "line-middle",
      "line-top",
    ]);
  });
});
