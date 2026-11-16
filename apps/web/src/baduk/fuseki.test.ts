import {
  type Cell,
  emptyBoard,
  pointAt,
  pointName,
  starPoints,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";

import { allPaths } from "@/study/line";

import { BADUK_FUSEKI } from "./fuseki";
import { BADUK_JOSEKI, parseJosekiStart } from "./joseki";

const SIZE = 19;
/** 판 끝에서 몇째 줄인지(가까운 끝 기준, 1부터) */
const lineOf = (name: string) => {
  const at = pointAt(name, SIZE);
  const x = at % SIZE;
  const y = Math.floor(at / SIZE);
  return Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y) + 1;
};
/** 네 귀 가운데 어느 귀 쪽인지(가운데 줄이면 null) */
const cornerOf = (name: string) => {
  const at = pointAt(name, SIZE);
  const x = at % SIZE;
  const y = Math.floor(at / SIZE);
  if (x === 9 || y === 9) return null;
  return `${x < 9 ? "왼" : "오른"}${y < 9 ? "위" : "아래"}`;
};

describe("바둑 포석 수순", () => {
  it("id가 겹치지 않고(정석과도), 모두 빈 19줄 판에서 흑부터 시작한다", () => {
    const ids = [...BADUK_FUSEKI, ...BADUK_JOSEKI].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const line of BADUK_FUSEKI) {
      expect(line.id.startsWith("line-fuseki-")).toBe(true);
      expect(parseJosekiStart(line.start ?? "")).toEqual({
        size: 19,
        black: [],
        white: [],
        toPlay: 1,
      });
    }
  });

  it.each(BADUK_FUSEKI.map((l) => [l.name, l] as const))(
    "%s: 번갈아 규칙대로 두어지고, 배우는 쪽 수에 마침표로 끝나는 설명이 있다",
    (_name, line) => {
      for (const path of allPaths(line)) {
        let board: Cell[] = emptyBoard(SIZE);
        let stone: 1 | 2 = 1;
        path.forEach((node, ply) => {
          const at = pointAt(node.move, SIZE);
          expect(pointName(at, SIZE)).toBe(node.move);
          const placed = tryPlace(board, at, stone);
          if (!placed.ok) throw new Error(`${ply + 1}수 ${node.move}`);
          board = placed.board;
          stone = stone === 1 ? 2 : 1;
          if (ply % 2 === line.learner) expect(node.note).toMatch(/\.$/);
        });
      }
    },
  );

  it.each(BADUK_FUSEKI.map((l) => [l.name, l] as const))(
    "%s: 귀 → 변 → 가운데 원리대로다. 빈 귀가 남아 있는 동안은 두 편 모두 빈 귀에 두고, 귀의 첫 수는 셋째·넷째 줄이다",
    (_name, line) => {
      const taken = new Set<string>();
      for (const node of line.moves) {
        const corner = cornerOf(node.move);
        const emptyLeft = 4 - taken.size;
        if (emptyLeft > 0) {
          expect(corner, node.move).not.toBeNull();
          expect(taken.has(corner as string), node.move).toBe(false);
          expect([3, 4]).toContain(lineOf(node.move));
          taken.add(corner as string);
        }
      }
    },
  );

  it("이름과 수가 맞다: 이연성·삼연성은 같은 쪽 화점, 소목은 셋째·넷째 줄", () => {
    const stars = new Set(starPoints(SIZE).map((p) => pointName(p, SIZE)));
    const black = (id: string) =>
      (BADUK_FUSEKI.find((l) => l.id === id)?.moves ?? [])
        .filter((_, i) => i % 2 === 0)
        .map((n) => n.move);
    expect(black("line-fuseki-nirensei")).toEqual(["Q16", "Q4"]);
    expect(black("line-fuseki-sanrensei")).toEqual(["Q16", "Q4", "Q10"]);
    for (const p of black("line-fuseki-sanrensei"))
      expect(stars.has(p)).toBe(true);
    const komoku = black("line-fuseki-komoku-shimari")[0] as string;
    expect(stars.has(komoku)).toBe(false);
    expect(lineOf(komoku)).toBe(3);
  });
});
