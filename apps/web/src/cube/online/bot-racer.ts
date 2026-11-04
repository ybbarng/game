import { sha256Hex } from "@game/baseball-engine";
import {
  BOT_LEVELS,
  type BotLevel,
  type BotPlan,
  botPlan,
} from "@game/cube-ai";
import {
  type CubeMove,
  formatMove,
  isRotation,
  parseMoves,
} from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { RaceSession } from "@/net/race/race-session";
import { BOT_NO_PLAN } from "./race-game";

/**
 * 대결에 든 컴퓨터(docs/47 9-1·10절). 방장 기기가 돌리지만 대결 틀에는 다른 사람과 똑같이 한 참가자다
 * (약속·공개·수 흘려보내기·맞춤 알림을 그대로 한다).
 *
 * 수와 시각은 `botPlan(단계, 크기, 시작 상태, 씨앗)`으로 정해진다. 씨앗은 대결 씨앗과 컴퓨터 아이디에서 나오므로
 * 다른 기기도 단계만 알면 같은 계획을 다시 계산해 "컴퓨터가 계획대로 두었나"를 확인할 수 있다(`checkBotRun`).
 */

/** 컴퓨터 계획의 씨앗(uint32) */
export function botSeed(raceSeed: string, botId: string): number {
  return Number.parseInt(
    sha256Hex(`cube-bot|${raceSeed}|${botId}`).slice(0, 8),
    16,
  );
}

/** 이 크기에 컴퓨터가 있나(2×2~5×5) */
export function botSupports(n: number): boolean {
  return n >= 2 && n <= 5;
}

/**
 * 계획을 끝내 만들지 못한 컴퓨터가 그 판을 기권하는 까닭. 고른 단계의 3×3 해법이 실패하면 `botPlan`이
 * 먼저 초고수 해로 대신하므로, 이것은 그것마저 실패했거나 4×4·5×5 축소법이 돌려 쥐어도 막혔을 때다
 * (축소법은 모든 단계가 함께 써서 초고수로 대신해도 똑같이 막힌다). 글은 `race-game.ts`에 둔다(받는 쪽 까닭 목록)
 */
export { BOT_NO_PLAN };

/**
 * 계획 만들기. 제품은 웹 워커(`planInWorker`, 해법기 표를 처음 만들 때 1초 넘게 걸려 화면이 멈추지 않게),
 * 시험은 같은 스레드에서 바로 만든다. 못 만들면 던지거나 거절한다(그 컴퓨터는 그 판 기권)
 */
export type PlanFn = (
  level: BotLevel,
  n: number,
  start: PuzzleState,
  seed: number,
) => BotPlan | Promise<BotPlan>;

/** 같은 스레드에서 바로(시험·워커를 못 쓸 때) */
export const planHere: PlanFn = (level, n, start, seed) =>
  botPlan(level, n, start, seed);

export interface AttachBotInit {
  session: RaceSession<CubeMove, PuzzleState>;
  id: string;
  level: BotLevel;
  n: number;
  clock: Clock;
  plan?: PlanFn;
  /** 그 시도의 계획을 받았다(화면 표시·시험용) */
  onPlanned?: (attempt: number) => void;
}

/**
 * 대결 하나에 컴퓨터를 붙인다. 떼는 함수를 돌려준다.
 * 계획은 씨앗을 안 순간(살펴보기 동안) 만들기 시작한다. 풀린 뒤에야 계획이 오면 그만큼 늦게 시작한 것으로 친다
 * (모든 시각을 늦은 만큼 미룬다. 한꺼번에 몰아 두지 않는다)
 */
export function attachBot(init: AttachBotInit): () => void {
  const { session, id, level, n, clock } = init;
  const planOf = init.plan ?? planHere;
  let attempt = -1;
  let moves: CubeMove[] | null = null;
  let times: number[] = [];
  /** 계획이 늦게 와서 미룬 시간(ms) */
  let delay = 0;
  let scheduled = false;
  let cancel: (() => void) | undefined;
  let stopped = false;

  const step = (k: number, j: number) => {
    cancel = undefined;
    if (stopped || k !== attempt || !moves) return;
    const snap = session.snapshot();
    if (snap.attempt !== k || snap.phase !== "race") return;
    // 계획 시각(+ 늦게 온 만큼)으로 적는다. 다른 기기가 계획과 시각까지 맞춰 본다(`checkBotRun`)
    const r = session.play(moves[j] as CubeMove, (times[j] as number) + delay);
    if (!r.ok || r.solved || j + 1 >= moves.length) return;
    schedule(k, j + 1);
  };
  const schedule = (k: number, j: number) => {
    const elapsed = session.snapshot().elapsed ?? 0;
    cancel = clock.after(
      Math.max(0, (times[j] as number) + delay - elapsed),
      () => step(k, j),
    );
  };
  const maybeStart = () => {
    const snap = session.snapshot();
    if (stopped || scheduled || !moves || snap.attempt !== attempt) return;
    if (snap.phase !== "race") return;
    scheduled = true;
    if (moves.length > 0) schedule(attempt, 0);
  };
  const accept = (k: number, plan: BotPlan) => {
    if (stopped || k !== attempt) return;
    moves = plan.moves.map((m) => parseMoves(n, m.move)[0] as CubeMove);
    times = plan.moves.map((m) => m.at);
    const snap = session.snapshot();
    delay = snap.phase === "race" ? (snap.elapsed ?? 0) : 0;
    init.onPlanned?.(k);
    maybeStart();
  };

  const off = session.onChange((snap) => {
    if (stopped) return;
    if (snap.attempt !== attempt && snap.seed !== undefined) {
      // 새 섞기: 살펴보기 동안 계획을 세운다
      const start = session.startState();
      if (!start) return;
      const k = snap.attempt;
      attempt = k;
      moves = null;
      scheduled = false;
      cancel?.();
      // 계획은 섞기를 정한 뒤에 세우므로, 못 만들면 그 판에서 이 컴퓨터만 DNF로 빠지고 판은 그대로 간다
      // (`retire`). 다른 까닭으로 다시 섞어도 그만둔 컴퓨터는 계획을 다시 세우지 않는다
      const fail = () => {
        if (stopped || k !== attempt) return;
        stopped = true;
        session.retire(BOT_NO_PLAN);
      };
      let made: BotPlan | Promise<BotPlan>;
      try {
        made = planOf(level, n, start, botSeed(snap.seed, id));
      } catch {
        fail();
        return;
      }
      if (made instanceof Promise) made.then((plan) => accept(k, plan), fail);
      else accept(k, made);
    }
    maybeStart();
  });
  return () => {
    stopped = true;
    cancel?.();
    off();
  };
}

/** 시각 비교 허용 오차(ms). 계획 시각은 정수, 늦게 온 만큼(delay)은 소수일 수 있어 뺄셈 오차만 둔다 */
export const BOT_TIME_TOLERANCE_MS = 1;

/**
 * 컴퓨터가 계획대로 두었나(다른 기기에서 다시 계산해 본다). 수 차례와 시각을 함께 본다.
 * 시각: 보고 시각 − 계획 시각이 모든 수에서 0 이상의 같은 값이어야 한다(계획이 늦게 와서 한꺼번에 미룬 만큼).
 * 그래서 방장이 컴퓨터를 계획보다 빨리 두고 보고 시각을 작게 적으면 드러난다
 */
export async function checkBotRun(
  level: BotLevel,
  n: number,
  start: PuzzleState,
  raceSeed: string,
  botId: string,
  log: readonly { m: string; t: number }[],
  plan: PlanFn = planHere,
): Promise<boolean> {
  const made = await plan(level, n, start, botSeed(raceSeed, botId));
  const expected = made.moves.map((m) =>
    formatMove(n, parseMoves(n, m.move)[0] as CubeMove),
  );
  if (expected.length !== log.length) return false;
  if (!log.every((x, i) => x.m === expected[i])) return false;
  const first = log[0];
  if (!first) return true;
  const delay = first.t - (made.moves[0]?.at as number);
  if (delay < -BOT_TIME_TOLERANCE_MS) return false;
  return log.every(
    (x, i) =>
      Math.abs(x.t - (made.moves[i]?.at as number) - delay) <=
      BOT_TIME_TOLERANCE_MS,
  );
}

/** 큐브 돌리기(x·y·z)를 뺀 수 차례(표기 글) */
function turnsOnly(n: number, moves: readonly string[]): string[] {
  const out: string[] = [];
  for (const text of moves)
    for (const m of parseMoves(n, text))
      if (!isRotation(n, m)) out.push(formatMove(n, m));
  return out;
}

/** 「컴퓨터 풀이와 같음」을 보는 가장 적은 수(이보다 짧은 풀이는 우연히 같을 수 있다) */
export const SAME_AS_BOT_MIN_TURNS = 10;

/**
 * 사람의 수 차례가 우리 컴퓨터 풀이(`solveHuman`, 어느 단계든)와 같은가(docs/47 9-2 의심 표시).
 * 같으면 그 단계, 아니면 null. 콘솔에서 해법기 계획을 받아 그대로 두는 자동 풀이를 본다. 결과는 바꾸지 않는다.
 * 큐브 돌리기는 빼고 견준다(y y′를 끼워 넣어 수를 채워도 같게 본다). 계획의 수 차례는 씨앗과 상관없다(시각만 씨앗).
 * 판이 끝난 뒤 한 번, 워커에서 계획을 만든다(`planInWorker`)
 */
export async function sameAsBotSolve(
  n: number,
  start: PuzzleState,
  log: readonly { m: string }[],
  plan: PlanFn = planHere,
): Promise<BotLevel | null> {
  if (!botSupports(n)) return null;
  const mine = turnsOnly(
    n,
    log.map((x) => x.m),
  );
  if (mine.length < SAME_AS_BOT_MIN_TURNS) return null;
  for (const level of BOT_LEVELS) {
    let made: BotPlan;
    try {
      made = await plan(level, n, start, 0);
    } catch {
      continue;
    }
    const theirs = turnsOnly(
      n,
      made.moves.map((m) => m.move),
    );
    if (theirs.length === mine.length && theirs.every((m, i) => m === mine[i]))
      return level;
  }
  return null;
}
