import {
  type Action,
  activeSeats,
  bidCommitment,
  bidSalt,
  debtPlan,
  type GalaxyState,
  type GalaxyView,
  isComplete,
  levelCostAt,
  NUMBERS,
  rentOf,
  STAR_SQUARES,
  sellValue,
  starAt,
  step,
  type TradeOffer,
  type TradeSide,
  tradeProblem,
  unmortgageCost,
} from "@game/galaxy-engine";
import {
  createRng,
  nextFloat,
  nextInt,
  type RngState,
} from "@game/mighty-engine";
import {
  CHAIN_LENGTH,
  chainHash,
  derivedSeed,
  sha256Hex,
} from "@game/yut-engine";

import {
  asState,
  type Board,
  ceil10,
  floor10,
  maxOpponentRent,
  opponentTurns,
  remainingRounds,
  rentAhead,
  seasonless,
  worth,
  worthGain,
} from "./evaluate";
import { landingRate } from "./odds";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(남의 씨앗·입찰 값은 모른다) */
export interface GalaxyBot {
  readonly name: string;
  decide(view: GalaxyView, rng: RngState): Action;
}

/* ───────────── 사슬: 자기 자리 재료로만 ───────────── */

/** 이 자리 재료로 만든 이번 세대 씨앗(컴퓨터·혼자 하기 사슬) */
export function botSeedOf(
  view: Pick<GalaxyView, "botKey" | "generation">,
): string {
  return derivedSeed(view.botKey, view.generation);
}

/**
 * 씨앗의 사슬 고리 전체(0이 약속). 공개마다 600번 해시를 다시 하지 않게 최근 씨앗 몇 개만 기억한다
 * (한 판에 자리 넷 × 세대 하나라 작다)
 */
const chainCache = new Map<string, string[]>();
function chainLinks(seed: string): string[] {
  const hit = chainCache.get(seed);
  if (hit) return hit;
  const links: string[] = new Array(CHAIN_LENGTH + 1);
  links[CHAIN_LENGTH] = seed;
  for (let i = CHAIN_LENGTH; i > 0; i--)
    links[i - 1] = chainHash(links[i] as string);
  chainCache.set(seed, links);
  if (chainCache.size > 16) {
    const oldest = chainCache.keys().next().value as string;
    chainCache.delete(oldest);
  }
  return links;
}

/**
 * 컴퓨터가 이 자리의 사슬을 아는가. 사람이 자기 씨앗으로 약속한 자리(끊긴 사람 대신 둘 때)는 모르므로
 * 공개는 그 사람을 기다린다. 그 밖의 결정은 언제든 대신 할 수 있다
 */
export function botKnowsChain(view: GalaxyView): boolean {
  if (view.decision?.kind === "bidReveal") return committedBid(view) !== null;
  if (view.decision?.kind !== "reveal") return true;
  return view.chains[view.mySeat]?.commit === chainLinks(botSeedOf(view))[0];
}

/**
 * 이 자리 봉투가 자리 재료의 소금(`bidSalt`)으로 낸 것이면 그 값. 컴퓨터 자신이 낸 봉투, 끊긴 사람 대신 낸 봉투,
 * 온라인 방이 결정 시간을 넘긴 사람 대신 낸 「내지 않음」 모두 같은 소금이라, 실력 단계와 상관없이 약속에서 값을 찾는다
 * (10 단위로 가진 별빛까지라 몇백 번 해시면 된다). 사람이 자기 소금으로 낸 봉투면 null
 */
export function committedBid(view: GalaxyView): number | null {
  const auction = view.auction;
  const commit = auction?.myCommit ?? null;
  if (!auction || !commit) return null;
  const salt = bidSalt(view.botKey, auction.index);
  const cash = view.cash[view.mySeat] ?? 0;
  for (let value = 0; value <= cash; value += 10)
    if (bidCommitment(auction.index, value, salt) === commit) return value;
  return null;
}

/** 재료로 만든 사슬로 약속·공개한다(컴퓨터·혼자 하기의 내 자리) */
export function derivedChainAction(view: GalaxyView): Action | null {
  const kind = view.decision?.kind;
  if (kind === "commit")
    return { type: "commit", hash: chainLinks(botSeedOf(view))[0] as string };
  if (kind === "reveal") {
    if (!botKnowsChain(view))
      throw new Error("이 자리의 사슬은 사람이 만들어 컴퓨터가 공개할 수 없다");
    const used = view.chains[view.mySeat]?.used ?? 0;
    return {
      type: "reveal",
      link: chainLinks(botSeedOf(view))[used + 1] as string,
    };
  }
  return null;
}

/* ───────────── 공통 틀 ───────────── */

/** 한 단계의 판단. 값을 정하는 결정마다 하나씩 */
interface Policy {
  /** 봉인 입찰에 낼 값(0은 내지 않음). 약속과 공개에서 같은 값이 나와야 해 화면만으로 정한다 */
  bid(ctx: Ctx, square: number, rng: RngState): number;
  buy(ctx: Ctx, square: number, price: number, rng: RngState): boolean;
  /** 차례 안의 관리(정거장 올리기·되찾기). 할 것이 없으면 null */
  manage(ctx: Ctx, rng: RngState): Action | null;
  /** 굴리기 전 거래 제안. 없으면 null */
  offer(ctx: Ctx): Action | null;
  accept(ctx: Ctx, offer: TradeOffer): boolean;
  payFine(ctx: Ctx): boolean;
}

/** 한 번의 결정에서 쓰는 셈 재료 */
interface Ctx {
  view: GalaxyView;
  state: GalaxyState;
  seat: number;
  rate: readonly number[];
  /** 남은 상대 차례 수 */
  turns: number;
}

function ctxOf(view: GalaxyView): Ctx {
  return {
    view,
    state: asState(view),
    seat: view.mySeat,
    rate: landingRate(view.board),
    turns: opponentTurns(view, view.mySeat),
  };
}

function ok(ctx: Ctx, action: Action): boolean {
  return step(ctx.state, ctx.seat, action).ok;
}

/** 입찰 값을 정할 난수: 재료와 입찰 번호로 정해 약속 때와 공개 때 같다 */
function bidRng(view: GalaxyView, index: number): RngState {
  const hex = sha256Hex(`galaxy-bot-bid|${view.botKey}|${index}`);
  return createRng(Number.parseInt(hex.slice(0, 8), 16));
}

function legalBid(value: number, cash: number): number {
  const v = floor10(Math.min(value, cash));
  return v >= 10 ? v : 0;
}

function makeBot(name: string, policy: Policy): GalaxyBot {
  return {
    name,
    decide(view, rng) {
      const decision = view.decision;
      if (!decision) throw new Error("둘 차례가 아니다");
      const chain = derivedChainAction(view);
      if (chain) return chain;
      if (decision.kind === "bid" || decision.kind === "bidReveal") {
        const auction = view.auction;
        if (!auction) throw new Error("입찰이 없다");
        const salt = bidSalt(view.botKey, auction.index);
        if (decision.kind === "bidReveal") {
          // 약속에서 값을 찾는다(대신 낸 봉투도 같은 소금이다). 사람이 자기 소금으로 냈으면 공개할 수 없다
          const value = committedBid(view);
          if (value === null)
            throw new Error(
              "이 자리 봉투는 사람이 만들어 컴퓨터가 공개할 수 없다",
            );
          return { type: "bidReveal", value, salt };
        }
        const ctx = ctxOf(view);
        const value = legalBid(
          policy.bid(ctx, auction.square, bidRng(view, auction.index)),
          view.cash[view.mySeat] ?? 0,
        );
        return { type: "bid", hash: bidCommitment(auction.index, value, salt) };
      }
      const ctx = ctxOf(view);
      switch (decision.kind) {
        case "buy":
          return decision.canAfford &&
            policy.buy(ctx, decision.square, decision.price, rng)
            ? { type: "buy" }
            : { type: "pass" };
        case "trade":
          return policy.accept(ctx, decision.offer)
            ? { type: "acceptTrade" }
            : { type: "rejectTrade" };
        case "debt": {
          const plan = debtPlan(ctx.state);
          if (plan[0]) return plan[0];
          throw new Error("빚을 정리할 수가 없다");
        }
        case "roll": {
          if (decision.canOffer) {
            const offer = policy.offer(ctx);
            if (offer && ok(ctx, offer)) return offer;
          }
          const managed = policy.manage(ctx, rng);
          if (managed && ok(ctx, managed)) return managed;
          if (decision.canPayFine && policy.payFine(ctx))
            return { type: "payFine" };
          return { type: "roll" };
        }
        case "end": {
          const managed = policy.manage(ctx, rng);
          if (managed && ok(ctx, managed)) return managed;
          return { type: "end" };
        }
        default:
          throw new Error("모르는 결정이다");
      }
    },
  };
}

/* ───────────── 공통 셈 ───────────── */

function myCash(ctx: Ctx): number {
  return ctx.view.cash[ctx.seat] ?? 0;
}

function groupOf(ctx: Ctx, square: number): number {
  return starAt(ctx.view.board, square)?.group ?? -1;
}

function ownedIn(ctx: Ctx, seat: number, group: number): number {
  const squares = ctx.view.board.groups[group]?.squares ?? [];
  return squares.filter((sq) => ctx.view.owners[sq] === seat).length;
}

/** 이 사람이 가진, 거래할 수 있는 별 */
function tradableStars(ctx: Ctx, seat: number): number[] {
  return STAR_SQUARES.filter((sq) => {
    if (ctx.view.owners[sq] !== seat || ctx.view.mortgaged[sq]) return false;
    const squares = ctx.view.board.groups[groupOf(ctx, sq)]?.squares ?? [];
    return squares.every((s) => (ctx.view.levels[s] ?? 0) <= 1);
  });
}

/** 지금 올릴 수 있는 칸(엔진 규칙으로 확인) */
function buildable(ctx: Ctx): number[] {
  return STAR_SQUARES.filter(
    (sq) =>
      ctx.view.owners[sq] === ctx.seat &&
      ok(ctx, { type: "build", square: sq }),
  );
}

/** 이 칸을 한 단 올리면 늘어나는 이용료(제철 빼고) */
function rentGain(ctx: Ctx, square: number): number {
  const b = seasonless(ctx.view);
  const levels = [...b.levels];
  levels[square] = (levels[square] ?? 1) + 1;
  return rentOf({ ...b, levels }, square) - rentOf(b, square);
}

/** 거래 뒤의 판(별 주인과 별빛만 바꾼다) */
function afterTrade(b: Board, offer: TradeOffer): Board {
  const owners = [...b.owners];
  const cash = [...b.cash];
  for (const sq of offer.give.stars) owners[sq] = offer.to;
  for (const sq of offer.get.stars) owners[sq] = offer.from;
  cash[offer.from] = (cash[offer.from] ?? 0) - offer.give.cash + offer.get.cash;
  cash[offer.to] = (cash[offer.to] ?? 0) + offer.give.cash - offer.get.cash;
  return { ...b, owners, cash };
}

/** 이 거래로 이 사람이 새로 완성하는 별자리 */
function newlyCompleted(b: Board, after: Board, seat: number): number[] {
  return b.board.groups.flatMap((_, g) =>
    !isComplete(b, seat, g) && isComplete(after, seat, g) ? [g] : [],
  );
}

function side(stars: number[], cash: number): TradeSide {
  return { stars, cash };
}

function starsValue(ctx: Ctx, stars: readonly number[]): number {
  return stars.reduce(
    (t, sq) => t + (starAt(ctx.view.board, sq)?.value ?? 0),
    0,
  );
}

/**
 * 별자리를 완성하는 거래에 내는 값의 상한(넘겨주는 별 값 + 별빛 − 받는 별빛): 넘겨받는 별 값의 1.5배.
 * 남은 돌림이 적으면 완성으로 받을 이용료도 적어, 마지막 돌림에는 별 값까지로 줄인다(자산은 완성 100만큼 는다)
 */
function completionCap(ctx: Ctx, value: number): number {
  const rounds = remainingRounds(ctx.view);
  return value * (1 + 0.5 * Math.min(1, (rounds - 1) / 6));
}

/** 이 거래로 받는 쪽(`offer.to`)이 내놓는 값: 주는 별 값 + 주는 별빛 − 받는 별빛 */
function netPaidByReceiver(ctx: Ctx, offer: TradeOffer): number {
  return starsValue(ctx, offer.get.stars) + offer.get.cash - offer.give.cash;
}

/** 외톨이 별을 이만큼(값의 배수) 넘게 받으면 판다 */
const LONE_SALE = 1.3;

/* ───────────── 입문 ───────────── */

/**
 * 입문(docs/48 8절): 별빛이 300 넘으면 거의(90%) 산다. 입찰은 별 값의 60~100% 무작위.
 * 완성한 별자리는 별빛을 400 남기는 안에서 아무 데나 올린다. 거래는 하지 않고 제안은 모두 거절한다.
 * 소행성대에서는 늘 굴린다
 */
const beginnerPolicy: Policy = {
  bid(ctx, square, rng) {
    const price = starAt(ctx.view.board, square)?.value ?? 0;
    return price * (0.6 + 0.4 * nextFloat(rng));
  },
  buy(ctx, _square, price, rng) {
    return (
      myCash(ctx) - price >= 0 && myCash(ctx) > 300 && nextFloat(rng) < 0.9
    );
  },
  manage(ctx, rng) {
    const builds = buildable(ctx).filter(
      (sq) => myCash(ctx) - levelCostAt(ctx.view.board, sq) >= 400,
    );
    if (builds.length > 0)
      return {
        type: "build",
        square: builds[nextInt(rng, builds.length)] as number,
      };
    const back = STAR_SQUARES.find(
      (sq) =>
        ctx.view.owners[sq] === ctx.seat &&
        ctx.view.mortgaged[sq] &&
        myCash(ctx) - unmortgageCost(ctx.view.board, sq) >= 600,
    );
    return back === undefined ? null : { type: "unmortgage", square: back };
  },
  offer: () => null,
  accept: () => false,
  payFine: () => false,
};

/* ───────────── 중수 ───────────── */

/**
 * 중수가 남길 돈: 지금 남의 별 이용료 가운데 가장 큰 값의 1.5배(적어도 60). 1배로 줄여 보았더니
 * 정거장을 남길 돈 끝까지 지어 큰 정거장 한 번에 운항 중단이 잦았다(docs/48 3-6)
 */
function intermediateReserve(ctx: Ctx): number {
  return Math.max(60, 1.5 * maxOpponentRent(ctx.view, ctx.seat));
}

/** 중수가 이 별을 더 쳐주는 몫: 내 별자리를 잇는 별 +0.5, 남의 별자리를 막는 별 +0.3 */
function intermediateBonus(ctx: Ctx, square: number): number {
  const group = groupOf(ctx, square);
  let bonus = 0;
  if (ownedIn(ctx, ctx.seat, group) > 0) bonus += 0.5;
  for (const other of activeSeats(ctx.view))
    if (other !== ctx.seat && ownedIn(ctx, other, group) > 0) {
      bonus += 0.3;
      break;
    }
  return bonus;
}

/**
 * 중수가 받는 파는 거래: 내가 주는 별이 모두 그 별자리에 하나뿐인 외톨이 별이고,
 * 받는 것(별 값 + 별빛)이 주는 것의 1.3배 이상이다
 */
function sellsLoneStars(ctx: Ctx, offer: TradeOffer): boolean {
  const given = offer.get.stars;
  if (given.some((sq) => ownedIn(ctx, ctx.seat, groupOf(ctx, sq)) !== 1))
    return false;
  if (myCash(ctx) - offer.get.cash < intermediateReserve(ctx)) return false;
  const out = starsValue(ctx, given) + offer.get.cash;
  const back = starsValue(ctx, offer.give.stars) + offer.give.cash;
  return back >= LONE_SALE * out;
}

/** 칸 밟힘을 모르는 중수가 쓰는 고른 밟힘(한 차례에 별 칸 하나를 밟을 어림) */
const EVEN_RATE = 1 / 28;
const evenRates = new Array<number>(32)
  .fill(0)
  .map((_, sq) => (STAR_SQUARES.includes(sq) ? EVEN_RATE : 0));

/**
 * 공정한 제안: 두 쪽의 기대 자산 변화(고른 밟힘으로 셈)가 비슷하다. 내 쪽이 줄지 않고,
 * 상대 쪽 이득이 내 이득보다 50(또는 오가는 별 값의 10%) 넘게 크지 않다
 */
function fairForIntermediate(ctx: Ctx, offer: TradeOffer): boolean {
  if (myCash(ctx) - offer.get.cash < intermediateReserve(ctx)) return false;
  const after = afterTrade(ctx.view, offer);
  const delta = (seat: number) => {
    const turns = opponentTurns(ctx.view, seat);
    return (
      worth(after, seat, evenRates, turns) -
      worth(ctx.view, seat, evenRates, turns)
    );
  };
  const mine = delta(offer.to);
  const theirs = delta(offer.from);
  const traded =
    starsValue(ctx, offer.give.stars) + starsValue(ctx, offer.get.stars);
  return mine >= 0 && theirs - mine <= Math.max(50, 0.1 * traded);
}

const intermediatePolicy: Policy = {
  bid(ctx, square) {
    const price = starAt(ctx.view.board, square)?.value ?? 0;
    const value = price * 0.8 * (1 + intermediateBonus(ctx, square));
    return Math.min(value, myCash(ctx) - intermediateReserve(ctx));
  },
  buy(ctx, square, price) {
    const left = myCash(ctx) - price;
    const reserve = intermediateReserve(ctx);
    if (left >= reserve) return true;
    return intermediateBonus(ctx, square) > 0 && left >= reserve / 2;
  },
  manage(ctx) {
    const reserve = intermediateReserve(ctx);
    const rounds = remainingRounds(ctx.view);
    const others = activeSeats(ctx.view).length - 1;
    // 완성한 별자리는 남길 돈 안에서 올린다. 짓는 순간 자산이 한 단 값의 절반만큼 줄어드니(2-10)
    // 그 몫을 남은 돌림에 이용료로 되찾을 수 있을 때만. 비싼 별자리부터, 별자리 안에서는 엔진이 허락한 칸(고르게)
    const builds = buildable(ctx)
      .filter((sq) => {
        const cost = levelCostAt(ctx.view.board, sq);
        if (myCash(ctx) - cost < reserve) return false;
        const perRound = rentGain(ctx, sq) * EVEN_RATE * others;
        const lost = cost - sellValue(ctx.view.board, sq);
        return perRound > 0 && lost / perRound <= rounds;
      })
      .sort(
        (a, b) =>
          levelCostAt(ctx.view.board, b) - levelCostAt(ctx.view.board, a) ||
          a - b,
      );
    if (builds[0] !== undefined) return { type: "build", square: builds[0] };
    const back = STAR_SQUARES.filter(
      (sq) =>
        ctx.view.owners[sq] === ctx.seat &&
        ctx.view.mortgaged[sq] &&
        myCash(ctx) - unmortgageCost(ctx.view.board, sq) >= 2 * reserve + 100,
    ).sort(
      (a, b) =>
        (starAt(ctx.view.board, b)?.value ?? 0) -
          (starAt(ctx.view.board, a)?.value ?? 0) || a - b,
    );
    return back[0] === undefined
      ? null
      : { type: "unmortgage", square: back[0] };
  },
  offer(ctx) {
    // 하나만 모자란 내 별자리의 마지막 별을, 상대 별자리를 완성시키지 않는 내 별 하나 + 값 차이로 청한다
    const reserve = intermediateReserve(ctx);
    const mine = tradableStars(ctx, ctx.seat);
    for (const [g, group] of ctx.view.board.groups.entries()) {
      const missing = group.squares.filter(
        (sq) => ctx.view.owners[sq] !== ctx.seat,
      );
      if (missing.length !== 1 || ownedIn(ctx, ctx.seat, g) === 0) continue;
      const target = missing[0] as number;
      const owner = ctx.view.owners[target] ?? -1;
      if (owner < 0 || owner === ctx.seat) continue;
      if (!tradableStars(ctx, owner).includes(target)) continue;
      const price = starAt(ctx.view.board, target)?.value ?? 0;
      const gives = mine
        .filter((sq) => groupOf(ctx, sq) !== g)
        .filter((sq) => ownedIn(ctx, ctx.seat, groupOf(ctx, sq)) === 1)
        .filter(
          (sq) =>
            ownedIn(ctx, owner, groupOf(ctx, sq)) + 1 <
            (ctx.view.board.groups[groupOf(ctx, sq)]?.squares.length ?? 0),
        )
        .sort(
          (a, b) =>
            (starAt(ctx.view.board, a)?.value ?? 0) -
              (starAt(ctx.view.board, b)?.value ?? 0) || a - b,
        );
      const give = gives[0];
      const giveValue =
        give === undefined ? 0 : (starAt(ctx.view.board, give)?.value ?? 0);
      // 상대가 받을 만하게 값의 1.3배(외톨이 별 파는 기준, 중수끼리도 거래가 이루어진다). 완성 거래 상한을 넘으면 청하지 않는다
      const cash = ceil10(Math.max(0, LONE_SALE * price - giveValue));
      if (myCash(ctx) - cash < reserve) continue;
      if (cash + giveValue > completionCap(ctx, price)) continue;
      const offer: TradeOffer = {
        from: ctx.seat,
        to: owner,
        give: side(give === undefined ? [] : [give], cash),
        get: side([target], 0),
      };
      if (tradeProblem(ctx.state, offer) === null)
        return { type: "offer", to: owner, give: offer.give, get: offer.get };
    }
    return null;
  },
  accept(ctx, offer) {
    // 내 별자리를 완성하는 거래는 내놓는 값이 상한(넘겨받는 별 값의 1.5배, 남은 돌림이 적으면 덜) 안이면 받는다.
    // 상대도 완성하면 내 별자리가 더 비쌀 때만. 그 밖에는 외톨이 별을 값의 1.3배 넘게 받고 파는 거래,
    // 두 쪽 기대 자산 변화가 비슷한 공정한 거래를 받는다
    const after = afterTrade(ctx.view, offer);
    const mine = newlyCompleted(ctx.view, after, ctx.seat);
    if (mine.length === 0)
      return sellsLoneStars(ctx, offer) || fairForIntermediate(ctx, offer);
    const pay = offer.get.cash;
    if (myCash(ctx) - pay < intermediateReserve(ctx)) return false;
    if (
      netPaidByReceiver(ctx, offer) >
      completionCap(ctx, starsValue(ctx, offer.give.stars))
    )
      return false;
    const theirs = newlyCompleted(ctx.view, after, offer.from);
    const base = (g: number) => ctx.view.board.groups[g]?.base ?? 0;
    return (
      theirs.length === 0 ||
      Math.max(...mine.map(base)) >= Math.max(...theirs.map(base))
    );
  },
  payFine(ctx) {
    const free = STAR_SQUARES.filter(
      (sq) => (ctx.view.owners[sq] ?? -1) < 0,
    ).length;
    return free >= 8 && myCash(ctx) >= intermediateReserve(ctx) + 50;
  },
};

/* ───────────── 고수 ───────────── */

/** 고수가 남길 돈: 다음 굴림에 멈출 수 있는 남의 별 이용료 가운데 가장 큰 값(적어도 60) */
function expertReserve(ctx: Ctx): number {
  const ahead = rentAhead(
    ctx.view,
    ctx.seat,
    ctx.view.positions[ctx.seat] ?? 0,
  );
  return Math.max(60, ahead, 0.5 * maxOpponentRent(ctx.view, ctx.seat));
}

/** 남이 이 별을 가지면 얻는 덤(별 값을 뺀 기대 이득) 가운데 가장 큰 값. 막는 값으로 쓴다 */
function denialValue(ctx: Ctx, square: number): number {
  const price = starAt(ctx.view.board, square)?.value ?? 0;
  let max = 0;
  for (const other of activeSeats(ctx.view)) {
    if (other === ctx.seat) continue;
    const turns = opponentTurns(ctx.view, other);
    const gain = worthGain(ctx.view, other, square, ctx.rate, turns) - price;
    max = Math.max(max, gain);
  }
  return max;
}

/** 남들이 이 별에 낼 만한 값의 어림(그 사람의 본전과 남은 별빛 가운데 작은 것) */
function opponentBidGuess(ctx: Ctx, square: number): number {
  const price = starAt(ctx.view.board, square)?.value ?? 0;
  let max = 0;
  for (const other of activeSeats(ctx.view)) {
    if (other === ctx.seat) continue;
    const turns = opponentTurns(ctx.view, other);
    const value = Math.min(
      worthGain(ctx.view, other, square, ctx.rate, turns),
      price * 1.2,
    );
    max = Math.max(max, Math.min(value, (ctx.view.cash[other] ?? 0) - 60));
  }
  return max;
}

/** 거래로 바뀌는 고수 기대 자산(제안한 쪽, 받는 쪽) */
function tradeDelta(ctx: Ctx, offer: TradeOffer): { from: number; to: number } {
  const after = afterTrade(ctx.view, offer);
  const delta = (seat: number) => {
    const turns = opponentTurns(ctx.view, seat);
    return (
      worth(after, seat, ctx.rate, turns) -
      worth(ctx.view, seat, ctx.rate, turns)
    );
  };
  return { from: delta(offer.from), to: delta(offer.to) };
}

const expertPolicy: Policy = {
  bid(ctx, square) {
    // 본전(기대 자산 이득) + 막는 값까지는 내도 되고, 남이 낼 만한 값보다 10 더 내면 충분하다
    const mine = worthGain(ctx.view, ctx.seat, square, ctx.rate, ctx.turns);
    const limit = mine + 0.5 * denialValue(ctx, square);
    const enough = opponentBidGuess(ctx, square) + 10;
    const spare = myCash(ctx) - 0.5 * expertReserve(ctx);
    return Math.min(limit, enough, spare);
  },
  buy(ctx, square, price) {
    // 사도 자산은 그대로라 남길 돈만 지키면 산다. 별자리를 잇거나 막는 별이면 남길 돈의 절반까지 쓴다
    const left = myCash(ctx) - price;
    const reserve = expertReserve(ctx);
    if (left >= reserve) return true;
    const extra =
      worthGain(ctx.view, ctx.seat, square, ctx.rate, ctx.turns) -
      price +
      denialValue(ctx, square);
    return extra > price * 0.3 && left >= reserve / 2;
  },
  manage(ctx) {
    const reserve = expertReserve(ctx);
    const spare = myCash(ctx) - reserve;
    // 별자리마다 한 단 올림과 두 단 올림(3단 꺾임점: 2→3단이 1→2단보다 이용료가 훨씬 크다)의 효율을 견준다
    let best: { square: number; score: number } | null = null;
    for (const sq of buildable(ctx)) {
      const cost = levelCostAt(ctx.view.board, sq);
      if (cost > spare) continue;
      const group = ctx.view.board.groups[groupOf(ctx, sq)];
      if (!group) continue;
      const b = seasonless(ctx.view);
      const income = (levels: number[]) =>
        group.squares.reduce(
          (t, s) => t + rentOf({ ...b, levels }, s) * (ctx.rate[s] ?? 0),
          0,
        ) * ctx.turns;
      const now = income([...b.levels]);
      const raise = (by: number) => {
        const levels = [...b.levels];
        for (const s of group.squares)
          levels[s] = Math.min(4, (levels[s] ?? 1) + by);
        return levels;
      };
      const groupCost = cost * group.squares.length;
      let score = (income(raise(1)) - now) / groupCost;
      if (spare >= 2 * groupCost)
        score = Math.max(score, (income(raise(2)) - now) / (2 * groupCost));
      // 짓는 순간 자산이 한 단 값에서 돌려받는 값을 뺀 만큼(절반) 준다(2-10). 남은 판의 기대 이용료가
      // 그 몫의 1.2배(공문 6 정거장 점검, 빚 정리 위험 몫)를 넘을 때만 짓는다
      const lost = (cost - sellValue(ctx.view.board, sq)) / cost;
      if (score < 1.2 * lost) continue;
      if (!best || score > best.score) best = { square: sq, score };
    }
    if (best) return { type: "build", square: best.square };
    const back = STAR_SQUARES.filter(
      (sq) =>
        ctx.view.owners[sq] === ctx.seat &&
        ctx.view.mortgaged[sq] &&
        myCash(ctx) - unmortgageCost(ctx.view.board, sq) >= 2 * reserve + 100,
    ).sort(
      (a, b) =>
        worthGain(ctx.view, ctx.seat, b, ctx.rate, ctx.turns) -
          worthGain(ctx.view, ctx.seat, a, ctx.rate, ctx.turns) || a - b,
    );
    return back[0] === undefined
      ? null
      : { type: "unmortgage", square: back[0] };
  },
  offer(ctx) {
    // 내 별자리에 닿는 남의 별 하나를 별빛만, 또는 내 별 하나 + 별빛으로 청한다.
    // 상대 기대 자산이 줄지 않을 만큼 별빛을 얹고, 내 이득이 가장 큰 제안 하나
    const reserve = expertReserve(ctx);
    const mine = tradableStars(ctx, ctx.seat);
    let best: { offer: TradeOffer; gain: number } | null = null;
    for (const other of activeSeats(ctx.view)) {
      if (other === ctx.seat) continue;
      for (const target of tradableStars(ctx, other)) {
        if (ownedIn(ctx, ctx.seat, groupOf(ctx, target)) === 0) continue;
        for (const give of [undefined, ...mine]) {
          const base: TradeOffer = {
            from: ctx.seat,
            to: other,
            give: side(give === undefined ? [] : [give], 0),
            get: side([target], 0),
          };
          const zero = tradeDelta(ctx, base);
          const cash = ceil10(Math.max(0, 10 - zero.to));
          if (myCash(ctx) - cash < reserve) continue;
          const gain = zero.from - cash;
          // 상대에게 완성을 주면 내 이득이 상대 이득보다 커야 한다
          const after = afterTrade(ctx.view, base);
          if (
            newlyCompleted(ctx.view, after, other).length > 0 &&
            gain < zero.to + cash
          )
            continue;
          if (gain < 40) continue;
          if (!best || gain > best.gain)
            best = {
              offer: { ...base, give: side(base.give.stars, cash) },
              gain,
            };
        }
      }
    }
    if (!best || tradeProblem(ctx.state, best.offer) !== null) return null;
    return {
      type: "offer",
      to: best.offer.to,
      give: best.offer.give,
      get: best.offer.get,
    };
  },
  accept(ctx, offer) {
    // 두 쪽의 기대 자산 변화로 본다. 상대에게 완성을 주는 거래는 내 이득이 상대 이득보다 클 때만(웃돈)
    if (myCash(ctx) - offer.get.cash < 0.5 * expertReserve(ctx)) return false;
    const d = tradeDelta(ctx, offer);
    if (d.to <= 0) return false;
    const after = afterTrade(ctx.view, offer);
    // 내 별자리를 완성하는 거래도 내놓는 값은 넘겨받는 별 값의 1.5배(남은 돌림이 적으면 덜)까지
    if (
      newlyCompleted(ctx.view, after, ctx.seat).length > 0 &&
      netPaidByReceiver(ctx, offer) >
        completionCap(ctx, starsValue(ctx, offer.give.stars))
    )
      return false;
    if (newlyCompleted(ctx.view, after, offer.from).length > 0)
      return d.to > d.from;
    return true;
  },
  payFine(ctx) {
    // 아직 살 별이 많으면 50을 내고 나가고, 판이 찼으면 소행성대에 머물러 이용료를 피한다
    const free = STAR_SQUARES.filter((sq) => (ctx.view.owners[sq] ?? -1) < 0);
    if (free.length < 6) return false;
    return myCash(ctx) >= expertReserve(ctx) + NUMBERS.asteroidFine + 100;
  },
};

/* ───────────── 목록 ───────────── */

export const galaxyBeginnerBot = makeBot("입문", beginnerPolicy);
export const galaxyIntermediateBot = makeBot("중수", intermediatePolicy);
export const galaxyExpertBot = makeBot("고수", expertPolicy);

export const GALAXY_BOTS = [
  galaxyBeginnerBot,
  galaxyIntermediateBot,
  galaxyExpertBot,
] as const;

/** 0 입문, 1 중수, 2 고수 */
export function galaxyBotFor(level: number): GalaxyBot {
  return GALAXY_BOTS[Math.max(0, Math.min(2, level))] as GalaxyBot;
}
