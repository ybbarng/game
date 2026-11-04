// 「큐브의 조각」 단원(3×3·2×2·4×4·5×5)의 고르기 답과 조각 따라가기 정답을 엔진으로 확인한다.
// 자리는 엔진(findHit·pieceByName)과 시험용 시뮬레이터(sim.homeOf) 두 쪽으로 서로 확인한다.
import {
  applyMoves,
  cubeTopology,
  FACE_INDEX,
  faceColors,
  OPPOSITE_FACE,
  parseMoves,
  pieceFaces,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { homeOf } from "./__test__/pieces";

const LETTER = ["U", "R", "F", "D", "L", "B"] as const;
/** 맞춘 큐브에서 그 조각의 색(찾기 목표용) */
const colorsOf = (p: number) =>
  pieceFaces(3, p).map((f) => LETTER[f] as (typeof LETTER)[number]);

import { apply, solved } from "./__test__/sim";
import { COURSES } from "./index";
import {
  findHit,
  focusPieces,
  focusSlots,
  type PlayCount,
  playCount,
  slotCenterColors,
} from "./interact";
import { goalMet, maskFor, pieceByName } from "./judge";
import {
  FACE_ONLY,
  FLIPPED_EDGE,
  LAYER_DONE,
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
    ["333-beginner", "333-start"],
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
    expect(tracks.length).toBeGreaterThanOrEqual(1);
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

  it("세기: 까만 큐브에서 가운데 6, 조립으로 모서리 12·꼭짓점 8, 모두 26", () => {
    const topo = cubeTopology(3);
    const kinds = topo.pieces.map((p) => p.stickers.length);
    expect(kinds.filter((k) => k === 2)).toHaveLength(12);
    expect(kinds.filter((k) => k === 3)).toHaveLength(8);
    expect(kinds.filter((k) => k === 1)).toHaveLength(6);
    expect(topo.pieces).toHaveLength(26);
    const first = lessonOf("333-start");
    const counts = first.steps.filter((x) => (x.count ?? 1) > 1);
    expect(counts.map((x) => [x.find?.piece, x.count, x.mask])).toEqual([
      ["center", 6, "none"],
    ]);
    expect(first.steps.map((x) => x.kind)).toEqual([
      "welcome",
      "parts",
      "find",
      "build",
      "quiz",
    ]);
    // 세는 개수가 큐브에 있는 그 조각 수와 같다(모자라지도 남지도 않는다)
    for (const x of counts)
      expect(hitSlots(3, solvedCube(3), x.find as FindTarget)).toHaveLength(
        x.count as number,
      );
    const total = first.steps.find((x) =>
      x.quiz?.question.includes("모두 몇 개"),
    );
    expect(total?.quiz?.choices[total.quiz.answer]).toBe("26개");
  });

  it("한 면을 맞춘 상태: (가)는 흰 면만 흰색(자리 틀림), (나)는 흰 조각이 제자리", () => {
    const { step, answer } = quiz("한 면을 맞춘 상태");
    expect(answer).toBe("(나)");
    expect(step.quiz?.pictures?.map((p) => p.alg)).toEqual([
      FACE_ONLY,
      LAYER_DONE,
    ]);
    const ga = play(3, FACE_ONLY);
    const na = play(3, LAYER_DONE);
    // 둘 다 윗면 아홉 칸이 흰색
    for (const s of [ga, na])
      expect(
        faceColors(3, s)
          .slice(0, 9)
          .every((c) => c === FACE_INDEX.U),
      ).toBe(true);
    expect(goalMet(3, na, "first-layer")).toBe(true);
    expect(goalMet(3, ga, "first-layer")).toBe(false);
    expect(goalMet(3, na, "solved")).toBe(false);
    // (가): 흰 조각 여덟이 모두 제자리가 아니다
    const whites = cubeTopology(3)
      .pieces.map((_, i) => i)
      .filter((p) => cubeTopology(3).pieces[p]?.kind !== "center")
      .filter((p) => pieceFaces(3, p).includes(FACE_INDEX.U as number));
    expect(whites).toHaveLength(8);
    for (const p of whites) {
      const home = cubeTopology(3).pieces[p]?.stickers[0] as number;
      expect(findHit(3, ga, home, { colors: colorsOf(p) })).toBeNull();
      expect(findHit(3, na, home, { colors: colorsOf(p) })).toBe(p);
    }
    // 옆면 첫 줄은 (가)에서 가운데 색과 모두 다르다
    const c = faceColors(3, ga);
    for (const f of [1, 2, 4, 5])
      for (const k of [0, 1, 2]) expect(c[f * 9 + k]).not.toBe(f);
  });

  it("초록 맞은편은 파랑(분해·조립의 가운데 규칙, build.test.ts)", () => {
    expect(OPPOSITE_FACE[FACE_INDEX.F as 0]).toBe(FACE_INDEX.B);
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

  it("자리 찾기: 초록-주황 자리는 앞-왼쪽", () => {
    const steps = l.steps.filter((s) => s.find?.at);
    expect(steps).toHaveLength(1);
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

describe("놀이판", () => {
  const zero: PlayCount = { turns: 0, moved: 0 };
  /** 공식을 한 수씩 두며 놀이판 셈을 쌓는다 */
  const tally = (n: number, pieces: number[], alg: string) => {
    let s = solvedCube(n);
    let c = zero;
    for (const m of parseMoves(n, alg)) {
      const next = applyMoves(n, s, [m]);
      c = playCount(n, s, next, m, pieces, c);
      s = next;
    }
    return c;
  };

  it("3×3 단원에 가운데·꼭짓점·모서리·색이 함께 다니는 놀이판이 있다", () => {
    const plays = lessonOf("333-pieces").steps.filter((s) => s.kind === "play");
    expect(plays).toHaveLength(4);
    const sizes = plays.map((s) => focusPieces(3, s.play?.focus ?? {}).length);
    expect(sizes).toEqual([6, 1, 1, 2]);
  });

  it("3×3: 면을 돌려도 가운데는 자리를 옮기지 않는다. 가운데 층은 옮긴다", () => {
    const centers = focusPieces(3, { piece: "center" });
    expect(tally(3, centers, "R U F' L D B R2")).toEqual({
      turns: 7,
      moved: 0,
    });
    // 가운데 하나만 보면 가운데 층(M)은 그 가운데를 옮긴다(여섯 묶음으로는 같은 자리들)
    const white = focusPieces(3, { piece: "center", colors: ["U"] });
    expect(tally(3, white, "R U F' L D B").moved).toBe(0);
    expect(tally(3, white, "M").moved).toBe(1);
    expect(tally(3, centers, "M").moved).toBe(0);
    // 큐브 전체 돌리기는 세지 않는다
    expect(tally(3, centers, "x y z")).toEqual(zero);
  });

  it("3×3: 꼭짓점은 꼭짓점 자리로만, 모서리는 모서리 자리로만", () => {
    const topo = cubeTopology(3);
    const corner = focusPieces(3, UFR);
    const edge = focusPieces(3, UF);
    let s = solvedCube(3);
    for (const m of parseMoves(3, "R U F' L2 D B' M E S R U2")) {
      s = applyMoves(3, s, [m]);
      const [c] = focusSlots(3, s, corner);
      const [e] = focusSlots(3, s, edge);
      expect(topo.pieces[c as number]?.kind).toBe("corner");
      expect(topo.pieces[e as number]?.kind).toBe("edge");
    }
    expect(tally(3, corner, "R U R").moved).toBe(3);
  });

  it("4×4: 바깥 면을 돌리면 초록 가운데 넷이 함께 돌고, 안쪽 층이면 흩어진다", () => {
    const green = focusPieces(4, { piece: "center", colors: ["F"] });
    expect(green).toHaveLength(4);
    expect(tally(4, green, "F F'")).toEqual({ turns: 2, moved: 0 });
    expect(tally(4, green, "2R").moved).toBe(1);
  });

  it("5×5: 한가운데 칸만 늘 제자리, 둘레는 안쪽 층에 옮겨 간다", () => {
    const white = focusPieces(5, { piece: "center", colors: ["U"] });
    expect(white).toHaveLength(9);
    const middle = white.filter(
      (p) => cubeTopology(5).pieces[p]?.kind === "center",
    );
    expect(middle).toHaveLength(1);
    const ring = white.filter((p) => !middle.includes(p));
    expect(tally(5, middle, "2R 2U R U 2F' L D").moved).toBe(0);
    expect(tally(5, ring, "2R").moved).toBe(1);
  });
});
