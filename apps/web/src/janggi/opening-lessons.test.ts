// @vitest-environment node
import {
  applyMove,
  type Board,
  baseBoard,
  type Cell,
  legalMoves,
  placeSetup,
  pointAt,
  pointName,
  pseudoTargets,
  SETUPS,
  type Side,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { threatenedPieces } from "./danger";
import {
  GREEDY_ROOK_LINE,
  HASTY_HORSE_LINE,
  openingPieces,
  POSITIONS,
  positionPieces,
} from "./opening-lessons";

const parse = (text: string) => {
  const [from = "", to = ""] = text.split("-");
  return { from: pointAt(from), to: pointAt(to) };
};

function boardOf(pieces: Record<string, string>): Cell[] {
  const board = new Array<Cell>(90).fill("");
  for (const [name, piece] of Object.entries(pieces))
    board[pointAt(name)] = piece as Cell;
  return board;
}

const START = boardOf(openingPieces("NENE", "NENE"));

/** 수순을 처음부터 두며 둘 때마다 그 편이 둘 수 있는 수인지 본다. 마지막 판을 돌려준다 */
function playLine(
  board: Board,
  line: readonly string[],
  sideOf: (i: number) => Side,
): Board {
  let now = board;
  line.forEach((text, i) => {
    const m = parse(text);
    const legal = legalMoves(now, sideOf(i)).some(
      (l) => l.from === m.from && l.to === m.to,
    );
    expect(legal, `${i + 1}째 수 ${text}`).toBe(true);
    now = applyMove(now, m);
  });
  return now;
}

const alternate = (i: number): Side => (i % 2 === 0 ? "c" : "h");

/** 이 자리(내 졸이 선 곳)를 내 마가 지키나: 그 자리에 상대 기물이 왔다고 보고 잡을 수 있는 마 */
function horseGuards(board: Board, name: string): string[] {
  const at = pointAt(name);
  const probe = [...board];
  probe[at] = "hP";
  return probe.flatMap((cell, from) =>
    cell === "cN" && pseudoTargets(probe, from).includes(at)
      ? [pointName(from)]
      : [],
  );
}

describe("장면 수순", () => {
  it.each(Object.entries(POSITIONS))("%s: 모든 수를 둘 수 있다", (_n, p) => {
    const board = baseBoard();
    placeSetup(board, "c", p.cho);
    placeSetup(board, "h", p.han);
    const end = playLine(
      board,
      p.moves,
      "choOnly" in p && p.choOnly ? () => "c" : alternate,
    );
    expect(boardOf(positionPieces(p))).toEqual(end);
  });

  it("처음 판에서 포는 움직일 수 없다(퀴즈)", () => {
    for (const cho of SETUPS)
      for (const han of SETUPS) {
        const board = boardOf(openingPieces(cho.value, han.value));
        const cannons = legalMoves(board, "c").filter(
          (m) => board[m.from] === "cC",
        );
        expect(cannons, `${cho.label}/${han.label}`).toEqual([]);
      }
  });
});

describe("포진 고르기", () => {
  it("한의 마상마상은 내 쪽에서 왼쪽부터 읽으면 상마상마다", () => {
    const row = [2, 3, 7, 8].map((col) => START[pointAt(`1${col}`)]);
    expect(row).toEqual(["hE", "hN", "hE", "hN"]);
  });

  it("귀마 차림은 마 하나가 첫 수에 바로 궁성 귀로 간다", () => {
    const corner = (setup: "NENE" | "ENEN" | "ENNE", from: string) =>
      pseudoTargets(boardOf(openingPieces(setup, "NENE")), pointAt(from)).map(
        pointName,
      );
    expect(corner("NENE", "07")).toContain("86");
    expect(corner("ENEN", "03")).toContain("84");
    expect(corner("ENNE", "03")).toContain("84");
    expect(corner("ENNE", "07")).toContain("86");
  });

  it("마를 꺼낸 모양에서 가운데 졸(75)을 지키는 마: 귀마 진마 하나, 원앙마 둘, 양귀마 없음", () => {
    expect(horseGuards(boardOf(positionPieces(POSITIONS.gwima)), "75")).toEqual(
      ["83"],
    );
    expect(
      horseGuards(boardOf(positionPieces(POSITIONS.wonang)), "75"),
    ).toEqual(["83", "87"]);
    expect(
      horseGuards(boardOf(positionPieces(POSITIONS.yanggwima)), "75"),
    ).toEqual([]);
  });

  it("귀마의 두 마(83·86)는 서로 지켜 주지 못한다", () => {
    const board = boardOf(positionPieces(POSITIONS.gwima));
    expect(horseGuards(board, "83")).toEqual([]);
    expect(horseGuards(board, "86")).toEqual([]);
  });
});

describe("첫 수와 초반 원칙", () => {
  it("79→78을 두면 오른쪽 차가 세로줄을 따라 나가고, 옮긴 졸은 옆 졸과 서로 지킨다", () => {
    const after = playLine(START, ["79-78"], alternate);
    expect(pseudoTargets(START, pointAt("09")).length).toBeLessThan(5);
    expect(pseudoTargets(after, pointAt("09")).length).toBeGreaterThanOrEqual(
      5,
    );
    // 졸은 옆으로도 잡는다: 77에 상대가 오면 78이, 78에 오면 77이 잡을 수 있다.
    const probe77 = [...after];
    probe77[pointAt("77")] = "hP";
    expect(pseudoTargets(probe77, pointAt("78"))).toContain(pointAt("77"));
    const probe78 = [...after];
    probe78[pointAt("78")] = "hP";
    expect(pseudoTargets(probe78, pointAt("77"))).toContain(pointAt("78"));
  });

  it("진마를 올려야 포가 그 마를 넘어 면포(85)로 가고, 면포는 가운데 줄로 한 병(45)을 노린다", () => {
    expect(pseudoTargets(START, pointAt("82"))).toEqual([]);
    const before = boardOf(positionPieces(POSITIONS.beforeCenterCannon));
    expect(pseudoTargets(before, pointAt("82")).map(pointName)).toContain("85");
    const after = applyMove(before, parse("82-85"));
    expect(pseudoTargets(after, pointAt("85"))).toContain(pointAt("45"));
    expect(after[pointAt("45")]).toBe("hP");
  });

  it("차로 변 병 욕심: 41 병을 잡은 차는 공짜로 잡히고, 한 차가 잡는다(2점 얻고 13점 잃음)", () => {
    const beforeGrab = playLine(START, GREEDY_ROOK_LINE.slice(0, 2), alternate);
    expect(beforeGrab[pointAt("41")]).toBe("hP");
    expect(threatenedPieces(beforeGrab, "c")).toEqual([]);
    const grabbed = playLine(START, GREEDY_ROOK_LINE.slice(0, 3), alternate);
    expect(threatenedPieces(grabbed, "c")).toEqual([
      { at: pointAt("41"), attackers: [pointAt("11")] },
    ]);
    const end = playLine(START, GREEDY_ROOK_LINE, alternate);
    expect(end[pointAt("41")]).toBe("hR");
    expect(end.filter((c) => c === "cR")).toHaveLength(1);
  });

  it("마 서두르기: 65로 간 마는 한 병이 잡고, 졸로 되잡아도 마와 병을 바꾼다", () => {
    const sent = playLine(START, HASTY_HORSE_LINE.slice(0, 3), alternate);
    expect(threatenedPieces(sent, "c")).toEqual([
      { at: pointAt("65"), attackers: [pointAt("55")] },
    ]);
    const end = playLine(START, HASTY_HORSE_LINE, alternate);
    expect(end[pointAt("65")]).toBe("hP");
    // 졸(75)이 되잡을 수 있다.
    const retake = legalMoves(end, "c").some(
      (m) => m.from === pointAt("75") && m.to === pointAt("65"),
    );
    expect(retake).toBe(true);
  });
});
