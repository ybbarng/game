// 코너 방향 먼저(신광사 해법) 강의 공식 짜임(docs/47 16-33): 쪽 글이 덩어리마다 말한 것을 엔진으로 확인한다. 덩어리를
// 이으면 쪽의 공식과 같은지, 공식이 첫 층 코너 돌리기와 같은 꼴(흐트러뜨리고·바꾸고·되돌리고·바꾼 것 되돌리기)인지,
// 덩어리 뒤 조각이 글이 말한 자리에 있는지, 공식이 위 엣지와 아래 두 층을 그대로 두는지 본다.
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
import { CORNER_A, CORNER_B, CORNER_TURN } from "./twist-first-path";

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const at = (alg: string, from: PuzzleState) =>
  alg.trim() ? applyMoves(3, from, parseMoves(3, alg)) : from;
/** 흰 면 아래로 쥔 맞춘 큐브 */
const down = () => at("z2", solvedCube(3));
const norm = (alg: string) => alg.trim().split(/\s+/).join(" ");
const where = (s: PuzzleState, piece: Face[]) =>
  [...piecePlace(s, piece)].sort().join("");
const slot = (faces: string) => [...faces].sort().join("");
/** 흰 면 아래로 쥐었을 때 그 자리에 있는 위 층 코너 블럭(맞춘 큐브의 면 글자: D 노랑, F 초록, L 주황, R 빨강, B 파랑) */
const TOP: Record<string, Face[]> = {
  UFR: ["D", "F", "L"],
  UFL: ["D", "F", "R"],
  UBR: ["D", "B", "L"],
  UBL: ["D", "B", "R"],
};
/** 위 엣지 넷이 제자리·바른 방향이고 아래 두 층이 맞음 */
function edgesHome(s: PuzzleState): boolean {
  if (!goalMet(3, s, "f2l")) return false;
  const c = faceColors(3, s);
  return (
    [1, 3, 5, 7].every((i) => c[i] === 3) &&
    [
      [19, 2],
      [10, 1],
      [46, 5],
      [37, 4],
    ].every(([i, f]) => c[i as number] === c[(f as number) * 9 + 4])
  );
}
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

describe("코너 방향 = R · (U' L' U) · R' · (U' L U)", () => {
  it("첫 층 코너 돌리기 R' D' R D와 같은 꼴: 흐트러뜨리고(R), 한 수 대신 덩어리로 옮기고(U' L' U), 되돌리고(R'), 덩어리를 되돌린다(가운데 L'만 L로)", () => {
    const X = "U' L' U";
    expect(CORNER_TURN).toBe(`R ${X} R' ${invertAlg(X)}`);
    expect(invertAlg(X)).toBe("U' L U");
    expect(TWIST).toBe(`R' D' ${invertAlg("R'")} ${invertAlg("D'")}`);
  });

  it("R로 앞-오른쪽 아래 코너 블럭과 둘째 층 오른쪽 엣지 블럭이 위 층으로, U' L' U는 그 둘을 건드리지 않고, R'로 둘이 제자리에 내려간다", () => {
    // 흰 면 아래로 쥐면 앞-오른쪽 아래 코너는 맞춘 큐브의 흰-초록-주황(U F L), 둘째 층 오른쪽 앞 엣지는 초록-주황(F L)
    const corner: Face[] = ["U", "F", "L"];
    const edge: Face[] = ["F", "L"];
    const r = at("R", down());
    expect([where(r, corner), where(r, edge)]).toEqual([
      slot("UFR"),
      slot("UR"),
    ]);
    const x = at("R U' L' U", down());
    expect([where(x, corner), where(x, edge)]).toEqual([
      slot("UFR"),
      slot("UR"),
    ]);
    const back = at("R U' L' U R'", down());
    expect([where(back, corner), where(back, edge)]).toEqual([
      slot("DFR"),
      slot("FR"),
    ]);
  });

  it("R로 앞-오른쪽 위 코너 블럭이 뒤-오른쪽 위로 밀려나고, U' L' U가 그 블럭을 왼쪽 층 아래(뒤-왼쪽 아래)로 내리고 앞-왼쪽 아래 코너 블럭을 위 층으로 올린다", () => {
    const top = TOP.UFR as Face[];
    // 흰 면 아래로 쥐면 앞-왼쪽 아래 코너는 맞춘 큐브의 흰-초록-빨강(U F R)
    const lowLeft: Face[] = ["U", "F", "R"];
    expect(where(at("R", down()), top)).toBe(slot("UBR"));
    expect(where(at("R U'", down()), top)).toBe(slot("UBL"));
    const x = at("R U' L' U", down());
    expect(where(x, top)).toBe(slot("DBL"));
    // 앞-왼쪽 아래 코너 블럭이 위 층(윗면에 닿는 자리)으로 올라와 있다
    expect(piecePlace(x, lowLeft)).toContain("U");
  });

  it("공식 한 번이면 아래 두 층과 위 엣지는 모두 그대로, 위 층 코너 셋의 자리와 방향이 바뀐다", () => {
    const s = at(CORNER_TURN, down());
    expect(edgesHome(s)).toBe(true);
    // 맞춘 큐브에서 치면 위를 보는 노란색이 하나만 남는다(셋이 돌아감)
    expect(upYellow(s)).toBe(1);
    const moved = Object.entries(TOP).filter(
      ([k, p]) => where(s, p) !== slot(k),
    );
    expect(moved.length).toBe(3);
  });
});

describe("코너 위치 A·B = 준비 · 덩어리 · 흐트러뜨림 · 덩어리 · 되돌림 · 준비 되돌림", () => {
  it("A = L · (L B2 L') · F' · (L B2 L') · F · L', B = R' · (R' B2 R) · F · (R' B2 R) · F' · R, 덩어리는 두 번 치면 처음", () => {
    const XL = "L B2 L'";
    const XR = "R' B2 R";
    expect(at(CORNER_A, down())).toEqual(at(`L ${XL} F' ${XL} F L'`, down()));
    expect(at(CORNER_B, down())).toEqual(at(`R' ${XR} F ${XR} F' R`, down()));
    expect(at(`${XL} ${XL}`, down())).toEqual(down());
    expect(at(`${XR} ${XR}`, down())).toEqual(down());
  });

  it("A는 앞-오른쪽 위를 두고 남은 셋을 위에서 보아 시계 방향(앞-왼쪽 → 뒤-왼쪽 → 뒤-오른쪽 → 앞-왼쪽)으로, B는 앞-왼쪽 위를 두고 반시계 방향(뒤-왼쪽 → 앞-오른쪽 → 뒤-오른쪽 → 뒤-왼쪽)으로 옮기고, 둘 다 위 엣지·노란색은 그대로다", () => {
    const moves = (alg: string) => {
      const s = at(alg, down());
      expect(edgesHome(s)).toBe(true);
      expect(upYellow(s)).toBe(4);
      return Object.fromEntries(
        Object.entries(TOP).map(([k, p]) => [k, where(s, p)]),
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
      UBL: slot("UFR"),
      UFR: slot("UBR"),
      UBR: slot("UBL"),
    });
  });

  it("A 덩어리마다: L로 앞-왼쪽 위가 앞-왼쪽 아래로, L B2 L'로 그것과 뒤-오른쪽 위가 맞바뀌고, F'로 앞-왼쪽 위에 온 블럭이 앞-왼쪽 아래로, 같은 덩어리로 그 블럭이 뒤-오른쪽 위로", () => {
    const UFL = TOP.UFL as Face[];
    const UBR = TOP.UBR as Face[];
    const UBL = TOP.UBL as Face[];
    expect(where(at("L", down()), UFL)).toBe(slot("DFL"));
    const x = at("L L B2 L'", down());
    expect([where(x, UFL), where(x, UBR)]).toEqual([slot("UBR"), slot("DFL")]);
    // 그때 앞-왼쪽 위에 와 있는 것은 처음 뒤-왼쪽 위 블럭
    expect(where(x, UBL)).toBe(slot("UFL"));
    expect(where(at("L L B2 L' F'", down()), UBL)).toBe(slot("DFL"));
    expect(where(at("L L B2 L' F' L B2 L'", down()), UBL)).toBe(slot("UBR"));
  });

  it("B 덩어리마다(A의 좌우 바꿈): R'로 앞-오른쪽 위가 앞-오른쪽 아래로, R' B2 R로 그것과 뒤-왼쪽 위가 맞바뀌고, F로 앞-오른쪽 위에 온 블럭이 앞-오른쪽 아래로, 같은 덩어리로 그 블럭이 뒤-왼쪽 위로", () => {
    const UFR = TOP.UFR as Face[];
    const UBL = TOP.UBL as Face[];
    const UBR = TOP.UBR as Face[];
    expect(where(at("R'", down()), UFR)).toBe(slot("DFR"));
    const x = at("R' R' B2 R", down());
    expect([where(x, UFR), where(x, UBL)]).toEqual([slot("UBL"), slot("DFR")]);
    expect(where(x, UBR)).toBe(slot("UFR"));
    expect(where(at("R' R' B2 R F", down()), UBR)).toBe(slot("DFR"));
    expect(where(at("R' R' B2 R F R' B2 R", down()), UBR)).toBe(slot("UBL"));
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
  });
});
