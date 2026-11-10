// 공식 연습 대결의 컴퓨터(docs/47 16-14). 단계마다 한 수 시간·문제를 읽는 시간·틀릴 확률을 정해 공식을 친다.
// 계획(수와 시각)은 문제·단계·씨앗만으로 정해지는 순수 함수라, 다른 기기도 같은 계획을 다시 계산해
// 「컴퓨터가 계획대로 쳤나」를 맞춰 볼 수 있다(`checkVersusBotRun`). 화면과 떨어진 순수 모듈이다.
import { type BotLevel, fitLevel, readBotSkill } from "@game/cube-ai";
import {
  type CubeMove,
  createRngFromSeed,
  formatMove,
  invertMove,
  parseMoves,
} from "@game/cube-engine";
import { nextInt } from "@game/mighty-engine";

import { PRACTICE_N } from "./problem";
import {
  applyVersus,
  trackOf,
  type VersusState,
  versusAt,
  versusBoard,
  versusOver,
} from "./versus";

export interface VersusBotSpeed {
  /** 낱말 하나를 치는 시간(ms, 가운데 값) */
  moveMs: number;
  /** 새 문제를 읽고 첫 수까지(ms, 가운데 값). 틀린 뒤 다시 보는 시간은 이것의 절반 */
  thinkMs: number;
  /** 낱말마다 틀릴 확률(0~1) */
  missRate: number;
}

/**
 * 단계별 빠르기(2026-11-10). 사람이 키보드로 공식을 따라 칠 때를 어림했다: 처음 배운 사람은 낱말을 읽고 키를 찾느라
 * 1초 남짓, 익숙한 사람은 0.3초 안팎, 손에 붙은 사람은 0.2초 안쪽. 2층(8수) 10문제면 입문 약 1분 50초, 초보 약 1분 10초,
 * 중수 약 45초, 고수 약 28초, 초고수 약 18초(틀림 포함 어림)
 */
export const VERSUS_BOT_SPEED: Readonly<Record<BotLevel, VersusBotSpeed>> = {
  novice: { moveMs: 1100, thinkMs: 1500, missRate: 0.15 },
  casual: { moveMs: 700, thinkMs: 1000, missRate: 0.1 },
  club: { moveMs: 450, thinkMs: 700, missRate: 0.06 },
  fast: { moveMs: 280, thinkMs: 500, missRate: 0.03 },
  pro: { moveMs: 170, thinkMs: 350, missRate: 0.01 },
};

/** 보고 치기는 공식을 떠올려야 해서 문제를 읽는 시간을 이만큼 늘린다 */
export const SEE_THINK_FACTOR = 1.6;

/** 단계 글(`RoomPlayer.bot`) → 단계. 「내 실력에 맞춤」은 3×3 목표 시간에 가장 가까운 단계, 옛 글은 초보. 모르는 글은 null */
export function versusBotLevel(text: string): BotLevel | null {
  const skill = readBotSkill(text);
  if (!skill) return null;
  if (skill.kind === "level") return skill.level;
  if (skill.kind === "fit") return fitLevel(3, skill.targetMs).level;
  return "casual";
}

export interface VersusBotMove {
  move: string;
  /** 풀림 기준 ms */
  at: number;
}

/** 틀린 수로 칠 후보(면 돌리기) */
const WRONG = ["U", "U'", "R", "R'", "F", "F'", "D", "L", "B"].map(
  (m) => parseMoves(PRACTICE_N, m)[0] as CubeMove,
);

/** 0.7~1.3배로 흔든 시간(정수 ms) */
function jitter(rng: ReturnType<typeof createRngFromSeed>, ms: number): number {
  return Math.round(ms * (0.7 + nextInt(rng, 601) / 1000));
}

/**
 * 컴퓨터가 칠 수와 시각. 문제마다 읽는 시간 뒤 공식 낱말을 차례로 치고, 낱말마다 `missRate`로 먼저 틀린 수를 친다.
 * 따라 치기의 틀린 수는 큐브에 들지 않으니 잠깐 다시 보고 맞는 수를 친다. 보고 치기는 틀린 수가 큐브에 들어가므로
 * 거꾸로 돌려 되돌린 뒤 친다. 같은 시작 상태·빠르기·씨앗이면 같은 계획이다
 */
export function versusBotPlan(
  start: VersusState,
  speed: VersusBotSpeed,
  seed: number,
): VersusBotMove[] {
  const rng = createRngFromSeed(seed);
  const out: VersusBotMove[] = [];
  let state = start;
  let t = 0;
  let index = -1;
  const think = (ms: number) => {
    t += jitter(rng, ms);
  };
  const play = (move: CubeMove) => {
    out.push({ move: formatMove(PRACTICE_N, move), at: t });
    state = applyVersus(state, move);
  };
  // 낱말 수 상한(멈춘 계획을 잡는 안전장치): 10문제 × (낱말 + 틀린 수) 넉넉히
  for (let guard = 0; guard < 2000; guard++) {
    const track = trackOf(state);
    if (versusOver(track)) return out;
    const board = versusBoard(track);
    if (!board) return out;
    if (track.index !== index) {
      index = track.index;
      think(
        track.mode === "see" ? speed.thinkMs * SEE_THINK_FACTOR : speed.thinkMs,
      );
    }
    // 보고 치기도 컴퓨터는 공식을 안다: 친 수(틀린 수를 되돌린 뒤)를 공식 차례로 센다
    const at =
      track.mode === "see" ? seeAt(track.fed, board.tokens) : versusAt(track);
    const token = board.tokens[at];
    if (token === undefined) return out;
    const right = parseMoves(PRACTICE_N, token)[0] as CubeMove;
    if (nextInt(rng, 1000) < Math.round(speed.missRate * 1000)) {
      const wrong = pickWrong(right, nextInt(rng, WRONG.length));
      think(speed.moveMs);
      play(wrong);
      if (track.mode === "see") {
        think(speed.thinkMs / 2);
        play(invertMove(wrong));
      } else think(speed.thinkMs / 2);
      continue;
    }
    think(speed.moveMs);
    play(right);
  }
  return out;
}

/** 보고 치기에서 공식 몇 낱말째까지 쳤나(틀린 수와 그것을 되돌린 수는 짝으로 빼고 센다) */
function seeAt(fed: readonly string[], tokens: readonly string[]): number {
  let at = 0;
  let k = 0;
  while (k < fed.length) {
    const m = fed[k] as string;
    if (at < tokens.length && sameMove(m, tokens[at] as string)) {
      at++;
      k++;
      continue;
    }
    // 틀린 수 + 되돌린 수
    k += 2;
  }
  return at;
}

function sameMove(text: string, token: string): boolean {
  const a = parseMoves(PRACTICE_N, text)[0];
  const b = parseMoves(PRACTICE_N, token)[0];
  return !!a && !!b && formatMove(PRACTICE_N, a) === formatMove(PRACTICE_N, b);
}

/** 맞는 수와 다른 면 돌리기 하나(같은 축·같은 층이면 반쪽 맞춤이 될 수 있어 피한다) */
function pickWrong(right: CubeMove, k: number): CubeMove {
  for (let d = 0; d < WRONG.length; d++) {
    const w = WRONG[(k + d) % WRONG.length] as CubeMove;
    if (w.axis !== right.axis || w.from !== right.from) return w;
  }
  return WRONG[0] as CubeMove;
}

/** 시각 비교 허용 오차(ms). 계획 시각은 정수라 뺄셈 오차만 둔다 */
export const VERSUS_BOT_TOLERANCE_MS = 1;

/**
 * 컴퓨터가 계획대로 쳤나(다른 기기가 다시 계산해 본다). 수 차례가 계획의 앞부분과 같고, 적힌 시각 − 계획 시각이
 * 모든 수에서 0 이상의 같은 값이어야 한다(계획을 늦게 시작한 만큼). 방장이 컴퓨터를 계획보다 빨리 치게 하고 시각을
 * 작게 적으면 드러난다. `complete`면 계획을 끝까지 쳤어야 한다(다 쳤다고 알린 컴퓨터)
 */
export function checkVersusBotRun(
  plan: readonly VersusBotMove[],
  log: readonly { m: string; t: number }[],
  complete: boolean,
): boolean {
  if (log.length > plan.length) return false;
  if (complete && log.length !== plan.length) return false;
  let offset: number | null = null;
  for (let k = 0; k < log.length; k++) {
    const p = plan[k] as VersusBotMove;
    const l = log[k] as { m: string; t: number };
    if (p.move !== l.m) return false;
    const d = l.t - p.at;
    if (d < -VERSUS_BOT_TOLERANCE_MS) return false;
    if (offset === null) offset = d;
    else if (Math.abs(d - offset) > VERSUS_BOT_TOLERANCE_MS) return false;
  }
  return true;
}
