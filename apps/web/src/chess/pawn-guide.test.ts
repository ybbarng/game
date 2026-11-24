// 킹과 폰으로 퀸 만들기 단원의 방법(pawn-guide.ts)이, 쓰는 범위의 모든 판에서 흑이 어떻게 받아도 퀸이 되는지 본다.
// 흑의 받는 수를 모두 따라가고(같은 판은 한 번만), 같은 판으로 돌아오면 실패로 센다. 고를 칸이 여럿이면 앞·뒤를 모두 본다.
import { kpkBlackMoves, kpkWins } from "@game/chess-ai";
import { squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import {
  blackReply,
  drillBoard,
  ENDGAME_LIMIT,
  ENDGAME_SETS,
  judgeDrill,
} from "./endgame";
import type { KxkBoard, Tie } from "./endgame-guide";
import {
  inKeyZone,
  keySquares,
  outsideSquare,
  pawnGuide,
  pawnPlayed,
  safeQueen,
} from "./pawn-guide";

const name = (at: number) => `${"abcdefgh"[at & 7]}${8 - (at >> 3)}`;
const show = (b: KxkBoard) => `K${name(b.wk)} P${name(b.p)} k${name(b.bk)}`;

/**
 * 방법대로 두면 흑이 어떻게 받아도 퀸이 되나. 퀸이 되기까지 가장 긴 수(백의 수)를, 못 하면 -1.
 * 비기는 판이 되는 수·폰을 잡히는 수·스테일메이트·맴돌기·둘 수 없음은 모두 실패
 */
function prover(tie: Tie) {
  const memo = new Map<number, number>();
  const open = new Set<number>();
  const prove = (b: KxkBoard): number => {
    const key = (b.wk * 64 + b.bk) * 64 + b.p;
    const known = memo.get(key);
    if (known !== undefined) return known;
    if (open.has(key)) return -1;
    open.add(key);
    let result = -1;
    const move = pawnGuide(b, tie);
    if (move && move.from === b.p && move.to < 8)
      result = safeQueen(b, move.to) ? 1 : -1;
    else if (move) {
      const a = pawnPlayed(b, move);
      const replies = kpkBlackMoves(a.wk, a.bk, a.p);
      if (kpkWins(1, a.wk, a.bk, a.p) && replies.length > 0) {
        let worst = 0;
        for (const r of replies) {
          const v = prove({ ...a, bk: r.to });
          if (v < 0) {
            worst = -1;
            break;
          }
          worst = Math.max(worst, v);
        }
        if (worst > 0) result = worst + 1;
      }
    }
    open.delete(key);
    memo.set(key, result);
    return result;
  };
  return prove;
}

/** 퀸으로 바꾸면 스테일메이트라 룩으로 바꿔야 이기는 판(폰이 7번째 가로줄). 단원 범위 밖 */
const needsRook = (b: KxkBoard) =>
  b.p >> 3 === 1 &&
  b.p - 8 !== b.wk &&
  b.p - 8 !== b.bk &&
  !safeQueen(b, b.p - 8);

/** 단원이 「늘 이긴다」고 쓴 범위: b~g폰, 백이 이기는 판 가운데 사각형 밖이거나 4번째 가로줄 이상에서 킹이 이기는 칸 */
function scope(): { kind: "square" | "key"; b: KxkBoard }[] {
  const out: { kind: "square" | "key"; b: KxkBoard }[] = [];
  for (let p = 8; p < 56; p++) {
    const [px, py] = [p & 7, p >> 3];
    if (px === 0 || px === 7) continue;
    for (let wk = 0; wk < 64; wk++)
      for (let bk = 0; bk < 64; bk++) {
        if (!kpkWins(0, wk, bk, p)) continue;
        const b = { wk, bk, p };
        if (needsRook(b)) continue;
        const pathFree = !((wk & 7) === px && wk >> 3 < py);
        if (outsideSquare(b) && pathFree) out.push({ kind: "square", b });
        else if (8 - py >= 4 && keySquares(p).includes(wk))
          out.push({ kind: "key", b });
      }
  }
  return out;
}

describe("킹과 폰: 방법대로 두면 흑이 어떻게 받아도 퀸이 된다", () => {
  const all = scope();

  it("범위의 판 수(사각형 밖·이기는 칸). 퀸으로 바꾸면 스테일메이트인 7번째 가로줄 판 18개는 뺐다", () => {
    expect(all.filter((s) => s.kind === "square").length).toBe(67_390);
    expect(all.filter((s) => s.kind === "key").length).toBe(2_434);
  });

  it.each(["first", "last"] as const)(
    "고를 칸을 %s로 골라도 범위의 모든 판에서 정해진 수 안에 퀸이 된다",
    (tie) => {
      const prove = prover(tie);
      const failed: string[] = [];
      let longest = 0;
      for (const { b } of all) {
        const v = prove(b);
        if (v < 0) failed.push(show(b));
        longest = Math.max(longest, v);
      }
      expect(failed.slice(0, 10)).toEqual([]);
      expect(longest).toBe(8);
      expect(longest).toBeLessThanOrEqual(ENDGAME_LIMIT.P);
    },
  );
});

describe("킹과 폰 연습", () => {
  const set = ENDGAME_SETS.find((s) => s.piece === "P");
  const drills = set?.drills ?? [];

  it("연습 시작 판은 셋이고, 모두 단원 범위 안에서 백이 이기는 판이다", () => {
    expect(drills).toHaveLength(3);
    for (const d of drills) {
      const b = drillBoard("P", d.fen);
      expect(kpkWins(0, b.wk, b.bk, b.p)).toBe(true);
      const inScope =
        outsideSquare(b) ||
        (8 - (b.p >> 3) >= 4 && keySquares(b.p).includes(b.wk));
      expect(inScope).toBe(true);
    }
  });

  it.each(drills.map((d) => [d.id, d] as const))(
    "%s: 「수 보기」대로 두면 흑 킹이 버텨도 화면 판정으로 정해진 수 안에 퀸이 된다",
    (_id, d) => {
      let b = drillBoard("P", d.fen);
      for (let step = 0; step < ENDGAME_LIMIT.P; step++) {
        const move = pawnGuide(b);
        if (!move) throw new Error(`둘 수 없음: ${show(b)}`);
        const verdict = judgeDrill("P", b, move, step);
        if (verdict.verdict === "solved") return;
        expect(verdict).toEqual({ verdict: "next" });
        const reply = blackReply("P", pawnPlayed(b, move));
        if (!reply) throw new Error(`흑이 둘 수 없음: ${show(b)}`);
        b = reply.board;
      }
      throw new Error(`정해진 수 안에 퀸이 되지 않음: ${d.id}`);
    },
  );
});

describe("킹과 폰 낱말", () => {
  const sq = squareAt;
  const names = (list: number[]) => list.map(name).sort();

  it("이기는 칸: 4번째 가로줄 폰은 두 줄 앞 세 칸, 5·6번째는 여섯 칸, 7번째는 옆 줄 네 칸", () => {
    expect(names(keySquares(sq("e4")))).toEqual(["d6", "e6", "f6"]);
    expect(names(keySquares(sq("e5")))).toEqual([
      "d6",
      "d7",
      "e6",
      "e7",
      "f6",
      "f7",
    ]);
    expect(names(keySquares(sq("e7")))).toEqual(["d7", "d8", "f7", "f8"]);
  });

  it("이기는 칸보다 앞: 같은 세 세로줄에서 더 앞의 칸은 들고, 옆 세로줄·뒤 칸은 들지 않는다", () => {
    expect(inKeyZone(sq("e4"), sq("f8"))).toBe(true);
    expect(inKeyZone(sq("e4"), sq("g6"))).toBe(false);
    expect(inKeyZone(sq("e4"), sq("e5"))).toBe(false);
  });

  it("폰의 사각형: 내 차례에 흑 킹이 사각형 밖이면 따라잡지 못한다(c4 폰은 c4·c8·g8·g4)", () => {
    const at = (bk: string) =>
      outsideSquare({ wk: sq("a1"), bk: sq(bk), p: sq("c4") });
    expect(at("h4")).toBe(true);
    expect(at("g4")).toBe(false);
    expect(at("g8")).toBe(false);
    expect(at("h8")).toBe(true);
    // 2번째 가로줄 폰은 3번째 가로줄에 있는 것처럼(두 칸 간다)
    expect(outsideSquare({ wk: sq("a1"), bk: sq("h3"), p: sq("c2") })).toBe(
      false,
    );
    expect(outsideSquare({ wk: sq("a1"), bk: sq("h2"), p: sq("c2") })).toBe(
      true,
    );
  });
});
