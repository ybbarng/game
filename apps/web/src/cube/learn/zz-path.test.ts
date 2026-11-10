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
