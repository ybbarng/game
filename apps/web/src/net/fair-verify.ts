import { createRng } from "@game/core";
import type { FairLogged } from "@game/fair-play";

import type { KitBot } from "@/game/kit";

export type FairVerdict =
  | { ok: true }
  | { ok: false; seat: number | null; reason: string };

/** 게임마다 다른 것: 진짜 카드로 다시 돌리기, 화면 만들기, 기록 속 행동 바꾸기, 컴퓨터 행동 다듬기 */
export interface FairReplayGame {
  check(
    rules: unknown,
    seed: number,
    log: readonly FairLogged[],
    deals: ReadonlyMap<number, unknown>,
  ):
    | { ok: true; states: { roundNumber: number }[]; upTo: number }
    | { ok: false; index: number; seat: number; reason: string };
  viewOf(state: unknown, seat: number): unknown;
  realAction(action: unknown, cards: ReadonlyMap<number, unknown>): unknown;
  annotate?(view: unknown, action: unknown): unknown;
  /** 방장 시계가 남긴 기록(응답 창 시간 끝)인가. 누가 둔 수가 아니라 컴퓨터 자리 확인에서 뺀다 */
  byClock?(action: unknown): boolean;
  /** 기록 속 내 행동을 내가 보낸 모양으로(방장이 실은 쓴 시간을 뗀다) */
  sentForm?(action: unknown): unknown;
  /**
   * 사람이 보낸 것이 아닌 기록(`byClock`)마다 게임이 따로 본다(`GameKit.verifyUnsigned`). `state`는 넣기 전 진짜 카드 상태.
   * 문제가 있으면 까닭
   */
  unsigned?(
    state: unknown,
    entry: { seat: number; action: unknown },
    index: number,
  ): string | null;
  /** 기록을 끝까지 본 뒤 한 번(`GameKit.verifyUnsignedDone`) */
  unsignedDone?(): string | null;
  /**
   * 화면에서 판을 넘어 쌓이고 기록·내 기록에 남는 값(누적 점수·판별 결과)만 뽑는다. 그만둔 게임의 끝 화면이
   * 이 기기가 다시 계산한 마지막 상태와 같은지 본다(`standingProblem`). 없으면(원카드: 한 게임이 한 판이라 쌓이는
   * 값이 없다) 보지 않는다
   */
  standing?(view: unknown): unknown;
  /** 패 없이 만든 게임 첫 상태(첫 판도 열리지 않았을 때 견줄 쌓인 값. 시작할 때 점수는 패와 상관없다) */
  initial?(rules: unknown, seed: number): unknown;
}

/** 화면에서 이 칸들만 뽑는다(`FairReplayGame.standing`) */
export function pickStanding(keys: readonly string[]) {
  return (view: unknown): Record<string, unknown> => {
    const v = (view ?? {}) as Record<string, unknown>;
    return Object.fromEntries(keys.map((k) => [k, v[k] ?? null]));
  };
}

/**
 * 게임마다 판을 넘어 쌓이는 화면 칸. 판 하나의 칸(마이티 `result`·`history`는 이번 판 것)은 넣지 않는다
 * - 마이티: 돈, 자리별 전적 / 하트: 누적 점수, 판별 점수 / 민화투: 누적 점수, 판별 결과 / 고스톱: 누적 점수,
 *   판별 정산 / 나이롱뽕: 누적 점수
 */
export const STANDING_KEYS: Readonly<Record<string, readonly string[]>> = {
  mighty: ["money", "records"],
  hearts: ["scores", "history"],
  minhwatu: ["totals", "history"],
  gostop: ["scores", "history"],
  nyrongppong: ["totals"],
};

/** 그만둔 게임 끝 화면의 쌓인 값이 확인한 판까지와 다를 때 */
export const STANDING_MISMATCH =
  "그만둔 게임 끝 화면의 점수가 확인한 판까지의 점수와 달라요.";

/**
 * 그만둔 게임(다시 계산이 끝까지 치지 않은 마지막 판에서 멈춤)의 끝 화면에 실린 쌓인 값이, 이 기기가 다시
 * 계산한 마지막 상태(마지막 끝난 판까지, 첫 판도 안 열렸으면 게임 첫 상태)와 같은지 본다. 끝까지 치지 않은 판은
 * 결과가 없으니 쌓인 값을 바꿀 수 없다. 방장 기기를 고쳐 판 끝 화면을 보내지 않고 점수를 부풀려도 여기서 걸린다.
 * 다르면 까닭(끝 화면을 만든 방장 탓)
 */
export function standingProblem(input: {
  game: FairReplayGame;
  rules: unknown;
  seed: number;
  seat: number;
  /** 다시 계산한 마지막 상태(없으면 게임 첫 상태로 본다) */
  verified: unknown;
  /** 방장이 보낸 마지막 원본 화면(그만둔 끝 화면) */
  finalView: unknown;
}): string | null {
  const { game } = input;
  if (!game.standing) return null;
  const base = input.verified ?? game.initial?.(input.rules, input.seed);
  if (base === undefined) return null;
  const expected = JSON.stringify(game.standing(game.viewOf(base, input.seat)));
  const shown = JSON.stringify(game.standing(input.finalView));
  return expected === shown ? null : STANDING_MISMATCH;
}

export interface FairVerifyInput {
  /** 어떤 게임인가(킷의 멘탈 포커 판이 만든 것, `KitFairTable.replay`) */
  game: FairReplayGame;
  rules: unknown;
  seed: number;
  seat: number;
  log: readonly FairLogged[];
  deals: ReadonlyMap<number, { cards: ReadonlyMap<number, unknown> }>;
  /** 컴퓨터 자리와 그 컴퓨터(방장이 컴퓨터를 조종하지 않았는지 다시 계산한다) */
  botSeats: ReadonlySet<number>;
  bot: KitBot<unknown, unknown> | null;
  /** 내가 보낸 행동(JSON) */
  sent: readonly string[];
  /** 게임 중 받은 화면(내 카드로 바꾼 것, JSON) */
  seen: readonly string[];
  /** 게임 중 검증: 기록 뒤에 보낸 내 행동이 더 있을 수 있다 */
  inFlight?: boolean;
  /**
   * 이 기기가 처음부터 지켜본 첫 판(없으면 1). 새로고침해 판 중간에 다시 들어왔으면 그다음 판이다.
   * 게임 끝 검증에서 패를 모르는 판이 끝난 판인지 따질 때 이 판부터만 본다(`unopenedRoundProblem`)
   */
  watchedFrom?: number;
  /**
   * 방장이 보낸 원본 화면(자리 표 그대로, 열기 전)에서 본 판(`HostRounds`). 없으면 받은 화면(`seen`)의 판 번호로
   * 가장 큰 판만 센다
   */
  hostRounds?: HostRounds;
  /** 방장이 보낸 마지막 원본 화면. 그만둔 게임이면 끝 화면의 쌓인 값을 견준다(`standingProblem`) */
  finalView?: unknown;
}

/**
 * 방장이 보낸 원본 화면에서 본 판. 내 카드로 바꾼 화면(`seen`)은 카드가 다 열려야 생기므로, 열쇠가 모자라 열리지
 * 않은 판의 끝 화면은 거기에 없다. 그래서 받는 즉시 원본으로 센다(`GuestRoom.noteHostRound`)
 */
export interface HostRounds {
  /** 가장 큰 판 번호(판 번호가 없는 게임이면 null) */
  last: number | null;
  /** 판 끝(정산)까지 간 판(`finishedRoundOf`) */
  finished: ReadonlySet<number>;
}

/** 판 끝 신호를 읽을 원본 화면 모양(게임마다 쓰는 칸만) */
interface RoundOverView {
  roundNumber?: unknown;
  phase?: unknown;
  retired?: unknown;
  /** 마이티: 정산한 판의 결과 */
  result?: unknown;
  /** 하트: 정산한 판의 점수 */
  roundPoints?: unknown;
}

/**
 * 방장이 보낸 원본 화면이 판 끝(정산)까지 간 판이면 그 판 번호. 게임마다 엔진이 판을 끝냈다고 보이는 신호:
 * - 마이티 `phase: "roundEnd"`, 또는 정산한 뒤의 게임 끝(`gameOver`이고 `result`가 있다. 정산 뒤 그만둬도 남는다)
 * - 하트 `phase: "roundEnd"`, 또는 정산한 뒤의 게임 끝(`roundPoints`가 있다)
 * - 화투 셋 `viewRoundOver`(그만둔 화면 `retired`는 빼고)
 * - 원카드(한 게임이 한 판, 판 번호 1) `phase: "over"`이고 그만둔 것이 아님
 */
export function finishedRoundOf(
  kind:
    | "mighty"
    | "hearts"
    | "onecard"
    | { viewRoundOver(view: never): boolean },
  view: unknown,
): number | null {
  if (typeof view !== "object" || view === null) return null;
  const v = view as RoundOverView;
  if (kind === "onecard")
    return v.phase === "over" && v.retired !== true ? 1 : null;
  const round = typeof v.roundNumber === "number" ? v.roundNumber : null;
  if (round === null) return null;
  if (typeof kind === "object")
    return kind.viewRoundOver(view as never) && v.retired !== true
      ? round
      : null;
  if (v.phase === "roundEnd") return round;
  const scored = kind === "hearts" ? v.roundPoints != null : v.result != null;
  return v.phase === "gameOver" && scored ? round : null;
}

/**
 * 그만둔 게임인가: 기록 끝이 끝내기(`GameKit.retireAction`, 멘탈 포커 카드 게임은 모두 `{ type: "retire" }`)다.
 * 「그만하기」 단추와 끝내기 투표 모두 `LocalMatch.end()`로 이 행동을 기록에 넣는다
 */
export function endsWithRetire(log: readonly { action: unknown }[]): boolean {
  const action = log.at(-1)?.action as { type?: unknown } | undefined;
  return action?.type === "retire";
}

/** 받은 화면(JSON)의 판 번호. 판 번호가 없는 게임(원카드)이면 null */
function roundOfView(view: string): number | null {
  try {
    const round = (JSON.parse(view) as { roundNumber?: unknown }).roundNumber;
    return typeof round === "number" ? round : null;
  } catch {
    return null;
  }
}

/** 패를 모르는 첫 판. 다시 계산은 판 차례대로 돌다가 이 판에서 멈춘다 */
function firstUnopened(deals: ReadonlyMap<number, unknown>): number {
  let round = 1;
  while (deals.has(round)) round++;
  return round;
}

/** 받은 화면(JSON)들에서 가장 큰 판 번호(원본 화면을 따로 세지 않은 호출용) */
function lastRoundOf(seen: readonly string[]): number | null {
  let last: number | null = null;
  for (const view of seen) {
    const round = roundOfView(view);
    if (round !== null && (last === null || round > last)) last = round;
  }
  return last;
}

/**
 * 게임 끝 검증에서 다시 계산이 패를 모르는 판에서 멈췄을 때, 그 판이 정말 끝까지 치지 않은 판인지 본다.
 * 문제가 있으면 까닭.
 *
 * 패를 몰라도 되는 판은 그만둔 게임(기록 끝이 끝내기 `retire`)의 마지막 판이면서, 판 끝(정산)까지 가지 않은
 * 판뿐이다: 끝까지 치지 않은 판이라 결과가 없다. 그 밖에 패를 모르면 끝난 판의 카드가 다 열리지 않은 것이다
 * (누군가 판 끝에 열쇠를 다 공개하지 않아 그 판을 다시 계산하지 못하게 했다).
 * - 그보다 앞 판: 방장이 불리한 판을 끝낸 뒤 열쇠를 숨기고 다음 판에서 그만두기
 * - 판 끝까지 간 판(`finished`): 판을 끝까지 친 직후, 다음 판 화면을 보내기 전에 그만두기. 판 중에 열리지 않는
 *   카드(마이티 바닥 패·버린 카드, 화투 남은 더미 등)를 끝까지 숨길 수 있다
 * - 끝까지 친 게임(그만두지 않음)의 마지막 판
 * 판과 판 끝은 방장이 보낸 원본 화면으로 센다(이미 보낸 화면은 거둘 수 없다). 이 기기가 처음부터 지켜본
 * 판(`watchedFrom`부터)만 따진다. 새로고침 앞 판은 이 기기가 다시 계산할 수 없다(`GuestRoom.verifyRound`).
 * 판 번호가 없는 게임(원카드, 한 게임이 한 판)은 판 끝 신호만 보고, 나머지는 그 게임의 다시 계산이 본다
 * (`checkOnecardTable`)
 */
export function unopenedRoundProblem(input: {
  deals: ReadonlyMap<number, unknown>;
  log: readonly { action: unknown }[];
  rounds: HostRounds;
  watchedFrom: number;
}): string | null {
  const stopped = firstUnopened(input.deals);
  if (stopped < input.watchedFrom) return null;
  const problem = `${stopped}판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.`;
  if (input.rounds.finished.has(stopped)) return problem;
  const last = input.rounds.last;
  if (last === null) return null;
  const retired = endsWithRetire(input.log);
  if (stopped < last || (stopped === last && !retired)) return problem;
  return null;
}

function idle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 멘탈 포커 판 검증: 모든 카드가 열린 뒤 행동 기록을 진짜 카드로 다시 돌려
 * ① 모든 행동이 규칙에 맞는지(누가 어겼는지) ② 컴퓨터 수가 같은 컴퓨터·같은 난수로 나오는지
 * ③ 기록 속 내 행동이 내가 보낸 것인지 ④ 게임 중 받은 화면이 다시 계산한 화면과 같은지 본다.
 */
export async function verifyFairLog(
  input: FairVerifyInput,
): Promise<FairVerdict> {
  const { game, rules, seed, seat, log, deals } = input;
  const checked = game.check(rules, seed, log, deals);
  if (!checked.ok)
    return {
      ok: false,
      seat: checked.seat,
      reason: `기록 ${checked.index + 1}번째: ${checked.reason}`,
    };
  const { states } = checked;
  const partial = checked.upTo < log.length;
  const done = log.slice(0, checked.upTo);
  // 게임 끝: 다시 계산이 멈춘 판은 그만둔 게임의 마지막 판(끝까지 치지 않은 판)이어야 한다.
  if (partial && !input.inFlight) {
    const problem = unopenedRoundProblem({
      deals,
      log,
      rounds: input.hostRounds ?? {
        last: lastRoundOf(input.seen),
        finished: new Set(),
      },
      watchedFrom: input.watchedFrom ?? 1,
    });
    if (problem) return { ok: false, seat: null, reason: problem };
    // 그만둔 게임 끝 화면의 쌓인 값(점수·순위)은 다시 계산한 마지막 상태 그대로여야 한다. 이 기기가 처음부터
    // 지켜보지 않은 판에서 멈췄으면(새로고침 앞 판) 견줄 상태가 없어 보지 않는다.
    if (
      endsWithRetire(log) &&
      input.finalView !== undefined &&
      firstUnopened(deals) >= (input.watchedFrom ?? 1)
    ) {
      const standing = standingProblem({
        game,
        rules,
        seed,
        seat,
        verified: states.at(-1),
        finalView: input.finalView,
      });
      if (standing) return { ok: false, seat: 0, reason: standing };
    }
  }

  // 사람이 보낸 것이 아닌 기록(방장 시계·방장 기기가 넣은 것)은 게임이 따로 본다(지어낸 청구, 뺀 발표 등)
  if (game.unsigned)
    for (const [index, entry] of done.entries()) {
      if (!game.byClock?.(entry.action)) continue;
      const problem = game.unsigned(states[index], entry, index);
      if (problem)
        return {
          ok: false,
          seat: 0,
          reason: `기록 ${index + 1}번째: ${problem}`,
        };
    }
  if (!partial) {
    const problem = game.unsignedDone?.() ?? null;
    if (problem) return { ok: false, seat: 0, reason: problem };
  }

  if (input.bot) {
    const botRng = createRng(seed ^ 0x2545f491);
    for (const [index, entry] of done.entries()) {
      if (game.byClock?.(entry.action)) continue;
      if (input.botSeats.has(entry.seat) && !entry.bot)
        return {
          ok: false,
          seat: 0,
          reason: `기록 ${index + 1}번째: 컴퓨터 자리를 사람이 뒀어요.`,
        };
      if (!entry.bot) continue;
      const state = states[index];
      if (!state) break;
      const cards = deals.get(state.roundNumber)?.cards ?? new Map();
      const view = game.viewOf(state, entry.seat);
      const decided = input.bot.decide(view, botRng);
      const expected = game.annotate ? game.annotate(view, decided) : decided;
      if (
        JSON.stringify(game.realAction(expected, cards)) !==
        JSON.stringify(game.realAction(entry.action, cards))
      )
        return {
          ok: false,
          seat: 0,
          reason: `기록 ${index + 1}번째: 컴퓨터가 둘 수와 달라요(방장이 컴퓨터를 조종했어요).`,
        };
      if (index % 8 === 0) await idle();
    }
  }

  // 다시 계산하지 못한 뒤쪽(끝까지 치지 않은 판)의 내 행동도 내가 보낸 차례 그대로여야 한다. 방장이 내 수를
  // 지어내 판을 끝까지 친 것처럼 꾸미지 못한다(보냈는데 그만두기에 밀려 빠진 끝쪽 행동은 괜찮다).
  const mine = log
    .filter((e) => e.seat === seat && !game.byClock?.(e.action))
    .map((e) =>
      JSON.stringify(game.sentForm ? game.sentForm(e.action) : e.action),
    );
  const sent = input.sent;
  const prefix = sent.slice(0, mine.length);
  if (
    JSON.stringify(prefix) !== JSON.stringify(mine) ||
    (!partial && !input.inFlight && sent.length !== mine.length)
  )
    return {
      ok: false,
      seat: 0,
      reason: "기록 속 내 행동이 내가 보낸 것과 달라요.",
    };

  // 받은 화면이 다시 계산한 화면 중에 차례대로 있어야 한다. 마지막 다시 계산한 화면 뒤로 받은 것은
  // 검증 시점 뒤의 진행이므로 건너뛴다.
  const replayed = states.map((s) => JSON.stringify(game.viewOf(s, seat)));
  let cursor = 0;
  for (const [i, view] of input.seen.entries()) {
    if (cursor === replayed.length - 1 && replayed[cursor] !== view) break;
    while (cursor < replayed.length && replayed[cursor] !== view) cursor++;
    if (cursor === replayed.length) {
      if (partial) break;
      return {
        ok: false,
        seat: 0,
        reason: `게임 중 받은 ${i + 1}번째 화면이 진짜 카드로 다시 계산한 것과 달라요.`,
      };
    }
  }
  return { ok: true };
}
