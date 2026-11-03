// @vitest-environment node
import {
  applyMove,
  moveToSan,
  parseFen,
  START_FEN,
  sanToMove,
} from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import {
  advance,
  allPaths,
  candidates,
  learnerToMove,
  lineDone,
  opponentPick,
  startCursor,
} from "@/study/line";

import { CHESS_OPENINGS } from "./openings";

describe("수순 따라 두기(공통 순수 함수)", () => {
  const italian = CHESS_OPENINGS.find((l) => l.id === "line-italian");
  if (!italian) throw new Error("이탈리안 없음");

  it("본줄기를 따라가면 끝나고, 배우는 편(백)은 짝수 번째 수를 둔다", () => {
    let cursor = startCursor(italian);
    const mine: boolean[] = [];
    while (!lineDone(cursor)) {
      mine.push(learnerToMove(italian, cursor));
      const node = candidates(cursor)[0];
      if (!node) throw new Error("후보 없음");
      cursor = advance(cursor, node) ?? cursor;
    }
    expect(cursor.ply).toBe(italian.moves.length);
    expect(mine.slice(0, 4)).toEqual([true, false, true, false]);
  });

  it("갈래 첫 수를 두면 그 갈래로 옮겨 가고, 후보가 아닌 마디는 두지 못한다", () => {
    let cursor = startCursor(italian);
    for (let i = 0; i < 5; i++)
      cursor = advance(cursor, italian.moves[i] as never) ?? cursor;
    const [main, branch] = candidates(cursor);
    expect(main?.move).toBe("Bc5");
    expect(branch?.move).toBe("Nf6");
    const moved = advance(cursor, branch as never);
    expect(moved?.ply).toBe(6);
    expect(candidates(moved as never)[0]?.move).toBe("d3");
    expect(advance(cursor, italian.moves[0] as never)).toBeNull();
  });

  it("상대 차례에는 roll로 본줄기와 갈래 가운데 하나를 고른다", () => {
    let cursor = startCursor(italian);
    for (let i = 0; i < 5; i++)
      cursor = advance(cursor, italian.moves[i] as never) ?? cursor;
    expect(opponentPick(cursor, 0)?.move).toBe("Bc5");
    expect(opponentPick(cursor, 0.99)?.move).toBe("Nf6");
  });
});

describe("체스 오프닝 수순", () => {
  it("id가 겹치지 않고 모두 line-으로 시작하며 출처가 있다", () => {
    const ids = CHESS_OPENINGS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const line of CHESS_OPENINGS) {
      expect(line.id.startsWith("line-")).toBe(true);
      expect(line.source).toMatch(/^https:\/\//);
    }
  });

  it.each(CHESS_OPENINGS.map((l) => [l.name, l] as const))(
    "%s: 본줄기와 모든 갈래가 처음 판에서 규칙대로 두어지고, 기보 글자가 엔진과 같다",
    (_name, line) => {
      for (const path of allPaths(line)) {
        let pos = parseFen(START_FEN);
        for (const node of path) {
          const move = sanToMove(pos, node.move);
          if (!move)
            throw new Error(`${line.name}: 둘 수 없는 수 ${node.move}`);
          // 체크 표시(+)까지 엔진이 만든 기보와 같아야 화면에 보이는 글자가 맞다.
          expect(moveToSan(pos, move)).toBe(node.move);
          pos = applyMove(pos, move);
        }
      }
    },
  );

  it("배우는 편이 둔 수에는 모두 설명이 있다", () => {
    for (const line of CHESS_OPENINGS)
      for (const path of allPaths(line))
        path.forEach((node, ply) => {
          // 처음 두 수(e4·d4와 그 맞수)는 앞 단원에서 익혔으니 설명을 건너뛰어도 된다.
          if (ply % 2 !== line.learner || ply < 2) return;
          expect(
            node.note,
            `${line.name} ${ply + 1}번째 수 ${node.move}`,
          ).toBeTruthy();
        });
  });
});
