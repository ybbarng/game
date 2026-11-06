// 초보자 첫 층(흰 면 위)과 마지막 층 네 단계(2026-11-04): 글이 말하는 쥐는 법·되풀이 횟수·고르기 답을 엔진으로 확인한다.
// 자료: mimmi.co.kr 「3x3 큐브 맞추는 법」, ruwix 「Beginner's method」. 해 보기(상황 → 모범 답 → 목표)는 judge.test.ts가 본다.
import { TAUGHT_CORNER_SHORTCUT } from "@game/cube-ai";
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  pieceFaces,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { COURSES } from "./index";
import { goalMet, placedTopCorners, stateForRule } from "./judge";
import {
  A_PERM,
  CORNER_CYCLE,
  CORNER_PLACED_TWISTED,
  CORNER_TWIST,
  CORNERS_NONE,
  DOT_TO_CROSS,
  EDGE_OPPOSITE,
  EDGE_SWAP,
  reps,
  SHORT_DOWN,
  SHORT_FRONT,
  SHORT_RIGHT,
  STUCK_CORNER_UP,
  TWIST_THREE,
  TWIST_TWO,
} from "./lessons-333";
import { setupFor } from "./notation";
import type { FaceLetter, Lesson } from "./types";

const F: Record<FaceLetter, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
const WHITE = F.U;
const YELLOW = F.D;
const EO = "F R U R' U' F'";
const U4 = ["", "U", "U2", "U'"];
const Y4 = ["", "y", "y2", "y'"];
const play = (alg: string, s: PuzzleState = solvedCube(3), n = 3) =>
  alg.trim() ? applyMoves(n, s, parseMoves(n, alg)) : s;
const held = (solution: string) => play(setupFor(solution, "z2"));

const lessonOf = (id: string): Lesson => {
  const l = COURSES.flatMap((c) => c.lessons).find((x) => x.id === id);
  if (!l) throw new Error(id);
  return l;
};

function slot(s: PuzzleState, faces: FaceLetter[]) {
  const want = faces.map((f) => F[f]).sort();
  const topo = cubeTopology(3);
  const i = topo.pieces.findIndex(
    (_, p) => pieceFaces(3, p).slice().sort().join() === want.join(),
  );
  const col = faceColors(3, s);
  return (topo.pieces[i]?.stickers ?? []).map((st) => ({
    face: Math.floor(st / 9),
    color: col[st] as number,
  }));
}
const colorsAt = (s: PuzzleState, at: FaceLetter[]) =>
  slot(s, at)
    .map((x) => x.color)
    .sort();
const faceOf = (s: PuzzleState, at: FaceLetter[], c: number) =>
  slot(s, at).find((x) => x.color === c)?.face;
const centerOf = (s: PuzzleState, f: FaceLetter) =>
  faceColors(3, s)[F[f] * 9 + 4] as number;
const SIDES: FaceLetter[] = ["F", "R", "B", "L"];
/** 윗면에서 노란 칸이 위를 보는 엣지 쪽 */
const yellowUp = (s: PuzzleState) =>
  SIDES.filter((f) => faceOf(s, ["U", f], centerOf(s, "U")) === F.U)
    .sort()
    .join("");
/** 위 엣지의 옆색이 옆 센터와 맞는 쪽 */
const matched = (s: PuzzleState) =>
  SIDES.filter((f) =>
    slot(s, ["U", f]).some(
      (x) => x.face === F[f] && x.color === centerOf(s, f),
    ),
  )
    .sort()
    .join("");
const ADJACENT = new Set(["FR", "BR", "BL", "FL"]);

describe("첫 층 코너(흰 면 위)", () => {
  const lesson = lessonOf("333-first-corners-up");

  it("칸 밑 코너: 흰색이 오른쪽 1번, 아래 3번, 앞 5번. 제 칸에서 오른쪽 2번, 앞 4번", () => {
    const want: Record<number, [FaceLetter[], number]> = {
      1: [["D", "F", "R"], F.R],
      2: [["U", "F", "R"], F.R],
      3: [["D", "F", "R"], F.D],
      4: [["U", "F", "R"], F.F],
      5: [["D", "F", "R"], F.F],
    };
    for (const k of [1, 2, 3, 4, 5]) {
      const s = play(setupFor(reps(CORNER_TWIST, k)));
      const [at, face] = want[k] as [FaceLetter[], number];
      expect(colorsAt(s, at), `${k}`).toEqual([0, 1, 2]);
      expect(faceOf(s, at, WHITE), `${k}`).toBe(face);
      expect(goalMet(3, s, "white-cross")).toBe(true);
      for (let i = 1; i < k; i++)
        expect(goalMet(3, play(reps(CORNER_TWIST, i), s), "first-layer")).toBe(
          false,
        );
      expect(goalMet(3, play(reps(CORNER_TWIST, k), s), "first-layer")).toBe(
        true,
      );
    }
  });

  it("고르기 답이 엔진과 같다(아래 3번, 제 칸 오른쪽 2번)", () => {
    const quizzes = lesson.steps.filter((s) => s.kind === "quiz");
    expect(quizzes[0]?.quiz?.choices[quizzes[0].quiz.answer]).toBe("세 번");
    expect(quizzes[1]?.quiz?.choices[quizzes[1].quiz.answer]).toBe("두 번");
  });

  it("지름길: 칸 밑 코너의 흰색이 오른쪽 R' D' R, 앞 F D F', 아래 R' D2 R D 뒤 R' D' R(해법과 같다)", () => {
    const want: [string, number][] = [
      [SHORT_RIGHT, F.R],
      [SHORT_FRONT, F.F],
      [SHORT_DOWN, F.D],
    ];
    expect([SHORT_RIGHT, SHORT_FRONT, SHORT_DOWN]).toEqual([
      TAUGHT_CORNER_SHORTCUT.right,
      TAUGHT_CORNER_SHORTCUT.front,
      TAUGHT_CORNER_SHORTCUT.down,
    ]);
    for (const [alg, face] of want) {
      const s = play(setupFor(alg));
      expect(colorsAt(s, ["D", "F", "R"]), alg).toEqual([0, 1, 2]);
      expect(faceOf(s, ["D", "F", "R"], WHITE), alg).toBe(face);
      expect(goalMet(3, s, "white-cross")).toBe(true);
      expect(goalMet(3, play(alg, s), "first-layer")).toBe(true);
      // 맞춘 면(U)은 돌리지 않는다
      expect(alg).not.toMatch(/U/);
    }
    // 지름길 단계는 무작위 해 보기 뒤라 해 보기 번호가 그대로다
    const random = lesson.steps.findIndex((s) => s.kind === "try" && !s.alg);
    const short = lesson.steps.findIndex((s) => s.alg === SHORT_RIGHT);
    expect(short).toBeGreaterThan(random);
    // 제 칸에서 돌아간 코너: 흰색이 보는 쪽 지름길에 D(앞이면 D')를 붙여 빼면 칸 밑에서도 흰색이 같은 쪽, 같은 지름길로 넣는다
    const stuck = lesson.steps.at(-3);
    const quiz = stuck?.quiz;
    const answer = `${SHORT_FRONT} D' 뒤 ${SHORT_FRONT}`;
    expect(quiz?.choices[quiz.answer]).toBe(answer);
    const setup = stuck?.setup;
    const start = play(setup && "alg" in setup ? setup.alg : "");
    expect(colorsAt(start, ["U", "F", "R"])).toEqual([0, 1, 2]);
    expect(faceOf(start, ["U", "F", "R"], WHITE)).toBe(F.F);
    const out = play(`${SHORT_FRONT} D'`, start);
    expect(faceOf(out, ["D", "F", "R"], WHITE)).toBe(F.F);
    expect(
      goalMet(3, play(answer.replace(" 뒤", ""), start), "first-layer"),
    ).toBe(true);
    const outRight = play(
      `${SHORT_RIGHT} D`,
      play(setupFor(`${SHORT_RIGHT} D ${SHORT_RIGHT}`)),
    );
    expect(faceOf(outRight, ["D", "F", "R"], WHITE)).toBe(F.R);
  });

  it("흰-초록-빨강은 아래-앞-왼쪽에 있고 D로 칸 밑에 온다", () => {
    const s = play(setupFor(`D ${CORNER_TWIST}`));
    expect(colorsAt(s, ["D", "F", "L"])).toEqual([0, 1, 2]);
    expect(colorsAt(play("D", s), ["D", "F", "R"])).toEqual([0, 1, 2]);
  });

  it("y로 쥐기: 넣을 칸은 오른쪽-뒤, 처음 앞은 주황", () => {
    const s = play(setupFor(`y ${CORNER_TWIST}`));
    expect(centerOf(s, "F")).toBe(F.L);
    expect(colorsAt(s, ["U", "B", "R"])).not.toContain(WHITE);
    expect(centerOf(play("y", s), "F")).toBe(F.F);
  });

  it("박힌 코너: 위 칸에 흰-파랑-빨강, 한 번 빼면 D로 오른쪽-뒤 밑, y로 쥐면 앞-오른쪽 밑", () => {
    const s = play(setupFor(STUCK_CORNER_UP));
    expect(colorsAt(s, ["U", "F", "R"])).toEqual([0, 1, 5]);
    const out = play(CORNER_TWIST, s);
    expect(colorsAt(out, ["U", "F", "R"])).not.toContain(WHITE);
    expect(colorsAt(out, ["D", "F", "R"])).toEqual([0, 1, 5]);
    expect(colorsAt(play("D", out), ["D", "B", "R"])).toEqual([0, 1, 5]);
    const turned = play("D y", out);
    expect(colorsAt(turned, ["D", "F", "R"])).toEqual([0, 1, 5]);
    expect([centerOf(turned, "F"), centerOf(turned, "R")]).toEqual([F.R, F.B]);
  });

  it("R' D'에서 흰 십자가 흐트러지고 R D로 돌아온다", () => {
    expect(goalMet(3, play("R' D'"), "white-cross")).toBe(false);
    expect(goalMet(3, play("R' D' R D"), "white-cross")).toBe(true);
  });

  it("끝에 뒤집기 둘러보기, 뒤집은 뒤 오른쪽은 주황", () => {
    const last = lesson.steps.at(-2);
    expect(last?.kind).toBe("look");
    expect(last?.look).toEqual({ color: "U", on: "D" });
    expect(centerOf(play("z2"), "R")).toBe(F.L);
  });
});

describe("노란 십자: 같은 공식을 모양마다", () => {
  it("가로줄은 가로(왼쪽-오른쪽), 한 번이면 십자", () => {
    expect(yellowUp(held(EO))).toBe("LR");
    expect(yellowUp(play(EO, held(EO)))).toBe("BFLR");
  });

  it("ㄱ자는 뒤·왼쪽에서 한 번 → 가로줄 → 한 번 → 십자", () => {
    const s = held(`${EO} ${EO}`);
    expect(yellowUp(s)).toBe("BL");
    expect(yellowUp(play(EO, s))).toBe("LR");
    expect(goalMet(3, play(`${EO} ${EO}`, s), "yellow-cross")).toBe(true);
  });

  it("쥐기 문제: 지금 ㄱ자는 왼쪽·앞, U로 뒤·왼쪽", () => {
    const s = play(`${setupFor(`${EO} ${EO}`, "z2")} U'`);
    expect(yellowUp(s)).toBe("FL");
    expect(yellowUp(play("U", s))).toBe("BL");
  });

  it("점 → ㄱ자 → (U2) 뒤·왼쪽 → 가로줄 → 십자, 세 번", () => {
    const dot = held(DOT_TO_CROSS);
    expect(yellowUp(dot)).toBe("");
    const one = play(EO, dot);
    expect(ADJACENT.has(yellowUp(one))).toBe(true);
    expect(faceColors(3, one)).toEqual(faceColors(3, held(`U2 ${EO} ${EO}`)));
    expect(yellowUp(play("U2", one))).toBe("BL");
    expect(yellowUp(play(`U2 ${EO}`, one))).toBe("LR");
    expect(goalMet(3, play(`U2 ${EO} ${EO}`, one), "yellow-cross")).toBe(true);
  });

  it("점은 아무 방향에서 한 번 하면 ㄱ자", () => {
    const dot = held(DOT_TO_CROSS);
    for (const y of Y4)
      expect(ADJACENT.has(yellowUp(play(`${y} ${EO}`, dot))), y).toBe(true);
  });

  it("둘째 층까지 맞은 큐브는 점·ㄱ자·가로줄·십자뿐(노란 엣지 짝수)", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const n = yellowUp(stateForRule("second-layer-solved", seed)).length;
      expect([0, 2, 4]).toContain(n);
    }
  });
});

describe("옆면 맞추기: R U R' U R U2 R' U", () => {
  it("뒤·오른쪽을 두고 앞·왼쪽을 바꾼다, 아래 두 층과 노란 십자는 그대로", () => {
    const s = held(EDGE_SWAP);
    expect(matched(s)).toBe("BR");
    const after = play(EDGE_SWAP, s);
    expect(matched(after)).toBe("BFLR");
    expect(goalMet(3, after, "yellow-edges")).toBe(true);
    // 맞춘 큐브에 한 번: 앞·왼쪽만 바뀌고 뒤·오른쪽은 그대로
    expect(matched(play(EDGE_SWAP, play("z2")))).toBe("BR");
  });

  it("쥐기 문제: 맞은 둘이 앞·오른쪽이면 y'로 오른쪽·뒤", () => {
    const s = play(`${setupFor(EDGE_SWAP, "z2")} y`);
    expect(matched(s)).toBe("FR");
    expect(matched(play("y'", s))).toBe("BR");
  });

  it("일자: 어느 U에서도 이웃 둘이 맞지 않고, U로 앞·뒤가 맞는다", () => {
    const s = held(EDGE_OPPOSITE);
    for (const k of U4)
      expect(ADJACENT.has(matched(play(k, s))), k).toBe(false);
    expect(matched(play("U", s))).toBe("BF");
  });

  it("일자에서 아무 쪽에서나 한 번 쓰면 이웃 둘이 맞는 U 자리가 생긴다", () => {
    const s = play("U", held(EDGE_OPPOSITE));
    for (const y of Y4) {
      const t = play(`${y} ${EDGE_SWAP}`, s);
      expect(
        U4.some((k) => ADJACENT.has(matched(play(k, t)))),
        y,
      ).toBe(true);
    }
    // 모범 답대로: U' 뒤 앞·오른쪽이 맞고 y'로 쥐어 한 번
    const t = play(EDGE_SWAP, s);
    expect(matched(play("U'", t))).toBe("FR");
    expect(goalMet(3, play(`U' y' ${EDGE_SWAP}`, t), "yellow-edges")).toBe(
      true,
    );
  });

  it("노란 십자만 맞은 큐브는 늘 둘 이상 맞는 U 자리가 있고, 쥐는 법대로 두 번 안에 끝난다", () => {
    for (let seed = 1; seed <= 24; seed++) {
      let s = stateForRule("ll-cross-solved", seed);
      expect(
        U4.some((k) => matched(play(k, s)).length >= 2),
        `${seed}`,
      ).toBe(true);
      let uses = 0;
      while (!goalMet(3, s, "yellow-edges")) {
        const k = U4.find((x) => ADJACENT.has(matched(play(x, s))));
        if (k === undefined) {
          s = play(EDGE_SWAP, s);
        } else {
          s = play(k, s);
          const y = Y4.find((x) => matched(play(x, s)) === "BR") as string;
          s = play(`${y} ${EDGE_SWAP}`, s);
        }
        uses++;
        expect(uses, `${seed}`).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("코너 자리: U R U' L' U R' U' L", () => {
  it("앞-오른쪽 위를 두고 나머지 셋을 위에서 볼 때 시계 반대로 돌린다, 엣지·아래 두 층은 그대로", () => {
    const z = play("z2");
    const s = play(CORNER_CYCLE, z);
    expect(goalMet(3, s, "yellow-edges")).toBe(true);
    expect(goalMet(3, s, "f2l")).toBe(true);
    expect(colorsAt(s, ["U", "F", "R"])).toEqual(colorsAt(z, ["U", "F", "R"]));
    // 조각이 가는 곳: 앞-왼쪽 → 뒤-오른쪽 → 뒤-왼쪽 → 앞-왼쪽
    expect(colorsAt(s, ["U", "B", "R"])).toEqual(colorsAt(z, ["U", "F", "L"]));
    expect(colorsAt(s, ["U", "B", "L"])).toEqual(colorsAt(z, ["U", "B", "R"]));
    expect(colorsAt(s, ["U", "F", "L"])).toEqual(colorsAt(z, ["U", "B", "L"]));
  });

  it("거꾸로 L' U R U' L U R' U'는 반대로 돌리고, 거울 U' L' U R U' L U R'는 앞-왼쪽 위를 둔다", () => {
    const z = play("z2");
    const back = play("L' U R U' L U R' U'", z);
    expect(colorsAt(back, ["U", "F", "R"])).toEqual(
      colorsAt(z, ["U", "F", "R"]),
    );
    expect(colorsAt(back, ["U", "F", "L"])).toEqual(
      colorsAt(z, ["U", "B", "R"]),
    );
    expect(faceColors(3, play(CORNER_CYCLE, back))).toEqual(faceColors(3, z));
    const mirror = play("U' L' U R U' L U R'", z);
    expect(colorsAt(mirror, ["U", "F", "L"])).toEqual(
      colorsAt(z, ["U", "F", "L"]),
    );
    expect(goalMet(3, mirror, "yellow-edges")).toBe(true);
  });

  it("고르기: 앞-오른쪽 위는 노랑·초록·주황이고 제자리지만 돌아가 있다", () => {
    const s = held(CORNER_PLACED_TWISTED);
    expect(colorsAt(s, ["U", "F", "R"])).toEqual([F.F, F.D, F.L].sort());
    expect(faceOf(s, ["U", "F", "R"], YELLOW)).not.toBe(F.U);
    expect(goalMet(3, s, "ll-corners-placed")).toBe(false);
  });

  it("한 번에 안 되면 같은 쥐는 법으로 한 번 더(두 번이면 반대로)", () => {
    const s = held(`${CORNER_CYCLE} ${CORNER_CYCLE}`);
    expect(placedTopCorners(3, s)).toBe(1);
    expect(goalMet(3, play(CORNER_CYCLE, s), "ll-corners-placed")).toBe(false);
    expect(
      goalMet(
        3,
        play(`${CORNER_CYCLE} ${CORNER_CYCLE}`, s),
        "ll-corners-placed",
      ),
    ).toBe(true);
  });

  it("제자리가 없으면 아무 쪽에서나 한 번 해 꼭 하나가 생긴다", () => {
    const s = held(CORNERS_NONE);
    expect(placedTopCorners(3, s)).toBe(0);
    for (const y of Y4)
      expect(placedTopCorners(3, play(`${y} ${CORNER_CYCLE}`, s)), y).toBe(1);
    // 한 번 뒤 제자리는 앞-왼쪽 위, y'로 앞-오른쪽 위에 온다
    const t = play(CORNER_CYCLE, s);
    expect(placedTopCorners(3, t)).toBe(1);
    expect(goalMet(3, play(`y' ${CORNER_CYCLE}`, t), "ll-corners-placed")).toBe(
      true,
    );
  });

  it("위 엣지까지 맞은 큐브의 제자리 코너는 0·1·4개뿐", () => {
    for (let seed = 1; seed <= 24; seed++)
      expect([0, 1, 4]).toContain(
        placedTopCorners(3, stateForRule("ll-edges-solved", seed)),
      );
  });
});

describe("코너 방향: R' D' R D 2번 또는 4번", () => {
  it("노랑이 오른쪽이면 두 번, 그사이 아래 두 층이 흐트러지고, U로 다음 것(노랑 앞) 네 번이면 돌아온다", () => {
    const s = held(TWIST_TWO);
    expect(faceOf(s, ["U", "F", "R"], YELLOW)).toBe(F.R);
    const mid = play(reps(CORNER_TWIST, 2), s);
    expect(faceOf(mid, ["U", "F", "R"], YELLOW)).toBe(F.U);
    expect(goalMet(3, mid, "f2l")).toBe(false);
    const next = play("U", mid);
    expect(faceOf(next, ["U", "F", "R"], YELLOW)).toBe(F.F);
    const end = play(reps(CORNER_TWIST, 4), next);
    expect(goalMet(3, end, "f2l")).toBe(true);
    expect(goalMet(3, end, "solved")).toBe(false);
    expect(goalMet(3, play("U'", end), "solved")).toBe(true);
  });

  it("R' D' R D는 위층에서 앞-오른쪽 위 코너 하나만 건드린다", () => {
    const s = held(TWIST_THREE);
    const t = play(CORNER_TWIST, s);
    for (const at of [
      ["U", "F", "L"],
      ["U", "B", "L"],
      ["U", "B", "R"],
      ["U", "F"],
      ["U", "R"],
      ["U", "B"],
      ["U", "L"],
    ] as FaceLetter[][])
      expect(slot(t, at), at.join("")).toEqual(slot(s, at));
  });

  it("셋이 돌아간 상황도 코너마다 두 번씩, 윗면만 돌려 끝난다", () => {
    const s = held(TWIST_THREE);
    expect(goalMet(3, s, "ll-corners-placed")).toBe(true);
    expect(goalMet(3, play(TWIST_THREE, s), "solved")).toBe(true);
  });

  it("방향을 먼저 맞추는 방식: A퍼뮤는 방향·엣지를 지키며 코너 셋만 바꾸고, 자리 공식은 방향을 바꾼다", () => {
    const z = play("z2");
    const a = play(A_PERM, z);
    expect(goalMet(3, a, "oll")).toBe(true);
    expect(goalMet(3, a, "yellow-edges")).toBe(true);
    const corners: FaceLetter[][] = [
      ["U", "F", "L"],
      ["U", "F", "R"],
      ["U", "B", "L"],
      ["U", "B", "R"],
    ];
    const moved = corners.map(
      (at) => colorsAt(a, at).join() !== colorsAt(z, at).join(),
    );
    expect(moved).toEqual([false, true, true, true]);
    expect(goalMet(3, play(CORNER_CYCLE, z), "oll")).toBe(false);
  });
});
