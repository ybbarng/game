import { squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { kpkWinningMoves, kpkWins } from "./kpk";

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
