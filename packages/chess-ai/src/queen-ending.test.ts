import { parseFen, squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { kxkAttacks, kxkWhiteDistance } from "./kxk";
import {
  type PawnEnding,
  PawnEndingSolver,
  pawnEndingMoves,
  toPawnEnding,
} from "./pawn-ending";
import {
  BARE_PLIES,
  EndingProver,
  promotedPosition,
  promotionDigest,
  promotionKey,
} from "./queen-ending";

const near = (a: number, b: number) =>
  Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))) <= 1;

const fromFen = (fen: string): PawnEnding => {
  const pos = parseFen(fen);
  const s = toPawnEnding(pos.board, pos.turn, pos.ep);
  if (!s) throw new Error(fen);
  return s;
};

describe("퀸이 된 뒤 읽기가 기대는 표", () => {
  it("킹+퀸 대 킹은 백 차례면 언제나 이기고, 가장 길어도 10수 만에 메이트한다", () => {
    let count = 0;
    let longest = 0;
    const losing: string[] = [];
    for (let wk = 0; wk < 64; wk++)
      for (let bk = 0; bk < 64; bk++)
        for (let q = 0; q < 64; q++) {
          if (wk === bk || wk === q || bk === q || near(wk, bk)) continue;
          // 백 차례인데 흑 킹이 체크를 받고 있을 수는 없다
          if (kxkAttacks("Q", q, wk, bk)) continue;
          count++;
          const d = kxkWhiteDistance("Q", wk, bk, q);
          if (d === null) losing.push(`${wk} ${bk} ${q}`);
          else longest = Math.max(longest, d);
        }
    expect(losing).toEqual([]);
    expect(count).toBe(144_508);
    expect(longest).toBe(10);
    // 폰이 길을 막는 판을 읽는 걸음은 이것보다 넉넉하다
    expect(BARE_PLIES).toBeGreaterThan(2 * longest);
  });
  // 킹+폰 대 킹 승패표의 승급이 정말 이기는지는 kpk.test.ts
});

describe("퀸이 된 뒤 끝까지 읽기", () => {
  it("흑 폰이 남아도 퀸이 된 뒤를 끝까지 읽어 이긴다고 증명한다(어림 없이)", () => {
    // h8=Q 뒤 퀸이 a6 폰을 잡으러 가고, 흑 킹 f2는 폰을 지키러 오지 못한다
    const s = fromFen("8/7P/p7/8/8/8/5k2/3K4 w - - 0 1");
    expect(new EndingProver().pawn.wins(s, 3)).toBe(true);
    // 다음 한 수만 보는 기본 판정으로는 증명하지 못한다(흑 폰이 남는다)
    expect(new PawnEndingSolver().wins(s, 3)).toBe(false);
  });

  it("퀸이 되어도 흑 폰이 7번째 줄에서 킹과 함께 버티면 이긴다고 하지 않는다", () => {
    // h8=Q 뒤 흑은 c2로 7번째 줄에 닿는다. 백 킹은 멀다(퀸 대 c폰은 비기는 판)
    const s = fromFen("8/7P/8/8/8/2p5/1k6/7K w - - 0 1");
    expect(new EndingProver({ queenPlies: 7 }).pawn.wins(s, 3)).toBe(false);
  });

  it("킹+퀸+폰 대 킹: 폰이 흑 킹의 칸을 막아 생기는 스테일메이트를 피해 메이트까지 읽는다", () => {
    // 폰을 빼고 본 표의 가장 빠른 수 가운데 g3 폰 때문에 스테일메이트가 되는 수가 있다
    const prover = new EndingProver();
    expect(prover.winsAt(parseFen("Q7/8/5k2/8/5K2/6P1/8/8 b - - 0 1"), 1)).toBe(
      true,
    );
  });

  it("킹+퀸+폰 대 킹: 폰이 흑 킹의 마지막 칸을 막아 생긴 스테일메이트는 이긴 것으로 치지 않는다", () => {
    // 흑 킹 h5: g4·g5는 백 킹, g6·h6은 퀸 d6, h4는 g3 폰이 노린다. 체크는 아니다
    const pos = parseFen("8/8/3Q4/7k/5K2/6P1/8/8 b - - 0 1");
    const prover = new EndingProver();
    expect(prover.winsAt(pos, 5)).toBe(false);
    expect(prover.holdsAt(pos, 5)).toBe(true);
  });

  it("흑 킹이 지켜지지 않은 새 퀸을 잡으면 킹과 폰 판으로 돌아가 읽는다", () => {
    // b7 흑 킹이 a8 퀸을 잡으면 g3 폰 하나 대 킹: 흑 킹이 너무 멀어 백이 이긴다
    const prover = new EndingProver();
    expect(prover.winsAt(parseFen("Q7/1k6/8/7K/8/6P1/8/8 b - - 0 1"), 3)).toBe(
      true,
    );
  });

  it("흑이 승급하면 퀸이 아닌 기물로 바꾸는 수까지 모두 이겨야 이긴다고 한다", () => {
    // 흑 b2-b1을 백 킹 c2가 바로 잡는다(어떤 기물이든). 그 뒤 h폰을 흑 킹이 따라잡지 못한다
    const s = fromFen("k7/8/8/7P/8/8/1pK5/8 b - - 0 1");
    const promote = pawnEndingMoves(s).find((m) => m.kind === "promote");
    if (promote?.kind !== "promote") throw new Error("승급 수가 없다");
    expect(new EndingProver().wins(promote)).toBe(true);
    expect(promotedPosition(promote, "N").board[squareAt("b1")]).toBe("bN");
  });
});

describe("증명 기록의 이름과 지문", () => {
  it("승급 판 이름은 물음과 기물 자리·차례로 정해지고, 지문은 이름 차례와 상관없다", () => {
    const s = fromFen("k7/8/8/7P/8/8/1pK5/8 b - - 0 1");
    const promote = pawnEndingMoves(s).find((m) => m.kind === "promote");
    if (promote?.kind !== "promote") throw new Error("승급 수가 없다");
    expect(promotionKey(promote, "wins")).toBe("wins k7/8/8/7P/8/8/2K5/1q6 w");
    expect(promotionDigest(["a", "b"])).toBe(promotionDigest(["b", "a"]));
    expect(promotionDigest(["a", "b"])).not.toBe(promotionDigest(["a", "c"]));
  });
});
