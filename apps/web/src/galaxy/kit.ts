import { botKnowsChain, galaxyBotFor } from "@game/galaxy-ai";
import {
  type Action,
  boardOfSky,
  clockTurn,
  createMatch,
  DEFAULT_SKY,
  decodeGalaxyRules,
  encodeGalaxyRules,
  type GalaxyRules,
  type GalaxyState,
  type GalaxyView,
  type GameEvent,
  type GameResult,
  isComplete,
  NUMBERS,
  pendingSeats,
  replay,
  STAR_SQUARES,
  step,
  viewOf,
} from "@game/galaxy-engine";

import type { Commentary, GameKit, KitStats } from "@/game/kit";
import type { RoundRecord } from "@/stats/records";

import { eventLine } from "./events";
import { money, squareName } from "./format";

export type GalaxyKit = GameKit<
  GalaxyRules,
  GalaxyState,
  GalaxyView,
  Action,
  GameEvent,
  undefined
>;

/** 판 끝 내 순위(끝나지 않았으면 null) */
export function myRank(
  result: GameResult | null,
  seat: number,
): { rank: number; assets: number; cash: number } | null {
  const row = result?.standings.find((s) => s.seat === seat);
  return row ? { rank: row.rank, assets: row.assets, cash: row.cash } : null;
}

/** 1등이면 이김, 꼴찌 쪽이면 짐. 둘 다 아니면(가운데 순위) 비김으로 본다 */
export function outcomeOf(
  result: GameResult | null,
  seat: number,
): "win" | "loss" | "draw" {
  const mine = myRank(result, seat);
  if (!mine) return "draw";
  if (mine.rank === 1) return "win";
  const worst = Math.max(...(result?.standings ?? []).map((s) => s.rank));
  return mine.rank === worst ? "loss" : "draw";
}

/** 은하 한 바퀴 판 기록(내 자리에서 본 것, docs/48 13절 3번) */
export interface GalaxyRound {
  players: number;
  length: GalaxyRules["length"];
  sky: string;
  /** 순위(1부터). 순위 없이 끝냈으면 null */
  rank: number | null;
  assets: number;
  cash: number;
  by: GameResult["kind"] | "retired";
  /** 산 별(별 id, 입찰 포함) */
  bought: string[];
  /** 판 끝에 완성해 둔 별자리(별자리 id) */
  completed: string[];
  rentPaid: number;
  rentReceived: number;
  /** 이번 판에서 머문 별과 가진 별(별 id) */
  met: string[];
}

export interface GalaxyGame {
  won: boolean;
  retired: boolean;
}

/** 이번 판에서 내가 만난 별 칸: 머문 별, 처음부터 받은 별, 산 별·입찰로 산 별, 거래로 오간 별, 판 끝에 가진 별 */
export function metSquares(
  view: Pick<GalaxyView, "board" | "owners" | "mySeat">,
  events: readonly GameEvent[],
): number[] {
  const met = new Set<number>();
  for (const e of events)
    if (
      e.type === "landed" &&
      e.seat === view.mySeat &&
      view.board.squares[e.square]?.star
    )
      met.add(e.square);
  for (const e of events) {
    if (e.type === "bought" && e.seat === view.mySeat) met.add(e.square);
    if (e.type === "auctionEnded" && e.result.winner === view.mySeat)
      met.add(e.result.square);
    if (e.type === "dealt")
      for (const sq of e.stars[view.mySeat] ?? []) met.add(sq);
    // 거래로 오간 별(받은 별, 준 별 모두 한때 가졌거나 내 손을 거쳤다)
    if (
      e.type === "tradeAccepted" &&
      (e.offer.from === view.mySeat || e.offer.to === view.mySeat)
    )
      for (const sq of [...e.offer.give.stars, ...e.offer.get.stars])
        met.add(sq);
  }
  for (const sq of STAR_SQUARES)
    if (view.owners[sq] === view.mySeat) met.add(sq);
  return [...met].sort((a, b) => a - b);
}

export const galaxyStats: KitStats<GalaxyView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "gameStarted"),
  roundEnded: (events) => events.some((e) => e.type === "gameEnded"),
  gameEnded: (events) => events.some((e) => e.type === "gameEnded"),
  roundNumber: (view) => view.roundNumber,
  round(_start, end, events): GalaxyRound | null {
    const ended = events.find(
      (e): e is Extract<GameEvent, { type: "gameEnded" }> =>
        e.type === "gameEnded",
    );
    if (!ended) return null;
    const me = end.mySeat;
    const board = end.board;
    let rentPaid = 0;
    let rentReceived = 0;
    const bought: number[] = [];
    for (const e of events) {
      if (e.type === "pay" && e.reason === "rent") {
        if (e.from === me) rentPaid += e.amount;
        if (e.to === me) rentReceived += e.amount;
      }
      if (e.type === "bought" && e.seat === me) bought.push(e.square);
      if (e.type === "auctionEnded" && e.result.winner === me)
        bought.push(e.result.square);
    }
    const starId = (sq: number) => board.squares[sq]?.star?.star.id ?? "";
    const mine = myRank(ended.result, me);
    return {
      players: end.rules.players,
      length: end.rules.length,
      sky: end.rules.sky,
      rank: mine?.rank ?? null,
      assets: mine?.assets ?? 0,
      cash: end.cash[me] ?? 0,
      by: ended.result?.kind ?? "retired",
      bought: bought.map(starId),
      completed: board.groups
        .filter((_, g) => isComplete(end, me, g))
        .map((g) => g.id),
      rentPaid,
      rentReceived,
      met: metSquares(end, events).map(starId),
    };
  },
  game(view): GalaxyGame {
    return {
      won: !view.retired && myRank(view.result, view.mySeat)?.rank === 1,
      retired: view.retired === true,
    };
  },
};

/** 행동 한 줄(다시 보기). 칸 이름은 기본 하늘의 판으로 읽는다(G7 전까지 하늘이 하나다) */
export function describeGalaxy(action: unknown): string {
  const a = action as Action;
  const board = boardOfSky(DEFAULT_SKY);
  const at = (square: number) => squareName(board, square);
  switch (a.type) {
    case "commit":
      return "주사위 사슬 약속";
    case "reveal":
      return "주사위 고리 공개";
    case "roll":
      return "주사위 굴리기";
    case "payFine":
      return `소행성대에서 ${money(NUMBERS.asteroidFine)} 내고 나가기`;
    case "buy":
      return "별 사기";
    case "pass":
      return "넘기기(봉인 입찰)";
    case "bid":
      return "입찰 봉투 내기";
    case "bidReveal":
      return a.value > 0
        ? `입찰 공개 ${money(a.value)}`
        : "입찰 공개(내지 않음)";
    case "offer":
      return "거래 제안";
    case "acceptTrade":
      return "거래 받기";
    case "rejectTrade":
      return "거래 거절";
    case "build":
      return `${at(a.square)} 정거장 올리기`;
    case "sell":
      return `${at(a.square)} 정거장 내리기`;
    case "mortgage":
      return `${at(a.square)} 맡기기`;
    case "unmortgage":
      return `${at(a.square)} 되찾기`;
    case "end":
      return "차례 마치기";
    case "timeUp":
      return "시간 상한";
    case "timeout":
      return "시간패";
    case "resign":
      return "기권";
    case "retire":
      return "끝내기";
  }
}

/**
 * 다시 보기 해설: 이 걸음에서 별빛이 어떻게 흘렀는지 사건으로 보인다(평가는 하지 않는다).
 * 주사위 게임이라 고수와 견주는 평가 대신 돈의 흐름을 말한다
 */
export function explainGalaxy(
  state: GalaxyState,
  next: { seat: number; action: unknown },
  _after: GalaxyState | null,
  _seed: number,
  name: (seat: number) => string,
): Commentary {
  const situation = [
    `${state.round}돌림`,
    `${name(state.turn.seat)}의 차례`,
    describeGalaxy(next.action),
  ];
  const result = step(state, next.seat, next.action as Action);
  const reasons = result.ok
    ? result.events.flatMap((e) => {
        const line = eventLine(e, state.board, name);
        return line ? [line] : [];
      })
    : [];
  return { situation, verdict: null, reasons };
}

const TIMED = new Set<Action["type"]>([
  "roll",
  "payFine",
  "buy",
  "pass",
  "offer",
  "acceptTrade",
  "rejectTrade",
  "build",
  "sell",
  "mortgage",
  "unmortgage",
  "end",
]);

/** 은하 한 바퀴 엔진을 대국 진행·온라인 방에 잇는다. 판은 규칙의 하늘로 만든다(사계절 하늘은 늘 있다) */
export const galaxyKit: GalaxyKit = {
  id: "galaxy",
  createMatch: (rules, seed) => createMatch(rules, seed, boardOfSky(rules.sky)),
  step,
  viewOf,
  replay: (rules, seed, log) => replay(rules, seed, boardOfSky(rules.sky), log),
  pendingSeats,
  playerCount: (rules) => rules.players,
  encodeRules: encodeGalaxyRules,
  decodeRules: decodeGalaxyRules,
  startEvents: (view) => [{ type: "gameStarted", turn: view.starter }],
  isOver: (view) => view.phase === "gameOver",
  // 끝내기·시간패·시간 상한은 방장 기기만 기록한다.
  guestMayAct: (action) =>
    action.type !== "retire" &&
    action.type !== "timeout" &&
    action.type !== "timeUp",
  offTurn: (view, action) =>
    action.type === "resign" && view.phase !== "gameOver",
  // 사람이 자기 씨앗으로 약속한 사슬은 컴퓨터가 공개할 수 없다.
  botCanAct: botKnowsChain,
  retireAction: { type: "retire" },
  stats: galaxyStats,
  // 숨긴 패가 없다. 주사위·공문은 기록 속 고리 공개로 다시 계산된다.
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: (state) => ({
      voids: Array.from({ length: state.rules.players }, () => []),
      tally: state.cash.map((cash, seat) => ({
        seat,
        label: "별빛",
        value: money(cash),
      })),
    }),
    describe: describeGalaxy,
    sortHand: (_state, cards) => [...cards],
    explain: explainGalaxy,
  },
  botFor: (level) => galaxyBotFor(level),
  timing: {
    turn: clockTurn,
    stamp: (action, spent) =>
      TIMED.has(action.type) ? ({ ...action, spent } as Action) : action,
    timeout: (spent) => ({ type: "timeout", spent }),
    strip: (action) => {
      if (action.type === "timeout") return null;
      if (!("spent" in action)) return action;
      const { spent: _spent, ...rest } = action;
      return rest as Action;
    },
  },
};

/* ---------- 지표(내 기록) ---------- */

export interface GalaxySummary {
  rounds: number;
  /** 1등 판 수 */
  firsts: number;
  averageRank: number;
  averageAssets: number;
  bestAssets: number;
  /** 완성한 별자리(판마다 센 합) */
  completed: number;
  /** 별자리마다 완성한 판 수 */
  completedBy: Record<string, number>;
  rentPaid: number;
  rentReceived: number;
  /** 만난 별(별 id, 겹치지 않게) */
  met: string[];
  recent: { rank: number | null; players: number }[];
}

export function summarizeGalaxy(rounds: readonly RoundRecord[]): GalaxySummary {
  const all = rounds
    .filter((r) => r.game === "galaxy")
    .map((r) => r.data as GalaxyRound);
  const ranked = all.filter((r) => r.rank !== null);
  const completedBy: Record<string, number> = {};
  for (const r of all)
    for (const id of r.completed) completedBy[id] = (completedBy[id] ?? 0) + 1;
  const sum = (pick: (r: GalaxyRound) => number, list = all) =>
    list.reduce((n, r) => n + pick(r), 0);
  return {
    rounds: all.length,
    firsts: all.filter((r) => r.rank === 1).length,
    averageRank:
      ranked.length === 0 ? 0 : sum((r) => r.rank ?? 0, ranked) / ranked.length,
    averageAssets:
      ranked.length === 0 ? 0 : sum((r) => r.assets, ranked) / ranked.length,
    bestAssets: Math.max(0, ...all.map((r) => r.assets)),
    completed: sum((r) => r.completed.length),
    completedBy,
    rentPaid: sum((r) => r.rentPaid),
    rentReceived: sum((r) => r.rentReceived),
    met: [...new Set(all.flatMap((r) => r.met))].filter(Boolean),
    recent: all.slice(-20).map((r) => ({ rank: r.rank, players: r.players })),
  };
}
