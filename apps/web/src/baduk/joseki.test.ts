import {
  type Cell,
  emptyBoard,
  groupOf,
  pointAt,
  pointName,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";

import { allPaths } from "@/study/line";

import { BADUK_JOSEKI, parseJosekiStart } from "./joseki";
import { JOSEKI_POINTS, JOSEKI_WALL } from "./study-lessons";

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

describe("정석 시작 판 글자", () => {
  it("판 크기·놓인 돌·먼저 둘 편을 읽는다", () => {
    expect(parseJosekiStart("19 B:D16,K16 W:F17 turn:W")).toEqual({
      size: 19,
      black: ["D16", "K16"],
      white: ["F17"],
      toPlay: 2,
    });
    expect(parseJosekiStart("19 B:C16 turn:B")?.white).toEqual([]);
  });

  it("I열, 판 밖, 흑백이 겹친 자리, 다른 판 크기는 받지 않는다", () => {
    expect(parseJosekiStart("19 B:I16 turn:W")).toBeNull();
    expect(parseJosekiStart("19 B:D20 turn:W")).toBeNull();
    expect(parseJosekiStart("19 B:D0 turn:W")).toBeNull();
    expect(parseJosekiStart("19 B:D16 W:D16 turn:W")).toBeNull();
    expect(parseJosekiStart("9 B:D4 turn:W")).toBeNull();
  });
});

// 수 설명과 정석 단원 그림이 말하는 판 관계(활로 수, 끊는 자리, 날일자 거리)를 엔진으로 확인한다.
const SIZE = 19;
const at = (name: string) => pointAt(name, SIZE);
const lineById = (id: string) => {
  const line = BADUK_JOSEKI.find((l) => l.id === id);
  if (!line) throw new Error(`정석이 없다: ${id}`);
  return line;
};

/** 수순의 시작 판에서 moves를 차례로 둔 판. moves는 그 수순의 본줄기나 갈래 앞부분이어야 한다 */
function boardAfter(id: string, moves: readonly string[]): Cell[] {
  const line = lineById(id);
  const isPrefix = allPaths(line).some((p) =>
    moves.every((m, i) => p[i]?.move === m),
  );
  if (!isPrefix) throw new Error(`${id}의 수순이 아니다: ${moves.join(" ")}`);
  const start = parseJosekiStart(line.start ?? "");
  if (!start) throw new Error("시작 판을 읽지 못했다");
  let board: Cell[] = emptyBoard(SIZE);
  for (const b of start.black) board[at(b)] = 1;
  for (const w of start.white) board[at(w)] = 2;
  let stone: 1 | 2 = start.toPlay;
  for (const m of moves) {
    const placed = tryPlace(board, at(m), stone);
    if (!placed.ok) throw new Error(`${m} 둘 수 없다`);
    board = placed.board;
    stone = stone === 1 ? 2 : 1;
  }
  return board;
}

/** 판의 한 자리가 속한 무리의 활로 이름(가나다순) */
const libertiesOf = (board: Cell[], name: string) =>
  groupOf(board, at(name))
    .liberties.map((p) => pointName(p, SIZE))
    .sort();

/** 빈 자리에 한 수 더 두었을 때 그 돌 무리의 활로 */
function libertiesIfPlaced(board: Cell[], name: string, stone: 1 | 2) {
  const placed = tryPlace(board, at(name), stone);
  if (!placed.ok) throw new Error(`${name} 둘 수 없다`);
  return libertiesOf(placed.board, name);
}

const stonesOf = (board: Cell[], stone: 1 | 2) =>
  board.flatMap((c, p) => (c === stone ? [pointName(p, SIZE)] : [])).sort();

describe("정석 수 설명의 판 관계", () => {
  it("삼삼 침입 예전 마무리는 기본 정석이 끝난 판에서 시작하고, 정석 단원의 벽 그림도 그 판이다", () => {
    const main = lineById("line-33-invasion-black").moves.map((n) => n.move);
    const end = boardAfter("line-33-invasion-black", main);
    const oldEnd = boardAfter("line-33-invasion-old-end", []);
    expect(stonesOf(oldEnd, 1)).toEqual(stonesOf(end, 1));
    expect(stonesOf(oldEnd, 2)).toEqual(stonesOf(end, 2));
    expect(stonesOf(end, 1)).toEqual([...JOSEKI_WALL.black].sort());
    expect(stonesOf(end, 2)).toEqual([...JOSEKI_WALL.white].sort());
  });

  it("예전 마무리: 흑이 C18에 두면 백 D18이 단수, F17 뒤 백이 E17에 끊으면 활로가 E16 하나", () => {
    const blocked = boardAfter("line-33-invasion-old-end", ["D18", "E18"]);
    expect(libertiesIfPlaced(blocked, "C18", 1)).toEqual(["B18", "C19"]);
    const tried = tryPlace(blocked, at("C18"), 1);
    if (!tried.ok) throw new Error("C18 둘 수 없다");
    expect(libertiesOf(tried.board, "D18")).toEqual(["D19"]);
    const done = boardAfter("line-33-invasion-old-end", [
      "D18",
      "E18",
      "C18",
      "F17",
    ]);
    expect(libertiesIfPlaced(done, "E17", 2)).toEqual(["E16"]);
  });

  it("양 젖힘: 끊으면 C15가 단수, B13이 B14를 단수, B16 뒤 B15 단수와 귀 백 두 점 활로 둘, B17로 두 점 단수", () => {
    const id = "line-33-invasion-double-hane";
    expect(libertiesOf(boardAfter(id, ["B14", "C14"]), "C15")).toEqual(["D15"]);
    expect(
      libertiesOf(boardAfter(id, ["B14", "C14", "D15", "B13"]), "B14"),
    ).toEqual(["A14"]);
    const b16 = boardAfter(id, ["B14", "C14", "D15", "B13", "B16"]);
    expect(libertiesOf(b16, "B15")).toEqual(["A15"]);
    expect(libertiesOf(b16, "C16")).toEqual(["B17", "C18"]);
    const taken = boardAfter(id, ["B14", "C14", "D15", "B13", "B16", "A14"]);
    expect(taken[at("B14")]).toBe(0);
    expect(libertiesOf(taken, "B15")).toEqual(["A15", "B14"]);
    const end = boardAfter(id, [
      "B14",
      "C14",
      "D15",
      "B13",
      "B16",
      "A14",
      "B17",
    ]);
    expect(libertiesOf(end, "C16")).toEqual(["C18"]);
  });

  it("소목 한 칸 높은 걸침: 물러선 뒤 F16이 백의 끊는 자리, G16으로 지키면 흑 F16은 활로가 F15 하나", () => {
    const id = "line-34-high-attach";
    const drawn = boardAfter(id, ["E17", "F17", "D17"]);
    // F16은 대각선으로 놓인 백 E16·F17 둘 다에 맞닿은 빈 자리다
    expect(drawn[at("F16")]).toBe(0);
    expect(libertiesOf(drawn, "E16")).toContain("F16");
    expect(libertiesOf(drawn, "F17")).toContain("F16");
    expect(groupOf(drawn, at("E16")).stones).toHaveLength(1);
    const hanging = boardAfter(id, ["E17", "F17", "D17", "G16"]);
    expect(libertiesIfPlaced(hanging, "F16", 1)).toEqual(["F15"]);
  });
});

describe("정석 단원 그림의 자리", () => {
  const xy = (name: string) => {
    const p = at(name);
    return { x: p % SIZE, y: Math.floor(p / SIZE) };
  };
  /** 판 위 끝(19줄)을 첫째 줄로 셀 때 몇째 줄인지 */
  const fromTop = (name: string) => 20 - Number(name.slice(1));
  const dist = (a: string, b: string) => {
    const p = xy(a);
    const q = xy(b);
    return { dx: Math.abs(p.x - q.x), dy: Math.abs(p.y - q.y) };
  };
  const P = JOSEKI_POINTS;

  it("낮은 걸침은 화점에서 가로 두 칸·세로 한 칸(날일자)의 셋째 줄이다", () => {
    expect(dist(P.star, P.lowApproach)).toEqual({ dx: 2, dy: 1 });
    expect(fromTop(P.lowApproach)).toBe(3);
  });

  it("높은 걸침은 소목과 같은 넷째 줄에서 한 칸을 비운 자리다", () => {
    expect(fromTop(P.komoku)).toBe(4);
    expect(fromTop(P.highApproach)).toBe(4);
    expect(dist(P.komoku, P.highApproach)).toEqual({ dx: 2, dy: 0 });
  });

  it("붙임은 맞닿고, 젖힘은 붙인 돌과 맞닿으며 걸친 돌과 대각선, 마늘모는 소목과 대각선이다", () => {
    expect(dist(P.attach, P.highApproach)).toEqual({ dx: 0, dy: 1 });
    expect(dist(P.hane, P.attach)).toEqual({ dx: 1, dy: 0 });
    expect(dist(P.hane, P.highApproach)).toEqual({ dx: 1, dy: 1 });
    expect(dist(P.diagonal, P.komoku)).toEqual({ dx: 1, dy: 1 });
  });

  it("단원 그림의 수는 소목 한 칸 높은 걸침 수순 그대로다", () => {
    const line = lineById("line-34-high-attach");
    const moves = line.moves.map((n) => n.move);
    expect(moves.slice(0, 4)).toEqual([P.attach, P.hane, P.drawBack, P.cut]);
    expect(line.start).toBe(`19 B:${P.komoku} W:${P.highApproach} turn:B`);
  });
});
