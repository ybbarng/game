"use client";

import { asState } from "@game/galaxy-ai";
import {
  type Action,
  buildCostOf,
  debtPlan,
  type GalaxyView,
  legalActions,
  NUMBERS,
  rentOf,
  round10,
  STAR_SQUARES,
  starAt,
  unmortgageCost,
} from "@game/galaxy-engine";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";
import { IdleHint, useIdleHint } from "@/stardraw/components/IdleHint";

import { money, squareName, starInfo, starLine, subject } from "../format";
import { GALAXY_FX } from "../fx-timing";
import { STAR_FACTS } from "../star-facts";
import "@/galaxy/components/galaxy.css";

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

/** 도착 인수(docs/48 2-8, g5): 이용료를 낸 남의 별을 사들이기·넘기기 */
export function TakeoverSheet({
  view,
  square,
  owner,
  price,
  name,
  submit,
}: {
  view: GalaxyView;
  square: number;
  owner: number;
  price: number;
  name: (seat: number) => string;
  submit: (a: Action) => void;
}) {
  const info = starInfo(view.board, square);
  return (
    <Sheet testId="takeover">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-black text-lg">
          ✶ {info?.star.ko}{" "}
          <span className="font-normal text-sm text-white/60">
            {name(owner)}의 별
          </span>
        </p>
        <p className="font-bold text-amber-200">{money(price)}</p>
      </div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          data-takeover
          onClick={() => submit({ type: "takeover" })}
          className={cn(PRIMARY, "flex-1")}
        >
          사들이기 {money(price)}
        </button>
        <button
          type="button"
          data-decline-takeover
          onClick={() => submit({ type: "declineTakeover" })}
          className={cn(SECONDARY, "flex-1")}
        >
          넘기기
        </button>
      </div>
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
      ? `−${money(buildCostOf(view, me, a.square))}`
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
