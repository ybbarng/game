/*
 * 기본 엔드게임 단원의 방법(`endgame-guide.ts`)이 정해진 수 안에 메이트하는지 보는 시험 묶음.
 * 퀸·룩을 `endgame-guide-queen.test.ts`·`endgame-guide-rook.test.ts`가 하나씩 돌린다(파일마다 혼자 1초 안쪽).
 * 흑은 메이트 거리 표로 가장 오래 버틴다(`kxkDefense`). 같은 값의 칸이 여럿이면 앞·뒤를 모두 고른다
 * (단원은 「어느 칸이든 괜찮다」고 쓰므로).
 * 2026-11-17에 이기는 판 전부(퀸 144,508·룩 175,168)를 앞·뒤로 돌려 퀸 22수·룩 27수 안에 모두 메이트, 스테일메이트 0을
 * 확인했다(한 벌 6초 남짓이라 시험은 97판마다 하나씩 고른 표본으로 본다).
 */

import { type KxkPiece, kxkWhiteDistance } from "@game/chess-ai";
import { describe, expect, it } from "vitest";

import {
  blackReply,
  drillBoard,
  ENDGAME_LIMIT,
  ENDGAME_SETS,
  judgeDrill,
} from "./endgame";
import {
  guideMove,
  type KxkBoard,
  type Tie,
  whitePlayed,
} from "./endgame-guide";

type Ending =
  | { result: "mate"; moves: number }
  | { result: "stalemate" | "lost" | "limit" | "stuck"; moves: number };

/** 방법대로 끝까지 둔다(흑은 가장 오래 버틴다). 판정은 연습 화면과 같은 `judgeDrill` */
export function playGuide(piece: KxkPiece, start: KxkBoard, tie: Tie): Ending {
  let b = start;
  for (let step = 0; ; step++) {
    const move = guideMove(piece, b, tie);
    if (!move) return { result: "stuck", moves: step };
    const verdict = judgeDrill(piece, b, move, step);
    if (verdict.verdict === "solved")
      return { result: "mate", moves: step + 1 };
    if (verdict.verdict === "wrong")
      return { result: verdict.miss, moves: step + 1 };
    const after = whitePlayed(b, move);
    const reply = blackReply(piece, after);
    if (!reply) return { result: "stuck", moves: step + 1 };
    b = reply.board;
  }
}

/** 백이 이기는 시작 판 가운데 `every`판마다 하나(늘 같은 판) */
function winningSample(piece: KxkPiece, every: number): KxkBoard[] {
  const out: KxkBoard[] = [];
  let i = 0;
  for (let wk = 0; wk < 64; wk++)
    for (let bk = 0; bk < 64; bk++)
      for (let p = 0; p < 64; p++) {
        if (kxkWhiteDistance(piece, wk, bk, p) === null) continue;
        if (i++ % every === 0) out.push({ wk, bk, p });
      }
  return out;
}

const name = (at: number) => `${"abcdefgh"[at & 7]}${8 - (at >> 3)}`;

export function guideSuite(piece: KxkPiece) {
  const limit = ENDGAME_LIMIT[piece];
  const word = piece === "Q" ? "퀸" : "룩";

  describe(`${word}: 단원대로 두면 ${limit}수 안에 메이트한다`, () => {
    const set = ENDGAME_SETS.find((s) => s.piece === piece);
    const drills = set?.drills ?? [];

    it("연습 시작 판은 셋이고, 모두 백 차례에 백이 이기는 판이다", () => {
      expect(drills).toHaveLength(3);
      for (const d of drills) {
        const b = drillBoard(piece, d.fen);
        expect(kxkWhiteDistance(piece, b.wk, b.bk, b.p)).not.toBeNull();
      }
    });

    it.each(drills.map((d) => [d.id, d] as const))(
      "%s: 고를 칸을 앞·뒤 어느 쪽으로 골라도 정해진 수 안에 메이트",
      (_id, d) => {
        for (const tie of ["first", "last"] as const) {
          const end = playGuide(piece, drillBoard(piece, d.fen), tie);
          expect(end.result).toBe("mate");
          expect(end.moves).toBeLessThanOrEqual(limit);
        }
      },
    );

    it.each(["first", "last"] as const)(
      "이기는 판 표본(97판마다 하나): 고를 칸을 %s로 골라도 모두 메이트, 스테일메이트·기물 내줌 없음",
      (tie) => {
        const failed: string[] = [];
        for (const b of winningSample(piece, 97)) {
          const end = playGuide(piece, b, tie);
          if (end.result !== "mate")
            failed.push(
              `${name(b.wk)} ${name(b.bk)} ${name(b.p)}: ${end.result}`,
            );
        }
        expect(failed).toEqual([]);
      },
    );
  });
}
