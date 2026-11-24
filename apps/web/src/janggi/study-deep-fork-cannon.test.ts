import { negamax } from "@game/janggi-ai";
import {
  applyMove,
  kingsFacing,
  legalMoves,
  type Move,
  pointName,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { JANGGI_PUZZLE_SETS } from "./puzzles";
import { parseMove, puzzleState } from "./study";

/*
 * 양수겸장·포 길 열기 묶음을 study-deep.test.ts와 같은 방법으로 더 깊이(4수) 다시 읽는다.
 * study.test.ts는 두 수 앞만 읽어, 세 수째에 다른 수가 따라잡는 판(2026-11-25까지의 포 길 열기 2·5·6번)을 놓쳤다.
 * 무거운 확인이라 파일을 나눠 다른 시험과 함께 돈다
 */
const KINDS = new Set(["fork", "cannon"]);
const rows = JANGGI_PUZZLE_SETS.flatMap((s) => s.puzzles)
  .filter((p) => KINDS.has(p.kind))
  .map((p) => [p.id, p] as const);
const name = (m: Move) => `${pointName(m.from)}-${pointName(m.to)}`;

describe("양수겸장·포 길 열기(4수 읽기)", () => {
  it.each(rows)(
    "%s: 정답 뒤 빅장이 아니고, 4수를 읽어도 정답과 맞먹는 다른 수가 없다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const solution = parseMove(p.solution);
      expect(kingsFacing(applyMove(board, solution))).toBe(false);
      const score = (m: Move) =>
        -negamax(applyMove(board, m), "h", 3, -Infinity, Infinity, {
          bikjangScore: true,
        });
      const best = score(solution);
      const rivals = legalMoves(board, "c")
        .filter((m) => name(m) !== p.solution)
        .filter((m) => score(m) >= best - 50)
        .map(name);
      expect(rivals).toEqual([]);
    },
  );
});
