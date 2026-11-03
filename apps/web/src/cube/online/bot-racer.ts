import { sha256Hex } from "@game/baseball-engine";
import { type BotLevel, type BotPlan, botPlan } from "@game/cube-ai";
import { type CubeMove, formatMove, parseMoves } from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { RaceSession } from "@/net/race/race-session";

/**
 * 경주에 든 컴퓨터(docs/47 9-1·10절). 방장 기기가 돌리지만 경주 틀에는 다른 사람과 똑같이 한 참가자다
 * (약속·공개·수 흘려보내기·맞춤 알림을 그대로 한다).
 *
 * 수와 시각은 `botPlan(단계, 크기, 시작 상태, 씨앗)`으로 정해진다. 씨앗은 경주 씨앗과 컴퓨터 아이디에서 나오므로
 * 다른 기기도 단계만 알면 같은 계획을 다시 계산해 "컴퓨터가 계획대로 두었나"를 확인할 수 있다(`checkBotRun`).
 */

/** 컴퓨터 계획의 씨앗(uint32) */
export function botSeed(raceSeed: string, botId: string): number {
  return Number.parseInt(
    sha256Hex(`cube-bot|${raceSeed}|${botId}`).slice(0, 8),
    16,
  );
}

/** 이 크기에 컴퓨터가 있나(지금은 2×2·3×3) */
export function botSupports(n: number): boolean {
  return n === 2 || n === 3;
}

export type PlanFn = (
  level: BotLevel,
  n: number,
  start: PuzzleState,
  seed: number,
) => BotPlan;

const defaultPlan: PlanFn = (level, n, start, seed) =>
  botPlan(level, n, start, seed);

export interface AttachBotInit {
  session: RaceSession<CubeMove, PuzzleState>;
  id: string;
  level: BotLevel;
  n: number;
  clock: Clock;
  plan?: PlanFn;
}

/** 경주 하나에 컴퓨터를 붙인다. 떼는 함수를 돌려준다 */
export function attachBot(init: AttachBotInit): () => void {
  const { session, id, level, n, clock } = init;
  const planOf = init.plan ?? defaultPlan;
  let attempt = -1;
  let moves: CubeMove[] = [];
  let times: number[] = [];
  let scheduled = false;
  let cancel: (() => void) | undefined;
  let stopped = false;

  const step = (j: number) => {
    cancel = undefined;
    if (stopped) return;
    const snap = session.snapshot();
    if (snap.attempt !== attempt || snap.phase !== "race") return;
    const r = session.play(moves[j] as CubeMove);
    if (!r.ok || r.solved || j + 1 >= moves.length) return;
    schedule(j + 1);
  };
  const schedule = (j: number) => {
    const elapsed = session.snapshot().elapsed ?? 0;
    cancel = clock.after(Math.max(0, (times[j] as number) - elapsed), () =>
      step(j),
    );
  };

  const off = session.onChange((snap) => {
    if (stopped) return;
    if (snap.attempt !== attempt && snap.seed !== undefined) {
      // 새 섞기: 살펴보기 동안 계획을 세운다
      const start = session.startState();
      if (!start) return;
      attempt = snap.attempt;
      scheduled = false;
      cancel?.();
      const plan = planOf(level, n, start, botSeed(snap.seed, id));
      moves = plan.moves.map((m) => parseMoves(n, m.move)[0] as CubeMove);
      times = plan.moves.map((m) => m.at);
    }
    if (snap.attempt === attempt && snap.phase === "race" && !scheduled) {
      scheduled = true;
      if (moves.length > 0) schedule(0);
    }
  });
  return () => {
    stopped = true;
    cancel?.();
    off();
  };
}

/** 컴퓨터가 계획대로 두었나(다른 기기에서 다시 계산해 본다). 수 차례만 보고 시각은 보지 않는다 */
export function checkBotRun(
  level: BotLevel,
  n: number,
  start: PuzzleState,
  raceSeed: string,
  botId: string,
  log: readonly { m: string }[],
  plan: PlanFn = defaultPlan,
): boolean {
  const expected = plan(level, n, start, botSeed(raceSeed, botId)).moves.map(
    (m) => formatMove(n, parseMoves(n, m.move)[0] as CubeMove),
  );
  if (expected.length !== log.length) return false;
  return log.every((x, i) => x.m === expected[i]);
}
