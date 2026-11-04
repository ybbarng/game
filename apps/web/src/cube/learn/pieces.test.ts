// 「큐브의 조각」 단원(3×3·2×2·4×4·5×5)의 고르기 답과 조각 따라가기 정답을 엔진으로 확인한다.
// 자리는 엔진(findHit·pieceByName)과 시험용 시뮬레이터(sim.homeOf) 두 쪽으로 서로 확인한다.
import {
  applyMoves,
  cubeTopology,
  FACE_INDEX,
  faceColors,
  OPPOSITE_FACE,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { homeOf } from "./__test__/pieces";
import { apply, solved } from "./__test__/sim";
import { COURSES } from "./index";
import { findHit, slotCenterColors } from "./interact";
import { goalMet, maskFor, pieceByName } from "./judge";
import {
  FLIPPED_EDGE,
  TRACK_CORNER,
  TRACK_EDGE,
  TWISTED_CORNER,
} from "./lessons-333";
import type { FindTarget, Lesson } from "./types";

const play = (n: number, alg: string, s: PuzzleState = solvedCube(n)) =>
  applyMoves(n, s, parseMoves(n, alg));

/** 찾기 목표에 맞는 조각 자리들 */
function hitSlots(n: number, state: PuzzleState, target: FindTarget) {
  const out = new Set<number>();
  for (let i = 0; i < cubeTopology(n).stickers.length; i++) {
    const p = findHit(n, state, i, target);
    if (p !== null) out.add(p);
  }
  return [...out];
}

const lessonOf = (id: string): Lesson => {
  const l = COURSES.flatMap((c) => c.lessons).find((x) => x.id === id);
  if (!l) throw new Error(id);
  return l;
};

const UFR = { colors: ["U", "F", "R"] } as FindTarget;
const UF = { colors: ["U", "F"] } as FindTarget;

describe("과정 맨 앞의 조각 단원", () => {
  it.each([
    ["333-beginner", "333-pieces"],
    ["222-beginner", "222-pieces"],
    ["444-reduction", "444-pieces"],
    ["555-reduction", "555-pieces"],
  ])("%s의 첫 단원은 %s", (course, lesson) => {
    expect(COURSES.find((c) => c.id === course)?.lessons[0]?.id).toBe(lesson);
  });

  it("3×3 조각 단원은 공식을 외우게 하지 않는다(해 보기 정답이 두 수 안쪽)", () => {
    for (const s of lessonOf("333-pieces").steps)
      if (s.kind === "try")
        expect(parseMoves(3, s.alg ?? "").length).toBeLessThanOrEqual(2);
  });
});

describe("조각 따라가기", () => {
  it("R을 돌리면 흰-초록-빨강 꼭짓점은 위-뒤-오른쪽으로 간다", () => {
    expect(hitSlots(3, play(3, "R"), UFR)).toEqual([pieceByName(3, "UBR")]);
    // 시뮬레이터: 위-뒤-오른쪽 자리(x 2, y 2, z -2)의 조각이 원래 위-앞-오른쪽 것
    expect(homeOf(apply(solved(3), "R"), [2, 2, -2])).toBe("2,2,2");
  });

  it(`${TRACK_CORNER}을 돌리면 흰-초록-빨강 꼭짓점은 위-앞-왼쪽으로 간다`, () => {
    expect(hitSlots(3, play(3, TRACK_CORNER), UFR)).toEqual([
      pieceByName(3, "UFL"),
    ]);
    expect(homeOf(apply(solved(3), TRACK_CORNER), [-2, 2, 2])).toBe("2,2,2");
  });

  it(`${TRACK_EDGE}을 돌리면 흰-초록 모서리는 위-오른쪽으로 간다`, () => {
    expect(hitSlots(3, play(3, TRACK_EDGE), UF)).toEqual([
      pieceByName(3, "UR"),
    ]);
    expect(homeOf(apply(solved(3), TRACK_EDGE), [2, 2, 0])).toBe("0,2,2");
  });

  it("단원의 따라가기 찾기는 그 조각 하나만 맞는다", () => {
    const l = lessonOf("333-pieces");
    const tracks = l.steps.filter(
      (s) => s.kind === "find" && s.mask === "centers" && s.find?.colors,
    );
    expect(tracks.length).toBeGreaterThanOrEqual(3);
    for (const s of tracks) {
      const start = play(3, (s.setup as { alg: string }).alg);
      expect(hitSlots(3, start, s.find as FindTarget)).toHaveLength(1);
    }
  });
});

describe("고르기 문제의 답", () => {
  const l = lessonOf("333-pieces");
  const quiz = (q: string) => {
    const s = l.steps.find((x) => x.quiz?.question.includes(q));
    if (!s?.quiz) throw new Error(q);
    return { step: s, answer: s.quiz.choices[s.quiz.answer] };
  };

  it("조각 수: 모서리 12(색 둘), 모두 26", () => {
    const topo = cubeTopology(3);
    const kinds = topo.pieces.map((p) => p.stickers.length);
    expect(kinds.filter((k) => k === 2)).toHaveLength(12);
    expect(kinds.filter((k) => k === 3)).toHaveLength(8);
    expect(kinds.filter((k) => k === 1)).toHaveLength(6);
    expect(topo.pieces).toHaveLength(26);
    expect(quiz("모서리 조각은 몇 개").answer).toBe("12개, 색 둘씩");
    expect(quiz("모두 몇 개").answer).toBe("26개");
  });

  it("면을 돌려도 흰 가운데는 위 그대로", () => {
    const { step, answer } = quiz("흰 가운데는 지금 어디");
    const s = play(3, (step.setup as { alg: string }).alg);
    expect(faceColors(3, s)[(FACE_INDEX.U as number) * 9 + 4]).toBe(FACE_INDEX.U);
    expect(answer).toBe("위 그대로");
  });

  it("초록 맞은편은 파랑", () => {
    expect(OPPOSITE_FACE[FACE_INDEX.F as 0]).toBe(FACE_INDEX.B);
    expect(quiz("초록 가운데의 맞은편").answer).toBe("파랑");
  });

  it("뒤집힌 모서리·돌아간 꼭짓점 그림은 제자리지만 방향이 틀렸다", () => {
    const e = play(3, FLIPPED_EDGE);
    expect(hitSlots(3, e, UF)).toEqual([pieceByName(3, "UF")]);
    expect(goalMet(3, e, "piece:UF")).toBe(false);
    expect(quiz("흰-초록 모서리는 지금").answer).toBe("제자리지만 뒤집혔어요");

    const c = play(3, TWISTED_CORNER);
    expect(hitSlots(3, c, UFR)).toEqual([pieceByName(3, "UFR")]);
    expect(goalMet(3, c, "piece:UFR")).toBe(false);
    expect(quiz("몇 가지 방향").answer).toBe("세 가지");
  });

  it("자리 찾기: 초록-주황 자리는 앞-왼쪽, 노랑-파랑-빨강 자리는 아래-뒤-오른쪽", () => {
    const steps = l.steps.filter((s) => s.find?.at);
    expect(steps).toHaveLength(2);
    for (const s of steps) {
      const start = play(3, (s.setup as { alg: string }).alg);
      const at = s.find?.at ?? [];
      const slots = hitSlots(3, start, s.find as FindTarget);
      expect(slots).toEqual([pieceByName(3, at.join(""))]);
      // 그 자리에 지금 다른 조각이 있어도 자리로 맞다
      const sticker = cubeTopology(3).pieces[slots[0] as number]
        ?.stickers[0] as number;
      expect(slotCenterColors(3, start, sticker).sort()).toEqual(
        at.map((f) => FACE_INDEX[f] as number).sort(),
      );
    }
  });
});

describe("조각 하나 목표", () => {
  it("다른 조각은 보지 않고, 큐브를 통째로 돌려도 같은 조각을 본다", () => {
    expect(goalMet(3, solvedCube(3), "piece:UFR")).toBe(true);
    expect(goalMet(3, play(3, "R"), "piece:UFR")).toBe(false);
    expect(goalMet(3, play(3, "D L B"), "piece:UFR")).toBe(true);
    expect(goalMet(3, play(3, "D L B"), "piece:UF")).toBe(true);
    expect(goalMet(3, play(3, "y x"), "piece:UFR")).toBe(true);
    expect(goalMet(3, play(3, `${TRACK_CORNER} y`), "piece:UFR")).toBe(false);
    expect(goalMet(3, play(3, `${TRACK_CORNER} y U2 R'`), "piece:UFR")).toBe(
      false,
    );
    expect(goalMet(3, play(3, `${TRACK_CORNER} U2 R' y2`), "piece:UFR")).toBe(
      true,
    );
  });

  it("조각 하나 가리기: 그 조각과 가운데만 보인다", () => {
    const m = maskFor(3, "piece:UFR") ?? [];
    expect(m.filter((v) => v === "visible")).toHaveLength(3 + 6);
    expect(
      (maskFor(3, "piece:UF") ?? []).filter((v) => v === "visible"),
    ).toHaveLength(2 + 6);
    expect(
      (maskFor(3, "centers") ?? []).filter((v) => v === "visible"),
    ).toHaveLength(6);
  });
});

describe("큰 큐브와 2×2 조각 단원", () => {
  it("4×4: 2R로 흰-초록 날개 둘이 떨어지고, 가운데가 옮겨 간다", () => {
    const s = play(4, "2R");
    expect(hitSlots(4, s, UF)).toHaveLength(2);
    // 윗면 가운데 칸 넷 중 흰색이 아닌 것이 생긴다
    const c = faceColors(4, s);
    const centers = [5, 6, 9, 10].map((k) => c[k]);
    expect(centers.some((x) => x !== FACE_INDEX.U)).toBe(true);
  });

  it("5×5: 2R로 한가운데 칸은 그대로, 흰-초록 모서리 셋이 갈라진다", () => {
    const s = play(5, "2R");
    expect(faceColors(5, s)[12]).toBe(FACE_INDEX.U);
    expect(hitSlots(5, s, UF)).toHaveLength(3);
    const c = faceColors(5, s);
    expect(
      [6, 7, 8, 11, 13, 16, 17, 18].some((k) => c[k] !== FACE_INDEX.U),
    ).toBe(true);
  });

  it("2×2: 흰-초록-주황 꼭짓점이 하나 있다", () => {
    expect(
      hitSlots(2, play(2, "R U"), { colors: ["U", "F", "L"] }),
    ).toHaveLength(1);
  });
});
