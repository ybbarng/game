import { parseFen, squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { kpkWins } from "./kpk";
import {
  type PawnEnding,
  PawnEndingSolver,
  pawnEndingMoves,
  toPawnEnding,
} from "./pawn-ending";

const fromFen = (fen: string): PawnEnding => {
  const pos = parseFen(fen);
  const s = toPawnEnding(pos.board, pos.turn, pos.ep);
  if (!s) throw new Error(fen);
  return s;
};

const PLIES = 21;

describe("킹과 폰 판 읽기: 수 만들기", () => {
  it("두 칸 나간 폰은 옆 상대 폰이 앙파상으로 잡을 수 있다", () => {
    const s = fromFen("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1");
    const push = pawnEndingMoves(s).find(
      (m) => m.from === squareAt("e2") && m.to === squareAt("e4"),
    );
    expect(push?.kind).toBe("pos");
    if (push?.kind !== "pos") return;
    expect(push.pos.ep).toBe(squareAt("e3"));
    const take = pawnEndingMoves(push.pos).find(
      (m) => m.from === squareAt("d4") && m.to === squareAt("e3"),
    );
    expect(take?.kind === "pos" && take.pos.wp).toEqual([]);
  });

  it("킹·폰 말고 다른 기물이 있으면 이 판정을 쓰지 않는다", () => {
    const pos = parseFen("4k3/8/8/8/8/8/4P3/3QK3 w - - 0 1");
    expect(toPawnEnding(pos.board, pos.turn, pos.ep)).toBeNull();
  });
});

describe("킹과 폰 판 읽기: 끝에 닿는 판", () => {
  it("흑 킹이 마지막 백 폰을 잡으면 백은 이길 수 없다", () => {
    // 흑 킹이 a폰을 잡는다(흑 폰 h7은 남는다)
    const s = fromFen("8/7p/8/8/8/1k6/P7/7K w - - 0 1");
    const solver = new PawnEndingSolver();
    expect(solver.holds(s, PLIES)).toBe(true);
    expect(solver.wins(s, PLIES)).toBe(false);
  });

  it("흑 킹이 움직일 곳 없고 폰도 막혔으면 스테일메이트로 비긴다(백 폰이 더 있어도)", () => {
    const s = fromFen("7k/5K1p/7P/8/8/8/P7/8 b - - 0 1");
    expect(pawnEndingMoves(s)).toEqual([]);
    const solver = new PawnEndingSolver();
    expect(solver.holds(s, PLIES)).toBe(true);
    expect(solver.wins(s, PLIES)).toBe(false);
  });

  it("백이 퀸이 된 뒤 흑 폰이 남으면 기본 판정은 이긴다고 하지 않고, 어림을 켜야 후보로 본다", () => {
    // 흑 폰이 멀리(자기 3번째 줄) 있다. 끝까지 읽는 증명은 queen-ending.test.ts
    const s = fromFen("8/7P/p7/k7/8/8/8/4K3 w - - 0 1");
    expect(new PawnEndingSolver().wins(s, PLIES)).toBe(false);
    expect(new PawnEndingSolver({ guessFar: true }).wins(s, PLIES)).toBe(true);
  });

  it("어림으로 세운 후보 증명에서 승급 판을 모으고, 아니라고 알려 준 승급 판은 쓰지 않는다", () => {
    const s = fromFen("8/7P/p7/k7/8/8/8/4K3 w - - 0 1");
    const promote = pawnEndingMoves(s).find((m) => m.kind === "promote");
    if (!promote) throw new Error("승급 수가 없다");
    const leaves = new PawnEndingSolver({ guessFar: true }).proofPromotions(
      "wins",
      promote,
      PLIES,
    );
    expect(leaves?.map((l) => l.queen)).toEqual([squareAt("h8")]);
    const refuted = new PawnEndingSolver({
      guessFar: true,
      known: () => false,
    });
    expect(refuted.proofPromotions("wins", promote, PLIES)).toBeNull();
  });

  it("퀸이 되어도 흑 폰이 퀸 한 칸 앞까지 갈 수 있으면 이긴다고 하지 않는다(퀸 대 7번째 줄 폰은 비기기도 한다)", () => {
    // h8=Q 뒤 흑은 c2로 7번째 줄에 닿는다. 백 킹은 멀다
    const s = fromFen("8/7P/8/8/8/2p5/1k6/7K w - - 0 1");
    const solver = new PawnEndingSolver();
    expect(solver.wins(s, PLIES)).toBe(false);
    // 비긴다고도 증명하지 않는다(모른다)
    expect(solver.holds(s, PLIES)).toBe(false);
  });

  it("흑이 퀸이 되면 백이 바로 잡을 때만 그 뒤를 읽는다", () => {
    // 흑 b2-b1=Q를 백 킹 c2가 잡는다. 그 뒤 백 폰 h5 하나 대 킹: 흑 킹 a8은 h폰을 따라잡지 못한다
    const s = fromFen("k7/8/8/7P/8/8/1pK5/8 b - - 0 1");
    expect(new PawnEndingSolver().wins(s, PLIES)).toBe(true);
  });
});

describe("킹과 폰 판 읽기: 킹+폰 대 킹 승패표와 맞춰 보기", () => {
  // 승패표를 끄고 읽어도, 이긴다·못 이긴다고 증명한 판은 표와 같아야 한다(퀸이 된 뒤 판정·스테일메이트·체크 포함)
  it.each(["e6", "a6", "g5"])(
    "폰 %s: 증명한 판이 모두 승패표와 같다",
    (pawn) => {
      const p = squareAt(pawn);
      const solver = new PawnEndingSolver({ kpk: false });
      const near = (a: number, b: number) =>
        Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))) <=
        1;
      const wrong: string[] = [];
      let wins = 0;
      let holds = 0;
      for (const stm of [0, 1] as const)
        for (let wk = 0; wk < 64; wk++)
          for (let bk = 0; bk < 64; bk++) {
            if (wk === p || bk === p || near(wk, bk)) continue;
            const checked =
              Math.abs((bk & 7) - (p & 7)) === 1 && bk >> 3 === (p >> 3) - 1;
            if (stm === 0 && checked) continue;
            const s: PawnEnding = { wk, bk, wp: [p], bp: [], stm, ep: -1 };
            const truth = kpkWins(stm, wk, bk, p);
            if (solver.wins(s, 11)) {
              wins++;
              if (!truth) wrong.push(`이김 ${stm} ${wk} ${bk}`);
            }
            if (solver.holds(s, 11)) {
              holds++;
              if (truth) wrong.push(`못 이김 ${stm} ${wk} ${bk}`);
            }
          }
      expect(wrong).toEqual([]);
      // 빈 확인이 아니다: 양쪽 모두 많이 증명한다
      expect(wins).toBeGreaterThan(1000);
      expect(holds).toBeGreaterThan(100);
    },
  );
});
