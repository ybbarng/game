// 3×3 처음 맞추기의 공식 짜임(docs/47 16-32): 쪽 글이 덩어리마다 「무엇이 어디로 가고 무엇은 그대로인지」 말한 것을
// 엔진으로 확인한다. 덩어리를 이으면 쪽의 공식과 같은지, 덩어리 하나하나를 친 뒤 조각이 글이 말한 자리에 있는지 본다.
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  EDGE_SWAP,
  FROM_RIGHT,
  piecePlace,
  RIGHT,
  reps,
  TWIST,
  TWIST_BACK,
  YELLOW_CROSS,
  YELLOW_CROSS_BACK,
} from "./beginner-path";
import { goalMet } from "./judge";
import {
  BEGINNER_333,
  CROSS_DOWN,
  CROSS_FLIP,
  CROSS_FLIPPED,
  CROSS_MIDDLE,
  CROSS_TOP_WRONG,
} from "./lessons-333";
import { invertAlg, setupFor } from "./notation";

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const at = (alg: string, from: PuzzleState = solvedCube(3)) =>
  alg.trim() ? applyMoves(3, from, parseMoves(3, alg)) : from;
const norm = (alg: string) => alg.trim().split(/\s+/).join(" ");
/** 조각(맞춘 큐브의 면 글자로 부른 색)이 든 자리: 스티커가 보는 면을 모아 차례 없이 */
const where = (s: PuzzleState, piece: Face[]) =>
  [...piecePlace(s, piece)].sort().join("");
/** 조각이 제자리·바른 방향(색마다 그 색 센터 면을 본다. 흰 면 위로 쥔 그대로 본다) */
const home = (s: PuzzleState, piece: Face[]) =>
  piecePlace(s, piece).join("") === piece.join("");

describe("덩어리를 이으면 쪽의 공식이다", () => {
  for (const lesson of BEGINNER_333.lessons)
    lesson.steps.forEach((step, i) => {
      if (!step.chunks) return;
      it(`${lesson.title} ${i + 1}번`, () => {
        expect(["demo", "turn"]).toContain(step.kind);
        const joined = norm(step.chunks?.map((c) => c.moves).join(" ") ?? "");
        // 덩어리는 쪽 공식의 끝부분(앞에 쥐는 수가 있을 수 있다)
        expect(norm(step.alg ?? "").endsWith(joined), joined).toBe(true);
        for (const c of step.chunks ?? []) {
          expect(c.says, c.moves).toMatch(/[요.!?]$/);
          expect(() => parseMoves(3, c.moves), c.moves).not.toThrow();
        }
      });
    });
});

describe("흰 십자: 앞면 아래에서 올리고, 옆면은 돌렸으면 되돌린다", () => {
  const GREEN: Face[] = ["U", "F"];
  const RED: Face[] = ["U", "R"];
  const OTHERS: Face[][] = [RED, ["U", "B"], ["U", "L"]];

  it("F2: 아래-앞에서 흰색이 아래면 제자리로, 흰색이 앞이면 제자리에서 뒤집혀 들어간다", () => {
    expect(piecePlace(at(CROSS_DOWN.setup), GREEN)).toEqual(["D", "F"]);
    expect(home(at("F2", at(CROSS_DOWN.setup)), GREEN)).toBe(true);
    const flip = at(CROSS_FLIP.setup);
    // 흰색이 앞, 초록이 아래
    expect(piecePlace(flip, GREEN)).toEqual(["F", "D"]);
    // F2 뒤: 제자리지만 흰색이 앞, 초록이 위
    expect(piecePlace(at("F2", flip), GREEN)).toEqual(["F", "U"]);
  });

  it("D R F' R': D로 아래-오른쪽에 흰색이 오른쪽, R로 앞-오른쪽에 세우며 흰-빨강이 빠지고, F'로 올리고, R'로 흰-빨강을 되돌린다", () => {
    const s = at(CROSS_FLIP.setup);
    const d = at("D", s);
    expect(piecePlace(d, GREEN)).toEqual(["R", "D"]);
    const r = at("R", d);
    // 초록 스티커가 앞(초록 센터 쪽), 흰 스티커가 오른쪽
    expect(piecePlace(r, GREEN)).toEqual(["R", "F"]);
    expect(home(r, RED)).toBe(false);
    expect(where(r, RED)).toBe("BR");
    const f = at("F'", r);
    expect(home(f, GREEN)).toBe(true);
    expect(home(f, RED)).toBe(false);
    const back = at("R'", f);
    expect(home(back, RED)).toBe(true);
    expect(goalMet(3, back, "white-cross")).toBe(true);
  });

  it("R' D' R: 앞-오른쪽 블럭을 아래-앞으로 내리고, 함께 앞-오른쪽으로 내려온 흰-빨강을 되돌린다", () => {
    const s = at(CROSS_MIDDLE.setup);
    expect(where(s, GREEN)).toBe("FR");
    const r1 = at("R'", s);
    expect(where(r1, GREEN)).toBe("DR");
    expect(where(r1, RED)).toBe("FR");
    const r2 = at("D'", r1);
    expect(where(r2, GREEN)).toBe("DF");
    const r3 = at("R", r2);
    expect(home(r3, RED)).toBe(true);
    // 흰색이 아래: 첫째 기본 모양
    expect(piecePlace(r3, GREEN)).toEqual(["D", "F"]);
  });

  it("위 층 F2: 위-앞 블럭만 아래-앞으로 내려가고 다른 흰 엣지는 그대로다", () => {
    const after = at("F2", at(CROSS_FLIPPED.setup));
    expect(piecePlace(after, GREEN)).toEqual(["F", "D"]);
    for (const p of OTHERS) expect(home(after, p), p.join("")).toBe(true);
  });

  it("위 층 흰색 위 다른 자리: 빨강 면을 앞으로 쥐고 F2로 내리면 빨강 센터 밑의 흰-빨강이 함께 올라가 제자리에 든다", () => {
    const s = at(CROSS_TOP_WRONG.setup);
    expect(where(s, GREEN)).toBe("RU");
    expect(piecePlace(s, RED)).toEqual(["D", "R"]);
    const after = at("y F2 y'", s);
    expect(home(after, RED)).toBe(true);
    expect(piecePlace(after, GREEN)).toEqual(["D", "R"]);
  });
});

describe("첫 층 코너: 코너 돌리기 R' D' R D", () => {
  const CORNER: Face[] = ["U", "F", "R"];
  const EDGE: Face[] = ["U", "R"];

  it("덩어리: R'로 흰-빨강이 내려가고 코너는 뒤-오른쪽 아래, D'로 앞-오른쪽 아래, R로 둘 다 제자리, D로 아래 층을 되돌린다", () => {
    const s = at(setupFor(TWIST));
    expect(where(s, CORNER)).toBe("DFR");
    const r1 = at("R'", s);
    expect(home(r1, EDGE)).toBe(false);
    expect(where(r1, CORNER)).toBe("BDR");
    const r2 = at("D'", r1);
    expect(where(r2, CORNER)).toBe("DFR");
    const r3 = at("R", r2);
    expect(home(r3, CORNER)).toBe(true);
    expect(home(r3, EDGE)).toBe(true);
    expect(goalMet(3, at("D", r3), "first-layer")).toBe(true);
  });

  it("거꾸로: D'로 코너를 앞-왼쪽 아래로 비키고, R'·D로 자리 옆에 붙이고, R로 함께 올린다", () => {
    const s = at(setupFor(TWIST_BACK));
    expect(where(at("D'", s), CORNER)).toBe("DFL");
    expect(where(at("D' R' D", s), CORNER)).toBe("DFR");
    expect(goalMet(3, at(TWIST_BACK, s), "first-layer")).toBe(true);
  });

  it("한 번 칠 때마다 그림의 다음 모양: 자리 밑 앞 → 제자리 앞 → 자리 밑 아래 → 제자리 오른쪽 → 자리 밑 오른쪽 → 맞음, 여섯 번이면 처음", () => {
    // 다 맞음까지 k번 남은 모양 = 맞춘 큐브에 공식을 거꾸로 k번
    const shape = (k: number) => {
      const s = at(setupFor(reps(TWIST, k)));
      return `${where(s, CORNER).includes("D") ? "자리 밑" : "제자리"} ${piecePlace(s, CORNER)[0]}`;
    };
    expect([5, 4, 3, 2, 1].map(shape)).toEqual([
      "자리 밑 F",
      "제자리 F",
      "자리 밑 D",
      "제자리 R",
      "자리 밑 R",
    ]);
    for (let k = 1; k <= 5; k++)
      expect(at(TWIST, at(setupFor(reps(TWIST, k))))).toEqual(
        at(setupFor(reps(TWIST, k - 1))),
      );
    expect(at(reps(TWIST, 6))).toEqual(solvedCube(3));
    // 거꾸로 한 번은 차례를 하나 거슬러 간다(다섯 번과 같다)
    expect(at(TWIST_BACK)).toEqual(at(reps(TWIST, 5)));
  });
});

describe("둘째 층: 덩어리 둘을 차례만 바꾼다", () => {
  // 흰 면 아래(z2)로 쥐면 앞 초록, 오른쪽 주황. 앞-오른쪽 자리 조각: 초록-주황 엣지, 흰-초록-주황 코너
  const EDGE: Face[] = ["F", "L"];
  const CORNER: Face[] = ["U", "F", "L"];
  /** 코너와 엣지가 위 층에서 나란히 붙었나: 둘 다 위 층이고, 같은 색 스티커가 같은 면을 본다 */
  const paired = (s: PuzzleState) => {
    const [, cg, co] = piecePlace(s, CORNER);
    const [eg, eo] = piecePlace(s, EDGE);
    return (
      where(s, CORNER).includes("U") &&
      where(s, EDGE).includes("U") &&
      cg === eg &&
      co === eo
    );
  };

  it("앞에서 넣기 = U R U' R' + U' F' U F, 오른쪽에서 넣기 = 같은 두 덩어리를 바꾼 차례", () => {
    expect(RIGHT).toBe("U R U' R' U' F' U F");
    expect(FROM_RIGHT).toBe("U' F' U F U R U' R'");
  });

  it("앞 덩어리가 첫 층 코너를 올려 엣지 바로 옆에 붙이고, 뒤 덩어리가 둘을 함께 넣는다", () => {
    for (const alg of [RIGHT, FROM_RIGHT]) {
      const s = at(setupFor(alg, "z2"));
      expect(paired(s), alg).toBe(false);
      const half = alg.split(" ").slice(0, 4).join(" ");
      expect(paired(at(half, s)), alg).toBe(true);
      expect(goalMet(3, at(alg, s), "second-layer"), alg).toBe(true);
    }
  });

  it("앞에서 넣기의 앞 덩어리는 엣지 블럭을 왼쪽으로, 오른쪽에서 넣기의 앞 덩어리는 뒤로 먼저 비킨다", () => {
    expect(where(at("U", at(setupFor(RIGHT, "z2"))), EDGE)).toBe("LU");
    expect(where(at("U'", at(setupFor(FROM_RIGHT, "z2"))), EDGE)).toBe("BU");
  });
});

describe("마지막 층", () => {
  const LL_EDGES: Record<string, Face[]> = {
    F: ["D", "F"],
    R: ["D", "R"],
    B: ["D", "B"],
    L: ["D", "L"],
  };
  /** 위 층 엣지 가운데 노란 스티커가 위를 보는 자리(흰 면 아래로 쥔 상태) */
  const yellowUp = (s: PuzzleState) =>
    Object.values(LL_EDGES)
      .filter((p) => piecePlace(s, p)[0] === "U")
      .map((p) => piecePlace(s, p)[1])
      .sort()
      .join("");

  it("노란 십자 = F + R U R' U' + F', 거꾸로는 가운데 덩어리만 거꾸로", () => {
    expect(YELLOW_CROSS).toBe("F R U R' U' F'");
    expect(YELLOW_CROSS_BACK).toBe(`F ${invertAlg("R U R' U'")} F'`);
  });

  it("일자에서: F 하나로 아래 두 층이 흐트러지고, F'까지 치면 아래 두 층이 돌아오며 노란 스티커 넷이 위를 본다", () => {
    const s = at(setupFor(YELLOW_CROSS, "z2"));
    expect(yellowUp(s).length).toBe(2);
    expect(goalMet(3, at("F", s), "second-layer")).toBe(false);
    const after = at(YELLOW_CROSS, s);
    expect(goalMet(3, after, "yellow-cross")).toBe(true);
  });

  it("옆면 맞추기 = R U R' U + R U2 R' + U: 뒤·오른쪽 엣지는 그대로, 앞·왼쪽 엣지가 자리를 바꾸고 아래 두 층은 그대로", () => {
    const s = at(setupFor(EDGE_SWAP, "z2"));
    const after = at(EDGE_SWAP, s);
    const slot = (t: PuzzleState, p: Face[]) => where(t, p);
    // 처음 자리 → 끝 자리
    const moved = Object.fromEntries(
      Object.entries(LL_EDGES).map(([k, p]) => [
        k,
        `${slot(s, p)}→${slot(after, p)}`,
      ]),
    );
    expect(moved).toEqual({
      F: "LU→FU",
      R: "FU→LU",
      B: "BU→BU",
      L: "RU→RU",
    });
    expect(goalMet(3, after, "second-layer")).toBe(true);
  });

  it("코너 자리 = (U R U') L' (U R' U') L, 덩어리 둘을 차례로 되돌리는 꼴. 거꾸로는 L'부터", () => {
    const A = "U R U'";
    expect(CORNER_CYCLE).toBe(`${A} L' ${invertAlg(A)} L`);
    expect(CORNER_CYCLE_BACK).toBe(`L' ${A} L ${invertAlg(A)}`);
  });

  it("코너 자리: 앞-오른쪽 위는 그대로, 앞-왼쪽 위 → 뒤-오른쪽 위 → 뒤-왼쪽 위 → 앞-왼쪽 위, 엣지와 아래 두 층은 그대로", () => {
    const s = at(setupFor(CORNER_CYCLE, "z2"));
    const after = at(CORNER_CYCLE, s);
    const corners: Face[][] = [
      ["D", "F", "R"],
      ["D", "F", "L"],
      ["D", "B", "R"],
      ["D", "B", "L"],
    ];
    const moves = Object.fromEntries(
      corners.map((p) => [where(s, p), where(after, p)]),
    );
    expect(moves).toEqual({
      FRU: "FRU",
      FLU: "BRU",
      BRU: "BLU",
      BLU: "FLU",
    });
    expect(goalMet(3, after, "yellow-edges")).toBe(true);
  });

  it("코너 방향은 첫 층과 같은 코너 돌리기: 제자리에서 오른쪽 두 번, 앞 거꾸로 두 번", () => {
    expect(at(reps(TWIST, 2))).toEqual(at(reps(TWIST_BACK, 4)));
  });
});
