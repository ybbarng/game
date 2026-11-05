import { sha256Hex } from "@game/baseball-engine";
import {
  BOT_LEVEL_LABELS,
  BOT_LEVELS,
  type BotPlan,
  botPlan,
  levelMethod,
  levelText,
  readBotSkill,
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
import { isItemText, parseItemText, undoMoves } from "./items";
import { BOT_NO_PLAN, type CubeAct } from "./race-game";

/**
 * 대결에 든 컴퓨터(docs/47 9-1·10절). 방장 기기가 돌리지만 대결 틀에는 다른 사람과 똑같이 한 참가자다
 * (약속·공개·수 흘려보내기·맞춤 알림을 그대로 한다).
 *
 * 수와 시각은 `botPlan(단계 글, 크기, 시작 상태, 씨앗)`으로 정해진다. 씨앗은 대결 씨앗과 컴퓨터 아이디에서 나오므로
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
  /** 단계 글(`RoomPlayer.bot`) */
  bot: string,
  n: number,
  start: PuzzleState,
  seed: number,
) => BotPlan | Promise<BotPlan>;

/** 같은 스레드에서 바로(시험·워커를 못 쓸 때) */
export const planHere: PlanFn = (level, n, start, seed) =>
  botPlan(level, n, start, seed);

export interface AttachBotInit {
  session: RaceSession<CubeAct, PuzzleState>;
  id: string;
  /** 단계 글(`RoomPlayer.bot`) */
  level: string;
  n: number;
  clock: Clock;
  plan?: PlanFn;
  /** 그 시도의 계획을 받았다(화면 표시·시험용) */
  onPlanned?: (attempt: number) => void;
}

/** 컴퓨터가 계획 밖의 수(맞은 섞기 되돌리기, 되감은 수 다시 두기)를 두는 간격(ms) */
export const BOT_FORCED_MS = 250;

/** 붙인 컴퓨터를 다루는 손잡이(아이템전: 방이 판정을 보고 부른다) */
export interface BotHandle {
  detach: () => void;
  /** 맞은 한 수 섞기(넣은 수 글)를 넣었다: 바로 되돌리는 수를 둔다 */
  afterHit(moves: string): void;
  /** 되감기를 썼다: 되돌린 수(둔 차례대로)를 다시 둔다 */
  afterRewind(undone: readonly CubeMove[]): void;
  /**
   * 아이템을 썼다(그 수는 지금 시각으로 적힌다): 뒤 계획 수를 그 뒤로 미룬다. 계획보다 늦게 두는 중에 지금 시각의 수가 끼면
   * 뒤 계획 수 시각이 거꾸로 가기 때문이다
   */
  afterItem(): void;
  /** 화면 방해를 맞았다: 그만큼 멈춘다 */
  pause(ms: number): void;
  /** 계획 밖의 수가 남지 않았다(아이템을 써도 된다) */
  idle(): boolean;
}

/**
 * 대결 하나에 컴퓨터를 붙인다. 떼는 손잡이를 돌려준다.
 * 계획은 씨앗을 안 순간(살펴보기 동안) 만들기 시작한다. 풀린 뒤에야 계획이 오면 그만큼 늦게 시작한 것으로 친다
 * (모든 시각을 늦은 만큼 미룬다. 한꺼번에 몰아 두지 않는다).
 * 아이템전에서는 계획 밖의 수(`forced`)를 먼저 두고, 그만큼 뒤 계획 시각을 미룬다(미룬 양은 늘기만 한다, `checkBotRun`이 본다)
 */
export function attachBot(init: AttachBotInit): BotHandle {
  const { session, id, level, n, clock } = init;
  const planOf = init.plan ?? planHere;
  let attempt = -1;
  let moves: CubeMove[] | null = null;
  let times: number[] = [];
  /** 계획이 늦게 와서(또는 아이템으로) 미룬 시간(ms) */
  let delay = 0;
  let scheduled = false;
  let cancel: (() => void) | undefined;
  let stopped = false;
  /** 다음에 둘 계획 수 */
  let j = 0;
  /** 계획 밖의 수(먼저 둔다) */
  let forced: CubeMove[] = [];
  /** 멈춤이 끝나는 때(풀림 기준 ms) */
  let pausedUntil = 0;
  /** 마지막 계획 밖의 수를 둔 때(없으면 -1) */
  let forcedAt = -1;

  const elapsedNow = () => session.snapshot().elapsed ?? 0;
  const step = (k: number) => {
    cancel = undefined;
    if (stopped || k !== attempt || !moves) return;
    const snap = session.snapshot();
    if (snap.attempt !== k || snap.phase !== "race") return;
    let r: ReturnType<typeof session.play>;
    if (forced.length > 0) {
      r = session.play(forced.shift() as CubeMove);
      forcedAt = elapsedNow();
    } else {
      if (j >= moves.length) return;
      // 계획 시각(+ 미룬 만큼)으로 적는다. 다른 기기가 계획과 시각까지 맞춰 본다(`checkBotRun`)
      r = session.play(moves[j] as CubeMove, (times[j] as number) + delay);
      j++;
    }
    if (!r.ok || r.solved) return;
    if (forced.length === 0 && j >= moves.length) return;
    schedule(k);
  };
  const schedule = (k: number) => {
    cancel?.();
    const elapsed = elapsedNow();
    let at: number;
    if (forced.length > 0) at = Math.max(elapsed + BOT_FORCED_MS, pausedUntil);
    else {
      // 계획 밖의 수·멈춤 뒤로만 계획을 미룬다(미룬 양은 줄지 않는다). 타이머가 늦게 불린 것은 미루지 않는다(계획 시각 그대로 적는다)
      const want = Math.max(
        pausedUntil,
        forcedAt < 0 ? 0 : forcedAt + BOT_FORCED_MS,
      );
      if ((times[j] as number) + delay < want)
        delay = want - (times[j] as number);
      at = (times[j] as number) + delay;
    }
    cancel = clock.after(Math.max(0, at - elapsed), () => step(k));
  };
  const nudge = () => {
    if (!scheduled || stopped || !moves) return;
    schedule(attempt);
  };
  const maybeStart = () => {
    const snap = session.snapshot();
    if (stopped || scheduled || !moves || snap.attempt !== attempt) return;
    if (snap.phase !== "race") return;
    scheduled = true;
    if (moves.length > 0) schedule(attempt);
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
      j = 0;
      forced = [];
      pausedUntil = 0;
      forcedAt = -1;
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
  return {
    detach: () => {
      stopped = true;
      cancel?.();
      off();
    },
    afterHit(text) {
      forced = [...undoMoves(n, text), ...forced];
      forcedAt = elapsedNow();
      nudge();
    },
    afterRewind(undone) {
      forced = [...undone, ...forced];
      forcedAt = elapsedNow();
      nudge();
    },
    afterItem() {
      forcedAt = elapsedNow();
      nudge();
    },
    pause(ms) {
      pausedUntil = Math.max(pausedUntil, elapsedNow() + ms);
      nudge();
    },
    idle: () => forced.length === 0,
  };
}

/** 시각 비교 허용 오차(ms). 계획 시각은 정수, 늦게 온 만큼(delay)은 소수일 수 있어 뺄셈 오차만 둔다 */
export const BOT_TIME_TOLERANCE_MS = 1;

/**
 * 컴퓨터가 계획대로 두었나(다른 기기에서 다시 계산해 본다). 수 차례와 시각을 함께 본다.
 * 시각: 보고 시각 − 계획 시각이 모든 수에서 0 이상의 같은 값이어야 한다(계획이 늦게 와서 한꺼번에 미룬 만큼).
 * 그래서 방장이 컴퓨터를 계획보다 빨리 두고 보고 시각을 작게 적으면 드러난다.
 * 단계 글이 이 기기가 모르는 계획 표 버전이면 다시 계산하지 않고 null(「확인 못 함」, 다른 버전 기기끼리 잘못 의심하지 않게)
 */
export async function checkBotRun(
  level: string,
  n: number,
  start: PuzzleState,
  raceSeed: string,
  botId: string,
  log: readonly { m: string; t: number }[],
  plan: PlanFn = planHere,
  /** 판이 정해져 도중에 멈춘 컴퓨터(체력바 대결): 계획의 앞부분만 두었으면 된다 */
  stopped = false,
): Promise<boolean | null> {
  if (!readBotSkill(level)) return null;
  const made = await plan(level, n, start, botSeed(raceSeed, botId));
  if (log.some((x) => isItemText(x.m)))
    return checkItemBotRun(n, made, log, stopped);
  const expected = made.moves
    .map((m) => formatMove(n, parseMoves(n, m.move)[0] as CubeMove))
    .slice(0, stopped ? log.length : undefined);
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

/**
 * 아이템전의 컴퓨터 확인: 계획 밖의 수(맞은 섞기를 되돌린 수, 되감은 수를 다시 둔 수)를 `attachBot`과 같은 규칙으로 걸러 내고,
 * 나머지가 계획 차례 그대로인지, 미룬 양(보고 시각 − 계획 시각)이 0 이상이고 줄지 않는지 본다(계획보다 빨리 두면 드러난다).
 * 계획 밖의 수 시각은 판정이 확실해진 때라 기기마다 달라 보지 않는다
 */
function checkItemBotRun(
  n: number,
  made: BotPlan,
  log: readonly { m: string; t: number }[],
  stopped: boolean,
): boolean {
  const expected = made.moves.map((m) =>
    formatMove(n, parseMoves(n, m.move)[0] as CubeMove),
  );
  let forced: string[] = [];
  let recent: string[] = [];
  let k = 0;
  let last = -BOT_TIME_TOLERANCE_MS;
  for (const x of log) {
    if (isItemText(x.m)) {
      const act = parseItemText(n, x.m);
      if (!act) return false;
      if (act.item === "hit") {
        forced = [
          ...undoMoves(n, act.moves).map((m) => formatMove(n, m)),
          ...forced,
        ];
        recent = [];
      } else if (act.kind === "rewind") {
        if (forced.length > 0) return false;
        forced = [...recent];
        recent = [];
      }
      continue;
    }
    if (forced.length > 0) {
      if (x.m !== forced[0]) return false;
      forced.shift();
    } else {
      if (x.m !== expected[k]) return false;
      const d = x.t - (made.moves[k]?.at as number);
      if (d < last - BOT_TIME_TOLERANCE_MS) return false;
      last = Math.max(last, d);
      k++;
    }
    recent = [...recent, x.m].slice(-3);
  }
  return stopped || (k === expected.length && forced.length === 0);
}

/** 큐브 돌리기(x·y·z)를 뺀 수 차례(표기 글) */
function turnsOnly(n: number, moves: readonly string[]): string[] {
  const out: string[] = [];
  // 아이템전의 특별한 수(쓰기·맞은 섞기)는 사람 손의 수가 아니다
  for (const text of moves)
    for (const m of isItemText(text) ? [] : parseMoves(n, text))
      if (!isRotation(n, m)) out.push(formatMove(n, m));
  return out;
}

/** 「컴퓨터 풀이와 같음」을 보는 가장 적은 수(이보다 짧은 풀이는 우연히 같을 수 있다) */
export const SAME_AS_BOT_MIN_TURNS = 10;

/**
 * 견줄 우리 해법(크기마다 단계가 쓰는 해법 하나씩)과 보이는 이름. 2단계 해법(옛 초고수)도 본다: 콘솔에서
 * 해법기를 불러 그대로 두는 자동 풀이가 가장 쉽게 쓰는 길이라서
 */
function sameCandidates(n: number): { bot: string; label: string }[] {
  const seen = new Set<string>();
  const out: { bot: string; label: string }[] = [];
  for (const level of BOT_LEVELS) {
    const method = levelMethod(level, n);
    if (seen.has(method)) continue;
    seen.add(method);
    out.push({ bot: levelText(level), label: BOT_LEVEL_LABELS[level] });
  }
  out.push({ bot: "expert", label: "2단계 해법" });
  return out;
}

/**
 * 사람의 수 차례가 우리 컴퓨터 풀이(`solveHuman`, 어느 단계든)와 같은가(docs/47 9-2 의심 표시).
 * 같으면 그 이름, 아니면 null. 콘솔에서 해법기 계획을 받아 그대로 두는 자동 풀이를 본다. 결과는 바꾸지 않는다.
 * 큐브 돌리기와 컴퓨터 헛수는 빼고 견준다(y y′를 끼워 넣어 수를 채워도 같게 본다). 헛수 말고 계획의 수 차례는 씨앗과
 * 상관없다(시각만 씨앗). 판이 끝난 뒤 한 번, 워커에서 계획을 만든다(`planInWorker`)
 */
export async function sameAsBotSolve(
  n: number,
  start: PuzzleState,
  log: readonly { m: string }[],
  plan: PlanFn = planHere,
): Promise<string | null> {
  if (!botSupports(n)) return null;
  const mine = turnsOnly(
    n,
    log.map((x) => x.m),
  );
  if (mine.length < SAME_AS_BOT_MIN_TURNS) return null;
  for (const { bot, label } of sameCandidates(n)) {
    let made: BotPlan;
    try {
      made = await plan(bot, n, start, 0);
    } catch {
      continue;
    }
    const theirs = turnsOnly(
      n,
      made.moves.filter((m) => !m.slip).map((m) => m.move),
    );
    if (theirs.length === mine.length && theirs.every((m, i) => m === mine[i]))
      return label;
  }
  return null;
}
