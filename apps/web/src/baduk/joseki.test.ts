import {
  type Cell,
  emptyBoard,
  pointAt,
  pointName,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";

import { allPaths } from "@/study/line";

import { BADUK_JOSEKI, parseJosekiStart } from "./joseki";

describe("바둑 정석 수순", () => {
  it("id가 겹치지 않고 모두 line-으로 시작하며 출처와 시작 판이 있다", () => {
    const ids = BADUK_JOSEKI.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const line of BADUK_JOSEKI) {
      expect(line.id.startsWith("line-")).toBe(true);
      expect(line.source).toMatch(/^https:\/\/senseis\.xmp\.net\//);
      expect(parseJosekiStart(line.start ?? "")).not.toBeNull();
    }
  });

  it.each(BADUK_JOSEKI.map((l) => [l.name, l] as const))(
    "%s: 본줄기와 모든 갈래가 시작 판에서 번갈아 규칙대로 두어지고, 배우는 쪽 수에 설명이 있다",
    (_name, line) => {
      const start = parseJosekiStart(line.start ?? "");
      if (!start) throw new Error("시작 판을 읽지 못했다");
      for (const path of allPaths(line)) {
        let board: Cell[] = emptyBoard(start.size);
        for (const b of start.black) board[pointAt(b, start.size)] = 1;
        for (const w of start.white) board[pointAt(w, start.size)] = 2;
        let stone: 1 | 2 = start.toPlay;
        path.forEach((node, ply) => {
          const at = pointAt(node.move, start.size);
          expect(pointName(at, start.size)).toBe(node.move);
          const placed = tryPlace(board, at, stone);
          if (!placed.ok)
            throw new Error(
              `${line.name}: ${ply + 1}수 ${node.move} 둘 수 없다`,
            );
          board = placed.board;
          stone = stone === 1 ? 2 : 1;
          if (ply % 2 === line.learner) expect(node.note).toBeTruthy();
        });
      }
    },
  );
});
