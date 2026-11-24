import { squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import {
  kpkBlackMoves,
  kpkDefense,
  kpkWhiteDistance,
  kpkWinningMoves,
  kpkWins,
} from "./kpk";
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

describe("킹+폰 대 킹 승급 거리 표와 흑의 버티기", () => {
  it("흑 킹이 사각형 밖이면 폰이 끝줄까지 가는 수가 곧 거리다(a4 폰은 a5·a6·a7·a8 넷)", () => {
    expect(kpkWhiteDistance(sq("e1"), sq("h5"), sq("a4"))).toBe(4);
    // 2번째 가로줄 폰은 처음에 두 칸 간다(a2 → a4 → … → a8 다섯 수)
    expect(kpkWhiteDistance(sq("e1"), sq("h4"), sq("a2"))).toBe(5);
  });

  it("비기는 판은 거리가 없다(맞서기를 흑이 가진 Ke5·e4 대 Ke7 백 차례)", () => {
    expect(kpkWhiteDistance(sq("e5"), sq("e7"), sq("e4"))).toBeNull();
  });

  it("백이 이기는 판과 거리가 있는 판이 같고, 거리는 한 수 앞 판들과 어긋나지 않는다(13판마다 하나)", () => {
    const wrong: string[] = [];
    let i = 0;
    for (let p = 8; p < 56; p++)
      for (let wk = 0; wk < 64; wk++)
        for (let bk = 0; bk < 64; bk++) {
          if (wk === bk || wk === p || bk === p) continue;
          if (i++ % 13 !== 0) continue;
          const wins = kpkWins(W, wk, bk, p);
          const d = kpkWhiteDistance(wk, bk, p);
          if (wins !== (d !== null)) {
            wrong.push(`표 ${wk} ${bk} ${p}`);
            continue;
          }
          if (d === null) continue;
          // 백의 이기는 수 가운데 가장 빠른 것: 승급이면 1, 아니면 1 + 흑이 가장 오래 버틴 값
          let fastest = Infinity;
          for (const m of kpkWinningMoves(wk, bk, p)) {
            if (m.from === p && m.to < 8) {
              fastest = 1;
              continue;
            }
            const [nwk, np] = m.from === wk ? [m.to, p] : [wk, m.to];
            const replies = kpkBlackMoves(nwk, bk, np);
            if (replies.length === 0) {
              fastest = Math.min(fastest, 1);
              continue;
            }
            const worst = Math.max(
              ...replies.map((r) => kpkWhiteDistance(nwk, r.to, np) ?? 99),
            );
            fastest = Math.min(fastest, 1 + worst);
          }
          if (fastest !== d) wrong.push(`${wk} ${bk} ${p}: ${d} ≠ ${fastest}`);
        }
    expect(wrong).toEqual([]);
  });

  it("흑은 폰을 잡을 수 있으면 잡는다", () => {
    expect(kpkDefense(sq("a1"), sq("d5"), sq("e4"))).toEqual({
      to: sq("e4"),
      capture: true,
    });
  });

  it("흑은 비기는 판으로 갈 수 있으면 간다(Ke4·e3 대 Kd6 흑 차례: Ke6으로 맞서기)", () => {
    const reply = kpkDefense(sq("e4"), sq("d6"), sq("e3"));
    expect(reply?.to).toBe(sq("e6"));
    expect(kpkWins(W, sq("e4"), sq("e6"), sq("e3"))).toBe(false);
  });

  it("흑은 이기는 판만 남으면 승급까지 가장 먼 수를 둔다", () => {
    const [wk, bk, p] = [sq("e6"), sq("e8"), sq("e5")];
    const reply = kpkDefense(wk, bk, p);
    const far = Math.max(
      ...kpkBlackMoves(wk, bk, p).map(
        (m) => kpkWhiteDistance(wk, m.to, p) ?? 0,
      ),
    );
    expect(kpkWhiteDistance(wk, reply?.to ?? -1, p)).toBe(far);
  });
});
