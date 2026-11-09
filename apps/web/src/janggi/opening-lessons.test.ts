// @vitest-environment node

import { negamax } from "@game/janggi-ai";
import {
  applyMove,
  type Board,
  baseBoard,
  type Cell,
  inCheck,
  legalMoves,
  other,
  placeSetup,
  pointAt,
  pointName,
  pseudoTargets,
  SETUPS,
  type Side,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { threatenedPieces } from "./danger";
import { firstMoves } from "./matchup-examples";
import { bestAgainst, isMatsang } from "./matchups";
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

  it("진마가 나가면 왼쪽 차는 02로 옆걸음하지만, 귀마가 나가도 오른쪽 찻길은 그대로다", () => {
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
  // 한 마상마상, 초 상마상마(맞상을 피한 짝)
  const LINE_START = boardOf(openingPieces("ENEN", "NENE"));
  const boards = replayBoards(LINE_START, OPENING_LINE_MOVES);
  const at = (ply: number) => boards[ply] as Board;

  it("21수 모두 둘 수 있고 수마다 까닭이 있다", () => {
    expect(OPENING_LINE).toHaveLength(21);
    playLine(LINE_START, OPENING_LINE_MOVES, alternate);
    for (const m of OPENING_LINE) expect(m.note.endsWith(".")).toBe(true);
  });

  it("맞상이 아닌 짝이고, 두 편 귀윗상은 서로 닿지 않는다", () => {
    expect(isMatsang("ENEN", "NENE")).toBe(false);
    expect(bestAgainst("NENE")).toContain("ENEN");
    expect(reach(at(18), "44")).not.toContain("74");
    expect(reach(at(18), "74")).not.toContain("44");
  });

  it("엔진 확인: 맞바꿈 말고는 수마다 고수의 두 수 앞 읽기로 가장 좋은 수와 0.3점 안쪽", () => {
    const value = (board: Board, side: Side, m: { from: number; to: number }) =>
      -negamax(applyMove(board, m), other(side), 1, -Infinity, Infinity, {
        bikjangScore: true,
      });
    OPENING_LINE_MOVES.forEach((text, i) => {
      const before = at(i);
      const side = alternate(i);
      const mine = parse(text);
      if (before[mine.to]) return; // 맞바꿈
      const best = Math.max(
        ...legalMoves(before, side).map((m) => value(before, side, m)),
      );
      expect(
        best - value(before, side, mine),
        `${i + 1}수 ${text}`,
      ).toBeLessThanOrEqual(30);
    });
  });

  it("21수: 세 수 앞까지 읽어도 59-56이 가장 좋고, 가운데 줄 장군(75-76·85-65)은 차를 살리는 더 좋은 수가 아니다", () => {
    // 20수 35-39로 한 면포가 빠져 가운데 줄이 열렸다. 장군을 불러도 한이 피하면 차는 그대로 노려진다.
    // 다른 한 수 뒤를 네 수 앞까지 읽은 결과는 docs/23 「초반 21수」에 적었다(시험으로 두기엔 무겁다).
    const before = at(20);
    const value3 = (text: string) =>
      -negamax(applyMove(before, parse(text)), "h", 2, -Infinity, Infinity, {
        bikjangScore: true,
      });
    const best = Math.max(
      ...legalMoves(before, "c").map((m) =>
        value3(`${pointName(m.from)}-${pointName(m.to)}`),
      ),
    );
    expect(value3("59-56")).toBe(best);
    for (const check of ["75-76", "85-65"]) {
      expect(inCheck(afterMove(20, check), "h"), check).toBe(true);
      expect(value3(check), check).toBeLessThan(best);
    }
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

  it("첫 수 원칙: 초는 차 옆에 상이 있는 쪽 졸을 쓸고, 한이 같은 쪽 병을 쓸면 차를 공짜로 잃는다", () => {
    expect(firstMoves("ENEN")).toEqual([OPENING_LINE_MOVES[0]]);
    expect(at(0)[pointAt("02")]).toBe("cE");
    expect(reach(at(0), "01")).not.toContain("61");
    expect(reach(at(1), "01")).toContain("61");
    expect(guards(at(1), "72")).toContain("73");
    // 한이 41 병을 비키면 두 차가 마주 보고, 한 차(11)를 지키는 기물이 없다.
    const mirror = applyMove(at(1), parse("41-42"));
    expect(reach(mirror, "01")).toContain("11");
    expect(guards(mirror, "11", "h")).toEqual([]);
    // 그래서 한은 반대쪽 병(49)을 비켜 9번 세로줄을 연다.
    expect(reach(at(2), "19")).toContain("59");
  });

  /** 그 자리 기물 편의 지키는 기물(자리 이름, 차례대로) */
  const guardsOf = (board: Board, name: string) => {
    const side = board[pointAt(name)]?.[0] as Side;
    return guards(board, name, side).sort();
  };
  const afterMove = (ply: number, text: string) =>
    applyMove(at(ply), parse(text));

  it("글이 「X는 A가 지켜요」라고 하면 X를 지키는 기물을 빠짐없이 말한다", () => {
    // 「79는 내 차(09)가 지켜」처럼 하나만 말하면 그 기물만 지키는 것으로 읽힌다(2026-11-08 사용자 지적:
    // 진마(87)도 79를 지켰다). 그래서 글에서 그 말을 찾아 엔진이 센 지키는 기물과 견준다.
    // 「X는」 뒤부터 「~가 지켜」까지. 사이에 다른 「Y는」이 끼면 그 말은 Y의 것이다.
    const SAYS_GUARDS =
      /(\d{2})(?: [가-힣]+)?[은는] ((?:(?!\d{2}(?: [가-힣]+)?[은는] |지키는 기물)[^.])*?)[이가] (?:함께 )?지켜/g;
    const SAYS_NONE = /(\d{2})[은는] 지키는 기물이 없/g;
    let checked = 0;
    OPENING_LINE.forEach(({ note }, i) => {
      const board = at(i + 1);
      for (const [, name = "", who = ""] of note.matchAll(SAYS_GUARDS)) {
        const named = (who.match(/\d{2}/g) ?? []).sort();
        expect(named, `${i + 1}수 「${name}는 ${who}」`).toEqual(
          guardsOf(board, name),
        );
        checked++;
      }
      for (const [, name = ""] of note.matchAll(SAYS_NONE)) {
        expect(guardsOf(board, name), `${i + 1}수 ${name}`).toEqual([]);
        checked++;
      }
    });
    // 10·11·12(둘)·16·17·18·19·20수가 이런 말을 한다(글을 고쳐 정규식이 놓치면 여기서 알린다).
    expect(checked).toBe(9);
  });

  it("까닭의 말: 노림과 지킴, 다른 수와 견준 말", () => {
    // 1수: 왼쪽 차는 졸과 상에 막혔다가 1번 세로줄로 나가고, 72·73 졸은 서로만 지킨다. 3수: 진마가 나가면 09가 08로 옆걸음한다.
    expect(reach(at(0), "01")).toEqual(["91", "81"]);
    expect(guardsOf(at(1), "72")).toEqual(["73"]);
    expect(guardsOf(at(1), "73")).toEqual(["72"]);
    expect(reach(at(2), "09")).not.toContain("08");
    expect(reach(at(3), "09")).toContain("08");
    // 3수: 진마가 가운데 졸을 지킨다. 9수: 상이 비운 02로 차가 옆걸음한다.
    expect(guards(at(3), "75")).toContain("87");
    expect(reach(at(9), "01")).toEqual(expect.arrayContaining(["02", "03"]));
    // 10수: 한 차가 79를 노린다.
    expect(reach(at(10), "59")).toContain("79");
    // 11수: 졸이 한 차를 노리고, 졸을 옆(78)으로 비켰다면 9번 세로줄이 열려 09가 공짜로 잡혔다.
    expect(reach(at(11), "69")).toContain("59");
    expect(threatenedPieces(at(11), "h")).toEqual([
      { at: pointAt("59"), attackers: [pointAt("69")] },
    ]);
    expect(threatenedPieces(afterMove(10, "79-78"), "c")).toEqual([
      { at: pointAt("09"), attackers: [pointAt("59")] },
    ]);
    // 12수: 51의 한 차가 1번 세로줄로 01을 노린다(맞혀 보기 정답). 13수: 01은 02·03으로도 비킬 수 있었다.
    expect(threatenedPieces(at(12), "c")).toEqual([
      { at: pointAt("01"), attackers: [pointAt("51")] },
    ]);
    for (const away of ["01-02", "01-03"])
      expect(threatenedPieces(afterMove(12, away), "c"), away).toEqual([]);
    expect(reach(at(13), "41")).toContain("51");
    // 15수: 옆으로 비키면 09가 19까지 닿고, 앞(59)으로 올리면 그대로 막힌다.
    expect(reach(at(14), "09")).not.toContain("19");
    expect(reach(at(15), "09")).toContain("19");
    expect(reach(afterMove(14, "69-59"), "09")).not.toContain("59");
    expect(reach(afterMove(14, "69-59"), "09")).not.toContain("19");
    // 16수: 그대로 두면 09가 19로 들어가 지키는 기물이 없는 17 상을 노린다. 49 상이 그 길을 막는다.
    expect(guardsOf(at(15), "17")).toEqual([]);
    expect(reach(afterMove(15, "09-19"), "19")).toContain("17");
    expect(reach(at(16), "09")).not.toContain("19");
    // 17수: 59의 차는 9번 세로줄에서 갈 수 있는 다른 자리보다 멀리 닿고, 51 병을 노린다.
    const reachFrom = (to: string) =>
      reach(afterMove(16, `09-${to}`), to).length;
    for (const to of ["08", "99", "89", "79", "69"])
      expect(reachFrom("59"), to).toBeGreaterThan(reachFrom(to));
    expect(reach(at(17), "59")).toContain("51");
    // 18수: 한 상이 72를 노린다. 19수: 79 상이 47을 노린다.
    expect(reach(at(18), "44")).toContain("72");
    expect(reach(at(19), "79")).toContain("47");
    // 20수: 39 포가 한 상(49)을 넘어 59 차를 노린다.
    expect(threatenedPieces(at(20), "c")).toEqual([
      { at: pointAt("59"), attackers: [pointAt("39")] },
    ]);
    expect(at(20)[pointAt("49")]).toBe("hE");
    // 21수: 차가 갈 곳 가운데 잡히지 않는 곳은 56·54뿐이고, 56은 79 상이 지킨다.
    const safe = reach(at(20), "59").filter(
      (to) => threatenedPieces(afterMove(20, `59-${to}`), "c").length === 0,
    );
    expect(safe.sort()).toEqual(["54", "56"]);
    expect(guardsOf(at(21), "56")).toEqual(["79"]);
    expect(guardsOf(afterMove(20, "59-54"), "54")).toEqual([]);
  });

  it("주고받은 점수: 차를 하나씩 바꿔 손해 없음", () => {
    expect(tallyText(tallyOf(boards, OPENING_LINE_MOVES, 14))).toBe(
      "잡은 기물: 초 차(13) · 한 차(13) → 점수가 같아 손해 없음",
    );
    expect(tallyText(tallyOf(boards, OPENING_LINE_MOVES, 21))).toBe(
      "잡은 기물: 초 차(13) · 한 차(13) → 점수가 같아 손해 없음",
    );
    expect(POSITIONS.elephantEyesPawn.moves).toEqual(
      OPENING_LINE_MOVES.slice(0, 18),
    );
  });
});
