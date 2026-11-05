"use client";

import { asState } from "@game/galaxy-ai";
import {
  type Action,
  debtPlan,
  type GalaxyView,
  legalActions,
  levelCostAt,
  NUMBERS,
  rentOf,
  round10,
  STAR_SQUARES,
  starAt,
  type TradeOffer,
  tradeProblem,
  unmortgageCost,
} from "@game/galaxy-engine";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { IdleHint, useIdleHint } from "@/stardraw/components/IdleHint";

import { money, squareName, starInfo, starLine, subject } from "../format";
import { GALAXY_FX } from "../fx-timing";
import { STAR_FACTS } from "../star-facts";
import { ShipToken } from "./parts";

export const PRIMARY =
  "rounded-xl bg-amber-200 px-4 py-2.5 font-bold text-slate-950 shadow-[0_0_18px_rgba(253,230,138,0.35)] active:scale-[0.98] disabled:opacity-40";
export const SECONDARY =
  "rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-semibold active:scale-[0.98] disabled:opacity-40";

/** 아래에서 올라오는 결정 창의 틀 */
export function Sheet({
  title,
  children,
  testId,
}: {
  title?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-decision={testId}
      className="galaxy-sheet w-full rounded-2xl border border-sky-100/15 bg-slate-950/80 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] backdrop-blur"
    >
      {title && <h2 className="mb-2 font-bold text-sm">{title}</h2>}
      {children}
    </section>
  );
}

/** 이 별의 이용료 표: 지금, 둘(선 하나), 완성, 2·3단, 큰 정거장(제철 빼고) */
export function rentTable(view: GalaxyView, square: number) {
  const star = starAt(view.board, square);
  if (!star) return null;
  const p = star.value;
  const r = NUMBERS.rent;
  const at = (rate: number) => Math.max(10, round10(p, rate));
  return {
    single: at(r.single),
    pair: at(r.pair),
    complete: at(r.complete),
    level2: at(r.level2),
    level3: at(r.level3),
    grand: at(r.grand),
  };
}

/** 별 한 줄 사실과 「더 보기」 */
export function StarFacts({
  view,
  square,
  compact = false,
}: {
  view: GalaxyView;
  square: number;
  compact?: boolean;
}) {
  const [more, setMore] = useState(false);
  const info = starInfo(view.board, square);
  if (!info) return null;
  const fact = STAR_FACTS[info.star.id];
  return (
    <div className="flex flex-col gap-1">
      <p data-star-line className="text-sky-100/85 text-xs leading-snug">
        {starLine(info.star, info.constellation)}
      </p>
      {!compact &&
        fact &&
        (more ? (
          <p className="rounded-lg bg-white/5 p-2 text-white/80 text-xs leading-relaxed">
            {fact}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setMore(true)}
            className="self-start text-sky-200/80 text-xs underline decoration-sky-200/30 underline-offset-2"
          >
            더 보기
          </button>
        ))}
    </div>
  );
}

/** 사기·넘기기 */
export function BuySheet({
  view,
  square,
  price,
  canAfford,
  submit,
}: {
  view: GalaxyView;
  square: number;
  price: number;
  canAfford: boolean;
  submit: (a: Action) => void;
}) {
  const info = starInfo(view.board, square);
  const rents = rentTable(view, square);
  const hint = useIdleHint(canAfford, GALAXY_FX.idleHint);
  return (
    <Sheet testId="buy">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-black text-lg">
          ✶ {info?.star.ko}{" "}
          <span className="font-normal text-sm text-white/60">
            {info?.constellation}
          </span>
        </p>
        <p className="font-bold text-amber-200">{money(price)}</p>
      </div>
      <StarFacts view={view} square={square} />
      {rents && (
        <p className="mt-2 text-white/60 text-xs">
          이용료 1단 {money(rents.single)} · 별 둘 {money(rents.pair)} · 완성{" "}
          {money(rents.complete)}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <span className="relative flex-1">
          <button
            type="button"
            data-buy
            disabled={!canAfford}
            onClick={() => submit({ type: "buy" })}
            className={cn(PRIMARY, "w-full")}
          >
            사기 {money(price)}
          </button>
          <IdleHint kind="tap" shown={hint} />
        </span>
        <button
          type="button"
          data-pass
          onClick={() => submit({ type: "pass" })}
          className={cn(SECONDARY, "flex-1")}
        >
          넘기기
        </button>
      </div>
      {!canAfford && (
        <p className="mt-1 text-rose-200/80 text-xs">별빛이 모자라요.</p>
      )}
    </Sheet>
  );
}

/** 봉투 입찰: 숫자 하나만 고른다(docs/48 7-5) */
export function BidSheet({
  view,
  square,
  max,
  onBid,
  name,
}: {
  view: GalaxyView;
  square: number;
  max: number;
  onBid: (value: number) => void;
  name: (seat: number) => string;
}) {
  const passer = view.auction?.passer ?? null;
  const info = starInfo(view.board, square);
  const top = Math.floor(max / 10) * 10;
  const [value, setValue] = useState(() =>
    Math.min(
      top,
      Math.max(10, Math.round(((info?.value ?? 100) * 0.8) / 10) * 10),
    ),
  );
  const change = (d: number) =>
    setValue((v) => Math.max(10, Math.min(top, v + d)));
  return (
    <Sheet title={`봉투 입찰 · ${info?.star.ko ?? ""}`} testId="bid">
      {passer !== null && (
        <p data-bid-why className="text-sm text-white/85">
          {subject(name(passer))} {info?.star.ko}에 도착했지만 사지 않아 봉투
          입찰을 엽니다.
        </p>
      )}
      <p className="mt-0.5 text-white/60 text-xs">
        모두 한 번씩 몰래 값을 적어 내고, 가장 높은 값을 낸 사람이 그 값에 사요.
        별 값 {money(info?.value ?? 0)}
      </p>
      <div className="my-3 flex items-center justify-center gap-1.5">
        {[-50, -10].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => change(d)}
            className="rounded-lg bg-white/10 px-2 py-1 text-sm"
          >
            −{Math.abs(d)}
          </button>
        ))}
        <span
          data-bid-value={value}
          className="min-w-20 text-center font-black text-2xl text-amber-100 tabular-nums"
        >
          {money(value)}
        </span>
        {[10, 50].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => change(d)}
            className="rounded-lg bg-white/10 px-2 py-1 text-sm"
          >
            +{d}
          </button>
        ))}
      </div>
      <p className="mb-2 text-center text-white/50 text-xs">
        가진 별빛 {money(max)}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          data-bid-submit
          disabled={top < 10}
          onClick={() => onBid(value)}
          className={cn(PRIMARY, "flex-1")}
        >
          이 값으로 내기
        </button>
        <button
          type="button"
          data-bid-skip
          onClick={() => onBid(0)}
          className={cn(SECONDARY, "flex-1")}
        >
          내지 않기
        </button>
      </div>
    </Sheet>
  );
}

function TradeSides({
  view,
  offer,
  name,
}: {
  view: GalaxyView;
  offer: TradeOffer;
  name: (seat: number) => string;
}) {
  const side = (title: string, stars: number[], cash: number) => (
    <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-2">
      <p className="mb-1 text-[11px] text-white/50">{title}</p>
      {stars.map((sq) => (
        <p key={sq} className="text-sm">
          ✶ {squareName(view.board, sq)}
        </p>
      ))}
      {cash > 0 && <p className="text-amber-100 text-sm">{money(cash)}</p>}
      {stars.length === 0 && cash === 0 && (
        <p className="text-sm text-white/40">없음</p>
      )}
    </div>
  );
  return (
    <div className="flex gap-2">
      {side(`${name(offer.from)} · 주는 것`, offer.give.stars, offer.give.cash)}
      {side(`${name(offer.to)} · 주는 것`, offer.get.stars, offer.get.cash)}
    </div>
  );
}

/** 받은 거래 제안: 받기·거절 */
export function TradeAnswer({
  view,
  offer,
  name,
  submit,
}: {
  view: GalaxyView;
  offer: TradeOffer;
  name: (seat: number) => string;
  submit: (a: Action) => void;
}) {
  return (
    <Sheet title={`${name(offer.from)}의 거래 제안`} testId="trade-answer">
      <TradeSides view={view} offer={offer} name={name} />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => submit({ type: "acceptTrade" })}
          className={cn(PRIMARY, "flex-1")}
        >
          받기
        </button>
        <button
          type="button"
          onClick={() => submit({ type: "rejectTrade" })}
          className={cn(SECONDARY, "flex-1")}
        >
          거절
        </button>
      </div>
    </Sheet>
  );
}

/** 거래 제안 만들기(두 걸음: 누구와 → 판에서 별 담기) */
export function TradeComposer({
  view,
  partner,
  setPartner,
  marked,
  clearMarked,
  name,
  submit,
  onClose,
}: {
  view: GalaxyView;
  partner: number | null;
  setPartner: (seat: number) => void;
  marked: ReadonlySet<number>;
  clearMarked: () => void;
  name: (seat: number) => string;
  submit: (a: Action) => void;
  onClose: () => void;
}) {
  const me = view.mySeat;
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  const others = view.cash
    .map((_, s) => s)
    .filter((s) => s !== me && !view.out[s]);
  if (partner === null)
    return (
      <Sheet title="누구와 거래할까요?" testId="trade-partner">
        <p className="mb-2 text-white/60 text-xs leading-snug">
          내 별·별빛과 상대의 별·별빛을 맞바꾸자고 제안해요. 상대가 받거나
          거절해요.
        </p>
        <div className="flex flex-wrap gap-2">
          {others.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPartner(s)}
              className={cn(SECONDARY, "flex items-center gap-1.5")}
            >
              <ShipToken seat={s} size={12} />
              {name(s)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 text-white/60 text-xs underline"
        >
          그만두기
        </button>
      </Sheet>
    );
  const give = [...marked].filter((sq) => view.owners[sq] === me);
  const get = [...marked].filter((sq) => view.owners[sq] === partner);
  const offer: TradeOffer = {
    from: me,
    to: partner,
    give: { stars: give, cash: giveCash },
    get: { stars: get, cash: getCash },
  };
  const problem = tradeProblem(asState(view), offer);
  const cashInput = (value: number, set: (n: number) => void, max: number) => (
    <span className="mt-1 flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => set(Math.max(0, value - 100))}
        className="rounded bg-white/10 px-1"
      >
        −100
      </button>
      <button
        type="button"
        onClick={() => set(Math.max(0, value - 10))}
        className="rounded bg-white/10 px-1"
      >
        −10
      </button>
      <span className="min-w-12 text-center text-amber-100">
        {money(value)}
      </span>
      <button
        type="button"
        onClick={() => set(Math.min(max, value + 10))}
        className="rounded bg-white/10 px-1"
      >
        +10
      </button>
      <button
        type="button"
        data-cash-plus100
        onClick={() => set(Math.min(max, value + 100))}
        className="rounded bg-white/10 px-1"
      >
        +100
      </button>
    </span>
  );
  return (
    <Sheet title={`거래 · ${name(partner)}`} testId="trade-compose">
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-2">
          <p className="text-[11px] text-white/50">주는 것</p>
          {give.map((sq) => (
            <p key={sq} className="text-sm">
              ✶ {squareName(view.board, sq)}
            </p>
          ))}
          {cashInput(giveCash, setGiveCash, view.cash[me] ?? 0)}
        </div>
        <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-2">
          <p className="text-[11px] text-white/50">받는 것</p>
          {get.map((sq) => (
            <p key={sq} className="text-sm">
              ✶ {squareName(view.board, sq)}
            </p>
          ))}
          {cashInput(getCash, setGetCash, view.cash[partner] ?? 0)}
        </div>
      </div>
      {problem && marked.size > 0 && (
        <p className="mt-1 text-rose-200/80 text-xs">{problem}</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={problem !== null}
          onClick={() => {
            submit({
              type: "offer",
              to: partner,
              give: offer.give,
              get: offer.get,
            });
            clearMarked();
            onClose();
          }}
          className={cn(PRIMARY, "flex-1")}
        >
          제안 보내기
        </button>
        <button
          type="button"
          onClick={() => {
            clearMarked();
            onClose();
          }}
          className={cn(SECONDARY, "flex-1")}
        >
          그만두기
        </button>
      </div>
    </Sheet>
  );
}

/** 빚 정리: 모자란 별빛과 제안한 정리 순서 */
export function DebtSheet({
  view,
  submit,
}: {
  view: GalaxyView;
  submit: (a: Action) => void;
}) {
  const debt = view.debt;
  if (!debt) return null;
  const plan = debtPlan(asState(view));
  const short = debt.amount - (view.cash[view.mySeat] ?? 0);
  const label = (a: Action) =>
    a.type === "sell"
      ? `${squareName(view.board, a.square)} 정거장 내리기`
      : a.type === "mortgage"
        ? `${squareName(view.board, a.square)} 맡기기`
        : "";
  return (
    <Sheet title={`별빛 ${money(short)}이 모자라요`} testId="debt">
      <ol className="mb-3 flex flex-col gap-1">
        {plan.map((a, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 정리 차례
            key={i}
            className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-sm"
          >
            <span>
              {i + 1}. {label(a)}
            </span>
            {i === 0 && (
              <button
                type="button"
                onClick={() => submit(a)}
                className="rounded-lg bg-white/10 px-2 py-0.5 text-xs"
              >
                하기
              </button>
            )}
          </li>
        ))}
      </ol>
      {plan[0] && (
        <button
          type="button"
          data-debt-plan
          onClick={() => submit(plan[0] as Action)}
          className={cn(PRIMARY, "w-full")}
        >
          제안대로 정리
        </button>
      )}
    </Sheet>
  );
}

/** 정거장 올리기·내리기·맡기기·되찾기(내 차례 안). 할 수 있는 것만 보인다 */
export function ManagePanel({
  view,
  submit,
}: {
  view: GalaxyView;
  submit: (a: Action) => void;
}) {
  const me = view.mySeat;
  const actions = legalActions(asState(view), me).filter(
    (a) =>
      a.type === "build" ||
      a.type === "sell" ||
      a.type === "mortgage" ||
      a.type === "unmortgage",
  );
  const mine = STAR_SQUARES.filter((sq) => view.owners[sq] === me);
  if (mine.length === 0) return null;
  const cost = (a: Action) =>
    a.type === "build"
      ? `−${money(levelCostAt(view.board, a.square))}`
      : a.type === "unmortgage"
        ? `−${money(unmortgageCost(view.board, a.square))}`
        : "";
  const word: Record<string, string> = {
    build: "올리기",
    sell: "내리기",
    mortgage: "맡기기",
    unmortgage: "되찾기",
  };
  return (
    <details className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">정거장 관리</summary>
      <p data-manage-help className="mt-1 text-white/60 text-xs leading-snug">
        별자리를 완성한 별에 정거장을 올리면 이용료가 커져요. 내리면 지은 값의
        절반을 돌려받고, 맡기면 별 값의 절반을 받지만 그동안 이용료를 받지
        못해요.
      </p>
      {actions.length === 0 ? (
        <p className="mt-1 text-white/50 text-xs">
          지금은 올리거나 맡길 별이 없어요.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {mine.map((sq) => {
            const here = actions.filter(
              (a) => "square" in a && a.square === sq,
            );
            if (here.length === 0) return null;
            return (
              <li key={sq} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  ✶ {squareName(view.board, sq)}{" "}
                  <span className="text-white/50 text-xs">
                    {(view.levels[sq] ?? 1) >= 4
                      ? "큰 정거장"
                      : `${view.levels[sq] ?? 1}단`}
                    {" · 이용료 "}
                    {money(rentOf(view, sq))}
                  </span>
                </span>
                <span className="flex gap-1">
                  {here.map((a) => (
                    <button
                      key={a.type}
                      type="button"
                      data-manage={a.type}
                      onClick={() => submit(a)}
                      className="rounded-lg bg-white/10 px-2 py-0.5 text-xs"
                    >
                      {word[a.type]} {cost(a)}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
