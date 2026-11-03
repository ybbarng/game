"use client";

import type { Action, OnecardState } from "@game/onecard-engine";
import { sortOnecards } from "@game/onecard-engine";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { GameArchive } from "@/review/archive";
import { replayArchive } from "@/review/replay";

import { SUIT_NAMES } from "../cards";
import { describeAction, onecardKit } from "../kit";
import { OnecardCardView } from "./OnecardCard";

/**
 * 원카드 다시 보기: 남긴 기록을 처음부터 다시 해 보며 한 걸음씩 앞뒤로 움직인다. 모든 손패를 펼쳐 보인다.
 * ←·→ 키로도 움직인다. 해설은 고수 컴퓨터가 생기면 붙인다
 */
export function OnecardReplay({
  archive,
  name,
}: {
  archive: GameArchive;
  name: (seat: number) => string;
}) {
  const replayed = useMemo(() => replayArchive(onecardKit, archive), [archive]);
  const states = replayed.states as OnecardState[];
  const last = states.length - 1;
  const [index, setIndex] = useState(last);
  const state = states[index] as OnecardState;
  const next = archive.log[index] ?? null;
  const go = (i: number) => setIndex(Math.max(0, Math.min(last, i)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(last, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const top = state.pile.at(-1);
  return (
    <section className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {state.hands.map((hand, seat) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 번호가 곧 정체다
            key={seat}
            data-replay-seat={seat}
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl px-2 py-1.5",
              state.turn === seat && state.phase === "play"
                ? "bg-amber-300/15"
                : "bg-white/5",
            )}
          >
            <span className="w-16 shrink-0 truncate text-sm">{name(seat)}</span>
            <span className="flex flex-wrap">
              {sortOnecards(hand).map((card, i) => (
                <OnecardCardView
                  key={card}
                  card={card}
                  width={24}
                  className={i > 0 ? "-ml-1.5" : undefined}
                />
              ))}
            </span>
            <span className="ml-auto text-white/70 text-xs tabular-nums">
              {hand.length}장
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-center gap-3 text-white/70 text-xs">
        더미 {state.deck.length}장 · 맨 위
        {top ? <OnecardCardView card={top} width={30} /> : " 없음"}
        {state.suit ? ` · ${SUIT_NAMES[state.suit]}` : ""}
        {state.attack > 0 ? ` · 공격 +${state.attack}` : ""}
      </div>
      <div
        role="toolbar"
        aria-label="다시 보기"
        className="flex flex-wrap justify-center gap-1"
      >
        {(
          [
            ["⏮", "처음", () => go(0)],
            ["◀", "한 걸음 뒤로", () => go(index - 1)],
            ["▶", "한 걸음 앞으로", () => go(index + 1)],
            ["⏭", "끝", () => go(last)],
          ] as const
        ).map(([icon, label, onClick]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            className="min-w-10 rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20"
          >
            {icon}
          </button>
        ))}
      </div>
      <p role="status" className="text-center text-sm text-white/80">
        {index}/{last}
        {next
          ? ` · 다음: ${name(next.seat)} ${describeAction(next.action as Action)}`
          : ""}
        {state.result
          ? ` · ${state.result.order.map((s) => `${state.result?.ranks[s]}등 ${name(s)}`).join(", ")}`
          : ""}
      </p>
      {replayed.error && (
        <p className="text-rose-300 text-xs">{replayed.error}</p>
      )}
    </section>
  );
}
