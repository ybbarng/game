// 공식 연습 대결(docs/47 16-14). 모두 같은 10문제를 같은 차례로 받아 누가 먼저 다 치는지 겨룬다.
// 한 판 전체(몇 번째 문제, 이 문제의 큐브, 맞은 수·틀린 수, 콤보)를 하나의 상태로 두고 수 하나씩 순수 함수로 넘긴다.
// 그래서 대결 틀(`net/race`)이 받은 수 기록을 다시 적용하기만 하면 모든 기기가 같은 진행·정확도·콤보를 얻는다
// (남이 알린 진행·결과를 믿지 않는다). 화면과 떨어진 순수 모듈이다.
//
// 공정성: 문제 목록(상황 + 윗면 돌리기)과 시작 모양은 씨앗만으로 정해져 모두 같다. 따라 칠 공식은 사람마다 자기 키 배치에서
// 가장 싼 공식(내 공식이 먼저)이라 다를 수 있다. 그래서 따라 치기는 문제마다 첫 수 앞에 그 문제에서 칠 공식을 알리는
// 특별한 수(`declareVersus`)를 흘려보내고, 모든 기기가 그 공식이 이 시작 모양을 정말 목표까지 푸는지 확인한 뒤 그 공식으로
// 한 수씩 판정한다. 알리지 않았으면 흔한 공식(자료의 첫 공식)으로 본다(컴퓨터).
import {
  applyMove,
  applyMoves,
  type CubeMove,
  formatMove,
  isValidMove,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { goalMet } from "../learn/judge";
import { type Draw, drawRound } from "./deck";
import { FollowJudge } from "./follow";
import { boardFor, PRACTICE_N, type ProblemBoard, problemFor } from "./problem";
import { ROUND_SIZE } from "./round";
import { stageById } from "./stages";
import type { DrillCase, PracticeStage } from "./types";

export type VersusMode = "follow" | "see";

/** 방이 정하는 공식 연습 대결 규칙. 보고 치기만 `mode`를 적는다(따라 치기가 기본) */
export interface VersusRule {
  stage: string;
  mode?: "see";
}

export interface VersusTrack {
  readonly stage: string;
  readonly mode: VersusMode;
  /** 문제 목록(상황 + 시작 모양의 윗면 돌리기). 씨앗만으로 정해져 모두 같다 */
  readonly problems: readonly Draw[];
  /** 지금 문제 차례(0부터). 다 치면 problems.length */
  readonly index: number;
  /** 따라 치기: 이번 문제에서 칠 공식(앞 맞춤 빼고). 알리지 않았으면 null이고 흔한 공식으로 본다 */
  readonly alg: string | null;
  /** 이번 문제에 넣은 수(엔진 글, 틀린 수 포함). 따라 치기 판정을 다시 세운다 */
  readonly fed: readonly string[];
  /** 따라 치기: 맞은 낱말 수 합 */
  readonly hits: number;
  /** 따라 치기: 틀린 수 합 */
  readonly misses: number;
  /** 이번 문제에서 틀린 수 */
  readonly problemMisses: number;
  /** 보고 치기: 이번 문제에서 공식을 펼쳐 봤나 */
  readonly peeked: boolean;
  /** 보고 치기: 공식을 펼쳐 본 문제 수 */
  readonly peeks: number;
  readonly combo: number;
  readonly best: number;
  /** 수 밖으로 큐브가 바뀐 횟수(새 문제, 반 바퀴 반쪽 되돌림). 화면이 장면을 다시 칠할 열쇠 */
  readonly jumps: number;
  /** 마지막 수가 틀린 수였으면 그 낱말 차례(아니면 null) */
  readonly wrong: number | null;
}

export type VersusState = PuzzleState & { readonly practice: VersusTrack };

export function ruleOk(rule: unknown): rule is VersusRule {
  if (typeof rule !== "object" || rule === null) return false;
  const r = rule as VersusRule;
  return (
    typeof r.stage === "string" &&
    stageById(r.stage) !== undefined &&
    (r.mode === undefined || r.mode === "see")
  );
}

export const modeOf = (rule: VersusRule): VersusMode => rule.mode ?? "follow";

/**
 * 씨앗 → 그 판의 문제 목록. 기록 없이 씨앗만 넘기므로 같은 씨앗이면 누구나 같은 상황·같은 차례·같은 윗면 돌리기다
 * (윗면을 돌려 내는 CFOP 단계는 모든 문제에 씨앗대로 붙인다). 공식은 목록에 없다: 사람마다 자기 공식을 그 모양에 맞춰 친다
 */
export function versusProblems(stage: PracticeStage, seed: number): Draw[] {
  return drawRound(
    stage.cases.map((c) => c.id),
    { seed, auf: stage.auf, everyTurn: true, count: ROUND_SIZE },
  );
}

function stageOf(track: VersusTrack): PracticeStage {
  const stage = stageById(track.stage);
  if (!stage) throw new RangeError("모르는 단계");
  return stage;
}

function caseIn(stage: PracticeStage, p: Draw): DrillCase {
  const c = stage.cases.find((x) => x.id === p.caseId);
  if (!c) throw new RangeError("모르는 상황");
  return c;
}

/**
 * 지금 문제의 판(공식 낱말·시작 모양·가리기·목표). 공식은 알린 공식, 아직 알리지 않았으면 `mine`(이 기기 사람이 칠 공식),
 * 그것도 없으면 흔한 공식이다. 어느 공식이든 시작 모양은 같다
 */
export function versusBoard(
  track: VersusTrack,
  mine?: string | null,
): ProblemBoard | null {
  const p = track.problems[track.index];
  if (!p) return null;
  const stage = stageOf(track);
  const c = caseIn(stage, p);
  const want = track.alg ?? mine ?? null;
  const problem =
    (want !== null ? problemFor(stage, c, p.turn, want) : null) ??
    problemFor(stage, c, p.turn, c.algs[0] as string);
  if (!problem) throw new RangeError("흔한 공식이 그 모양을 풀지 못한다");
  return boardFor(stage, c, problem);
}

/**
 * 따라 치기: 이번 문제에서 칠 공식을 알린다(첫 수 앞에 한 번). 그 공식이 이 시작 모양을 목표까지 풀지 못하거나, 보고 치기거나,
 * 이미 쳤거나 알렸으면 throw(대결 틀이 「둘 수 없는 수」로 거절한다)
 */
export function declareVersus(state: PuzzleState, alg: string): VersusState {
  const t = trackOf(state);
  if (t.mode !== "follow" || versusOver(t) || t.fed.length > 0 || t.alg)
    throw new RangeError("알릴 수 없다");
  const stage = stageOf(t);
  const p = t.problems[t.index] as Draw;
  if (!problemFor(stage, caseIn(stage, p), p.turn, alg))
    throw new RangeError("그 모양을 풀지 못하는 공식");
  return withTrack(state, { ...t, alg });
}

/** 지금 문제의 상황 */
export function versusCase(track: VersusTrack): DrillCase | undefined {
  const p = track.problems[track.index];
  return p ? stageOf(track).cases.find((x) => x.id === p.caseId) : undefined;
}

function withTrack(cube: PuzzleState, practice: VersusTrack): VersusState {
  return { perm: cube.perm, twist: cube.twist, practice };
}

export function versusStart(
  stage: PracticeStage,
  mode: VersusMode,
  problems: readonly Draw[],
): VersusState {
  const track: VersusTrack = {
    stage: stage.id,
    mode,
    problems,
    index: 0,
    alg: null,
    fed: [],
    hits: 0,
    misses: 0,
    problemMisses: 0,
    peeked: false,
    peeks: 0,
    combo: 0,
    best: 0,
    jumps: 0,
    wrong: null,
  };
  const board = versusBoard(track);
  if (!board) throw new RangeError("문제가 없다");
  return withTrack(board.start, track);
}

export function trackOf(state: PuzzleState): VersusTrack {
  const t = (state as VersusState).practice;
  if (!t) throw new RangeError("공식 연습 상태가 아니다");
  return t;
}

export const versusOver = (t: VersusTrack): boolean =>
  t.index >= t.problems.length;

/** 이번 문제의 따라 치기 판정을 넣은 수로 다시 세운다(같은 수 → 같은 판정) */
function judgeOf(t: VersusTrack, board: ProblemBoard): FollowJudge {
  const j = new FollowJudge(PRACTICE_N, board.tokens);
  for (const m of t.fed) j.feed(parseMoves(PRACTICE_N, m)[0] as CubeMove);
  return j;
}

/** 따라 치기에서 지금 칠 낱말 차례(다 쳤거나 보고 치기면 낱말 수) */
export function versusAt(t: VersusTrack): number {
  const board = versusBoard(t);
  if (!board) return 0;
  if (t.mode === "see") return board.tokens.length;
  return judgeOf(t, board).index;
}

/** 문제 하나를 끝냈다: 콤보를 세고 다음 문제의 시작 모양으로 */
function nextProblem(
  t: VersusTrack,
  clean: boolean,
  solvedCube: PuzzleState,
): VersusState {
  const combo = clean ? t.combo + 1 : 0;
  const next: VersusTrack = {
    ...t,
    index: t.index + 1,
    alg: null,
    fed: [],
    problemMisses: 0,
    peeked: false,
    combo,
    best: Math.max(t.best, combo),
    jumps: t.jumps + 1,
    wrong: null,
  };
  const board = versusBoard(next);
  // 다 쳤으면 마지막 문제를 맞춘 모습 그대로 둔다(큐브는 보이기만 한다)
  return withTrack(board ? board.start : solvedCube, next);
}

/**
 * 수 하나. 둘 수 없는 수거나 판이 끝났으면 throw(대결 틀이 「둘 수 없는 수」로 거절한다).
 * - 따라 치기: 틀린 수는 큐브에 넣지 않고 틀림으로 센다(반 바퀴를 나눠 치다 틀리면 먼저 넣은 반쪽도 되돌린다). 맞은 수만 넣는다.
 *   공식을 끝까지 치면 다음 문제. 틀림 없이 친 문제만 콤보를 잇는다.
 * - 보고 치기: 어느 수든 큐브에 넣고, 단계 목표 모양이 되면 다음 문제(다른 공식으로 풀어도 된다). 펼쳐 보지 않은 문제만 콤보를 잇는다.
 */
export function applyVersus(state: PuzzleState, move: CubeMove): VersusState {
  const t = trackOf(state);
  if (versusOver(t)) throw new RangeError("끝남");
  if (!isValidMove(PRACTICE_N, move)) throw new RangeError("둘 수 없는 수");
  const board = versusBoard(t) as ProblemBoard;
  const text = formatMove(PRACTICE_N, move);
  if (t.mode === "see") {
    const cube = applyMove(PRACTICE_N, state, move);
    if (goalMet(PRACTICE_N, cube, board.goal))
      return nextProblem(t, !t.peeked, cube);
    return withTrack(cube, { ...t, fed: [...t.fed, text], wrong: null });
  }
  const judge = judgeOf(t, board);
  const at = judge.index;
  const step = judge.feed(move);
  if (!step) throw new RangeError("끝남");
  const fed = [...t.fed, text];
  if (step.kind === "miss") {
    const cube = applyMoves(PRACTICE_N, state, step.undo);
    return withTrack(cube, {
      ...t,
      fed,
      misses: t.misses + 1,
      problemMisses: t.problemMisses + 1,
      combo: 0,
      jumps: step.undo.length > 0 ? t.jumps + 1 : t.jumps,
      wrong: at,
    });
  }
  const cube = applyMove(PRACTICE_N, state, move);
  const hits = step.kind === "partial" ? t.hits : t.hits + 1;
  if (step.kind === "done")
    return nextProblem({ ...t, hits }, t.problemMisses === 0, cube);
  return withTrack(cube, { ...t, fed, hits, wrong: null });
}

/** 보고 치기: 이번 문제의 공식을 펼친다(그 문제는 콤보에서 빠진다). 따라 치기·이미 펼쳤으면 throw */
export function peekVersus(state: PuzzleState): VersusState {
  const t = trackOf(state);
  if (t.mode !== "see" || t.peeked || versusOver(t))
    throw new RangeError("펼칠 수 없다");
  return withTrack(state, {
    ...t,
    peeked: true,
    peeks: t.peeks + 1,
    combo: 0,
  });
}

/** 0~1 진행(맞춘 문제 + 이번 문제에서 친 낱말 몫) */
export function versusProgress(t: VersusTrack): number {
  const total = t.problems.length;
  if (total === 0) return 1;
  if (versusOver(t)) return 1;
  let part = 0;
  if (t.mode === "follow") {
    const board = versusBoard(t);
    if (board && board.tokens.length > 0)
      part = judgeOf(t, board).index / board.tokens.length;
  }
  return (t.index + part) / total;
}

export interface VersusSummary {
  /** 0~1. 따라 치기는 맞은 수 / 친 수(틀린 수 포함), 보고 치기는 펼쳐 보지 않고 맞춘 문제 / 맞춘 문제 */
  accuracy: number;
  bestCombo: number;
  /** 맞춘 문제 수 */
  solved: number;
}

export function versusSummary(t: VersusTrack): VersusSummary {
  const solved = Math.min(t.index, t.problems.length);
  const accuracy =
    t.mode === "follow"
      ? t.hits + t.misses === 0
        ? 0
        : t.hits / (t.hits + t.misses)
      : solved === 0
        ? 0
        : (solved - Math.min(solved, t.peeks - (t.peeked ? 1 : 0))) / solved;
  return { accuracy, bestCombo: t.best, solved };
}
