import {
  legalMoves,
  mateInOneMoves,
  parseFen,
  squareAt,
} from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import {
  type KxkPiece,
  kxkBlackDistance,
  kxkBlackMoves,
  kxkDefense,
  kxkMated,
  kxkStalemate,
  kxkTable,
  kxkWhiteDistance,
  kxkWhiteMoves,
} from "./kxk";

const sq = squareAt;

/** FEN의 백 킹·흑 킹·백 퀸(룩) 자리 */
function placed(fen: string, piece: KxkPiece) {
  const board = parseFen(fen).board;
  return {
    wk: board.indexOf("wK"),
    bk: board.indexOf("bK"),
    p: board.indexOf(`w${piece}`),
  };
}

/** 표본 판: 놓일 수 있는 판 가운데 칸 번호로 고르게 뽑는다(늘 같은 판) */
function samplePositions(every: number) {
  const out: { wk: number; bk: number; p: number }[] = [];
  let i = 0;
  for (let wk = 0; wk < 64; wk++)
    for (let bk = 0; bk < 64; bk++)
      for (let p = 0; p < 64; p++) {
        if (wk === bk || wk === p || bk === p) continue;
        const [wx, wy] = [wk & 7, wk >> 3];
        const [bx, by] = [bk & 7, bk >> 3];
        if (Math.max(Math.abs(wx - bx), Math.abs(wy - by)) <= 1) continue;
        if (i++ % every === 0) out.push({ wk, bk, p });
      }
  return out;
}

/** 자리 셋을 엔진 판(FEN)으로 */
function fenOf(
  piece: KxkPiece,
  b: { wk: number; bk: number; p: number },
  turn: "w" | "b",
) {
  const cells = Array<string>(64).fill("");
  cells[b.wk] = "K";
  cells[b.bk] = "k";
  cells[b.p] = piece;
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

describe("메이트 거리 표(잘 알려진 값)", () => {
  it.each([
    ["Q", 10],
    ["R", 16],
  ] as const)(
    "킹+%s 대 킹: 가장 오래 걸리는 판도 %i수면 메이트한다",
    (piece, longest) => {
      expect(kxkTable(piece).white.reduce((a, b) => Math.max(a, b), 0)).toBe(
        longest,
      );
    },
  );

  it("퀸 구석 스테일메이트: 퀸 b6·흑 킹 a8은 흑 차례에 둘 곳이 없고 체크도 아니라 비긴다", () => {
    const b = placed("k7/8/1Q6/8/8/8/8/4K3 b - - 0 1", "Q");
    expect(kxkStalemate("Q", b.wk, b.bk, b.p)).toBe(true);
    expect(kxkBlackDistance("Q", b.wk, b.bk, b.p)).toBeNull();
  });

  it("룩 끝줄 메이트: 킹끼리 마주 보고 룩이 끝줄을 체크하면 메이트(거리 0)", () => {
    const b = placed("3k3R/8/3K4/8/8/8/8/8 b - - 0 1", "R");
    expect(kxkMated("R", b.wk, b.bk, b.p)).toBe(true);
    expect(kxkBlackDistance("R", b.wk, b.bk, b.p)).toBe(0);
  });

  it("지켜지지 않은 룩 옆의 흑 킹은 룩을 잡아 비긴다", () => {
    const b = placed("8/8/8/3kR3/8/8/8/K7 b - - 0 1", "R");
    expect(kxkBlackDistance("R", b.wk, b.bk, b.p)).toBeNull();
    expect(kxkDefense("R", b.wk, b.bk, b.p)).toEqual({
      to: sq("e5"),
      capture: true,
    });
  });
});

describe.each(["Q", "R"] as const)(
  "킹+%s 대 킹 표와 엔진이 같은 판을 본다",
  (piece) => {
    const positions = samplePositions(211);

    it("흑 킹이 둘 수 있는 수가 엔진의 수와 같다", () => {
      for (const b of positions) {
        const pos = parseFen(fenOf(piece, b, "b"));
        const engine = legalMoves(pos)
          .map((m) => m.to)
          .sort((x, y) => x - y);
        const mine = kxkBlackMoves(piece, b.wk, b.bk, b.p)
          .map((m) => m.to)
          .sort((x, y) => x - y);
        expect(mine).toEqual(engine);
      }
    });

    it("백이 둘 수 있는 수가 엔진의 수와 같다(흑 킹이 체크가 아닌 판)", () => {
      for (const b of positions) {
        if (kxkWhiteDistance(piece, b.wk, b.bk, b.p) === null) continue;
        const pos = parseFen(fenOf(piece, b, "w"));
        const engine = legalMoves(pos)
          .map((m) => `${m.from}-${m.to}`)
          .sort();
        const mine = kxkWhiteMoves(piece, b.wk, b.bk, b.p)
          .map((m) => `${m.from}-${m.to}`)
          .sort();
        expect(mine).toEqual(engine);
      }
    });

    it("한 수 메이트라고 적힌 판은 엔진도 한 수 메이트를 찾고, 더 먼 판은 찾지 못한다", () => {
      for (const b of positions) {
        const d = kxkWhiteDistance(piece, b.wk, b.bk, b.p);
        if (d === null) continue;
        const mates = mateInOneMoves(parseFen(fenOf(piece, b, "w")));
        expect(mates.length > 0).toBe(d === 1);
      }
    });

    it("백 차례 거리는 「흑 차례 판 가운데 가장 가까운 것 + 1」, 흑 차례 거리는 「가장 먼 것」이다", () => {
      for (const b of positions) {
        const d = kxkWhiteDistance(piece, b.wk, b.bk, b.p);
        if (d === null) continue;
        const after = kxkWhiteMoves(piece, b.wk, b.bk, b.p).map((m) =>
          kxkBlackDistance(piece, m.wk, b.bk, m.p),
        );
        const best = Math.min(...after.filter((x): x is number => x !== null));
        expect(d).toBe(best + 1);
      }
    });
  },
);

describe("흑 킹이 가장 오래 버티는 수", () => {
  it.each(["Q", "R"] as const)(
    "킹+%s: 고른 수 뒤의 메이트 거리가 흑의 모든 수 가운데 가장 멀다",
    (piece) => {
      for (const b of samplePositions(307)) {
        const now = kxkBlackDistance(piece, b.wk, b.bk, b.p);
        if (now === null || now === 0) continue;
        const pick = kxkDefense(piece, b.wk, b.bk, b.p);
        if (!pick) throw new Error("둘 수가 있어야 한다");
        const longest = Math.max(
          ...kxkBlackMoves(piece, b.wk, b.bk, b.p).map(
            (m) => kxkWhiteDistance(piece, b.wk, m.to, b.p) ?? 99,
          ),
        );
        expect(kxkWhiteDistance(piece, b.wk, pick.to, b.p)).toBe(longest);
        expect(longest).toBe(now);
      }
    },
  );

  it("같은 판에서는 늘 같은 수를 고른다", () => {
    const b = placed("8/8/8/4k3/8/8/8/K6Q b - - 0 1", "Q");
    const first = kxkDefense("Q", b.wk, b.bk, b.p);
    expect(kxkDefense("Q", b.wk, b.bk, b.p)).toEqual(first);
  });

  it("같은 거리면 가운데 가까운 칸으로 간다", () => {
    // 흑 킹 e5, 퀸 h1·백 킹 a1: 메이트 거리가 같은 칸이 여럿일 때 가운데(d4·d5·e4·e5) 쪽
    const b = placed("8/8/8/4k3/8/8/8/K6Q b - - 0 1", "Q");
    const pick = kxkDefense("Q", b.wk, b.bk, b.p);
    const longest = Math.max(
      ...kxkBlackMoves("Q", b.wk, b.bk, b.p).map(
        (m) => kxkWhiteDistance("Q", b.wk, m.to, b.p) ?? 99,
      ),
    );
    const ties = kxkBlackMoves("Q", b.wk, b.bk, b.p).filter(
      (m) => (kxkWhiteDistance("Q", b.wk, m.to, b.p) ?? 99) === longest,
    );
    const centre = (at: number) =>
      Math.abs(2 * (at & 7) - 7) + Math.abs(2 * (at >> 3) - 7);
    expect(centre(pick?.to ?? -1)).toBe(
      Math.min(...ties.map((m) => centre(m.to))),
    );
  });
});
