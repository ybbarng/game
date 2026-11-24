// 메이트 문제 주제 묶음(뒷줄 메이트·빗나가게 하기)이 정말 그 모양인지, 해설이 장면과 맞는지 본다.
// 정답이 하나뿐인지(한 수·두 수 메이트 유일성)는 study.test.ts가 모든 메이트 문제에 대해 본다.
import {
  applyMove,
  legalMoves,
  type Move,
  mateInOneMoves,
  step,
} from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { toneProblems } from "@/study/tone";
import { earlyUses, splitSentences } from "@/tutorial/term-order";

import { CHESS_PUZZLE_SETS, type ChessPuzzle } from "./puzzles";
import {
  defenseFor,
  explainMatePuzzle,
  isBackRankMate,
  puzzleState,
  solutionMove,
} from "./study";

const setOf = (id: string) => {
  const set = CHESS_PUZZLE_SETS.find((s) => s.id === id);
  if (!set) throw new Error(`묶음 없음: ${id}`);
  return set;
};
const rows = (ps: readonly ChessPuzzle[]) => ps.map((p) => [p.id, p] as const);

/** 정답 뒤 고수가 받은 판과, 그 판의 메이트 수들. 한 수 문제는 처음 판과 정답 하나 */
function finalLine(p: ChessPuzzle) {
  const state = puzzleState(p);
  if (p.kind === "mate" && p.mateIn === 1)
    return { before: state.position, mates: [solutionMove(p)] };
  const first = step(state, 0, { type: "move", ...solutionMove(p) });
  if (!first.ok) throw new Error(first.error);
  const reply = defenseFor(first.state);
  const second = step(first.state, 1, reply);
  if (!second.ok) throw new Error(second.error);
  return {
    before: second.state.position,
    mates: mateInOneMoves(second.state.position),
    reply,
    afterFirst: first.state.position,
  };
}

describe("뒷줄 메이트 묶음", () => {
  const set = setOf("back-rank");

  it("한 수 문제로 시작하고 두 수 문제가 뒤따르며, 모두 주제가 뒷줄 메이트다", () => {
    const kinds = set.puzzles.map((p) => (p.kind === "mate" ? p.mateIn : 0));
    expect(kinds.slice(0, 2)).toEqual([1, 1]);
    expect(kinds.slice(2).every((n) => n === 2)).toBe(true);
    expect(
      set.puzzles.every((p) => p.kind === "mate" && p.theme === "back-rank"),
    ).toBe(true);
  });

  it.each(rows(set.puzzles))(
    "%s: 흑이 어떻게 받아도 다음 수에 뒷줄 메이트가 있다(한 수 문제는 정답이 뒷줄 메이트)",
    (_id, p) => {
      const { position } = puzzleState(p);
      const answer = solutionMove(p);
      if (p.kind === "mate" && p.mateIn === 1) {
        expect(isBackRankMate(position, answer)).toBe(true);
        return;
      }
      const after = applyMove(position, answer);
      const missing = legalMoves(after).filter((reply) => {
        const next = applyMove(after, reply);
        return !mateInOneMoves(next).some((m) => isBackRankMate(next, m));
      });
      expect(missing).toEqual([]);
    },
  );
});

describe("빗나가게 하기 묶음", () => {
  const set = setOf("deflection");

  it("모두 두 수 메이트이고 주제가 빗나가게 하기다", () => {
    expect(
      set.puzzles.every(
        (p) => p.kind === "mate" && p.mateIn === 2 && p.theme === "deflection",
      ),
    ).toBe(true);
  });

  it.each(rows(set.puzzles))(
    "%s: 고수는 첫 수 기물을 잡으며 끌려가고, 그 기물이 지키던 다른 칸에서 메이트한다(어느 메이트 수든 해설이 그렇게 말한다)",
    (_id, p) => {
      const line = finalLine(p);
      const answer = solutionMove(p);
      expect(line.reply).toMatchObject({ type: "move", to: answer.to });
      expect(line.mates.length).toBeGreaterThan(0);
      for (const m of line.mates as Move[])
        expect(explainMatePuzzle(p, line.before, m)[0]).toMatch(
          /지키고 있었는데, .+ 끌려가 더는 지키지 못해요\.$/,
        );
    },
  );
});

describe("주제 묶음 글", () => {
  const sets = [setOf("back-rank"), setOf("deflection")];

  it("해설은 해요체 + 마침표이고, 주제 한 줄이 맨 앞에 온다", () => {
    const lines: string[] = [];
    for (const set of sets)
      for (const p of set.puzzles) {
        const line = finalLine(p);
        const m = line.mates[0] as Move;
        const text = explainMatePuzzle(p, line.before, m);
        if (set.id === "back-rank")
          expect(text[0]).toBe(
            "흑 킹이 자기 기물에 막혀 8번째 가로줄을 벗어나지 못하는 뒷줄 메이트예요.",
          );
        lines.push(...text);
      }
    expect(toneProblems(lines)).toEqual([]);
  });

  it("「뒷줄 메이트」는 묶음 소개에서 뜻을 알린 뒤에 해설에서 쓴다", () => {
    const set = setOf("back-rank");
    const places = [
      ...splitSentences(set.summary).map((text, i) => ({
        where: `소개 ${i + 1}째 문장`,
        group: 0,
        text,
      })),
      ...set.puzzles.flatMap((p) => {
        const line = finalLine(p);
        return explainMatePuzzle(p, line.before, line.mates[0] as Move).map(
          (text, i) => ({ where: `${p.id} 해설 ${i + 1}줄`, group: 0, text }),
        );
      }),
    ];
    expect(
      earlyUses(places, [
        {
          term: "뒷줄 메이트",
          use: /뒷줄 메이트/,
          define: /뒷줄 메이트라고 해요/,
        },
      ]),
    ).toEqual([]);
  });
});
