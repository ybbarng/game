"use client";

import type { GameEvent, OnecardState } from "@game/onecard-engine";

import type { ReplayRoundProps } from "@/review/replay-table";

/** 원카드 판 한눈에 보기(복기 목록): 순위·남은 장 수, 외침·잡기·헛외침 수, 다시 보기 단추 */
export function OnecardReviewRound({
  span,
  states,
  events,
  seat,
  name,
  onReplay,
}: ReplayRoundProps) {
  const end =
    span.end === null ? null : (states[span.end] as OnecardState | undefined);
  const result = end?.result ?? null;
  const all = events
    .slice(span.start, (span.end ?? events.length - 1) + 1)
    .flat() as GameEvent[];
  const count = (type: GameEvent["type"]) =>
    all.filter((e) => e.type === type).length;
  const tallies = [
    ["원카드!", count("shouted") - count("caught") - count("falseShout")],
    ["잡기", count("caught")],
    ["헛외침", count("falseShout")],
    ["다시 섞기", count("reshuffled")],
  ] as const;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/35 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{span.number}판</h3>
        {result === null && (
          <span className="text-white/60 text-xs">하던 중</span>
        )}
        <button
          type="button"
          onClick={() => onReplay(span.start)}
          className="ml-auto rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
        >
          ▶ 이 판 다시 보기
        </button>
      </div>
      {result && end && (
        <ol aria-label="순위" className="flex flex-col gap-0.5 text-sm">
          {result.order.map((s) => (
            <li
              key={s}
              className={s === seat ? "font-bold text-amber-200" : undefined}
            >
              {result.ranks[s]}등 {name(s)}
              {end.bankrupt.includes(s) ? " (파산)" : ""} · 남은 카드{" "}
              {result.scores[s]}장
            </li>
          ))}
        </ol>
      )}
      <p className="flex flex-wrap gap-x-3 text-white/70 text-xs tabular-nums">
        {tallies.map(([label, n]) => (
          <span key={label}>
            {label} {n}번
          </span>
        ))}
      </p>
    </section>
  );
}
