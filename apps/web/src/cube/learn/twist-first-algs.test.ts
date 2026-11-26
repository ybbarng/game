// 코너 방향 먼저 강의 공식 짜임(docs/47 16-33): 쪽 글이 덩어리마다 「무엇이 어디로 가고 무엇은 그대로인지」 말한 것을
// 엔진으로 확인한다. 덩어리를 이으면 쪽의 공식과 같은지, 덩어리 하나하나를 친 뒤 조각이 글이 말한 자리에 있는지 본다.
import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { piecePlace, TWIST } from "./beginner-path";
import { goalMet } from "./judge";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import { invertAlg } from "./notation";
import {
  CORNER_SWAP,
  EDGE_CYCLE,
  EDGE_CYCLE_LEFT,
  edgesHome,
  YELLOW_FACE,
  YELLOW_FACE_BACK,
  YELLOW_FACE_MIRROR,
} from "./twist-first-path";

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const at = (alg: string, from: PuzzleState) =>
  alg.trim() ? applyMoves(3, from, parseMoves(3, alg)) : from;
/** 흰 면 아래로 쥔 맞춘 큐브 */
const down = () => at("z2", solvedCube(3));
const norm = (alg: string) => alg.trim().split(/\s+/).join(" ");
/** 조각(맞춘 큐브의 면 글자로 부른 색)이 든 자리: 스티커가 보는 면을 차례 없이 */
const where = (s: PuzzleState, piece: Face[]) =>
  [...piecePlace(s, piece)].sort().join("");
const slot = (faces: string) => [...faces].sort().join("");
/** 흰 면 아래로 쥐었을 때 그 자리에 있는 위 층 코너 블럭(맞춘 큐브의 면 글자) */
const TOP: Record<string, Face[]> = {
  UFR: ["D", "F", "L"],
  UFL: ["D", "F", "R"],
  UBR: ["D", "B", "L"],
  UBL: ["D", "B", "R"],
};
const upYellow = (s: PuzzleState) => {
  const c = faceColors(3, s);
  return [0, 2, 6, 8].filter((k) => c[k] === 3).length;
};

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

describe("노란 면 = R U R' + U + R U2 R'", () => {
  it("R U R'로 앞-오른쪽 짝(첫 층 코너·둘째 층 엣지)이 위 층으로 올라가 비켜 서고, 앞-오른쪽 위 코너 블럭이 아래로 내려간다", () => {
    const s = down();
    const a = at("R U R'", s);
    expect(where(a, ["U", "F", "L"])).toBe(slot("UFL"));
    expect(where(a, ["F", "L"])).toBe(slot("UF"));
    expect(where(a, TOP.UFR as Face[])).toBe(slot("DFR"));
  });

  it("U로 그 짝이 뒤-왼쪽으로, R U2 R'로 내려갔던 코너 블럭이 노란색이 옆을 보며 올라오고 짝은 제자리에 내려간다", () => {
    const s = at("R U R' U", down());
    expect(where(s, ["U", "F", "L"])).toBe(slot("UBL"));
    expect(where(s, ["F", "L"])).toBe(slot("UL"));
    // R 하나 뒤: 내려갔던 코너가 앞-오른쪽 위로, 노란색(맞춘 큐브 D 색)이 오른쪽
    const up = at("R", s);
    expect(piecePlace(up, TOP.UFR as Face[])[0]).toBe("R");
    expect(where(up, TOP.UFR as Face[])).toBe(slot("UFR"));
    const end = at("R U2 R'", s);
    expect(goalMet(3, end, "f2l")).toBe(true);
    expect(goalMet(3, end, "yellow-cross")).toBe(true);
    // 위를 보는 노란색은 하나만 남는다(코너 셋이 돌아감)
    expect(upYellow(end)).toBe(1);
  });

  it("노란 면 공식은 코너 셋을 같은 쪽으로 한 번씩 돌린다: 하나인 모양 둘은 셋이 같은 쪽으로 돌아가 있고, 앞-오른쪽 위 노란색이 앞이면 공식, 오른쪽이면 그 반대쪽(거꾸로)", () => {
    // 코너 자리 스티커(윗면 칸부터 시계 방향): 노란 칸의 차례가 돌아간 쪽(0 = 위)
    const SLOTS = [
      [8, 9, 20],
      [6, 18, 38],
      [0, 36, 47],
      [2, 45, 11],
    ];
    const twists = (s: PuzzleState) => {
      const c = faceColors(3, s);
      return SLOTS.map((xs) => xs.findIndex((i) => c[i] === 3)).filter(
        (k) => k > 0,
      );
    };
    expect(twists(at(YELLOW_FACE, down()))).toEqual([1, 1, 1]);
    const front = at(invertAlg(YELLOW_FACE), down());
    const right = at(invertAlg(YELLOW_FACE_BACK), down());
    expect([twists(front), twists(right)]).toEqual([
      [2, 2, 2],
      [1, 1, 1],
    ]);
    // 앞-오른쪽 위 노란색: 공식으로 맞는 모양은 앞(20번 칸), 거꾸로로 맞는 모양은 위를 보는 블럭을 앞-왼쪽 위에 두면 오른쪽
    expect(faceColors(3, front)[20]).toBe(3);
  });

  it("거꾸로 R U2 R' U' R U' R'는 노란 면 공식의 수를 끝에서부터 반대로 친 것이다", () => {
    expect(YELLOW_FACE_BACK).toBe(invertAlg(YELLOW_FACE));
  });

  it("위를 보는 노란색 하나, 앞-왼쪽 위: 앞-오른쪽 위 노란색이 앞이면 노란 면 공식 한 번으로 윗면이 노랗다", () => {
    const s = at(invertAlg(YELLOW_FACE), down());
    expect(upYellow(s)).toBe(1);
    expect(goalMet(3, at(YELLOW_FACE, s), "oll")).toBe(true);
  });
});

describe("코너 바꾸기 = R' · F · (R' B2 R) · F' · (R' B2 R) · R", () => {
  it("첫 층 코너 돌리기 R' D' R D와 같은 꼴: 흐트러뜨림 F, 바꾸기 R' B2 R, 되돌림 F', 바꾸기 되돌림 R' B2 R을 R'·R로 감쌌다", () => {
    const X = "R' B2 R";
    expect(at(CORNER_SWAP, down())).toEqual(at(`R' F ${X} F' ${X} R`, down()));
    // 코너 돌리기도 흐트러뜨리고(R') 바꾸고(D') 되돌리고(R) 바꾼 것을 되돌린다(D)
    expect(TWIST).toBe(`R' D' ${invertAlg("R'")} ${invertAlg("D'")}`);
  });

  it("R' B2 R은 두 번 치면 처음으로 돌아온다", () => {
    expect(at("R' B2 R R' B2 R", down())).toEqual(down());
  });

  it("덩어리마다: R'로 뒤-오른쪽 위가 앞-오른쪽 위로, F로 그것이 앞-오른쪽 아래로, R' B2 R로 뒤-왼쪽 위와 맞바꿈, F'로 처음 앞-오른쪽 위가 앞-오른쪽 아래로, R' B2 R2로 그것이 뒤-왼쪽 위로", () => {
    const s = down();
    const UBR = TOP.UBR as Face[];
    const UFR = TOP.UFR as Face[];
    const UBL = TOP.UBL as Face[];
    const UFL = TOP.UFL as Face[];
    let t = at("R'", s);
    expect([where(t, UBR), where(t, UFR)]).toEqual([slot("UFR"), slot("DFR")]);
    t = at("R' F", s);
    expect(where(t, UBR)).toBe(slot("DFR"));
    t = at("R' F R' B2 R", s);
    expect([where(t, UBR), where(t, UBL)]).toEqual([slot("UBL"), slot("DFR")]);
    t = at("R' F R' B2 R F'", s);
    expect(where(t, UFR)).toBe(slot("DFR"));
    t = at("R' F R' B2 R F' R' B2 R", s);
    expect([where(t, UFR), where(t, UBR)]).toEqual([slot("UBL"), slot("DFR")]);
    // 뒤 층도 돌아온다(아래 두 층 가운데 뒤쪽 조각)
    expect(where(t, ["U", "B", "R"])).toBe(slot("DBL"));
    const end = at(CORNER_SWAP, s);
    expect([
      where(end, UBR),
      where(end, UFR),
      where(end, UBL),
      where(end, UFL),
    ]).toEqual([slot("UFR"), slot("UBL"), slot("UBR"), slot("UFL")]);
    expect(goalMet(3, end, "oll")).toBe(true);
  });
});

describe("엣지 돌리기 = 노란 면 + U + 거울 + U'", () => {
  const mirror = (alg: string) =>
    alg
      .split(" ")
      .map((m) =>
        m === "R"
          ? "L'"
          : m === "R'"
            ? "L"
            : m === "U"
              ? "U'"
              : m === "U'"
                ? "U"
                : m,
      )
      .join(" ");

  it("거울은 R을 L'로, R'을 L로, U를 U'로 바꾸고 U2는 그대로다", () => {
    expect(YELLOW_FACE_MIRROR).toBe(mirror(YELLOW_FACE));
  });

  it("노란 면 공식 뒤 위 코너가 흐트러지고, U와 거울 뒤 노란색이 모두 위, U' 뒤 코너가 모두 제자리다", () => {
    const s = down();
    expect(upYellow(at(`${YELLOW_FACE} U`, s))).toBe(1);
    expect(
      goalMet(3, at(`${YELLOW_FACE} U ${YELLOW_FACE_MIRROR}`, s), "oll"),
    ).toBe(true);
    const end = at(EDGE_CYCLE, s);
    const c = faceColors(3, end);
    const cornersHome = [8, 9, 20, 6, 18, 38, 0, 36, 47, 2, 45, 11].every(
      (i) => c[i] === c[Math.floor(i / 9) * 9 + 4],
    );
    expect(cornersHome).toBe(true);
    expect(goalMet(3, end, "f2l")).toBe(true);
  });

  it("오른손 먼저: 뒤 엣지는 그대로, 앞 → 왼쪽 → 오른쪽 → 앞. 왼손 먼저는 반대로", () => {
    const edges: Record<string, Face[]> = {
      F: ["D", "F"],
      R: ["D", "L"],
      B: ["D", "B"],
      L: ["D", "R"],
    };
    const moved = (alg: string) =>
      Object.fromEntries(
        Object.entries(edges).map(([k, p]) => [k, where(at(alg, down()), p)]),
      );
    expect(moved(EDGE_CYCLE)).toEqual({
      F: slot("UL"),
      L: slot("UR"),
      R: slot("UF"),
      B: slot("UB"),
    });
    expect(moved(EDGE_CYCLE_LEFT)).toEqual({
      F: slot("UR"),
      R: slot("UL"),
      L: slot("UF"),
      B: slot("UB"),
    });
    expect(edgesHome(at(EDGE_CYCLE, down()))).toEqual(["B"]);
  });

  it("왼손 먼저는 두 덩어리의 차례를 바꾸고 사이·끝의 윗면 돌리기를 반대로 한 것이다", () => {
    expect(EDGE_CYCLE).toBe(`${YELLOW_FACE} U ${YELLOW_FACE_MIRROR} U'`);
    expect(EDGE_CYCLE_LEFT).toBe(`${YELLOW_FACE_MIRROR} U' ${YELLOW_FACE} U`);
  });
});
