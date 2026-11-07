// @vitest-environment node
import {
  applyMove,
  type Board,
  baseBoard,
  type Cell,
  inCheck,
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
  FIRST_MOVES_LESSON,
  LINES,
  openingPieces,
  POSITIONS,
  positionPieces,
  REPLAY_SETUPS,
} from "./opening-lessons";
import { OPENING_LINE, OPENING_LINE_MOVES } from "./opening-line";
import { replayBoards, tallyOf, tallyText } from "./replay";

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
const choOnly = (): Side => "c";

/** 넘겨 보기 수순을 그 차림의 처음 판에서 앞 `n`수까지 둔다 */
function lineBoard(line: keyof typeof LINES, n?: number): Board {
  const { cho, han } = REPLAY_SETUPS[line];
  const moves = LINES[line].slice(0, n);
  const by =
    line === "gwimaFast" || line === "wonangSlow" || line === "yangFast"
      ? choOnly
      : alternate;
  return playLine(boardOf(openingPieces(cho, han)), moves, by);
}

/** 이 자리(내 기물이 선 곳)를 지키는 `side` 기물: 그 자리에 상대 기물이 왔다고 보고 잡을 수 있는 기물 */
function guards(board: Board, name: string, side: Side = "c"): string[] {
  const at = pointAt(name);
  const probe = [...board];
  probe[at] = side === "c" ? "hP" : "cP";
  return probe.flatMap((cell, from) =>
    cell.startsWith(side) && pseudoTargets(probe, from).includes(at)
      ? [pointName(from)]
      : [],
  );
}

const horseGuards = (board: Board, name: string) =>
  guards(board, name).filter((n) => board[pointAt(n)] === "cN");

const reach = (board: Board, name: string) =>
  pseudoTargets(board, pointAt(name)).map(pointName);

describe("장면 수순", () => {
  it.each(Object.entries(POSITIONS))("%s: 모든 수를 둘 수 있다", (_n, p) => {
    const board = baseBoard();
    placeSetup(board, "c", p.cho);
    placeSetup(board, "h", p.han);
    const end = playLine(
      board,
      p.moves,
      "choOnly" in p && p.choOnly ? choOnly : alternate,
    );
    expect(boardOf(positionPieces(p))).toEqual(end);
  });

  it.each(Object.keys(LINES))("넘겨 보기 %s: 모든 수를 둘 수 있다", (line) => {
    lineBoard(line as keyof typeof LINES);
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

describe("자리 부르기", () => {
  it("앞 숫자는 위에서 센 가로줄, 뒤 숫자는 왼쪽에서 센 세로줄(맨 아래 줄은 0)", () => {
    expect(pointAt("79")).toBe(6 * 9 + 8);
    expect(START[pointAt("79")]).toBe("cP");
    expect(START[pointAt("01")]).toBe("cR");
    expect(START[pointAt("95")]).toBe("cK");
    expect(START[pointAt("19")]).toBe("hR");
  });
});

describe("포진 고르기", () => {
  it("한의 마상마상은 내 쪽에서 왼쪽부터 읽으면 상마상마다", () => {
    const row = [2, 3, 7, 8].map((col) => START[pointAt(`1${col}`)]);
    expect(row).toEqual(["hE", "hN", "hE", "hN"]);
  });

  it("말풀이: 귀(84·86)·면(85)은 궁성 윗줄의 빈자리", () => {
    for (const name of ["84", "85", "86"])
      expect(START[pointAt(name)]).toBe("");
  });

  it("귀마 차림은 마 하나가 첫 수에 바로 궁성 귀로 간다", () => {
    const corner = (setup: "NENE" | "ENEN" | "ENNE", from: string) =>
      reach(boardOf(openingPieces(setup, "NENE")), from);
    expect(corner("NENE", "07")).toContain("86");
    expect(corner("ENEN", "03")).toContain("84");
    expect(corner("ENNE", "03")).toContain("84");
    expect(corner("ENNE", "07")).toContain("86");
  });

  it("가운데 졸(75)을 지키는 마: 귀마 진마 하나, 원앙마 둘, 양귀마 없음", () => {
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

  it("귀마 장점: 초 세 수(진마·귀마·면포)로 갖춘다", () => {
    const end = lineBoard("gwimaFast");
    expect(end[pointAt("83")]).toBe("cN");
    expect(end[pointAt("86")]).toBe("cN");
    expect(end[pointAt("85")]).toBe("cC");
  });

  it("귀마 약점: 진마·면포 뒤 2번 세로줄이 비고, 그 줄로 간 차를 한 포가 병을 넘어 잡는다(13점)", () => {
    const empty = lineBoard("emptyFile", 6);
    for (const row of [9, 8, 7, 6, 5, 0])
      expect(empty[pointAt(`${row}2`)], `${row}2`).toBe("");
    const moved = lineBoard("emptyFile", 7);
    expect(threatenedPieces(moved, "c")).toEqual([
      { at: pointAt("02"), attackers: [pointAt("32")] },
    ]);
    const boards = replayBoards(
      boardOf(openingPieces("NENE", "NENE")),
      LINES.emptyFile,
    );
    expect(tallyText(tallyOf(boards, LINES.emptyFile, 8))).toBe(
      "잡은 기물: 초 없음 · 한 차(13) → 초 13점 손해",
    );
  });

  it("원앙마 장점: 마 둘·상 둘이 75를 지켜, 한 포가 잡으면 상이 되잡는다(5점 이득)", () => {
    const before = lineBoard("wonangGuard", 5);
    expect(guards(before, "75").sort()).toEqual(["03", "07", "83", "87"]);
    // 한 면포는 병(45)을 넘어 75를 노린다.
    expect(reach(before, "35")).toContain("75");
    const boards = replayBoards(
      boardOf(openingPieces("NEEN", "NENE")),
      LINES.wonangGuard,
    );
    expect(tallyText(tallyOf(boards, LINES.wonangGuard, 7))).toBe(
      "잡은 기물: 초 포(7) · 한 졸(2) → 초 5점 이득",
    );
  });

  it("원앙마 약점: 초 다섯 수(두 마·면포·가운데 졸 비키기·가운데 상), 가운데 상은 두 마가 지킨다", () => {
    const end = lineBoard("wonangSlow");
    expect(LINES.wonangSlow).toHaveLength(5);
    expect(LINES.gwimaFast).toHaveLength(3);
    expect(end[pointAt("75")]).toBe("cE");
    expect(horseGuards(end, "75")).toEqual(["83", "87"]);
  });

  it("양귀마 장점: 초 두 수로 두 마가 궁성 양쪽 귀(84·86)에 선다", () => {
    const end = lineBoard("yangFast");
    expect(end[pointAt("84")]).toBe("cN");
    expect(end[pointAt("86")]).toBe("cN");
  });

  it("양귀마 약점: 75를 지키는 기물이 없어 한 면포가 공짜로 잡는다", () => {
    const before = lineBoard("yangCenter", 5);
    expect(guards(before, "75")).toEqual([]);
    expect(threatenedPieces(before, "c")).toEqual([
      { at: pointAt("75"), attackers: [pointAt("35")] },
    ]);
    const end = lineBoard("yangCenter");
    expect(end[pointAt("75")]).toBe("hC");
    expect(guards(end, "75")).toEqual([]);
  });

  it("같은 이름이면 대각선 쪽 두 상(08·12)을 하나씩 올려 서로 닿고, 다른 이름이면 같은 식으로 올려도 닿지 않는다", () => {
    expect(REPLAY_SETUPS.sameNameMeet).toEqual({ cho: "NENE", han: "NENE" });
    expect(REPLAY_SETUPS.otherNameApart).toEqual({ cho: "ENEN", han: "NENE" });
    const same = lineBoard("sameNameMeet", 0);
    expect(same[pointAt("08")]).toBe("cE");
    expect(same[pointAt("12")]).toBe("hE");
    const met = lineBoard("sameNameMeet");
    expect(reach(met, "76")).toContain("44");
    expect(reach(met, "44")).toContain("76");

    const other = lineBoard("otherNameApart", 0);
    for (const name of ["02", "07"]) expect(other[pointAt(name)]).toBe("cE");
    expect(other[pointAt("12")]).toBe("hE");
    const apart = lineBoard("otherNameApart");
    expect(reach(apart, "74")).not.toContain("44");
    expect(reach(apart, "44")).not.toContain("74");
  });

  it("맞상: 같은 이름 귀마 짝에서 마주 보던 상(08·12)을 하나씩 올리면 서로 잡을 수 있고, 잡고 되잡아 상끼리 바꾼다", () => {
    expect(REPLAY_SETUPS.matsang).toEqual({ cho: "NENE", han: "NENE" });
    const start = lineBoard("matsang", 0);
    expect(start[pointAt("08")]).toBe("cE");
    expect(start[pointAt("12")]).toBe("hE");
    const facing = lineBoard("matsang", 2);
    expect(reach(facing, "76")).toContain("44");
    expect(reach(facing, "44")).toContain("76");
    const end = lineBoard("matsang");
    expect(end[pointAt("44")]).toBe("hP");
    const boards = replayBoards(start, LINES.matsang);
    expect(tallyText(tallyOf(boards, LINES.matsang, 4))).toBe(
      "잡은 기물: 초 상(3) · 한 상(3) → 점수가 같아 손해 없음",
    );
  });
});

describe("첫 수와 초반 원칙", () => {
  it("첫 장면의 고리는 막는 졸(79)·상(08), 오른쪽 차는 두 칸뿐이다", () => {
    const step = FIRST_MOVES_LESSON.steps[0];
    if (step?.kind !== "explain" || !step.scene) throw new Error("첫 장면");
    const board = boardOf(step.scene.pieces);
    expect((step.scene.rings ?? []).map((n) => board[pointAt(n)])).toEqual([
      "cP",
      "cE",
    ]);
    expect(reach(START, "09").sort()).toEqual(["89", "99"]);
  });

  it("진마가 나가면 왼쪽 차는 02로 옆걸음하지만, 귀마가 나가도 오른쪽 차 길은 그대로다", () => {
    const left = playLine(START, ["02-83"], choOnly);
    expect(reach(left, "01")).toContain("02");
    const right = playLine(START, ["07-86"], choOnly);
    expect(reach(right, "09").sort()).toEqual(["89", "99"]);
  });

  it("79→78을 두면 오른쪽 차가 49 병까지 닿고, 옮긴 졸은 옆 졸과 서로 지킨다", () => {
    const after = playLine(START, ["79-78"], alternate);
    expect(reach(after, "09")).toEqual(
      expect.arrayContaining(["89", "79", "69", "59", "49"]),
    );
    expect(guards(after, "77")).toContain("78");
    expect(guards(after, "78")).toContain("77");
  });

  it("진마를 올려야 포가 그 마를 넘어 면포(85)로 가고, 면포는 가운데 줄로 한 병(45)을 노린다", () => {
    expect(pseudoTargets(START, pointAt("82"))).toEqual([]);
    const before = boardOf(positionPieces(POSITIONS.beforeCenterCannon));
    expect(reach(before, "82")).toContain("85");
    const after = applyMove(before, parse("82-85"));
    expect(reach(after, "85")).toContain("45");
  });

  it("귀마 쪽 포(88)도 귀마를 넘어 85에 가고, 78 졸을 넘어 8번 세로줄로도 나간다", () => {
    const board = boardOf(positionPieces(POSITIONS.twoCannons));
    expect(reach(board, "88")).toEqual(
      expect.arrayContaining(["85", "68", "48"]),
    );
    expect(reach(board, "82")).toContain("85");
  });

  it("천궁: 궁이 85에 서면 한 포가 졸 하나만 넘어 장군, 궁이 95이고 면포가 있으면 장군이 아니다", () => {
    const before = lineBoard("cheongung", 5);
    expect(inCheck(before, "c")).toBe(false);
    const end = lineBoard("cheongung");
    expect(inCheck(end, "c")).toBe(true);
    expect(reach(end, "35")).toContain("85");
    const contrast = lineBoard("cheongungContrast");
    expect(contrast[pointAt("95")]).toBe("cK");
    expect(inCheck(contrast, "c")).toBe(false);
    // 사(04·06)는 위로 올라간 궁 곁(84·86)에 닿지 못한다.
    for (const a of ["04", "06"])
      expect(reach(end, a)).not.toEqual(expect.arrayContaining(["84"]));
    expect([...reach(end, "04"), ...reach(end, "06")]).not.toContain("86");
  });

  it("변병 욕심: 49를 잡은 차는 공짜로 잡히고 한 차(19)가 잡는다(11점 손해)", () => {
    const beforeGrab = lineBoard("greedyRook", 2);
    expect(threatenedPieces(beforeGrab, "c")).toEqual([]);
    const grabbed = lineBoard("greedyRook", 3);
    expect(threatenedPieces(grabbed, "c")).toEqual([
      { at: pointAt("49"), attackers: [pointAt("19")] },
    ]);
    const boards = replayBoards(START, LINES.greedyRook);
    expect(tallyText(tallyOf(boards, LINES.greedyRook, 4))).toBe(
      "잡은 기물: 초 병(2) · 한 차(13) → 초 11점 손해",
    );
  });

  it("미끼를 보고 마를 깊이: 62의 마는 43 병을 노리지만 한 포(32)가 42 병을 넘어 공짜로 잡는다", () => {
    const sent = lineBoard("hastyHorse", 5);
    expect(reach(sent, "62")).toContain("43");
    expect(threatenedPieces(sent, "c")).toEqual([
      { at: pointAt("62"), attackers: [pointAt("32")] },
    ]);
    const end = lineBoard("hastyHorse");
    expect(guards(end, "62")).toEqual([]);
    const boards = replayBoards(START, LINES.hastyHorse);
    expect(tallyText(tallyOf(boards, LINES.hastyHorse, 6))).toBe(
      "잡은 기물: 초 없음 · 한 마(5) → 초 5점 손해",
    );
  });
});

describe("초반 21수", () => {
  const boards = replayBoards(START, OPENING_LINE_MOVES);
  const at = (ply: number) => boards[ply] as Board;

  it("21수 모두 둘 수 있고 수마다 까닭이 있다", () => {
    expect(OPENING_LINE.length).toBeGreaterThanOrEqual(20);
    playLine(START, OPENING_LINE_MOVES, alternate);
    for (const m of OPENING_LINE) expect(m.note.endsWith(".")).toBe(true);
  });

  it("잡지 않는 수 뒤에는 둔 편에 공짜로 잡힐 기물이 없다", () => {
    OPENING_LINE_MOVES.forEach((text, i) => {
      const before = at(i);
      if (before[parse(text).to]) return; // 맞바꿈은 아래에서 본다
      expect(
        threatenedPieces(at(i + 1), alternate(i)),
        `${i + 1}수 ${text}`,
      ).toEqual([]);
    });
  });

  it("까닭의 말: 노림과 지킴", () => {
    // 10수: 한 차가 71을 노리고 내 차(01)가 지킨다.
    expect(reach(at(10), "31")).toContain("71");
    expect(guards(at(10), "71")).toContain("01");
    // 11수: 91 차가 71을 지키고, 한 포가 92로 오면 잡는다.
    expect(guards(at(11), "71")).toContain("91");
    expect(reach(at(11), "32")).toContain("92");
    expect(reach(at(11), "91")).toContain("92");
    // 02까지 들어오면 진마(83)가 잡는다.
    expect(reach(at(11), "32")).toContain("02");
    expect(guards(at(11), "02")).toContain("83");
    // 13수: 차끼리 마주 보고, 한 포는 72 너머로 못 들어온다.
    expect(reach(at(13), "91")).toContain("31");
    expect(reach(at(13), "32")).not.toEqual(expect.arrayContaining(["82"]));
    expect(guards(at(13), "72")).toContain("73");
    // 16수: 한 차가 76 상을 노리지만 졸 둘이 지킨다.
    expect(reach(at(16), "26")).toContain("76");
    expect(guards(at(16), "76")).toEqual(expect.arrayContaining(["75", "77"]));
    // 17수: 마가 돌아와 75를 지킨다.
    expect(horseGuards(at(17), "75")).toEqual(["83"]);
    // 18수: 두 상이 서로 노린다.
    expect(reach(at(18), "44")).toContain("76");
    expect(reach(at(18), "76")).toContain("44");
    // 20수: 한 차가 86까지 보지만 궁이 지킨다. 21수: 76 졸이 막는다.
    expect(reach(at(20), "26")).toContain("86");
    expect(guards(at(20), "86")).toContain("95");
    expect(reach(at(21), "26")).not.toContain("86");
    expect(guards(at(21), "76")).toContain("75");
  });

  it("주고받은 점수: 차와 상을 하나씩 바꿔 손해 없음", () => {
    expect(tallyText(tallyOf(boards, OPENING_LINE_MOVES, 21))).toBe(
      "잡은 기물: 초 차(13)·상(3) · 한 차(13)·상(3) → 점수가 같아 손해 없음",
    );
    expect(POSITIONS.rookEyesElephant.moves).toEqual(
      OPENING_LINE_MOVES.slice(0, 16),
    );
  });
});
