// 배우기 단계의 상호작용 판정(조각 찾기·둘러보기·한 수 해 보기·고르기 문제). 화면 없이 시험한다.
// 칸은 엔진의 스티커 자리 번호(면 f, 칸 k → f*n*n + k)로 다룬다. 3D에서 누른 칸도, 펼친 그림에서 누른 칸도
// 이 번호로 바꿔 넘긴다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  pieceFaces,
  solvedCube,
} from "@game/cube-engine";
import { type PuzzleState, statesEqual } from "@game/puzzle-core";

import {
  type FaceLetter,
  FINGER_NOTATION,
  type FindTarget,
  type FingerToken,
  type Lesson,
  type LessonSetup,
  type LessonStep,
  type LookGoal,
  type MaskName,
  type PieceType,
} from "./types";

const FACE_INDEX: Record<FaceLetter, number> = {
  U: 0,
  R: 1,
  F: 2,
  D: 3,
  L: 4,
  B: 5,
};

/** 3D 장면의 법선 이름 → 면 번호 */
const NORMAL_FACE: Record<string, number> = {
  "+y": 0,
  "+x": 1,
  "+z": 2,
  "-y": 3,
  "-x": 4,
  "-z": 5,
};

/** 3D에서 누른 칸(조각 중심과 칸이 향하는 쪽) → 스티커 자리 번호. 없으면 null */
export function stickerAtHit(
  n: number,
  center: readonly [number, number, number],
  normal: string,
): number | null {
  const face = NORMAL_FACE[normal];
  if (face === undefined) return null;
  const i = cubeTopology(n).stickerAt([center[0], center[1], center[2]], face);
  return i < 0 ? null : i;
}

/** 스티커 자리가 든 조각: 종류와 지금 그 조각에 붙은 색(면 번호, 작은 것부터) */
export function pieceAtSticker(
  n: number,
  state: PuzzleState,
  sticker: number,
): { piece: number; type: PieceType; colors: number[] } | null {
  const topo = cubeTopology(n);
  const s = topo.stickers[sticker];
  if (!s) return null;
  const p = topo.pieces[s.piece];
  if (!p) return null;
  const colors = faceColors(n, state);
  const type: PieceType =
    p.kind === "corner"
      ? "corner"
      : p.kind === "edge" || p.kind === "wing"
        ? "edge"
        : "center";
  return {
    piece: s.piece,
    type,
    colors: p.stickers.map((i) => colors[i] as number).sort((a, b) => a - b),
  };
}

/** 누른 칸이 찾는 조각인가. 맞으면 그 조각 자리 번호(서로 다른 조각 세기용), 아니면 null */
export function findHit(
  n: number,
  state: PuzzleState,
  sticker: number,
  target: FindTarget,
): number | null {
  const got = pieceAtSticker(n, state, sticker);
  if (!got) return null;
  if (target.piece && got.type !== target.piece) return null;
  if (target.colors) {
    const want = target.colors.map((c) => FACE_INDEX[c]).sort((a, b) => a - b);
    if (want.length !== got.colors.length) return null;
    if (want.some((c, i) => c !== got.colors[i])) return null;
  }
  if (target.has?.some((c) => !got.colors.includes(FACE_INDEX[c]))) return null;
  if (target.at) {
    const want = target.at.map((c) => FACE_INDEX[c]).sort((a, b) => a - b);
    const faces = pieceFaces(n, got.piece).sort((a, b) => a - b);
    if (want.length !== faces.length) return null;
    if (want.some((c, i) => c !== faces[i])) return null;
  }
  return got.piece;
}

/** 칸이 든 자리가 닿은 면의 가운데 색(면 번호). 자리 찾기에서 틀렸을 때 「그 자리는 ○-○ 가운데 사이」로 알린다 */
export function slotCenterColors(
  n: number,
  state: PuzzleState,
  sticker: number,
): number[] {
  const topo = cubeTopology(n);
  const s = topo.stickers[sticker];
  if (!s || n % 2 === 0) return [];
  const colors = faceColors(n, state);
  const nn = n * n;
  const mid = (nn - 1) / 2;
  return pieceFaces(n, s.piece).map((f) => colors[f * nn + mid] as number);
}

/** 누른 칸이 틀렸을 때 부드럽게 알려 줄 말(그 칸이 무엇이었는지) */
export function pieceName(type: PieceType): string {
  return type === "center"
    ? "가운데 조각"
    : type === "edge"
      ? "모서리 조각"
      : "꼭짓점 조각";
}

/** 둘러보기: 면 `on`의 칸 절반 넘게가 색 `color`인가(큐브를 통째로 돌린 뒤 그 색 면이 어디 있는지) */
export function lookMet(
  n: number,
  state: PuzzleState,
  goal: LookGoal,
): boolean {
  const colors = faceColors(n, state);
  const nn = n * n;
  const f = FACE_INDEX[goal.on];
  const c = FACE_INDEX[goal.color];
  let same = 0;
  for (let k = 0; k < nn; k++) if (colors[f * nn + k] === c) same++;
  return same * 2 > nn;
}

/**
 * 한 수 해 보기: 지금 모양이 공식의 몇 수째 모양과 같은가.
 * `step`은 같은 모양인 가장 뒤의 수 차례(0 = 시작 그대로), 어느 것과도 다르면 -1. 끝 모양이면 `done`.
 * 결과 모양으로 보므로 R2를 R R로 쳐도 된다(가운데에 잠깐 「다름」이 보일 뿐이다).
 */
export function turnProgress(
  n: number,
  start: PuzzleState,
  alg: string,
  now: PuzzleState,
): { step: number; total: number; done: boolean } {
  const moves = parseMoves(n, alg);
  let s = start;
  const states = [s];
  for (const m of moves) {
    s = applyMoves(n, s, [m]);
    states.push(s);
  }
  let step = -1;
  for (let i = states.length - 1; i >= 0; i--) {
    if (statesEqual(states[i] as PuzzleState, now)) {
      step = i;
      break;
    }
  }
  return { step, total: moves.length, done: step === moves.length };
}

/** 사용자가 직접 해야 다음으로 넘어가는 단계인가(넘기기는 되지만 「다음」을 밝게 보이는 기준) */
export function stepIsActive(step: LessonStep): boolean {
  return (
    step.kind === "try" ||
    step.kind === "look" ||
    step.kind === "find" ||
    step.kind === "quiz" ||
    step.kind === "turn"
  );
}

/**
 * 시연·해보기가 아닌 단계(글·둘러보기·찾기·고르기)에 보일 큐브 모습.
 * 단계에 상황·마스크가 있으면 그것을, 없으면 그 단원에서 가장 가까운(뒤 먼저, 다음 앞) 단계의 마스크를
 * 맞춘 큐브에 씌운다. 그래서 단원 첫 글 단계에도 그 단원이 노리는 조각이 보인다.
 */
export function stepPicture(
  lesson: Lesson,
  index: number,
): { setup: LessonSetup | undefined; mask: MaskName | undefined } {
  const step = lesson.steps[index];
  if (!step) return { setup: undefined, mask: undefined };
  if (step.mask !== undefined) return { setup: step.setup, mask: step.mask };
  const steps = lesson.steps;
  for (let d = 1; d < steps.length; d++) {
    const after = steps[index + d];
    if (after?.mask !== undefined)
      return { setup: step.setup, mask: after.mask };
    const before = steps[index - d];
    if (before?.mask !== undefined)
      return { setup: step.setup, mask: before.mask };
  }
  return { setup: step.setup, mask: undefined };
}

/** 시연 단계에 「직접 해 보기」를 붙이나: 같은 상황·같은 공식의 해보기·한 수 해 보기가 단원에 이미 있으면 붙이지 않는다 */
export function demoOffersTurn(lesson: Lesson, index: number): boolean {
  const step = lesson.steps[index];
  if (step?.kind !== "demo" || !step.alg) return false;
  const key = (s: LessonStep) => `${JSON.stringify(s.setup ?? null)}|${s.alg}`;
  const k = key(step);
  return !lesson.steps.some(
    (s) => (s.kind === "try" || s.kind === "turn") && key(s) === k,
  );
}

/** 단계 자료가 제 종류에 필요한 것을 갖췄나(자료 시험용). 문제가 있으면 까닭, 없으면 null */
export function stepProblem(lesson: Lesson, step: LessonStep): string | null {
  const n = lesson.size;
  switch (step.kind) {
    case "find": {
      if (
        !step.find ||
        (!step.find.piece &&
          !step.find.colors &&
          !step.find.has &&
          !step.find.at)
      )
        return "찾을 조각이 없다";
      const start = setupState(n, step.setup);
      if (!start) return null;
      const all = cubeTopology(n).stickers.length;
      const hits = new Set<number>();
      for (let i = 0; i < all; i++) {
        const p = findHit(n, start, i, step.find);
        if (p !== null) hits.add(p);
      }
      if (hits.size < (step.count ?? 1)) return "찾을 조각이 큐브에 모자라다";
      return null;
    }
    case "quiz": {
      const q = step.quiz;
      if (!q) return "문제가 없다";
      if (q.choices.length < 2) return "고를 것이 둘보다 적다";
      if (q.answer < 0 || q.answer >= q.choices.length)
        return "답 차례가 틀렸다";
      return null;
    }
    case "turn":
    case "demo":
      return step.alg ? null : "공식이 없다";
    case "look": {
      if (!step.look) return null;
      const start = setupState(n, step.setup);
      if (start && lookMet(n, start, step.look)) return "처음부터 목표다";
      return null;
    }
    default:
      return null;
  }
}

/** 공식으로 만든 상황만(무작위 규칙은 null) */
function setupState(n: number, setup: LessonSetup | undefined) {
  if (!setup) return solvedCube(n);
  if ("alg" in setup)
    return applyMoves(n, solvedCube(n), parseMoves(n, setup.alg));
  return null;
}

// ── 핑거 트릭: 손가락 고르기 ─────────────────────────────

/**
 * 공식의 수 하나를 내고 그 수를 돌리는 손가락을 셋 중에서 고르게 한다(round마다 다음 수).
 * 틀린 보기 둘은 같은 공식에 나오는 다른 손가락을 먼저, 모자라면 표기 목록에서 채운다. 차례는 round로 정해진다.
 */
export function fingerQuiz(
  tokens: readonly string[],
  fingers: readonly string[],
  round: number,
): {
  index: number;
  move: string;
  answer: FingerToken;
  choices: FingerToken[];
} {
  const total = Math.max(1, Math.min(tokens.length, fingers.length));
  const index = ((round % total) + total) % total;
  const answer = fingers[index] as FingerToken;
  const pool: FingerToken[] = [];
  for (const f of [
    ...fingers,
    ...Object.keys(FINGER_NOTATION),
  ] as FingerToken[])
    if (f !== answer && f !== "rot" && !pool.includes(f)) pool.push(f);
  const wrong = [pool[round % pool.length], pool[(round + 1) % pool.length]];
  const choices = [answer, ...(wrong as FingerToken[])];
  // 답 자리를 돌려 가며 둔다
  const shift = round % choices.length;
  return {
    index,
    move: tokens[index] ?? "",
    answer,
    choices: [...choices.slice(shift), ...choices.slice(0, shift)],
  };
}
