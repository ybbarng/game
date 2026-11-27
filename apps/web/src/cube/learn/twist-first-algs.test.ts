// 코너 방향 먼저(신광사 해법) 강의 공식 짜임(docs/47 16-33): 쪽 글이 덩어리마다 말한 것을 엔진으로 확인한다. 덩어리를
// 이으면 쪽의 공식과 같은지, 공식이 쪽이 말한 꼴(첫 층 코너 돌리기 R' D' R D와 같은 「돌리고 · 옮기고 · 되돌리고 · 옮긴 것
// 되돌리기」, 준비와 준비 되돌리기)인지, 덩어리 뒤 조각이 글이 말한 자리에 있는지, 공식이 앞 단계에서 맞춘 것을 그대로
// 두는지 본다.
import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { piecePlace } from "./beginner-path";
import { goalMet } from "./judge";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import { invertAlg } from "./notation";
import {
  CORNER_A,
  CORNER_B,
  CORNER_DOWN,
  CORNER_IN,
  CORNER_PULL,
  CORNER_TURN,
  CROSS_FRONT,
  CROSS_PULL,
  cornerYellows,
  EDGE_CYCLE,
  EDGE_FLIP,
  edgesMatched,
  edgesUp,
  SECOND_A,
  SECOND_B,
} from "./twist-first-path";

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const at = (alg: string, from: PuzzleState) =>
  alg.trim() ? applyMoves(3, from, parseMoves(3, alg)) : from;
/** 흰 면 아래로 쥔 맞춘 큐브 */
const down = () => at("z2", solvedCube(3));
const norm = (alg: string) => alg.trim().split(/\s+/).join(" ");
/** 흰 면 아래로 쥐었을 때 그 자리에 있는 조각(맞춘 큐브의 면 글자: D 노랑, F 초록, L 주황, R 빨강, B 파랑, U 흰) */
const PIECE: Record<string, Face[]> = {
  UF: ["D", "F"],
  UR: ["D", "L"],
  UL: ["D", "R"],
  UB: ["D", "B"],
  FR: ["F", "L"],
  FL: ["F", "R"],
  UFR: ["D", "F", "L"],
  UFL: ["D", "F", "R"],
  UBR: ["D", "B", "L"],
  UBL: ["D", "B", "R"],
  DFR: ["U", "F", "L"],
  DFL: ["U", "F", "R"],
  DBR: ["U", "B", "L"],
};
const where = (s: PuzzleState, piece: string) =>
  [...piecePlace(s, PIECE[piece] as Face[])].sort().join("");
const slot = (faces: string) => [...faces].sort().join("");
const home = (s: PuzzleState, piece: string) => where(s, piece) === slot(piece);
/** 위 엣지 넷이 제자리·바른 방향이고 아래 두 층이 맞음 */
const edgesHome = (s: PuzzleState) =>
  goalMet(3, s, "f2l") &&
  edgesUp(s).length === 4 &&
  edgesMatched(s).length === 4;
/** 공식의 거꾸로로 만든, 그 공식이 맞추는 상황 */
const solvedBy = (alg: string) => at(invertAlg(alg), down());

describe("덩어리를 이으면 쪽의 공식이다", () => {
  for (const lesson of TWIST_FIRST_333.lessons)
    lesson.steps.forEach((step, i) => {
      if (!step.chunks) return;
      it(`${lesson.title} ${i + 1}번`, () => {
        expect(["demo", "turn"]).toContain(step.kind);
        const joined = norm(step.chunks?.map((c) => c.moves).join(" ") ?? "");
        expect(norm(step.alg ?? "").endsWith(joined), joined).toBe(true);
        for (const c of step.chunks ?? [])
          expect(c.says, c.moves).toMatch(/[요.!?]$/);
      });
    });
});

const commutator = (x: string, y: string) =>
  `${x} ${y} ${invertAlg(x)} ${invertAlg(y)}`;
/** 흰 면 위로 쥔 맞춘 큐브에서, 공식의 거꾸로로 만든 그 공식이 맞추는 상황 */
const solvedUpBy = (alg: string) => at(invertAlg(alg), solvedCube(3));
/** 흰 면 위로 쥐었을 때 그 자리에 있는 조각(맞춘 큐브의 면 글자 그대로) */
const whereUp = (s: PuzzleState, piece: Face[]) =>
  [...piecePlace(s, piece)].sort().join("");

describe("흰 십자: F2, 옆에서 올리기 D · (R F' R'), 빼기 R2 · D · R2", () => {
  it("옆에서 올리기: D로 아래-오른쪽, R로 앞-오른쪽 자리(위-오른쪽 흰 엣지 블럭은 뒤-오른쪽으로), F'로 위-앞에 흰색 위로, R'로 흰 십자가 다 맞는다", () => {
    const start = solvedUpBy(CROSS_FRONT);
    const wf: Face[] = ["U", "F"];
    const wr: Face[] = ["U", "R"];
    expect(piecePlace(start, wf)).toEqual(["F", "D"]);
    expect(whereUp(at("D", start), wf)).toBe(slot("DR"));
    const r = at("D R", start);
    expect([whereUp(r, wf), whereUp(r, wr)]).toEqual([slot("FR"), slot("BR")]);
    expect(piecePlace(at("D R F'", start), wf)).toEqual(["U", "F"]);
    expect(goalMet(3, at(CROSS_FRONT, start), "white-cross")).toBe(true);
  });

  it("빼기 R2 D R2: 위-오른쪽 엣지 블럭이 아래-오른쪽 → 아래-뒤로 내려가 아래 층에 남는다", () => {
    const pr: Face[] = ["U", "R"];
    expect(whereUp(at("R2", solvedCube(3)), pr)).toBe(slot("DR"));
    expect(whereUp(at("R2 D", solvedCube(3)), pr)).toBe(slot("DB"));
    expect(whereUp(at(CROSS_PULL, solvedCube(3)), pr)).toBe(slot("DB"));
  });
});

describe("첫 층 코너: 코너 넣기 F' R F R' = (F', R)의 「돌리고 · 돌리고 · 되돌리고 · 되돌리기」", () => {
  it("코너 넣기는 X Y X' Y' 꼴이다", () => {
    expect(CORNER_IN).toBe(commutator("F'", "R"));
  });

  it("F'로 코너 블럭이 앞-오른쪽 위에 흰색 위로 올라오고(위-앞 흰 엣지 블럭은 비킴), R로 뒤-오른쪽 위로 비키고(위-오른쪽 흰 엣지 블럭도), F로 위-앞 흰 엣지 블럭이 돌아오고, R'로 코너 블럭이 제자리에 들고 위-오른쪽도 돌아온다", () => {
    const start = solvedUpBy(CORNER_IN);
    const c: Face[] = ["U", "F", "R"];
    const wf: Face[] = ["U", "F"];
    const wr: Face[] = ["U", "R"];
    expect(piecePlace(start, c)[0]).toBe("R");
    const f = at("F'", start);
    expect(piecePlace(f, c)[0]).toBe("U");
    expect(whereUp(f, c)).toBe(slot("UFR"));
    expect(whereUp(f, wf)).not.toBe(slot("UF"));
    const r = at("F' R", start);
    expect([whereUp(r, c), whereUp(r, wr)]).toEqual([slot("UBR"), slot("BR")]);
    expect(piecePlace(at("F' R F", start), wf)).toEqual(["U", "F"]);
    expect(goalMet(3, at(CORNER_IN, start), "first-layer")).toBe(true);
  });

  it("빼기 R' D' R은 아래-앞-오른쪽 코너 블럭을 위-앞-오른쪽 자리에 올려 넣고, 들어 있던 블럭은 아래-앞-왼쪽으로 밀려 나오며, 흰 십자는 그대로다", () => {
    const s = at(CORNER_PULL, solvedCube(3));
    expect(whereUp(s, ["D", "F", "R"])).toBe(slot("UFR"));
    expect(whereUp(s, ["U", "F", "R"])).toBe(slot("DFL"));
    expect(goalMet(3, s, "white-cross")).toBe(true);
    // 덩어리마다: R'로 들어 있던 블럭이 아래-앞-오른쪽, 아래-앞-오른쪽 블럭은 아래-뒤-오른쪽으로. D'로 들어 있던 블럭은
    // 아래-앞-왼쪽, 비켰던 블럭은 아래-앞-오른쪽으로
    const r = at("R'", solvedCube(3));
    expect([whereUp(r, ["U", "F", "R"]), whereUp(r, ["D", "F", "R"])]).toEqual([
      slot("DFR"),
      slot("DBR"),
    ]);
    const d = at("R' D'", solvedCube(3));
    expect([whereUp(d, ["U", "F", "R"]), whereUp(d, ["D", "F", "R"])]).toEqual([
      slot("DFL"),
      slot("DFR"),
    ]);
  });

  it("빼기 R2 D R2도 아래-앞 엣지 블럭을 위-오른쪽 자리에 올려 넣고, 들어 있던 블럭은 아래-뒤로 밀려 나온다", () => {
    const s = at(CROSS_PULL, solvedCube(3));
    expect([whereUp(s, ["D", "F"]), whereUp(s, ["U", "R"])]).toEqual([
      slot("UR"),
      slot("DB"),
    ]);
  });

  it("다시 놓기 R' D2 R: 자리 밑에서 흰색이 바닥인 코너 블럭이 R'로 굴러 흰색이 뒤, D2로 아래-앞-왼쪽에 흰색이 앞, R 뒤에도 그대로이고 흰 십자도 그대로다", () => {
    // 코너 블럭 넣기 앞 D까지 치면 맞는 상황: 자리 밑, 흰색 아래
    const start = solvedUpBy(`${CORNER_DOWN} D ${CORNER_IN}`);
    const c: Face[] = ["U", "F", "R"];
    expect([whereUp(start, c), piecePlace(start, c)[0]]).toEqual([
      slot("DFR"),
      "D",
    ]);
    const r = at("R'", start);
    expect([whereUp(r, c), piecePlace(r, c)[0]]).toEqual([slot("DBR"), "B"]);
    const d = at("R' D2", start);
    expect([whereUp(d, c), piecePlace(d, c)[0]]).toEqual([slot("DFL"), "F"]);
    const e = at(CORNER_DOWN, start);
    expect([whereUp(e, c), piecePlace(e, c)[0]]).toEqual([slot("DFL"), "F"]);
    expect(goalMet(3, e, "white-cross")).toBe(true);
  });
});

describe("둘째 층 A = (U R U' R') · (F R' F' R), B는 좌우를 바꾼 꼴", () => {
  it("두 덩어리 모두 코너 넣기 F' R F R'와 같은 꼴(X Y X' Y')이고, 뒤 덩어리는 코너 넣기의 도는 방향을 모두 바꾼 것이다", () => {
    expect(SECOND_A).toBe(`${commutator("U", "R")} ${commutator("F", "R'")}`);
    expect(commutator("F", "R'")).toBe("F R' F' R");
    expect(SECOND_B).toBe(`${commutator("U'", "L'")} ${commutator("F'", "L")}`);
  });

  it("U R U' R' 뒤: 넣을 엣지 블럭은 위-앞으로 돌아와 기다리고, 앞-오른쪽 아래 코너 블럭은 위 층에, 앞-오른쪽 자리에는 위 층 엣지 블럭이 들어가 있다", () => {
    const start = solvedBy(SECOND_A);
    const before = where(start, "FR");
    expect(before).toBe(slot("UF"));
    const x = at("U R U' R'", start);
    expect(where(x, "FR")).toBe(slot("UF"));
    expect(where(x, "DFR")).toContain("U");
    // 앞-오른쪽 자리에 든 엣지 블럭에는 노란색(맞춘 큐브의 D)이 있다
    const c = faceColors(3, x);
    expect([c[23], c[12]]).toContain(3);
    const done = at(SECOND_A, start);
    expect(goalMet(3, done, "second-layer")).toBe(true);
  });

  it("B의 첫 덩어리 뒤: 앞-왼쪽 아래 코너 블럭이 위 층으로 나오고 엣지 블럭은 위-앞에서 기다린다", () => {
    const start = solvedBy(SECOND_B);
    const x = at("U' L' U L", start);
    expect(where(x, "FL")).toBe(slot("UF"));
    expect(where(x, "DFL")).toContain("U");
    expect(goalMet(3, at(SECOND_B, start), "second-layer")).toBe(true);
  });
});

describe("엣지 방향 = R' · (U' F' U F) · R", () => {
  it("가운데 네 수는 R' D' R D와 같은 꼴이고, 앞뒤의 R'와 R은 서로 거꾸로다", () => {
    expect(EDGE_FLIP).toBe(`R' U' F' ${invertAlg("U'")} ${invertAlg("F'")} R`);
  });

  it("R'로 위-오른쪽 엣지 블럭이 앞-오른쪽 자리로 내려간다", () => {
    expect(where(at("R'", down()), "UR")).toBe(slot("FR"));
  });

  it("공식 한 번이면 아래 두 층은 그대로, 위 층 엣지 블럭 셋(앞·오른쪽·왼쪽)의 자리가 바뀌고 뒤는 그대로다", () => {
    const s = at(EDGE_FLIP, down());
    expect(goalMet(3, s, "f2l")).toBe(true);
    expect(["UF", "UR", "UL", "UB"].map((p) => home(s, p))).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});

describe("엣지 위치 = (R' U' R) · U' · (R' U2 R)", () => {
  it("두 덩어리는 같은 꼴이고 둘째만 가운데가 U2다", () => {
    expect(EDGE_CYCLE).toBe("R' U' R U' R' U2 R");
  });

  it("뒤 엣지 블럭은 그대로, 앞 → 왼쪽, 왼쪽 → 오른쪽, 오른쪽 → 앞이고 위 엣지 방향과 아래 두 층은 그대로다", () => {
    const s = at(EDGE_CYCLE, down());
    expect(goalMet(3, s, "f2l")).toBe(true);
    expect(edgesUp(s).length).toBe(4);
    expect([
      where(s, "UB"),
      where(s, "UF"),
      where(s, "UL"),
      where(s, "UR"),
    ]).toEqual([slot("UB"), slot("UL"), slot("UR"), slot("UF")]);
  });
});

describe("코너 방향 = R' · (F' L' F) · R · (F' L F)", () => {
  it("첫 층 코너 돌리기 R' D' R D와 같은 꼴: D' 자리에 덩어리 F' L' F, D 자리에 그 덩어리의 거꾸로(가운데 L'만 L로)", () => {
    const X = "F' L' F";
    expect(CORNER_TURN).toBe(`R' ${X} R ${invertAlg(X)}`);
    expect(invertAlg(X)).toBe("F' L F");
  });

  it("R'로 앞-오른쪽 위 코너 블럭이 앞-오른쪽 아래로, F' L' F는 그 블럭을 건드리지 않고 앞-왼쪽 위 코너 블럭을 앞-오른쪽 위로, R로 내려간 블럭이 위 층으로 돌아온다", () => {
    expect(where(at("R'", down()), "UFR")).toBe(slot("DFR"));
    const x = at("R' F' L' F", down());
    expect(where(x, "UFR")).toBe(slot("DFR"));
    expect(where(x, "UFL")).toBe(slot("UFR"));
    expect(where(at("R' F' L' F R", down()), "UFR")).toContain("U");
  });

  it("공식 한 번이면 아래 두 층과 위 엣지는 모두 그대로, 위 층 코너 셋의 자리와 방향이 바뀌고 뒤-왼쪽 위는 그대로다", () => {
    const s = at(CORNER_TURN, down());
    expect(edgesHome(s)).toBe(true);
    expect(["UFR", "UFL", "UBR", "UBL"].map((p) => home(s, p))).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(cornerYellows(s)[2]).toBe("U");
  });
});

describe("코너 위치 A = (R U) · (B L B') · R' · (B L' B') · R · (U' R'), B는 좌우를 바꾼 꼴", () => {
  it("준비와 준비 되돌리기는 서로 거꾸로이고, 가운데 여덟 수는 R' D' R D와 같은 꼴(덩어리 · 한 수 · 덩어리 거꾸로 · 한 수 거꾸로)이다", () => {
    const X = "B L B'";
    expect(CORNER_A).toBe(`R U ${X} R' ${invertAlg(X)} R ${invertAlg("R U")}`);
    const Y = "B' R' B";
    expect(CORNER_B).toBe(
      `L' U' ${Y} L ${invertAlg(Y)} L' ${invertAlg("L' U'")}`,
    );
  });

  it("말로 외우는 움직임이 실제와 같다: 앞면에서 보아 R·L'은 올리고 R'·L은 내리며, B는 위 줄을 왼쪽으로 B'는 오른쪽으로 보낸다", () => {
    // 앞면 오른쪽 줄(20)·왼쪽 줄(18) 스티커가 윗면(U)으로 가면 올림, 아랫면(D)으로 가면 내림
    const faceOfFront = (move: string, i: number) => {
      const s = at(move, down());
      const c = faceColors(3, s);
      const front = faceColors(3, down())[i];
      // 그 스티커 색이 옮겨 간 면: 윗면 칸 6~8 또는 아랫면 칸 27~29 등. 윗면 앞줄·아랫면 앞줄을 본다
      if ([0, 3, 6, 2, 5, 8].some((k) => c[k] === front)) return "up";
      if ([27, 30, 33, 29, 32, 35].some((k) => c[k] === front)) return "down";
      return "?";
    };
    expect(
      ["R", "L'", "R'", "L"].map((m) =>
        faceOfFront(m, m.startsWith("R") ? 20 : 18),
      ),
    ).toEqual(["up", "up", "down", "down"]);
    // 뒤면을 돌리면 윗면 뒤 줄(0·1·2) 스티커가 B는 왼쪽 면(36~44), B'는 오른쪽 면(9~17)으로
    const topBack = faceColors(3, down())[1];
    const sideOf = (move: string) => {
      const c = faceColors(3, at(move, down()));
      if ([36, 39, 42].some((k) => c[k] === topBack)) return "left";
      if ([11, 14, 17].some((k) => c[k] === topBack)) return "right";
      return "?";
    };
    expect([sideOf("B"), sideOf("B'")]).toEqual(["left", "right"]);
  });

  it("R U로 뒤-오른쪽 위 코너 블럭이 뒤-오른쪽 아래로 내려간다", () => {
    expect(where(at("R U", down()), "UBR")).toBe(slot("DBR"));
  });

  it("A는 앞-오른쪽 위를 두고 남은 셋을 시계 방향(앞-왼쪽 → 뒤-왼쪽 → 뒤-오른쪽 → 앞-왼쪽)으로, B는 앞-왼쪽 위를 두고 반시계 방향(앞-오른쪽 → 뒤-오른쪽 → 뒤-왼쪽 → 앞-오른쪽)으로 옮기고, 둘 다 위 엣지·노란색은 그대로다", () => {
    const moves = (alg: string) => {
      const s = at(alg, down());
      expect(edgesHome(s)).toBe(true);
      expect(cornerYellows(s).every((f) => f === "U")).toBe(true);
      return Object.fromEntries(
        ["UFR", "UFL", "UBL", "UBR"].map((k) => [k, where(s, k)]),
      );
    };
    expect(moves(CORNER_A)).toEqual({
      UFR: slot("UFR"),
      UFL: slot("UBL"),
      UBL: slot("UBR"),
      UBR: slot("UFL"),
    });
    expect(moves(CORNER_B)).toEqual({
      UFL: slot("UFL"),
      UFR: slot("UBR"),
      UBR: slot("UBL"),
      UBL: slot("UFR"),
    });
  });

  it("B는 A의 왼쪽과 오른쪽을 바꾼 꼴이다(L ↔ R, 도는 방향은 모두 반대)", () => {
    const mirror = (alg: string) =>
      alg
        .split(" ")
        .map((m) => {
          const face = m[0] === "L" ? "R" : m[0] === "R" ? "L" : m[0];
          const rest = m.slice(1);
          if (rest === "2") return `${face}2`;
          return rest === "'" ? face : `${face}'`;
        })
        .join(" ");
    expect(CORNER_B).toBe(mirror(CORNER_A));
    expect(SECOND_B).toBe(mirror(SECOND_A));
  });
});
