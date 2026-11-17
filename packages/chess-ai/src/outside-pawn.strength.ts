/*
 * 바깥 패스 폰 문제 증명 확인(docs/26 6절). 수십 초가 걸려 `pnpm --filter @game/chess-ai bench`로 돈다.
 * 기록(`outside-pawn-proofs.json`)마다 후보 증명을 다시 세워 기록과 같은 승급 판 묶음인지 보고,
 * 그 승급 판을 모두 퀸이 된 뒤 끝까지 읽기(`EndingProver`)로 확인한다. 하나라도 확인되지 않으면 실패한다.
 *
 * 기록 새로 만들기: 문제를 더하거나 판정을 바꾸면 `UPDATE=1`을 주고 돌린다. 기록의 판·정답마다
 * 처음부터 되풀이 증명(`provePawnPuzzle`, 확인까지 함)을 해서 새 기록 JSON을 찍는다. 그것으로 기록 파일을 바꾼다.
 * 문제를 더할 때는 기록 파일에 `{ "fen", "answer", "refuted": [], "leaves": 0, "digest": "" }`를 먼저 더한다.
 */
import { parseFen, sanToMove } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { OUTSIDE_PAWN_PROOFS } from "./outside-pawn-proofs";
import { toPawnEnding } from "./pawn-ending";
import {
  EndingProver,
  type PawnProofRecord,
  pawnPuzzleCandidate,
  promotionDigest,
  provePawnPuzzle,
} from "./queen-ending";

// 확인 결과를 사람이 읽게 찍는다(다른 bench와 같다)
declare const console: { log(...args: unknown[]): void };
declare const performance: { now(): number };
declare const process: { env: Record<string, string | undefined> };

/** 정답 수를 둔 뒤 읽는 걸음(반수). 웹 시험 `outside-suite.ts`와 같다 */
const PLIES = 27;

function puzzleOf(r: Pick<PawnProofRecord, "fen" | "answer">) {
  const pos = parseFen(r.fen);
  const s = toPawnEnding(pos.board, pos.turn, pos.ep);
  const move = sanToMove(pos, r.answer);
  if (!s || !move) throw new Error(`킹과 폰 문제가 아니다: ${r.fen}`);
  return {
    s,
    answer: { from: move.from, to: move.to, san: r.answer, fen: r.fen },
  };
}

const UPDATE = process.env.UPDATE === "1";

describe.runIf(!UPDATE)("바깥 패스 폰 증명 확인", () => {
  it.each(OUTSIDE_PAWN_PROOFS.map((r) => [r.answer, r] as const))(
    "%s: 후보 증명의 승급 판이 모두 끝까지 읽혀 확인된다",
    (_san, record) => {
      const started = performance.now();
      const { s, answer } = puzzleOf(record);
      const cand = pawnPuzzleCandidate(
        s,
        answer,
        PLIES,
        new Set(record.refuted),
      );
      expect(cand.unproved).toBeNull();
      expect(cand.leaves.length).toBe(record.leaves);
      expect(promotionDigest(cand.leaves.map((l) => l.key))).toBe(
        record.digest,
      );
      const prover = new EndingProver();
      const unconfirmed = cand.leaves
        .filter(
          (l) => !(l.goal === "wins" ? prover.wins(l.m) : prover.holds(l.m)),
        )
        .map((l) => l.key);
      expect(unconfirmed).toEqual([]);
      console.log(
        `${record.fen} ${record.answer}: 승급 판 ${cand.leaves.length}개 확인, 읽은 판 ${prover.nodes}, ${((performance.now() - started) / 1000).toFixed(1)}초`,
      );
    },
  );
});

describe.runIf(UPDATE)("바깥 패스 폰 증명 기록 새로 만들기", () => {
  it("기록의 판마다 처음부터 되풀이 증명해 새 기록을 찍는다", () => {
    const records = OUTSIDE_PAWN_PROOFS.map((r) => {
      const { s, answer } = puzzleOf(r);
      const proved = provePawnPuzzle(s, answer, PLIES);
      if (!proved) throw new Error(`증명하지 못했다: ${r.fen} ${r.answer}`);
      console.log(
        `${r.fen} ${r.answer}: 승급 판 ${proved.leaves}개, 증명 못 한 승급 판 ${proved.refuted.length}개`,
      );
      return proved;
    });
    console.log(`새 기록:\n${JSON.stringify(records, null, 2)}`);
  });
});
