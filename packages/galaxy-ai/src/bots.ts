import {
  type Action,
  activeSeats,
  bidCommitment,
  bidSalt,
  buildCostOf,
  debtPlan,
  type GalaxyState,
  type GalaxyView,
  levelCostAt,
  matchesFact,
  rentOf,
  requestById,
  requestCommitOf,
  requestOf,
  requestProgress,
  requestSecretOf,
  STAR_SQUARES,
  sellValue,
  starAssetOf,
  starAt,
  step,
  turnLimitOf,
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
  floor10,
  maxOpponentRent,
  opponentTurns,
  remainingRounds,
  rentAhead,
  seasonless,
  withOwner,
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
  if (view.decision?.kind === "requestReveal")
    return (
      view.requests?.commits[view.mySeat] ===
      requestCommitOf(view.mySeat, firstSeedOf(view))
    );
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

/** 이 자리 재료로 만든 0세대 사슬 씨앗(관측 의뢰 비밀을 여기서 만든다) */
function firstSeedOf(view: Pick<GalaxyView, "botKey">): string {
  return derivedSeed(view.botKey, 0);
}

/**
 * 이 자리가 재료로 약속한 관측 의뢰(의뢰를 끈 판, 닻이 아직 없거나 사람이 자기 씨앗으로 약속한 자리는 null).
 * 컴퓨터는 자기 의뢰만 안다
 */
export function myRequest(view: GalaxyView): number | null {
  const requests = view.requests;
  if (!requests?.anchor) return null;
  const seed = firstSeedOf(view);
  if (requests.commits[view.mySeat] !== requestCommitOf(view.mySeat, seed))
    return null;
  return requestOf(view.board, requestSecretOf(seed), requests.anchor);
}

/** 재료로 만든 사슬로 약속·공개한다(컴퓨터·혼자 하기의 내 자리). 관측 의뢰 약속·공개도 */
export function derivedChainAction(view: GalaxyView): Action | null {
  const kind = view.decision?.kind;
  if (kind === "commit")
    return {
      type: "commit",
      hash: chainLinks(botSeedOf(view))[0] as string,
      ...(view.requests && view.generation === 0
        ? { request: requestCommitOf(view.mySeat, firstSeedOf(view)) }
        : {}),
    };
  if (kind === "requestReveal") {
    if (!botKnowsChain(view))
      throw new Error("이 자리 의뢰는 사람이 만들어 컴퓨터가 펼칠 수 없다");
    return {
      type: "requestReveal",
      secret: requestSecretOf(firstSeedOf(view)),
    };
  }
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
  /** 봉투 입찰에 낼 값(0은 내지 않음). 약속과 공개에서 같은 값이 나와야 해 화면만으로 정한다 */
  bid(ctx: Ctx, square: number, rng: RngState): number;
  buy(ctx: Ctx, square: number, price: number, rng: RngState): boolean;
  /** 차례 안의 관리(정거장 올리기·되찾기). 할 것이 없으면 null */
  manage(ctx: Ctx, rng: RngState): Action | null;
  /** 소행성대에서 50을 내고 나갈지 */
  payFine(ctx: Ctx): boolean;
  /** 도착 인수(g5): 이용료를 낸 남의 별을 이 값에 사들일지 */
  takeover(ctx: Ctx, square: number, price: number): boolean;
}

/** 한 번의 결정에서 쓰는 셈 재료 */
interface Ctx {
  view: GalaxyView;
  state: GalaxyState;
  seat: number;
  rate: readonly number[];
  /** 남은 상대 차례 수 */
  turns: number;
  /** 내 관측 의뢰(모르거나 없으면 null) */
  request: number | null;
}

function ctxOf(view: GalaxyView): Ctx {
  return {
    view,
    state: asState(view),
    seat: view.mySeat,
    rate: landingRate(view.board),
    turns: opponentTurns(view, view.mySeat),
    request: myRequest(view),
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
        case "takeover":
          return policy.takeover(ctx, decision.square, decision.price)
            ? { type: "takeover" }
            : { type: "declineTakeover" };
        case "debt": {
          const plan = debtPlan(ctx.state);
          if (plan[0]) return plan[0];
          throw new Error("빚을 정리할 수가 없다");
        }
        case "roll": {
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

/** 지금 이 칸에 한 단 올리는 값(내 별 재방문이면 반값) */
function buildCost(ctx: Ctx, square: number): number {
  return buildCostOf(ctx.view, ctx.seat, square);
}

/** 정렬 열쇠: 재방문 반값이면 0(먼저), 아니면 1 */
function discountOf(ctx: Ctx, square: number): number {
  return buildCost(ctx, square) < levelCostAt(ctx.view.board, square) ? 0 : 1;
}

/** 도착 인수(g5)로 이 별을 사들이면 내 별자리가 완성되나 */
function takeoverCompletes(ctx: Ctx, square: number): boolean {
  const group = groupOf(ctx, square);
  const squares = ctx.view.board.groups[group]?.squares ?? [];
  return squares.every(
    (sq) => sq === square || ctx.view.owners[sq] === ctx.seat,
  );
}

/** 별 하나를 사면 줄어드는 자산(g5: 값 − 자산에 드는 값) */
function buyLoss(ctx: Ctx, square: number, price: number): number {
  return price - starAssetOf(ctx.view.board, square);
}

/** 이 별을 혼자 가졌을 때 남은 판에 받을 이용료 어림(고른 밟힘, 제철 빼고) */
function loneIncome(ctx: Ctx, square: number): number {
  const b = withOwner(seasonless(ctx.view), square, ctx.seat);
  const others = activeSeats(ctx.view).length - 1;
  return rentOf(b, square) * EVEN_RATE * others * remainingRounds(ctx.view);
}

/* ───────────── 입문 ───────────── */

/**
 * 입문(docs/48 8절): 별빛이 300 넘으면 거의(90%) 산다. 입찰은 별 값의 60~100% 무작위.
 * 완성한 별자리는 별빛을 400 남기는 안에서 아무 데나 올린다. 사들이기는 별자리를 완성할 때만.
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
      (sq) => myCash(ctx) - buildCost(ctx, sq) >= 400,
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
  payFine: () => false,
  takeover: (ctx, square, price) =>
    takeoverCompletes(ctx, square) && myCash(ctx) - price >= 400,
};

/* ───────────── 중수 ───────────── */

/**
 * 중수가 남길 돈: 지금 남의 별 이용료 가운데 가장 큰 값의 1.5배(적어도 60). 1배로 줄여 보았더니
 * 정거장을 남길 돈 끝까지 지어 큰 정거장 한 번에 운항 중단이 잦았다(docs/48 3-6)
 */
function intermediateReserve(ctx: Ctx): number {
  return Math.max(60, 1.5 * maxOpponentRent(ctx.view, ctx.seat));
}

/**
 * 내 관측 의뢰(15-5 1번)에 보탬이 되는 별인가: 아직 이루지 않았고, 별 사실 의뢰면 그 사실에 맞는 별,
 * 계절 의뢰면 그 계절 별자리 별, 넓은 순찰이면 아직 별이 없는 별자리 별
 */
function requestHelps(ctx: Ctx, square: number): boolean {
  const card = ctx.request;
  if (card === null) return false;
  const progress = requestProgress(ctx.view, ctx.seat, card);
  if (progress.have >= progress.need) return false;
  const star = starAt(ctx.view.board, square);
  if (!star) return false;
  const goal = requestById(card).goal;
  if (goal.kind === "fact") return matchesFact(star.star, goal.fact);
  if (goal.kind === "season")
    return ctx.view.board.groups[star.group]?.season === goal.season;
  return ownedIn(ctx, ctx.seat, star.group) === 0;
}

/**
 * 중수가 이 별을 더 쳐주는 몫: 내 별자리를 잇는 별 +0.5, 남의 별자리를 막는 별 +0.3,
 * 내 관측 의뢰에 보탬이 되는 별 +0.4
 */
function intermediateBonus(ctx: Ctx, square: number): number {
  const group = groupOf(ctx, square);
  let bonus = requestHelps(ctx, square) ? 0.4 : 0;
  if (ownedIn(ctx, ctx.seat, group) > 0) bonus += 0.5;
  for (const other of activeSeats(ctx.view))
    if (other !== ctx.seat && ownedIn(ctx, other, group) > 0) {
      bonus += 0.3;
      break;
    }
  return bonus;
}

/** 칸 밟힘을 모르는 중수가 쓰는 고른 밟힘(한 차례에 별 칸 하나를 밟을 어림) */
const EVEN_RATE = 1 / 28;

/** 중수 판단. 남길 돈(`reserveOf`)만 바꿔 고수가 바탕으로 쓴다 */
function intermediateWith(reserveOf: (ctx: Ctx) => number): Policy {
  return {
    bid(ctx, square) {
      const price = starAt(ctx.view.board, square)?.value ?? 0;
      const value = price * 0.8 * (1 + intermediateBonus(ctx, square));
      return Math.min(value, myCash(ctx) - reserveOf(ctx));
    },
    buy(ctx, square, price) {
      // g5: 사면 자산이 값의 4분의 1만큼 준다. 남은 판의 이용료(잇는 별·막는 별은 덤만큼 더)로 되찾을 별만 산다
      const left = myCash(ctx) - price;
      const reserve = reserveOf(ctx);
      const bonus = intermediateBonus(ctx, square);
      const pays =
        loneIncome(ctx, square) * (1 + 2 * bonus) >=
        buyLoss(ctx, square, price);
      if (!pays) return false;
      if (left >= reserve) return true;
      return bonus > 0 && left >= reserve / 2;
    },
    takeover(ctx, square, price) {
      // 내 별자리를 완성하는 인수는 남은 판이 셋 넘게 남았을 때, 별 둘을 잇는 인수는 판 앞쪽 절반에서
      // 남은 별이 주인 없거나 내 것일 때만. 모두 남길 돈을 지킨다
      if (myCash(ctx) - price < reserveOf(ctx)) return false;
      const rounds = remainingRounds(ctx.view);
      if (takeoverCompletes(ctx, square)) return rounds > 3;
      const group = groupOf(ctx, square);
      const squares = ctx.view.board.groups[group]?.squares ?? [];
      const open = squares.every(
        (sq) =>
          sq === square ||
          ctx.view.owners[sq] === ctx.seat ||
          (ctx.view.owners[sq] ?? -1) < 0,
      );
      return (
        open &&
        ownedIn(ctx, ctx.seat, group) >= 1 &&
        rounds * 2 > (turnLimitOf(ctx.view.rules) ?? 50)
      );
    },
    manage(ctx) {
      const reserve = reserveOf(ctx);
      const rounds = remainingRounds(ctx.view);
      const others = activeSeats(ctx.view).length - 1;
      // 완성한 별자리는 남길 돈 안에서 올린다. 짓는 순간 자산이 한 단 값의 절반만큼 줄어드니(2-10)
      // 그 몫을 남은 돌림에 이용료로 되찾을 수 있을 때만. 비싼 별자리부터, 별자리 안에서는 엔진이 허락한 칸(고르게)
      // 내 별 재방문 반값이면 줄어드는 자산이 없다(반값 = 내릴 때 돌려받는 값)
      const builds = buildable(ctx)
        .filter((sq) => {
          const cost = buildCost(ctx, sq);
          if (myCash(ctx) - cost < reserve) return false;
          const perRound = rentGain(ctx, sq) * EVEN_RATE * others;
          const lost = cost - sellValue(ctx.view.board, sq);
          return perRound > 0 && lost / perRound <= rounds;
        })
        .sort(
          (a, b) =>
            discountOf(ctx, a) - discountOf(ctx, b) ||
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
    payFine(ctx) {
      const free = STAR_SQUARES.filter(
        (sq) => (ctx.view.owners[sq] ?? -1) < 0,
      ).length;
      return free >= 8 && myCash(ctx) >= reserveOf(ctx) + 50;
    },
  };
}

const intermediatePolicy: Policy = intermediateWith(intermediateReserve);

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

/** 이 별 하나만 더 있으면 완성되는 사람이 나인가, 남인가 */
function completesFor(
  ctx: Ctx,
  square: number,
): { mine: boolean; theirs: boolean } {
  const squares = ctx.view.board.groups[groupOf(ctx, square)]?.squares ?? [];
  const by = (seat: number) =>
    squares.every((sq) => sq === square || ctx.view.owners[sq] === seat);
  return {
    mine: by(ctx.seat),
    theirs: activeSeats(ctx.view).some((o) => o !== ctx.seat && by(o)),
  };
}

/**
 * 고수(docs/48 16-8): 중수 판단을 바탕으로 사들이기·정거장 올리기에서 앞을 더 본다.
 * g4 고수의 앞섬은 거래 평가에서 나왔고, 거래가 빠진 g5에서는 기대 자산만 보던 판단이 중수와 같아졌다
 * (판단을 하나씩 중수 것으로 바꿔도 1 대 3에서 1등 23~25%). 그래서 bench로 앞서는 것만 더했다.
 * - 막는 사들이기: 주인이 이 별을 포함해 하나 모자란 별자리(남은 하나는 주인 없음)를 남은 판이 넷 넘게 남았으면
 *   사들인다(남의 완성 덤·이용료 2배·정거장을 막는다)
 * - 내 완성 사들이기는 남길 돈 없이도(별빛 60은 남긴다) 남은 판이 둘 넘게면, 둘 잇기는 남은 판 다섯 넘게까지
 * - 정거장 올리기는 실제 칸 밟힘으로 한 단·두 단 올림의 효율을 견주고, 없으면 중수처럼
 */
const expertPolicy: Policy = {
  ...intermediatePolicy,
  takeover(ctx, square, price) {
    const left = myCash(ctx) - price;
    const rounds = remainingRounds(ctx.view);
    const reserve = intermediateReserve(ctx);
    const { mine, theirs } = completesFor(ctx, square);
    if (mine) return left >= 60 && rounds > 2;
    const owner = ctx.view.owners[square] ?? -1;
    const group = groupOf(ctx, square);
    const squares = ctx.view.board.groups[group]?.squares ?? [];
    const ownerNear =
      squares.filter((sq) => ctx.view.owners[sq] === owner).length ===
        squares.length - 1 &&
      squares.every(
        (sq) =>
          ctx.view.owners[sq] === owner || (ctx.view.owners[sq] ?? -1) < 0,
      );
    if ((ownerNear || theirs) && rounds > 4 && left >= reserve) return true;
    const open = squares.every(
      (sq) =>
        sq === square ||
        ctx.view.owners[sq] === ctx.seat ||
        (ctx.view.owners[sq] ?? -1) < 0,
    );
    return (
      open &&
      ownedIn(ctx, ctx.seat, group) >= 1 &&
      rounds > 5 &&
      left >= reserve
    );
  },
  manage(ctx, rng) {
    const reserve = expertReserve(ctx);
    const spare = myCash(ctx) - reserve;
    // 별자리마다 한 단 올림과 두 단 올림(3단 꺾임점: 2→3단이 1→2단보다 이용료가 훨씬 크다)의 효율을 견준다
    let best: { square: number; score: number } | null = null;
    for (const sq of buildable(ctx)) {
      const cost = buildCost(ctx, sq);
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
    return intermediatePolicy.manage(ctx, rng);
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

/* ───────────── 전략 견주기(docs/48 16절 bench) ───────────── */

/**
 * 사기 전략만 바꾼 중수(나머지 판단은 중수와 같다). bench가 「다 사기」가 언제나 이득인지 잰다.
 * - all 「보이는 대로 다 사기」: 별빛이 값만큼 있으면 산다
 * - picky 「골라 사기」: 내 별자리를 잇거나 남의 별자리를 막는 별, 의뢰에 보탬이 되는 별은 중수처럼 사고,
 *   외톨이 별은 판 앞쪽(남은 돌림 10 넘게)에 별빛을 300 넘게 남길 때만 산다
 */
export function galaxyStrategyBot(kind: "all" | "picky"): GalaxyBot {
  const policy: Policy = {
    ...intermediatePolicy,
    buy(ctx, square, price) {
      const left = myCash(ctx) - price;
      if (kind === "all") return left >= 0;
      const reserve = intermediateReserve(ctx);
      if (intermediateBonus(ctx, square) > 0) return left >= reserve / 2;
      return left >= Math.max(300, reserve) && remainingRounds(ctx.view) > 10;
    },
  };
  return makeBot(kind === "all" ? "다 사기" : "골라 사기", policy);
}
