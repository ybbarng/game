import type { CubeMove } from "@game/cube-engine";
import { parseMoves } from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { RaceSession } from "@/net/race/race-session";
import { PRACTICE_N } from "../practice/problem";
import type { VersusState } from "../practice/versus";
import {
  checkVersusBotRun,
  VERSUS_BOT_SPEED,
  type VersusBotMove,
  versusBotLevel,
  versusBotPlan,
} from "../practice/versus-bot";
import { type BotHandle, botSeed } from "./bot-racer";
import { BOT_NO_PLAN, type CubeAct } from "./race-game";

/**
 * 공식 연습 대결에 든 컴퓨터(docs/47 16-14). 방장 기기가 돌리지만 대결 틀에는 한 참가자다.
 * 계획(수와 시각)은 `versusBotPlan(시작 상태, 단계 빠르기, 씨앗)`으로 정해지고, 씨앗은 대결 씨앗과 컴퓨터 아이디에서 나온다.
 * 그래서 다른 기기도 같은 계획을 다시 계산해 계획대로 쳤는지 맞춰 본다(`practiceBotRunOk`). 시각은 넣은 `Clock`으로 잰다.
 */

export interface AttachPracticeBotInit {
  session: RaceSession<CubeAct, PuzzleState>;
  id: string;
  /** 단계 글(`RoomPlayer.bot`) */
  level: string;
  clock: Clock;
  onPlanned?: (attempt: number) => void;
}

/** 그 컴퓨터의 계획(모르는 단계 글이면 null) */
export function practiceBotPlan(
  level: string,
  start: PuzzleState,
  raceSeed: string,
  botId: string,
): VersusBotMove[] | null {
  const lv = versusBotLevel(level);
  if (!lv) return null;
  return versusBotPlan(
    start as VersusState,
    VERSUS_BOT_SPEED[lv],
    botSeed(raceSeed, botId),
  );
}

/** 다른 기기에서 그 컴퓨터가 계획대로 쳤나 본다. 다시 계산할 수 없으면 null(「확인 못 함」) */
export function practiceBotRunOk(
  level: string,
  start: PuzzleState,
  raceSeed: string,
  botId: string,
  log: readonly { m: string; t: number }[],
  complete: boolean,
): boolean | null {
  const plan = practiceBotPlan(level, start, raceSeed, botId);
  return plan ? checkVersusBotRun(plan, log, complete) : null;
}

export function attachPracticeBot(init: AttachPracticeBotInit): BotHandle {
  const { session, id, level, clock } = init;
  let attempt = -1;
  let moves: CubeMove[] = [];
  let times: number[] = [];
  let j = 0;
  let scheduled = false;
  let stopped = false;
  let cancel: (() => void) | undefined;

  const step = (k: number) => {
    cancel = undefined;
    if (stopped || k !== attempt || j >= moves.length) return;
    const snap = session.snapshot();
    if (snap.attempt !== k || snap.phase !== "race") return;
    const r = session.play(moves[j] as CubeMove, times[j] as number);
    j++;
    if (!r.ok || r.solved || j >= moves.length) return;
    schedule(k);
  };
  const schedule = (k: number) => {
    const elapsed = session.snapshot().elapsed ?? 0;
    cancel = clock.after(Math.max(0, (times[j] as number) - elapsed), () =>
      step(k),
    );
  };
  const off = session.onChange((snap) => {
    if (stopped) return;
    if (snap.attempt !== attempt && snap.seed !== undefined) {
      const start = session.startState();
      if (!start) return;
      attempt = snap.attempt;
      cancel?.();
      scheduled = false;
      j = 0;
      const plan = practiceBotPlan(level, start, snap.seed, id);
      if (!plan) {
        stopped = true;
        session.retire(BOT_NO_PLAN);
        return;
      }
      moves = plan.map((p) => parseMoves(PRACTICE_N, p.move)[0] as CubeMove);
      times = plan.map((p) => p.at);
      init.onPlanned?.(attempt);
    }
    if (!scheduled && snap.attempt === attempt && snap.phase === "race") {
      scheduled = true;
      if (moves.length > 0) schedule(attempt);
    }
  });
  return {
    detach: () => {
      stopped = true;
      cancel?.();
      off();
    },
    afterHit() {},
    afterRewind() {},
    afterItem() {},
    pause() {},
    idle: () => true,
  };
}
