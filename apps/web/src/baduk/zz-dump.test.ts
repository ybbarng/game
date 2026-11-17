import { writeFileSync } from "node:fs";

import {
  type BadukState,
  legalPoints,
  solveEndgame,
  step,
} from "@game/baduk-engine";
import { it } from "vitest";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  endgameArea,
  judgeMove,
  koPointOf,
  puzzleState,
  solutionOf,
} from "./study";
import { explainSolved } from "./study-explain";

function solve(p: BadukPuzzle): string[] {
  let state: BadukState = puzzleState(p);
  let move = solutionOf(p);
  for (let i = 0; i < 40; i++) {
    const v = judgeMove(p, state, move, i);
    if (v === "wrong") return [`(틀림 ${i})`];
    const before = state.board;
    const mine = step(state, 0, { type: "place", at: move });
    if (!mine.ok) return [`(못 둠 ${i})`];
    state = mine.state;
    if (v === "solved") return explainSolved(p, before, move, i + 1);
    const theirs = step(state, 1, defenseFor(p, state, i));
    if (!theirs.ok) return ["(백 못 둠)"];
    state = theirs.state;
    if (p.kind === "capture") {
      const next = legalPoints(state).find(
        (m) => judgeMove(p, state, m, i + 1) !== "wrong",
      );
      if (next === undefined) return ["(다음 수 없음)"];
      move = next;
    } else if (p.kind === "endgame") {
      const best = solveEndgame(state.board, endgameArea(p, state), 1).best;
      move = best.find((m) => m !== null) as number;
    } else if (p.kind === "kofight") move = koPointOf(p);
  }
  return ["(끝 안 남)"];
}

it("dump", () => {
  const out: string[] = [];
  const t0 = performance.now();
  for (const s of BADUK_PUZZLE_SETS) {
    out.push(`## ${s.id}`);
    for (const p of s.puzzles)
      out.push(`- ${p.id}`, ...solve(p).map((l) => `    ${l}`));
  }
  out.push(`ms ${Math.round(performance.now() - t0)}`);
  writeFileSync(process.env.DUMP_OUT ?? "/dev/null", out.join("\n"));
}, 60000);
