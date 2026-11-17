// 바둑 문제 해설(study-explain.ts): 묶음 첫 문제는 개념을 풀어 쓰고, 뒤 문제는 같은 문장을 되풀이하지 않고 그 판의 사실을 짚는다.
// 처음 보는 독자 검토의 「해설이 문제마다 거의 같은 세 문장」 지적(2026-11-17)을 다시 받지 않게 본다.
import { type BadukState, solveEndgame, step } from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  endgameArea,
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
    // 다음 정답: 패로 버티기는 되따낼 자리, 끝내기는 판정이 받아 주는 가장 좋은 수 가운데 첫 것
    // (빈 점마다 판정하면 세 곳 끝내기는 빈 점마다 끝까지 읽어 느리다), 그 밖은 판정이 받아 주는 첫 수
    const next =
      p.kind === "kofight"
        ? koPointOf(p)
        : p.kind === "endgame"
          ? (solveEndgame(state.board, endgameArea(p), 1).best.find(
              (m) => m !== null,
            ) ?? -1)
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

  it("축이 막히면 장문: 축머리마다 깨는 쪽, 장문 자리가 백 돌·뻗을 두 자리와 어떻게 닿는지, 백이 뻗으면 흑이 막는 자리", () => {
    expect(linesOf("blocked-net-2")).toEqual([
      "F4에서 치면 D4 축머리에, E5에서 치면 F2 축머리에 백이 닿아 축이 깨져요.",
      "E4는 백 돌과는 대각선으로 한 칸 떨어져 있고, 백이 뻗을 두 자리 E5·F4에는 모두 붙어 있어요.",
      "백이 E5로 뻗으면 D5, F4로 뻗으면 G4에 두어 세 수 안에 따내요.",
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
      "A(E8)는 2점짜리로 B와 크기가 같지만, 선수인 B부터 두면 백이 F2에 받은 뒤 다시 흑 차례라 A까지 흑이 둬요.",
    ]);
  });

  it("역끝내기: 백이 두면 흑이 받는 자리, 흑이 먼저 막은 뒤 백·흑이 두는 곳(곳의 자리는 그림 이름을 붙인다)", () => {
    expect(linesOf("endgame-reverse-2")).toEqual([
      "백이 A(E6)에 두면 흑 한 점이 단수가 되어 흑은 F7에 이어야 해요.",
      "흑이 A에 먼저 막자 백은 B(E3)에 두고 흑이 C(E1)까지 둬, 세 곳 가운데 두 곳을 흑이 가졌어요.",
    ]);
  });

  it("양선수: 흑이 두면·백이 두면 받는 자리, 흑이 먼저 둔 뒤 남은 곳(그림 이름 글자와 좌표 글자가 섞이지 않게 이름을 붙인다)", () => {
    expect(linesOf("endgame-double-3")).toEqual([
      "B(D4)에 흑이 두면 백 한 점이 단수가 되어 백이 E3에, 백이 두면 흑 한 점이 단수가 되어 흑이 C5에 이어야 해요.",
      "흑이 먼저 두어 백이 E3에 받은 뒤 A(A4)까지 둬, 세 곳 가운데 두 곳을 흑이 가졌어요.",
    ]);
  });

  it("역끝내기냐 큰 후수냐(큰 후수부터): 받는 자리, 역끝내기 + 작은 후수와 큰 후수의 셈, 작은 후수가 같은 크기일 때만 「두 배」, 점수 차 차이", () => {
    expect(linesOf("endgame-compare-2")).toEqual([
      "백이 C(E2)에 두면 흑 세 점이 단수가 되어 흑은 F1에 이어야 해요. 백의 선수 자리라, 흑이 먼저 막으면 역끝내기예요.",
      "C(E2) 2점과 B(E5) 2점을 더하면 4점, A(E9)는 6점짜리예요.",
      "B(E5)가 역끝내기와 같은 2점짜리라, C부터 막지 않으면 그 두 배인 4점을 내주는 셈이에요.",
      "그래서 A(E9)부터 뒀어요. B·C에 백이 먼저 두어도 C부터 막을 때보다 점수 차가 2점 더 커요.",
    ]);
  });

  it("역끝내기냐 큰 후수냐(역끝내기부터): 작은 후수가 역끝내기보다 커서 「두 배」라고 하지 않는다", () => {
    expect(linesOf("endgame-compare-3")).toEqual([
      "백이 B(E6)에 두면 흑 세 점이 단수가 되어 흑은 F5에 이어야 해요. 백의 선수 자리라, 흑이 먼저 막으면 역끝내기예요.",
      "B(E6) 2점과 C(E2) 4점을 더하면 6점, A(E9)는 4점짜리예요.",
      "그래서 B(E6)부터 막아 B·C에 흑이 먼저 뒀고, A부터 둘 때보다 점수 차가 2점 더 커요.",
    ]);
  });

  it("두 눈 만들기: 급소에 두면 어느 돌을 따내며 눈 자리가 어디로 나뉘는지, 안에 남은 백 돌, 다른 자리에 두면 잡힌다", () => {
    expect(linesOf("live-4")).toEqual([
      "흑이 B8에 두면 B7 백 돌을 따내며 눈 자리가 A9·A8 두 칸과 B7 한 칸으로 나뉘어요.",
      "눈 자리 안의 B9 백 돌은 활로가 A9 하나뿐이라, 흑이 A9에 두면 따내요.",
      "백이 먼저 B8에 두면 남은 눈 자리가 A9·A8 두 칸뿐이라 두 눈으로 나눌 수 없어요.",
      "A9나 A8에 두면 흑이 잡혀요.",
    ]);
  });
});
