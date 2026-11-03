import {
  type AuctionResult,
  BANK,
  type GalaxyBoard,
  type GameEvent,
  type PayReason,
} from "@game/galaxy-engine";

import { GALAXY_FX as FX } from "./fx-timing";
import { skyArt } from "./sky-art";

/**
 * 한 걸음의 사건을 차례로 보일 연출 목록으로 바꾼다(docs/41 6절 「동시에 움직이지 않기」).
 * 걸음마다 주사위 → 이동 → 칸 일(사기·공문·별자리) → 이용료 차례로 하나씩 보이고, 다 보인 뒤에 다음 걸음으로 간다.
 * 저장소(다음 걸음을 언제 보일지)와 화면(지금 무엇을 그릴지)이 같은 목록을 쓴다. 움직임 줄이기면 빈 목록
 */
export type FxStep =
  | {
      kind: "dice";
      seat: number;
      dice: [number, number];
      doubles: boolean;
    }
  | { kind: "move"; seat: number; from: number; path: number[]; jump: boolean }
  | {
      kind: "pay";
      /** 함께 흐르는 별빛(공문 하나로 모두가 받는 등) */
      flows: { from: number; to: number; amount: number }[];
      reason: PayReason;
      square?: number;
    }
  | { kind: "buy"; seat: number; square: number; price: number }
  | { kind: "card"; seat: number; card: number; squares: number[] }
  | { kind: "link"; seat: number; group: number; owned: number; size: number }
  | { kind: "jail"; seat: number }
  | { kind: "auction"; result: AuctionResult }
  | { kind: "season"; season: number }
  | { kind: "build"; seat: number; square: number; what: string }
  | { kind: "trade"; accepted: boolean; from: number; to: number }
  | { kind: "bankrupt"; seat: number };

export type TimedStep = FxStep & { at: number; dur: number };

export interface Timeline {
  steps: TimedStep[];
  total: number;
}

export const EMPTY_TIMELINE: Timeline = { steps: [], total: 0 };

/** 사건 묶음 → 연출 목록. 나(`me`)와 상관있는 순간은 온전히, 컴퓨터끼리는 줄여 보인다 */
export function buildTimeline(
  events: readonly GameEvent[],
  board: GalaxyBoard,
  me: number,
  options: { reduced: boolean; scale?: (ms: number) => number },
): Timeline {
  if (options.reduced) return EMPTY_TIMELINE;
  const scale = options.scale ?? ((ms: number) => ms);
  const steps: TimedStep[] = [];
  let at = 0;
  const push = (step: FxStep, ms: number) => {
    const dur = Math.max(0, scale(ms));
    steps.push({ ...step, at, dur } as TimedStep);
    at += dur + scale(FX.gap);
  };
  const mine = (seat: number) => seat === me;
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as GameEvent;
    switch (e.type) {
      case "dice":
        push(
          { kind: "dice", seat: e.seat, dice: e.dice, doubles: e.doubles },
          mine(e.seat) ? FX.dice : FX.diceBot,
        );
        break;
      case "moved": {
        const jump = e.via === "card" || e.path.length <= 1;
        const hop = mine(e.seat) ? FX.hop : FX.hopBot;
        push(
          { kind: "move", seat: e.seat, from: e.from, path: e.path, jump },
          Math.max(FX.moveMin, jump ? FX.moveMin : hop * e.path.length),
        );
        break;
      }
      case "pay": {
        // 사기·입찰 값은 사기·입찰 연출이 함께 보인다.
        if (e.reason === "buy" || e.reason === "bid") break;
        const flows = [{ from: e.from, to: e.to, amount: e.amount }];
        // 같은 까닭(공문 하나로 모두가 받는 등)으로 잇따른 별빛은 한 번에 흐른다.
        while (true) {
          const n = events[i + 1];
          if (
            n?.type !== "pay" ||
            n.reason !== e.reason ||
            n.card !== e.card ||
            n.square !== e.square
          )
            break;
          flows.push({ from: n.from, to: n.to, amount: n.amount });
          i += 1;
        }
        const touchesMe = flows.some((f) => mine(f.from) || mine(f.to));
        push(
          {
            kind: "pay",
            flows,
            reason: e.reason,
            ...(e.square !== undefined ? { square: e.square } : {}),
          },
          touchesMe ? FX.pay : FX.payBot,
        );
        break;
      }
      case "bought":
        push(
          { kind: "buy", seat: e.seat, square: e.square, price: e.price },
          FX.buy,
        );
        break;
      case "card":
        push(
          { kind: "card", seat: e.seat, card: e.card, squares: e.squares },
          mine(e.seat) ? FX.card : FX.cardBot,
        );
        break;
      case "linked": {
        const complete = e.owned >= e.size;
        const segments = skyArt(board)[e.group]?.segments.length ?? 0;
        push(
          {
            kind: "link",
            seat: e.seat,
            group: e.group,
            owned: e.owned,
            size: e.size,
          },
          complete
            ? FX.completeSegment * Math.max(3, segments) + FX.completeName
            : FX.link,
        );
        break;
      }
      case "jailed":
        push({ kind: "jail", seat: e.seat }, FX.jail);
        break;
      case "auctionEnded":
        push({ kind: "auction", result: e.result }, FX.auction);
        break;
      case "seasonChanged":
        push({ kind: "season", season: e.season }, FX.season);
        break;
      case "built":
      case "sold":
      case "mortgaged":
      case "unmortgaged":
        push(
          {
            kind: "build",
            seat: e.seat,
            square: e.square,
            what: e.type,
          },
          FX.build,
        );
        break;
      case "tradeAccepted":
      case "tradeRejected":
        push(
          {
            kind: "trade",
            accepted: e.type === "tradeAccepted",
            from: e.offer.from,
            to: e.offer.to,
          },
          FX.trade,
        );
        break;
      case "bankrupt":
        push({ kind: "bankrupt", seat: e.seat }, FX.bankrupt);
        break;
      default:
        break;
    }
  }
  const last = steps.at(-1);
  return { steps, total: last ? last.at + last.dur : 0 };
}

/** 지금(경과 ms) 보이는 연출 하나(없으면 null) */
export function activeStep(
  timeline: Timeline,
  elapsed: number,
): TimedStep | null {
  for (const s of timeline.steps)
    if (elapsed >= s.at && elapsed < s.at + s.dur + 1) return s;
  return null;
}

/**
 * 연출 도중의 우주선 자리. 아직 보이지 않은 움직임은 출발 칸, 움직이는 중이면 지나는 칸, 다 보였으면 도착 칸.
 * `positions`는 걸음 뒤 자리(엔진 화면)
 */
export function shipPositions(
  timeline: Timeline,
  positions: readonly number[],
  elapsed: number,
): { square: number; moving: boolean }[] {
  return positions.map((final, seat) => {
    const moves = timeline.steps.filter(
      (s): s is Extract<TimedStep, { kind: "move" }> =>
        s.kind === "move" && s.seat === seat,
    );
    const first = moves[0];
    if (!first) return { square: final, moving: false };
    let square = first.from;
    for (const m of moves) {
      if (elapsed < m.at) return { square, moving: false };
      if (elapsed < m.at + m.dur) {
        if (m.jump) return { square: m.path.at(-1) as number, moving: true };
        const k = Math.min(
          m.path.length - 1,
          Math.floor(((elapsed - m.at) / m.dur) * m.path.length),
        );
        return { square: m.path[k] as number, moving: true };
      }
      square = m.path.at(-1) as number;
    }
    return { square: final, moving: false };
  });
}

/**
 * 연출 도중의 별빛. 아직 보이지 않은 별빛 이동(사기·입찰 값 포함)을 걸음 뒤 별빛에서 되돌린다
 * (이용료 빛이 흘러간 뒤에 숫자가 바뀐다)
 */
export function shownCash(
  timeline: Timeline,
  events: readonly GameEvent[],
  cash: readonly number[],
  elapsed: number,
): number[] {
  if (timeline.steps.length === 0) return [...cash];
  const shown = [...cash];
  const undo = (from: number, to: number, amount: number) => {
    if (from !== BANK) shown[from] = (shown[from] ?? 0) + amount;
    if (to !== BANK) shown[to] = (shown[to] ?? 0) - amount;
  };
  // 사기·입찰 값은 그 연출이 시작할 때, 나머지는 그 흐름 연출이 끝날 때 바뀐다.
  const buyAt = new Map<number, number>();
  for (const s of timeline.steps) {
    if (s.kind === "buy") buyAt.set(s.square, s.at);
    if (s.kind === "auction" && s.result.winner !== null)
      buyAt.set(s.result.square, s.at + s.dur * 0.6);
  }
  for (const s of timeline.steps)
    if (s.kind === "pay" && elapsed < s.at + s.dur)
      for (const f of s.flows) undo(f.from, f.to, f.amount);
  for (const e of events)
    if (e.type === "pay" && (e.reason === "buy" || e.reason === "bid")) {
      const t = e.square !== undefined ? buyAt.get(e.square) : undefined;
      if (t !== undefined && elapsed < t) undo(e.from, e.to, e.amount);
    }
  return shown;
}

/** 연출 도중 아직 주인이 보이지 않을 별 칸(사기·입찰 연출 전) */
export function hiddenOwners(timeline: Timeline, elapsed: number): Set<number> {
  const hidden = new Set<number>();
  for (const s of timeline.steps) {
    if (s.kind === "buy" && elapsed < s.at) hidden.add(s.square);
    if (
      s.kind === "auction" &&
      s.result.winner !== null &&
      elapsed < s.at + s.dur * 0.6
    )
      hidden.add(s.result.square);
  }
  return hidden;
}
