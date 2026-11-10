import { sha256Hex } from "@game/baseball-engine";
import {
  type CubeMove,
  formatMove,
  isRotation,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { PRACTICE_N } from "../practice/problem";
import { stageById } from "../practice/stages";
import {
  applyVersus,
  modeOf,
  peekVersus,
  trackOf,
  type VersusRule,
  versusOver,
  versusProblems,
  versusProgress,
  versusStart,
} from "../practice/versus";
import {
  BOT_NO_PLAN,
  type CubeAct,
  type CubeRaceGame,
  isItemAct,
  isPeekAct,
  PEEK_TEXT,
  stateHash,
} from "./race-game";

/**
 * 공식 연습 대결을 대결 틀(`net/race`)에 붙이는 어댑터(docs/47 16-14).
 *
 * 씨앗(모두의 약속 후 공개로 정한 글) → 해시로 uint32 → 그 단계의 10문제(`versusProblems`, 기록 없이 씨앗만). 한 판의 상태는
 * 지금 문제의 큐브 + 진행(`VersusState`)이고, 수마다 `applyVersus`로 넘긴다. 대결 틀이 받은 수 기록을 모든 기기에서 다시
 * 적용하므로 진행·정확도·콤보는 남이 알린 값이 아니라 각 기기가 계산한 값이다. 다 친 시각은 다른 큐브 대결과 같은
 * 증인 하한으로 확인한다(docs/47 9-2). 문제 목록과 첫 시작 모양을 지문으로 실어 모두 같은 문제를 받았는지 맞춰 본다.
 */

/** 대결 씨앗(글) → 출제 씨앗(uint32) */
export function practiceSeed(seed: string): number {
  return Number.parseInt(sha256Hex(`cube-practice|${seed}`).slice(0, 8), 16);
}

export function createPracticeRaceGame(rule: VersusRule): CubeRaceGame {
  const stage = stageById(rule.stage);
  if (!stage) throw new RangeError("모르는 단계");
  const mode = modeOf(rule);
  const n = PRACTICE_N;
  const startOf = (seed: string) =>
    versusStart(stage, mode, versusProblems(stage, practiceSeed(seed)));
  return {
    id: "cube-practice",
    n,
    event: "333",
    practice: mode === "see" ? { stage: stage.id, mode } : { stage: stage.id },
    scrambleFor: () => undefined,
    startState: (seed) => startOf(seed),
    startFingerprint(seed) {
      const s = startOf(seed);
      const problems = trackOf(s)
        .problems.map((p) => `${p.caseId}=${p.alg}`)
        .join(";");
      return `practice|${stage.id}|${mode}|${problems}|${stateHash(s)}`;
    },
    apply(state, move) {
      if (isPeekAct(move)) return peekVersus(state);
      if (isItemAct(move)) throw new RangeError("둘 수 없는 수");
      return applyVersus(state, move);
    },
    isSolved: (state) => versusOver(trackOf(state)),
    progress: (state) => versusProgress(trackOf(state)),
    retireReasons: [BOT_NO_PLAN],
    // 큐브 돌리기(x·y·z)와 공식 보기는 수로 세지 않는다
    isTurn(text) {
      if (text === PEEK_TEXT) return false;
      const move = parseMoves(n, text)[0];
      return move !== undefined && !isRotation(n, move);
    },
    encodeMove: (move: CubeAct) =>
      isPeekAct(move)
        ? PEEK_TEXT
        : isItemAct(move)
          ? move.text
          : formatMove(n, move),
    decodeMove(text) {
      if (text === PEEK_TEXT) {
        if (mode !== "see") throw new Error("따라 치기에는 공식 보기가 없다");
        return { peek: true };
      }
      const moves = parseMoves(n, text);
      if (moves.length !== 1) throw new Error("수 하나가 아니다");
      return moves[0] as CubeMove;
    },
  };
}

/** 그 상태가 공식 연습 대결 상태인가 */
export function isPracticeState(state: PuzzleState | undefined): boolean {
  return !!state && "practice" in state;
}
