import { squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { kpkWinningMoves, kpkWins } from "./kpk";
import { kxkBlackDistance } from "./kxk";

const sq = squareAt;
const W = 0 as const;
const B = 1 as const;

describe("킹+폰 대 킹 승패표(잘 알려진 판)", () => {
  it("백 킹이 폰 앞 6번째 줄에 서면 누가 두든 이긴다(Ke6·e5 대 Ke8)", () => {
    expect(kpkWins(W, sq("e6"), sq("e8"), sq("e5"))).toBe(true);
    expect(kpkWins(B, sq("e6"), sq("e8"), sq("e5"))).toBe(true);
  });

  it("맞서기(옵포지션): Ke5·e4 대 Ke7은 흑 차례면 이기고 백 차례면 비긴다", () => {
    expect(kpkWins(B, sq("e5"), sq("e7"), sq("e4"))).toBe(true);
    expect(kpkWins(W, sq("e5"), sq("e7"), sq("e4"))).toBe(false);
  });

  it("스테일메이트: Ke6·e7 대 Ke8 흑 차례는 비긴다", () => {
    expect(kpkWins(B, sq("e6"), sq("e8"), sq("e7"))).toBe(false);
  });

  it("가장자리 폰은 흑 킹이 구석에 있으면 비긴다(Kh6·h5 대 Kh8)", () => {
    expect(kpkWins(W, sq("h6"), sq("h8"), sq("h5"))).toBe(false);
    expect(kpkWins(B, sq("h6"), sq("h8"), sq("h5"))).toBe(false);
  });

  it("흑 킹이 폰을 따라잡지 못하면 폰만 밀어도 이긴다(사각형 밖)", () => {
    // 폰 a4, 흑 킹 h4: 흑 차례라도 폰의 사각형(a4~e8)에 들어가지 못한다
    expect(kpkWins(B, sq("e1"), sq("h4"), sq("a4"))).toBe(true);
    expect(kpkWinningMoves(sq("e1"), sq("h5"), sq("a4"))).toContainEqual({
      from: sq("a4"),
      to: sq("a5"),
    });
  });
});

describe("킹+폰 대 킹 승패표: 승급하면 정말 이기나", () => {
  const near = (a: number, b: number) =>
    Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))) <= 1;
  const pawnAttacks = (p: number, at: number) =>
    at >> 3 === (p >> 3) - 1 && Math.abs((at & 7) - (p & 7)) === 1;

  it("「무사히 승급하면 이긴다」고 본 판은 퀸이나 룩으로 바꾸면 메이트 거리 표로도 이긴다(스테일메이트 없음)", () => {
    let promotions = 0;
    const wrong: string[] = [];
    for (let p = 8; p < 16; p++)
      for (let wk = 0; wk < 64; wk++)
        for (let bk = 0; bk < 64; bk++) {
          if (wk === bk || wk === p || bk === p || near(wk, bk)) continue;
          if (pawnAttacks(p, bk)) continue;
          for (const m of kpkWinningMoves(wk, bk, p)) {
            if (m.from !== p || m.to !== p - 8) continue;
            promotions++;
            const queen = kxkBlackDistance("Q", wk, bk, m.to);
            const rook = kxkBlackDistance("R", wk, bk, m.to);
            if (queen === null && rook === null) wrong.push(`${wk} ${bk} ${p}`);
          }
        }
    expect(wrong).toEqual([]);
    expect(promotions).toBeGreaterThan(10_000);
  });

  it("퀸으로도 룩으로도 스테일메이트가 되는 승급은 이기는 수로 치지 않고, 그 판은 킹 수로 이긴다", () => {
    // 백 킹 a3·흑 킹 a1·폰 b7: b8=Q·b8=R 모두 흑 킹이 둘 곳이 없다. Kb3 뒤 Kb1, 그다음 b8=Q+로 이긴다
    const [wk, bk, p] = [sq("a3"), sq("a1"), sq("b7")];
    expect(kpkWins(W, wk, bk, p)).toBe(true);
    const moves = kpkWinningMoves(wk, bk, p);
    expect(moves.filter((m) => m.from === p)).toEqual([]);
    expect(moves).toContainEqual({ from: wk, to: sq("b3") });
  });
});
