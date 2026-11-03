// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  advance,
  allPaths,
  candidates,
  type LineNode,
  learnerToMove,
  lineDone,
  opponentPick,
  type StudyLine,
  startCursor,
} from "./line";

/** 체스 이탈리안 게임 앞부분(본줄기 3...Bc5, 갈래 3...Nf6 4.d3). 실제 데이터와 같은 모양 */
const node = (move: string, branches?: LineNode[][]): LineNode =>
  branches ? { move, branches } : { move };
const ITALIAN: StudyLine = {
  id: "line-italian",
  name: "이탈리안 게임",
  summary: "",
  learner: 0,
  source: "https://en.wikipedia.org/wiki/Italian_Game",
  moves: [
    node("e4"),
    node("e5"),
    node("Nf3"),
    node("Nc6"),
    node("Bc4"),
    node("Bc5", [[node("Nf6"), node("d3"), node("Bc5")]]),
    node("c3"),
  ],
};

/** 본줄기 앞 n마디를 둔 자리 */
function after(n: number) {
  let cursor = startCursor(ITALIAN);
  for (let i = 0; i < n; i++)
    cursor = advance(cursor, ITALIAN.moves[i] as LineNode) ?? cursor;
  return cursor;
}

describe("수순 따라 두기(공통 순수 함수)", () => {
  it("본줄기를 따라가면 끝나고, 배우는 편(첫 수를 두는 편)은 짝수 번째 수를 둔다", () => {
    let cursor = startCursor(ITALIAN);
    const mine: boolean[] = [];
    while (!lineDone(cursor)) {
      mine.push(learnerToMove(ITALIAN, cursor));
      const first = candidates(cursor)[0];
      if (!first) throw new Error("후보 없음");
      cursor = advance(cursor, first) ?? cursor;
    }
    expect(cursor.ply).toBe(ITALIAN.moves.length);
    expect(mine.slice(0, 4)).toEqual([true, false, true, false]);
  });

  it("갈래 첫 수를 두면 그 갈래로 옮겨 가고, 후보가 아닌 마디는 두지 못한다", () => {
    const cursor = after(5);
    const [main, branch] = candidates(cursor);
    expect(main?.move).toBe("Bc5");
    expect(branch?.move).toBe("Nf6");
    const moved = advance(cursor, branch as LineNode);
    expect(moved?.ply).toBe(6);
    expect(moved && candidates(moved)[0]?.move).toBe("d3");
    expect(advance(cursor, ITALIAN.moves[0] as LineNode)).toBeNull();
  });

  it("상대 차례에는 roll로 본줄기와 갈래 가운데 하나를 고른다", () => {
    const cursor = after(5);
    expect(opponentPick(cursor, 0)?.move).toBe("Bc5");
    expect(opponentPick(cursor, 0.99)?.move).toBe("Nf6");
  });

  it("allPaths는 본줄기와 갈래를 처음부터 끝까지 펼친다", () => {
    const paths = allPaths(ITALIAN).map((p) => p.map((n) => n.move).join(" "));
    expect(paths).toEqual([
      "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5",
      "e4 e5 Nf3 Nc6 Bc4 Bc5 c3",
    ]);
  });
});
