// 바둑 문제 해설(study-explain.ts): 묶음 첫 문제는 개념을 풀어 쓰고, 뒤 문제는 같은 문장을 되풀이하지 않고 그 판의 사실을 짚는다.
// 처음 보는 독자 검토의 「해설이 문제마다 거의 같은 세 문장」 지적(2026-11-17)을 다시 받지 않게 본다.
import { type BadukState, step } from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  judgeMove,
  koPointOf,
  puzzleState,
  solutionOf,
} from "./study";
import { explainSolved, isFirstInSet } from "./study-explain";

/** 판 위 자리 이름(「F6」) */
const POINT = /[A-HJ][1-9]/;

/** 화면에서 푼 순간과 같은 판으로 해설을 만든다: 정답 첫 수를 두고, 문제가 이어지면 백이 받은 뒤 다음 정답까지 */
function solvedLines(p: BadukPuzzle): string[] {
  let state: BadukState = puzzleState(p);
  let move = solutionOf(p);
  for (let i = 0; i < 20; i++) {
    const verdict = judgeMove(p, state, move, i);
    if (verdict === "wrong") throw new Error(`${p.id}: ${i + 1}수가 틀렸다`);
    const before = state.board;
    const mine = step(state, 0, { type: "place", at: move });
    if (!mine.ok) throw new Error(`${p.id}: ${mine.error}`);
    state = mine.state;
    if (verdict === "solved") return explainSolved(p, before, move, i + 1);
    const theirs = step(state, 1, defenseFor(p, state, i));
    if (!theirs.ok) throw new Error(`${p.id}: ${theirs.error}`);
    state = theirs.state;
    // 다음 정답: 패로 버티기는 되따낼 자리, 그 밖은 판정이 받아 주는 첫 수
    const next =
      p.kind === "kofight"
        ? koPointOf(p)
        : state.board.findIndex(
            (c, at) => c === 0 && judgeMove(p, state, at, i + 1) !== "wrong",
          );
    if (next < 0) throw new Error(`${p.id}: 다음 수가 없다`);
    move = next;
  }
  throw new Error(`${p.id}: 끝나지 않는다`);
}

const explained = BADUK_PUZZLE_SETS.map(
  (set) =>
    [set.id, set.puzzles.map((p) => ({ p, lines: solvedLines(p) }))] as const,
);

describe("바둑 해설 되풀이 줄이기", () => {
  it("묶음 첫 문제만 개념을 풀어 쓰는 문제다", () => {
    for (const set of BADUK_PUZZLE_SETS)
      expect(set.puzzles.map(isFirstInSet)).toEqual(
        set.puzzles.map((_, i) => i === 0),
      );
  });

  it.each(explained)(
    "%s: 같은 묶음의 두 문제가 같은 해설 문장을 쓰지 않는다",
    (_id, items) => {
      const owner = new Map<string, string>();
      const repeated: string[] = [];
      for (const { p, lines } of items)
        for (const line of new Set(lines)) {
          const first = owner.get(line);
          if (first && first !== p.id)
            repeated.push(`${first}·${p.id}: ${line}`);
          else owner.set(line, p.id);
        }
      expect(repeated).toEqual([]);
    },
  );

  it.each(explained)(
    "%s: 뒤 문제의 해설 문장은 모두 그 판의 자리를 짚는다(개념만 말하는 문장이 없다)",
    (_id, items) => {
      const general = items
        .slice(1)
        .flatMap(({ p, lines }) =>
          lines.filter((l) => !POINT.test(l)).map((l) => `${p.id}: ${l}`),
        );
      expect(general).toEqual([]);
    },
  );
});

describe("뒤 문제 해설은 엔진으로 센 그 판의 사실이다", () => {
  const linesOf = (id: string) =>
    explained.flatMap(([, items]) => items).find((x) => x.p.id === id)?.lines ??
    [];

  it("축이 막히면 장문: 축머리마다 막는 쪽, 장문 자리가 백이 나올 두 자리에 붙었는지, 백이 나오면 흑이 막는 자리", () => {
    expect(linesOf("blocked-net-2")).toEqual([
      "F4에서 치는 축은 D4, E5에서 치는 축은 F2 백 돌에 막혀요.",
      "E4는 백이 나올 두 자리 E5·F4에 모두 붙은 자리예요.",
      "백이 E5로 나오면 D5, F4로 나오면 G4에 두어 세 수 안에 따내요.",
    ]);
  });

  it("환격: 백이 따낸 뒤 무리 크기와 하나뿐인 활로, 되따낸 돌 수", () => {
    expect(linesOf("snapback-2")).toEqual([
      "백이 A1에 두어 A2의 흑 한 점을 따내도, 백 네 점의 활로는 A2 하나뿐이에요.",
      "A2에 다시 두어, 내준 흑 돌 하나 대신 백 돌 4개를 되따냈어요.",
    ]);
  });

  it("선수 끝내기: 백이 받는 자리와, 받은 사이 흑이 두는 남은 곳", () => {
    expect(linesOf("endgame-sente-2")).toEqual([
      "B(E1)에 두면 백 한 점이 단수가 되어 백은 F2에 이어야 해요.",
      "A(E8)는 2점짜리로 B와 크기가 같지만, 백이 F2에 받은 사이 흑이 E8까지 둬요.",
    ]);
  });

  it("두 눈 만들기: 급소에 두면 눈 자리가 어느 자리로 나뉘는지, 다른 자리에 두면 잡힌다", () => {
    expect(linesOf("live-4")).toEqual([
      "흑이 B8에 두면 안쪽 백 돌 1개를 따내며 눈 자리 세 칸이 A9·A8 두 칸과 B7 한 칸으로 나뉘어요.",
      "백이 먼저 B8에 두면 남은 눈 자리 A9·A8 두 칸이 한 덩이라 눈이 하나뿐이에요.",
      "B8 말고 흑이 둘 수 있는 눈 자리 A9·A8 가운데 어디에 두어도 흑이 잡혀요.",
    ]);
  });
});
