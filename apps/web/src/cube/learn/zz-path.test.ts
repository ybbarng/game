// ZZ EO라인·블록 경우별 정해진 길(docs/47 16-15): 무작위 상태를 규칙만으로 끝내는지 엔진으로 본다.
import {
  cubeTopology,
  faceColors,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { goalMet } from "./judge";
import { methodGoalMet } from "./judge-methods";
import {
  blockRuleMoves,
  EO_CHECK,
  EO_GATHER,
  EO_SCATTERED,
  ZZ_BLOCK_START_7,
  ZZ_BLOCK_START_21,
  ZZ_LEFT_RULE_7,
  ZZ_LEFT_RULE_21,
  ZZ_PAIR_BACK,
  ZZ_PAIR_JOIN,
  ZZ_PAIR_LEFT,
  ZZ_PAIR_RIGHT,
  ZZ_PAIR_WHITE_UP,
  ZZ_RIGHT_RULE_7,
  ZZ_RIGHT_RULE_21,
  ZZ_STUCK,
  ZZ_STUCK_SETUP,
} from "./lessons-zz";
import { invertAlg, setupFor } from "./notation";
import {
  badEdges,
  mirrorPairAlg,
  nextBlock,
  nextEo,
  nextLine,
  pieceAt,
  pieceSolved,
  play3,
  runBlocks,
  runZz,
  stepMovesBlock,
  ZZ_PAIR_CASES,
  type ZzBlockStep,
  type ZzSlot,
} from "./zz-path";

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

// ── ZZ 블록(짝 붙이기 경우) ─────────────────────────────────────────────
/** 흰 면 아래로 쥔 큐브(색 번호: 흰0 빨1 초2 노3 주4 파5, 왼쪽 빨강·오른쪽 주황)의 블록 부분마다 조각 색 */
const PART_PIECES: Record<ZzBlockStep["part"], number[][]> = {
  DL: [[0, 1]],
  FL: [
    [0, 2, 1],
    [2, 1],
  ],
  BL: [
    [0, 5, 1],
    [5, 1],
  ],
  DR: [[0, 4]],
  FR: [
    [0, 2, 4],
    [2, 4],
  ],
  BR: [
    [0, 5, 4],
    [5, 4],
  ],
};
/** 큐브의 엣지 블럭·코너 블럭 모두의 색 */
const ALL_PIECES = (() => {
  const topo = cubeTopology(3);
  const col = faceColors(3, solvedCube(3));
  return topo.pieces
    .filter((p) => p.kind === "edge" || p.kind === "corner")
    .map((p) => p.stickers.map((st) => col[st] as number));
})();
const z2 = () => play3(solvedCube(3), "z2");
const solvedPart = (s: PuzzleState, part: ZzBlockStep["part"]) =>
  PART_PIECES[part].every((c) => pieceSolved(s, c));

describe("ZZ 블록: 오른쪽 앞 칸 표와 바꿔 읽기", () => {
  const slots: ZzSlot[] = ["FR", "BR", "FL", "BL"];

  it("표는 열두 경우(흰색 셋 × 엣지 블럭 자리 넷)가 하나씩이고, 공식은 R·U만 쓴다", () => {
    const keys = ZZ_PAIR_CASES.map((c) => `${c.white}-${c.edge}`);
    expect(new Set(keys).size).toBe(12);
    for (const c of ZZ_PAIR_CASES) expect(c.alg).toMatch(/^[RU2' ]+$/);
  });

  it.each(slots)(
    "%s: 열두 경우마다 그 칸 짝만 빼 둔 상황을 규칙이 그 경우로 알아보고, 바꿔 읽은 공식 한 번으로 넣는다",
    (slot) => {
      for (const c of ZZ_PAIR_CASES) {
        const alg = mirrorPairAlg(c.alg, slot);
        const s = play3(z2(), invertAlg(alg));
        const st = nextBlock(s) as ZzBlockStep;
        expect(st.part).toBe(slot);
        expect(st.caseId).toBe(`pair-${c.white}-${c.edge}`);
        expect(st.hold).toBe("");
        expect(st.alg).toBe(alg);
        expect(nextBlock(play3(s, alg))).toBeNull();
      }
    },
  );

  it("꺼내기 공식은 그 칸과 위 층만 바꾸고, 칸으로 내리는 위 층 자리는 칸 바로 위 코너 자리와 맞은편 위 엣지 자리다", () => {
    const outs: [ZzSlot, string, string, string][] = [
      ["FR", "R U R'", "FRU", "BU"],
      ["BR", "R' U' R", "BRU", "FU"],
      ["FL", "L' U' L", "FLU", "BU"],
      ["BL", "L U L'", "BLU", "FU"],
    ];
    for (const [slot, alg, cornerAt, edgeAt] of outs) {
      const before = z2();
      const after = play3(before, alg);
      const own = [`D${slot}`, slot].map((x) => [...x].sort().join(""));
      for (const colors of ALL_PIECES) {
        const a = pieceAt(before, colors);
        const b = pieceAt(after, colors);
        if (a.slot !== b.slot || a.ref !== b.ref)
          expect(a.slot.includes("U") || own.includes(a.slot)).toBe(true);
        if (a.slot.includes("U") && !b.slot.includes("U"))
          expect([cornerAt, edgeAt]).toContain(a.slot);
      }
    }
  });
});

describe("ZZ 블록: 무작위 EO라인에서 규칙만으로 두 블록", () => {
  it("무작위 300개: 왼쪽 블록 → 오른쪽 블록을 끝내고, 걸음마다 EO라인과 끝낸 부분을 지키며, 모든 경우를 만난다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const eo = runZz(held(seed), nextEo).state;
      let s = runZz(eo, nextLine, 4).state;
      const done = new Set<ZzBlockStep["part"]>();
      for (let guard = 0; ; guard++) {
        const st = nextBlock(s);
        if (!st) break;
        expect(guard, `씨앗 ${seed}`).toBeLessThan(30);
        seen.add(st.caseId);
        const moves = stepMovesBlock(st);
        // 오른쪽 블록은 R·U만, 왼쪽 블록은 R·U·L만(F·B·D는 쓰지 않는다)
        expect(moves).toMatch(
          st.part === "DR" || st.part[1] === "R" ? /^[RU2' ]*$/ : /^[RUL2' ]*$/,
        );
        s = play3(s, moves);
        expect(methodGoalMet(3, s, "eoline"), `씨앗 ${seed}`).toBe(true);
        for (const p of done)
          expect(solvedPart(s, p), `씨앗 ${seed} ${p}`).toBe(true);
        if (solvedPart(s, st.part)) done.add(st.part);
      }
      expect(goalMet(3, s, "f2l"), `씨앗 ${seed}`).toBe(true);
    }
    expect([...seen].sort()).toEqual(
      [
        "base-middle",
        "base-right",
        "base-top",
        "pair-out-other",
        "pair-out-own",
        "pair-out-right",
        ...ZZ_PAIR_CASES.map((c) => `pair-${c.white}-${c.edge}`),
      ].sort(),
    );
  });
});

describe("ZZ 블록 단원의 모범 답 = 규칙이 낸 수", () => {
  it("짝 넣기 해 보기·문제는 표(와 바꿔 읽기)의 공식이고, 그 상황에서 규칙이 내는 수와 같다", () => {
    expect(ZZ_PAIR_RIGHT).toBe("U R U' R'");
    expect(ZZ_PAIR_JOIN).toBe("R U R'");
    expect(ZZ_PAIR_WHITE_UP).toBe("R U2 R' U' R U R'");
    expect(ZZ_PAIR_BACK).toBe("U' R' U R");
    expect(ZZ_PAIR_LEFT).toBe("U' L' U L");
    for (const alg of [
      ZZ_PAIR_RIGHT,
      ZZ_PAIR_JOIN,
      ZZ_PAIR_WHITE_UP,
      ZZ_PAIR_BACK,
      ZZ_PAIR_LEFT,
    ])
      expect(blockRuleMoves(setupFor(alg, "z2"), "all")).toBe(alg);
  });

  it("박힌 코너 블럭: 엣지 블럭이 위-오른쪽이라 비키지 않고 R U R'로 꺼내고, 그다음 표의 한 경우", () => {
    const s = play3(solvedCube(3), ZZ_STUCK_SETUP);
    expect(pieceAt(s, [0, 2, 4]).slot).toBe("DFR");
    expect(pieceSolved(s, [0, 2, 4])).toBe(false);
    expect(pieceAt(s, [2, 4]).slot).toBe("RU");
    const steps = runBlocks(s).steps;
    expect(steps.map((x) => x.caseId)).toEqual([
      "pair-out-own",
      "pair-side-far",
    ]);
    expect(steps[0]?.hold).toBe("");
    expect(steps[0]?.alg).toBe("R U R'");
    expect(steps[1]?.hold).toBe("U'");
    expect(steps[1]?.alg).toBe("R U R'");
    expect(ZZ_STUCK).toBe(steps.map(stepMovesBlock).join(" "));
  });

  it("실제 섞기 시연·해 보기: 왼쪽 블록 수 뒤 zz-left, 오른쪽 블록 수(R·U만) 뒤 F2L", () => {
    for (const [start, left, right] of [
      [ZZ_BLOCK_START_21, ZZ_LEFT_RULE_21, ZZ_RIGHT_RULE_21],
      [ZZ_BLOCK_START_7, ZZ_LEFT_RULE_7, ZZ_RIGHT_RULE_7],
    ] as const) {
      const s = play3(solvedCube(3), start);
      expect(methodGoalMet(3, s, "eoline")).toBe(true);
      expect(left).toBe(blockRuleMoves(start, "left"));
      const l = play3(s, left);
      expect(methodGoalMet(3, l, "zz-left")).toBe(true);
      expect(goalMet(3, play3(l, right), "f2l")).toBe(true);
      expect(right).toMatch(/^[RU2' ]+$/);
    }
  });
});
