import { legalMoves, parseFen, squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import {
  type KrrkBoard,
  krrkBlackMoves,
  krrkBlackPlayed,
  krrkCheck,
  krrkDefense,
  krrkMated,
  krrkStalemate,
  krrkWhiteMoves,
  krrkWhitePlayed,
} from "./krrk";

const sq = squareAt;

/** FEN의 백 킹·흑 킹·백 룩 둘 자리 */
function placed(fen: string): KrrkBoard {
  const board = parseFen(fen).board;
  const rooks = board.flatMap((c, i) => (c === "wR" ? [i] : []));
  return {
    wk: board.indexOf("wK"),
    bk: board.indexOf("bK"),
    p: rooks[0] as number,
    q: rooks[1] as number,
  };
}

/** 자리 넷을 엔진 판(FEN)으로 */
function fenOf(b: KrrkBoard, turn: "w" | "b") {
  const cells = Array<string>(64).fill("");
  cells[b.wk] = "K";
  cells[b.bk] = "k";
  cells[b.p] = "R";
  cells[b.q] = "R";
  const rows: string[] = [];
  for (let y = 0; y < 8; y++) {
    let row = "";
    let empty = 0;
    for (let x = 0; x < 8; x++) {
      const c = cells[y * 8 + x] as string;
      if (c === "") empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += c;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${turn} - - 0 1`;
}

/** 놓일 수 있는 판 가운데 칸 번호로 고르게 뽑은 표본(늘 같은 판) */
function samplePositions(every: number): KrrkBoard[] {
  const out: KrrkBoard[] = [];
  let i = 0;
  for (let wk = 0; wk < 64; wk += 3)
    for (let bk = 0; bk < 64; bk++) {
      const near =
        Math.max(
          Math.abs((wk & 7) - (bk & 7)),
          Math.abs((wk >> 3) - (bk >> 3)),
        ) <= 1;
      if (near) continue;
      for (let p = 0; p < 64; p++)
        for (let q = p + 1; q < 64; q++) {
          if ([wk, bk].includes(p) || [wk, bk].includes(q)) continue;
          if (i++ % every === 0) out.push({ wk, bk, p, q });
        }
    }
  return out;
}

describe("킹+룩 둘 대 킹: 수 만들기는 엔진과 같다", () => {
  const positions = samplePositions(2003);

  it("표본이 수백 판이다", () => {
    expect(positions.length).toBeGreaterThan(300);
  });

  it("흑 킹이 둘 수 있는 수가 엔진의 수와 같다", () => {
    for (const b of positions) {
      const engine = legalMoves(parseFen(fenOf(b, "b")))
        .map((m) => m.to)
        .sort((x, y) => x - y);
      const mine = krrkBlackMoves(b)
        .map((m) => m.to)
        .sort((x, y) => x - y);
      expect(mine).toEqual(engine);
    }
  });

  it("백이 둘 수 있는 수가 엔진의 수와 같다(흑 킹이 체크가 아닌 판)", () => {
    for (const b of positions) {
      if (krrkCheck(b)) continue;
      const engine = legalMoves(parseFen(fenOf(b, "w")))
        .map((m) => `${m.from}-${m.to}`)
        .sort();
      const mine = krrkWhiteMoves(b)
        .map((m) => `${m.from}-${m.to}`)
        .sort();
      expect(mine).toEqual(engine);
    }
  });
});

describe("메이트·스테일메이트", () => {
  it("사다리 메이트: 룩 둘이 7·8번째 줄에 서고 8번째 줄이 체크면 메이트", () => {
    expect(krrkMated(placed("R3k3/7R/8/8/8/8/8/4K3 b - - 0 1"))).toBe(true);
  });

  it("체크하는 룩이 흑 킹 바로 옆이고 지켜지지 않으면 메이트가 아니다(잡는다)", () => {
    const b = placed("3Rk3/7R/8/8/8/8/8/4K3 b - - 0 1");
    expect(krrkCheck(b)).toBe(true);
    expect(krrkMated(b)).toBe(false);
    expect(krrkBlackMoves(b)).toContainEqual({ to: sq("d8"), capture: true });
  });

  it("다른 룩이 지키는 룩은 잡지 못한다", () => {
    const b = placed("3Rk3/3R4/8/8/8/8/8/4K3 b - - 0 1");
    expect(krrkBlackMoves(b).some((m) => m.capture)).toBe(false);
  });

  it("흑 킹은 체크하는 룩의 줄을 따라 뒤로 물러설 수 없다", () => {
    const b = placed("8/8/8/R2k4/8/8/8/4K2R b - - 0 1");
    const to = krrkBlackMoves(b).map((m) => m.to);
    expect(to).not.toContain(sq("e5"));
    expect(to).not.toContain(sq("c5"));
  });

  it("구석 스테일메이트: 흑 킹 a8, 룩 b1·h7이면 둘 곳이 없고 체크도 아니다", () => {
    expect(krrkStalemate(placed("k7/7R/8/8/8/8/8/1R2K3 b - - 0 1"))).toBe(true);
  });
});

describe("흑 킹이 버티는 수", () => {
  it("지켜지지 않은 룩을 잡을 수 있으면 잡는다", () => {
    const b = placed("8/8/8/3kR3/8/8/8/R3K3 b - - 0 1");
    expect(krrkDefense(b)).toEqual({ to: sq("e5"), capture: true });
    expect(krrkBlackPlayed(b, sq("e5"))).toMatchObject({
      bk: sq("e5"),
      p: -1,
    });
  });

  it("한 수 메이트를 피할 수 있으면 피한다(표본 판 전부)", () => {
    const matesNext = (a: KrrkBoard) =>
      krrkWhiteMoves(a).some((m) => krrkMated(krrkWhitePlayed(a, m)));
    let checked = 0;
    for (const b of samplePositions(3001)) {
      const moves = krrkBlackMoves(b);
      if (moves.some((m) => m.capture)) continue;
      const safe = moves.filter((m) => !matesNext(krrkBlackPlayed(b, m.to)));
      if (safe.length === 0 || safe.length === moves.length) continue;
      checked++;
      const chosen = krrkDefense(b);
      expect(safe.map((m) => m.to)).toContain(chosen?.to);
    }
    // 한 수 메이트를 당하는 수와 피하는 수가 섞인 판이 표본에 넉넉히 있다
    expect(checked).toBeGreaterThan(5);
  });

  it("한 수 메이트가 없으면 가장자리 줄에서 먼 칸으로 간다(룩이 7번째 줄을 막은 8번째 줄의 흑 킹은 그대로 8번째 줄)", () => {
    // 흑 킹 h8, 백 룩 a6(6번째 줄)·b1(b줄). g7·h7은 가장자리 줄에서 0·1칸, g8은 0칸. 한 수 메이트는 어느 칸에도 없다
    const b = placed("7k/8/R7/8/8/8/8/1R2K3 b - - 0 1");
    expect(krrkDefense(b)).toEqual({ to: sq("g7"), capture: false });
  });

  it("같은 판이면 늘 같은 수", () => {
    const b = placed("8/8/8/4k3/8/8/8/R3K2R b - - 0 1");
    expect(krrkDefense(b)).toEqual(krrkDefense({ ...b }));
    expect(krrkDefense(b)).toEqual(krrkDefense({ ...b, p: b.q, q: b.p }));
  });
});
