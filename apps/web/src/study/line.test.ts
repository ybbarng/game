// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  advance,
  allPaths,
  candidates,
  keepWays,
  type LineNode,
  learnerToMove,
  lineDone,
  matchMove,
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

describe("대칭 변환으로 수 맞추기(matchMove·keepWays)", () => {
  // 9줄 바둑 좌표(I 없이 A~J). 왼쪽·오른쪽 뒤집기만 쓰는 간단한 두 방향. 쉬기는 그대로
  const COLS = "ABCDEFGHJ";
  const mirror = (p: string) =>
    p === "pass" ? p : `${COLS[8 - COLS.indexOf(p[0] as string)]}${p.slice(1)}`;
  const transforms = [(p: string) => p, mirror];
  const corner: StudyLine = {
    id: "line-corner",
    name: "귀 굳힘",
    summary: "",
    learner: 0,
    source: "시험용",
    moves: [node("C3"), node("G7"), node("D3")],
  };
  const parse = (p: string) => p;
  const same = (a: string, b: string) => a === b;

  it("방향이 정해지지 않았으면 뒤집은 자리도 맞고, 맞은 방향만 남긴다", () => {
    const cursor = startCursor(corner);
    expect(
      matchMove(cursor, "C3", parse, same, transforms, null)?.orients,
    ).toEqual([0]);
    const flipped = matchMove(cursor, "G3", parse, same, transforms, null);
    expect(flipped?.orients).toEqual([1]);
    expect(flipped?.node.move).toBe("C3");
  });

  it("대칭인 자리(가운데 줄)는 두 방향이 함께 맞고, 뒤의 수가 좁힌다", () => {
    const center: StudyLine = {
      ...corner,
      moves: [node("E5"), node("C3"), node("D4")],
    };
    const first = matchMove(
      startCursor(center),
      "E5",
      parse,
      same,
      transforms,
      null,
    );
    expect(first?.orients).toEqual([0, 1]);
    // 상대가 첫 방향(그대로)으로 C3을 두면 C3이 되는 방향만 남는다
    expect(keepWays(node("C3"), "C3", parse, same, transforms, [0, 1])).toEqual(
      [0],
    );
  });

  it("방향이 정해지면 그 방향만 본다", () => {
    const cursor = advance(
      advance(startCursor(corner), corner.moves[0] as LineNode) as never,
      corner.moves[1] as LineNode,
    );
    if (!cursor) throw new Error("자리 없음");
    expect(
      matchMove(cursor, "F3", parse, same, transforms, [1])?.node.move,
    ).toBe("D3");
    expect(matchMove(cursor, "D3", parse, same, transforms, [1])).toBeNull();
  });
});
