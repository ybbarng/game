import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { COURSES } from "./index";
import {
  demoBodyParts,
  demoOffersTurn,
  findHit,
  fingerQuiz,
  focusMask,
  focusPieces,
  lookMet,
  marksForSlots,
  pickPiece,
  pieceAtSticker,
  pieceIdentityAt,
  playPassed,
  stepIsActive,
  stepPicture,
  stepProblem,
  stickerAtHit,
  turnProgress,
} from "./interact";
import type { Lesson } from "./types";

const play = (n: number, alg: string, s: PuzzleState = solvedCube(n)) =>
  applyMoves(n, s, parseMoves(n, alg));

/** 면 f(U R F D L B)의 줄 r 칸 c 스티커 자리 */
const at = (n: number, f: number, r: number, c: number) =>
  f * n * n + r * n + c;

describe("조각 찾기", () => {
  it("3D에서 누른 칸(조각 중심·법선)을 스티커 자리로 바꾼다", () => {
    // 앞면 센터
    expect(stickerAtHit(3, [0, 0, 1], "+z")).toBe(at(3, 2, 1, 1));
    // 윗면 앞 가운데 칸(흰-초록 엣지의 흰 칸)
    expect(stickerAtHit(3, [0, 1, 1], "+y")).toBe(at(3, 0, 2, 1));
    expect(stickerAtHit(3, [0, 0, 0], "+y")).toBeNull();
  });

  it("조각 종류와 붙은 색을 안다(큰 큐브 날개는 엣지)", () => {
    expect(pieceAtSticker(3, solvedCube(3), at(3, 2, 1, 1))).toMatchObject({
      type: "center",
      colors: [2],
    });
    expect(pieceAtSticker(3, solvedCube(3), at(3, 0, 2, 1))).toMatchObject({
      type: "edge",
      colors: [0, 2],
    });
    expect(pieceAtSticker(3, solvedCube(3), at(3, 0, 2, 2))?.type).toBe(
      "corner",
    );
    expect(pieceAtSticker(4, solvedCube(4), at(4, 0, 3, 1))?.type).toBe("edge");
    expect(pieceAtSticker(4, solvedCube(4), at(4, 0, 1, 1))?.type).toBe(
      "center",
    );
  });

  it("색으로 찾으면 조각이 옮겨 간 자리에서 맞는다(어느 칸을 눌러도)", () => {
    const s = play(3, "F2");
    const target = { colors: ["U", "F"] as ("U" | "F")[] };
    // F2 뒤 흰-초록 엣지 블럭은 아래-앞
    const down = at(3, 3, 0, 1);
    const front = at(3, 2, 2, 1);
    expect(findHit(3, s, down, target)).not.toBeNull();
    expect(findHit(3, s, front, target)).toBe(findHit(3, s, down, target));
    // 원래 자리(위-앞)에는 이제 노랑-초록이 있다
    expect(findHit(3, s, at(3, 0, 2, 1), target)).toBeNull();
    expect(findHit(3, s, at(3, 2, 1, 1), { piece: "center" })).not.toBeNull();
    expect(findHit(3, s, front, { piece: "corner" })).toBeNull();
  });
});

describe("고르기와 세기", () => {
  const s = solvedCube(3);
  const center = { piece: "center" } as const;
  // 앞면 센터(22)·윗면 센터(4)·앞면 왼쪽 위(18, 코너)
  it("누를 때마다 더하고, 다시 누르면 풀고, 틀린 조각은 세지 않는다", () => {
    const a = pickPiece(3, s, 22, center, [], 6);
    expect(a.kind).toBe("add");
    expect(a.found).toHaveLength(1);
    const b = pickPiece(3, s, 4, center, a.found, 6);
    expect(b.found).toHaveLength(2);
    const off = pickPiece(3, s, 22, center, b.found, 6);
    expect(off.kind).toBe("remove");
    expect(off.found).toEqual(b.found.filter((p) => p !== a.piece));
    const wrong = pickPiece(3, s, 18, center, b.found, 6);
    expect(wrong.kind).toBe("wrong");
    expect(wrong.found).toEqual(b.found);
    expect(wrong.piece).not.toBeNull();
  });

  it("하나 찾기는 다시 눌러도 풀리지 않고, 다 찾은 뒤에는 받지 않는다", () => {
    const a = pickPiece(3, s, 22, center, [], 1);
    expect(pickPiece(3, s, 22, center, a.found, 1).kind).toBe("none");
    const b = pickPiece(3, s, 22, center, [], 2);
    expect(pickPiece(3, s, 22, center, b.found, 2).kind).toBe("remove");
  });

  it("고른 조각의 스티커 모두에 표시가 붙고, 뒤의 표시가 앞을 덮는다", () => {
    const corner = pickPiece(3, s, 18, { piece: "corner" }, [], 1)
      .piece as number;
    const m = marksForSlots(3, s, [
      [corner, "pick"],
      [corner, "wrong"],
    ]);
    expect(m.filter((t) => t === "wrong")).toHaveLength(3);
    expect(m.filter((t) => t !== null)).toHaveLength(3);
  });

  it("표시는 조각을 따라 다닌다: 돌린 큐브에서 고른 자리의 지금 조각에 붙는다", () => {
    const r = play(3, "R");
    // R 뒤 위-앞-오른쪽 자리(윗면 칸 8)에 든 조각
    const slot = pickPiece(3, r, 8, { piece: "corner" }, [], 1).piece as number;
    const m = marksForSlots(3, r, [[slot, "pick"]]);
    const id = pieceIdentityAt(3, r, 8) as number;
    // 표시가 붙은 스티커 정체는 그 조각의 것
    const marked = m.flatMap((t, i) => (t ? [i] : []));
    expect(
      marked.every((i) => pieceIdentityAt(3, solvedCube(3), i) === id),
    ).toBe(true);
  });
});

describe("놀이판 가리기와 통과", () => {
  it("그 조각만 색, 센터를 더하면 센터도", () => {
    const corner = focusPieces(3, { colors: ["U", "F", "R"] });
    expect(corner).toHaveLength(1);
    const visible = (m: readonly string[]) =>
      m.filter((v) => v === "visible").length;
    expect(visible(focusMask(3, corner))).toBe(3);
    expect(visible(focusMask(3, corner, true))).toBe(3 + 6);
    // 여럿 주면 모두 더한다
    expect(
      focusPieces(3, [{ colors: ["U", "R"] }, { colors: ["U", "R", "B"] }]),
    ).toHaveLength(2);
  });

  it("층 돌리기 수나 조각 옮김 중 하나라도 채우면 통과", () => {
    expect(playPassed({ focus: {}, turns: 3 }, { turns: 2, moved: 9 })).toBe(
      false,
    );
    expect(playPassed({ focus: {}, turns: 3 }, { turns: 3, moved: 0 })).toBe(
      true,
    );
    expect(
      playPassed({ focus: {}, moved: 2, turns: 9 }, { turns: 2, moved: 2 }),
    ).toBe(true);
  });
});

describe("둘러보기", () => {
  it("큐브를 통째로 돌려 그 색 면이 그 자리로 왔는지 본다", () => {
    const goal = { color: "U", on: "D" } as const;
    expect(lookMet(3, solvedCube(3), goal)).toBe(false);
    expect(lookMet(3, play(3, "z2"), goal)).toBe(true);
    expect(lookMet(3, play(3, "x2"), goal)).toBe(true);
    expect(lookMet(2, play(2, "x2"), goal)).toBe(true);
    expect(lookMet(4, play(4, "x"), { color: "F", on: "U" })).toBe(true);
  });
});

describe("핑거 트릭 손가락 고르기", () => {
  const tokens = ["R", "U", "R'", "U'"];
  const fingers = ["RW", "RI", "RW", "LI"];

  it("round마다 다음 수를 내고, 답이 보기 셋 안에 한 번 있다", () => {
    for (let round = 0; round < 8; round++) {
      const q = fingerQuiz(tokens, fingers, round);
      expect(q.index).toBe(round % 4);
      expect(q.move).toBe(tokens[round % 4]);
      expect(q.answer).toBe(fingers[round % 4]);
      expect(q.choices).toHaveLength(3);
      expect(new Set(q.choices).size).toBe(3);
      expect(q.choices.filter((c) => c === q.answer)).toHaveLength(1);
      expect(q.choices).not.toContain("rot");
    }
  });

  it("답 자리가 고정되지 않는다", () => {
    const at = [0, 1, 2].map((r) => {
      const q = fingerQuiz(tokens, fingers, r);
      return q.choices.indexOf(q.answer);
    });
    expect(new Set(at).size).toBeGreaterThan(1);
  });
});

describe("한 수 해 보기", () => {
  const start = solvedCube(3);
  it("공식의 몇 수째 모양인지, 다르면 -1", () => {
    expect(turnProgress(3, start, "R U", start)).toMatchObject({
      step: 0,
      total: 2,
      done: false,
    });
    expect(turnProgress(3, start, "R U", play(3, "R")).step).toBe(1);
    expect(turnProgress(3, start, "R U", play(3, "R U")).done).toBe(true);
    expect(turnProgress(3, start, "R U", play(3, "L")).step).toBe(-1);
  });

  it("결과 모양으로 보므로 R2를 R R로 쳐도 된다", () => {
    expect(turnProgress(3, start, "R2", play(3, "R R")).done).toBe(true);
    expect(turnProgress(3, start, "z2", play(3, "x2 y2")).done).toBe(true);
  });
});

describe("단계 그림과 시연 따라 하기", () => {
  const lesson: Lesson = {
    id: "t",
    size: 3,
    title: "t",
    summary: "",
    steps: [
      { kind: "text", body: "a" },
      {
        kind: "demo",
        body: "b",
        alg: "F2",
        setup: { alg: "F2" },
        mask: "cross",
      },
      { kind: "demo", body: "c", alg: "R" },
      {
        kind: "try",
        body: "d",
        alg: "F2",
        setup: { alg: "F2" },
        goal: "cross",
      },
      { kind: "text", body: "e", mask: "f2l" },
    ],
  };

  it("마스크가 없는 글 단계는 가장 가까운 단계의 마스크를 맞춘 큐브에 씌운다", () => {
    expect(stepPicture(lesson, 0)).toEqual({ setup: undefined, mask: "cross" });
    expect(stepPicture(lesson, 4)).toEqual({ setup: undefined, mask: "f2l" });
  });

  it("시연 본문은 보는 말과 치는 말로 갈리고, 이으면 그대로다", () => {
    const body =
      "R은 오른쪽 면을 돌려요. 앞면 칸이 위로 올라가요. 이제 R을 쳐 보세요.";
    const parts = demoBodyParts(body);
    expect(parts.map((p) => p.text).join("")).toBe(body);
    expect(parts.map((p) => p.doing)).toEqual([false, false, true]);
    for (const c of COURSES)
      for (const l of c.lessons)
        for (const st of l.steps)
          if (st.kind === "demo")
            expect(
              demoBodyParts(st.body)
                .map((p) => p.text)
                .join(""),
            ).toBe(st.body);
  });

  it("같은 해보기가 있는 시연에는 「직접 해 보기」를 붙이지 않는다", () => {
    expect(demoOffersTurn(lesson, 1)).toBe(false);
    expect(demoOffersTurn(lesson, 2)).toBe(true);
    expect(demoOffersTurn(lesson, 0)).toBe(false);
  });
});

describe("배우기 자료", () => {
  const steps = COURSES.flatMap((c) =>
    c.lessons.flatMap((l) =>
      l.steps.map((step, i) => ({ id: `${l.id}#${i}`, lesson: l, step })),
    ),
  );

  it("글만 읽고 넘기는 단계가 없다", () => {
    expect(
      steps.filter(({ step }) => step.kind === "text").map((s) => s.id),
    ).toEqual([]);
  });

  it("단원마다 직접 하는 단계가 있다", () => {
    for (const c of COURSES)
      for (const l of c.lessons)
        expect(l.steps.some(stepIsActive), l.id).toBe(true);
  });

  it("고르기 문제의 답이 고를 것 안에 있고 고를 것끼리 겹치지 않는다", () => {
    for (const { id, step } of steps) {
      if (!step.quiz) continue;
      expect(new Set(step.quiz.choices).size, id).toBe(
        step.quiz.choices.length,
      );
    }
  });

  it.each(steps)("$id 자료가 제 종류에 맞다", ({ lesson, step }) => {
    expect(stepProblem(lesson, step)).toBeNull();
  });

  it("한 수 해 보기는 시작 상황에서 끝까지 가면 통과한다", () => {
    for (const { lesson, step } of steps) {
      if (step.kind !== "turn" || !step.alg) continue;
      const n = lesson.size;
      const s0 =
        step.setup && "alg" in step.setup
          ? play(n, step.setup.alg)
          : solvedCube(n);
      expect(turnProgress(n, s0, step.alg, play(n, step.alg, s0)).done).toBe(
        true,
      );
    }
  });
});
