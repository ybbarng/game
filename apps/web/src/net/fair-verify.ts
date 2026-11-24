import {
  checkReplay,
  type FairLogged,
  type RoundDeal,
  realAction,
} from "@game/fair-play";
import {
  type Action,
  type Card,
  createRng,
  type MatchState,
  type PlayerView,
  type RuleSet,
  viewOf,
} from "@game/mighty-engine";

import type { KitBot } from "@/game/kit";
import { mightyKit } from "@/game/mighty-kit";

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
}

/** 마이티 */
export const MIGHTY_REPLAY: FairReplayGame = {
  check: (rules, seed, log, deals) =>
    checkReplay(
      rules as RuleSet,
      seed,
      log,
      deals as ReadonlyMap<number, RoundDeal>,
    ),
  viewOf: (state, seat) => viewOf(state as MatchState, seat),
  realAction: (action, cards) =>
    realAction(action as Action, cards as ReadonlyMap<number, Card>),
  annotate: (view, action) =>
    mightyKit.annotateBotAction
      ? mightyKit.annotateBotAction(view as PlayerView, action as Action)
      : action,
};

export interface FairVerifyInput {
  /** 어떤 게임인가(없으면 마이티) */
  game?: FairReplayGame;
  rules: RuleSet;
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

/**
 * 게임 끝 검증에서 다시 계산이 패를 모르는 판에서 멈췄을 때, 그 판이 정말 끝까지 치지 않은 판인지 본다.
 * 문제가 있으면 까닭.
 *
 * 그만둔 게임(기록 끝이 끝내기 `retire`)의 마지막 판만 패를 몰라도 된다: 끝까지 치지 않은 판이라 결과가 없다.
 * 그보다 앞 판이거나, 끝까지 친 게임의 마지막 판인데 패를 모르면 끝난 판의 카드가 다 열리지 않은 것이다
 * (누군가 판 끝에 열쇠를 다 공개하지 않아 그 판을 다시 계산하지 못하게 했다). 방장이 불리한 판을 끝낸 뒤
 * 열쇠를 숨기고 다음 판에서 그만둬도 여기서 걸린다. 판은 받은 화면의 판 번호로 센다(방장이 이미 보낸 화면은
 * 거둘 수 없다). 이 기기가 처음부터 지켜본 판(`watchedFrom`부터)만 따진다. 새로고침 앞 판은 이 기기가 다시
 * 계산할 수 없다(`GuestRoom.verifyRound`).
 * 판 번호가 없는 게임(원카드, 한 게임이 한 판)은 그 게임의 다시 계산이 본다(`checkOnecardTable`)
 */
export function unopenedRoundProblem(input: {
  deals: ReadonlyMap<number, unknown>;
  log: readonly { action: unknown }[];
  seen: readonly string[];
  watchedFrom: number;
}): string | null {
  let last: number | null = null;
  for (const view of input.seen) {
    const round = roundOfView(view);
    if (round !== null && (last === null || round > last)) last = round;
  }
  if (last === null) return null;
  // 다시 계산은 판 차례대로 돌다가 패를 모르는 첫 판에서 멈춘다.
  let stopped = 1;
  while (input.deals.has(stopped)) stopped++;
  if (stopped < input.watchedFrom) return null;
  const retired = endsWithRetire(input.log);
  if (stopped < last || (stopped === last && !retired))
    return `${stopped}판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.`;
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
  const { rules, seed, seat, log, deals } = input;
  const game = input.game ?? MIGHTY_REPLAY;
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
      seen: input.seen,
      watchedFrom: input.watchedFrom ?? 1,
    });
    if (problem) return { ok: false, seat: null, reason: problem };
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

  const mine = done
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
