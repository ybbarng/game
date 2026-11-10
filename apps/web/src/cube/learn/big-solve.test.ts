// 큰 큐브의 3×3처럼 단계와 패리티(big-solve.ts): 축소한 무작위 4×4·5×5를 3×3 처음 맞추기 규칙과 패리티 둘로 끝내는지 본다.
import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { play } from "./beginner-path";
import {
  OLL_PARITY_ALG,
  PLL_PARITY_ALG,
  project,
  solveReduced,
} from "./big-solve";
import { stateForRule } from "./judge";
import {
  ADJ_EDGES_444,
  ADJ_EDGES_444_SETUP,
  CORNER_SWAP_444,
  CORNER_SWAP_444_SETUP,
} from "./lessons-big";
import { setupFor } from "./notation";

const fromSolved = (n: number, alg: string) =>
  applyMoves(n, solvedCube(n), parseMoves(n, alg));

describe("바깥 층만 본 3×3", () => {
  it("바깥 층만 돌린 4×4·5×5는 같은 수를 친 3×3과 색이 같다", () => {
    const alg = "R U2 F' L D B2 R' U F2";
    const want = play(solvedCube(3), alg);
    for (const n of [4, 5])
      expect(project(n, fromSolved(n, alg)).perm).toEqual(want.perm);
  });
});

describe("4×4 3×3처럼(패리티 포함)", () => {
  it("축소한 무작위 4×4 60개를 규칙만으로 맞추고, 두 패리티를 모두 만난다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      // 바깥 층만 섞은 것(패리티 없음)에 패리티 공식을 섞어 넣는다: 씨앗에 따라 없음·OLL·PLL·둘 다
      const extra = [
        "",
        OLL_PARITY_ALG,
        PLL_PARITY_ALG,
        `${OLL_PARITY_ALG} R U ${PLL_PARITY_ALG}`,
      ][seed % 4] as string;
      const base = stateForRule("4x4-reduced", seed);
      const s = extra ? applyMoves(4, base, parseMoves(4, extra)) : base;
      const r = solveReduced(4, s);
      expect(isSolved(4, r.state)).toBe(true);
      for (const st of r.stages) seen.add(st.id);
    }
    expect(seen).toContain("oll-parity");
    expect(seen).toContain("pll-parity");
  });

  it("PLL 패리티는 코너 자리 단계에서 드러난다: 맞은편 엣지 둘·이웃한 엣지 둘·이웃한 코너 둘·대각선 코너 둘이 바뀐 모양", () => {
    const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const Y = "F R U' R' U' R U R' F' R U R' U' R' F R F'";
    const cases: Record<string, string> = {
      "맞은편 엣지 둘": PLL_PARITY_ALG,
      "이웃한 엣지 둘": `${PLL_PARITY_ALG} y' ${T} y U' ${T}`,
      "이웃한 코너 둘": `${PLL_PARITY_ALG} y ${T} y'`,
      "대각선 코너 둘": `${PLL_PARITY_ALG} ${Y}`,
    };
    for (const [name, alg] of Object.entries(cases)) {
      // 흰 면 아래(z2)로 쥔 맞춘 4×4에서 이 공식으로 풀리는 모양
      const s = fromSolved(4, setupFor(alg, "z2"));
      const r = solveReduced(4, s);
      expect(isSolved(4, r.state), name).toBe(true);
      const ids = r.stages.map((x) => x.id);
      expect(ids, name).toContain("pll-parity");
      expect(ids, name).not.toContain("oll-parity");
      const at = ids.indexOf("pll-parity");
      expect(["edges", "corner-place"], name).toContain(ids[at - 1]);
    }
  });
});

describe("단원 해 보기의 모범 답 = 규칙이 낸 수", () => {
  it("코너 둘만 바뀐 모양·이웃한 엣지 둘만 바뀐 모양: 코너 자리 단계에서 PLL 패리티 → 옆면 맞추기부터 다시, 맞는다", () => {
    for (const [setup, answer] of [
      [CORNER_SWAP_444_SETUP, CORNER_SWAP_444],
      [ADJ_EDGES_444_SETUP, ADJ_EDGES_444],
    ] as const) {
      const s = fromSolved(4, setup);
      expect(isSolved(4, applyMoves(4, s, parseMoves(4, answer)))).toBe(true);
      expect(answer).toContain(PLL_PARITY_ALG);
      // T퍼뮤(CFOP)는 쓰지 않는다
      expect(answer).not.toContain("R U R' U' R' F R2 U' R' U' R U R' F'");
    }
  });
});

describe("5×5 3×3처럼", () => {
  it("엣지가 묶인 5×5는 패리티 없이 3×3 규칙만으로 맞는다", () => {
    const moves = "R U F2 L' D B R2 U' F L2 D' B2 R' U2 F' L".split(" ");
    for (let k = 6; k <= moves.length; k++) {
      const r = solveReduced(5, fromSolved(5, moves.slice(0, k).join(" ")));
      expect(isSolved(5, r.state)).toBe(true);
      expect(r.stages.map((x) => x.id)).not.toContain("oll-parity");
      expect(r.stages.map((x) => x.id)).not.toContain("pll-parity");
    }
  });
});
