"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import {
  bigNumberNote,
  COUNT_LEAD,
  COUNT_PLANS,
  groupDigits,
  koreanApprox,
  readableApprox,
  runningTotals,
  SECONDS_PER_YEAR,
  UNIVERSE_YEARS,
  yearsToSee,
} from "../../math/counts";
import { Big, Lead, Pill, Quiz, Source } from "./ui";

const SIZES = [2, 3, 4, 5] as const;
type Size = (typeof SIZES)[number];

const RATES: { label: string; perSecond: bigint }[] = [
  { label: "1초에 하나", perSecond: 1n },
  { label: "1초에 10억 개, 컴퓨터 빠르기", perSecond: 1_000_000_000n },
];

/** 걸리는 시간을 알맞은 단위로 */
function duration(total: bigint, perSecond: bigint): string {
  const seconds = total / perSecond;
  const years = yearsToSee(total, perSecond);
  if (years === 0n) {
    const days = seconds / 86_400n;
    if (days > 0n) return `약 ${groupDigits(days)}일`;
    return `약 ${groupDigits(seconds / 60n)}분`;
  }
  const universe = years / UNIVERSE_YEARS;
  const base = `${readableApprox(years)} 년`;
  if (universe >= 2n)
    return `${base}, 우주 나이의 ${readableApprox(universe)}배`;
  return base;
}

/** 경우의 수: 조각별로 묻고 맞히며 곱을 쌓는다 */
export function CountCard() {
  const [size, setSize] = useState<Size>(3);
  const [done, setDone] = useState<Record<Size, number>>({
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  });
  const [rate, setRate] = useState(0);
  const plan = COUNT_PLANS[size];
  const totals = useMemo(() => runningTotals(plan.steps), [plan]);
  const k = done[size];
  const finished = k >= plan.steps.length;
  const current = plan.steps[k];
  const value = k === 0 ? 1n : (totals[k - 1] as bigint);
  const time = duration(plan.total, RATES[rate]?.perSecond ?? 1n);

  return (
    <div className="flex flex-col gap-3" data-count-size={size}>
      <Lead>{COUNT_LEAD}</Lead>
      <div className="flex flex-wrap gap-1.5">
        {SIZES.map((s) => (
          <Pill
            key={s}
            active={s === size}
            onClick={() => setSize(s)}
            attr={{ "data-count-tab": String(s) }}
          >
            {s}×{s}
          </Pill>
        ))}
      </div>
      <Lead>
        <span data-count-intro>{plan.intro}</span>
      </Lead>

      <div className="flex flex-col gap-1 rounded-xl bg-black/30 p-3">
        <p
          className="flex flex-wrap justify-center gap-x-2 font-mono text-lg text-sky-200"
          data-count-expr
        >
          {k === 0 && <span className="text-white/40">?</span>}
          {plan.steps.slice(0, k).map((s, i) => (
            <span key={s.id} className={cn(s.op === "div" && "text-amber-300")}>
              {i > 0 && s.op === "mul" ? "× " : ""}
              {s.expr}
            </span>
          ))}
        </p>
        <Big className="text-xl sm:text-2xl">
          <span data-count-value>{groupDigits(value)}</span>
        </Big>
        <p className="text-center text-white/50 text-xs">
          {k}/{plan.steps.length} 단계
        </p>
      </div>

      {k > 0 && (
        <ol className="flex flex-col gap-1.5" data-count-steps>
          {plan.steps.slice(0, k).map((s) => (
            <li
              key={s.id}
              className="flex gap-2 break-keep text-white/80 text-xs"
            >
              <b
                className={cn(
                  "shrink-0 font-mono",
                  s.op === "div" ? "text-amber-300" : "text-sky-200",
                )}
              >
                {s.expr}
              </b>
              <span>{s.meaning}</span>
            </li>
          ))}
        </ol>
      )}

      {current && (
        <Quiz
          key={`${size}-${current.id}`}
          id={`count-${current.id}`}
          question={current.question}
          choices={current.choices}
          answer={current.answer}
          why={current.why}
          onSolved={() =>
            window.setTimeout(
              () => setDone((d) => ({ ...d, [size]: d[size] + 1 })),
              900,
            )
          }
        />
      )}

      {finished && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3"
          data-count-done
        >
          <p className="text-center font-mono text-sky-200 text-sm">
            {plan.formula}
          </p>
          <p className="break-keep text-center text-white/60 text-xs">
            {plan.formulaNote}
          </p>
          <Big className="text-lg sm:text-xl">{groupDigits(plan.total)}</Big>
          <p className="text-center text-sm text-white/80">
            {koreanApprox(plan.total)} 가지
          </p>
          {bigNumberNote(koreanApprox(plan.total)) && (
            <p className="text-center text-white/60 text-xs">
              {bigNumberNote(koreanApprox(plan.total))}
            </p>
          )}
          {plan.note && <Lead>{plan.note}</Lead>}
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-white/70">모두 보려면</span>
            {RATES.map((r, i) => (
              <Pill
                key={r.label}
                active={rate === i}
                onClick={() => setRate(i)}
              >
                {r.label}
              </Pill>
            ))}
          </div>
          <p className="text-center font-bold text-amber-200" data-count-time>
            {time}
          </p>
          {bigNumberNote(time) && (
            <p className="text-center text-white/60 text-xs">
              {bigNumberNote(time)}
            </p>
          )}
          <p className="text-center text-[11px] text-white/45">
            한 해를 {groupDigits(SECONDS_PER_YEAR)}초, 우주 나이를 약 138억
            년으로 셌어요.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => setDone((d) => ({ ...d, [size]: 0 }))}
          className="rounded-lg bg-white/10 px-2.5 py-1"
        >
          처음부터
        </button>
        {!finished && (
          <button
            type="button"
            data-count-skip
            onClick={() =>
              setDone((d) => ({ ...d, [size]: plan.steps.length }))
            }
            className="rounded-lg bg-white/10 px-2.5 py-1"
          >
            답만 보기
          </button>
        )}
      </div>
      <Source>
        2×2 3,674,160 · 3×3 43,252,003,274,489,856,000 · 4×4 약 7.4 × 10^45 ·
        5×5 약 2.8 × 10^74. 10^45는 1 뒤에 0이 45개, 10^74는 0이 74개 붙은
        수예요. 숫자는 이 페이지가 직접 곱해 맞춘 값이에요.
      </Source>
    </div>
  );
}
