"use client";

import { useEffect, useRef, useState } from "react";

import { PARTY_HP, PARTY_LOW } from "./party";

/** 깎인 몫(「−16」)이 떠 있는 시간(ms). CSS `cube-party-hit`과 같다 */
const HIT_MS = 900;

/**
 * 사람 칸의 얇은 체력바(docs/51 3-2). 깎이면 막대가 줄고 깎인 몫이 잠깐 밝게 남았다 따라 줄며, 「−16」이 잠깐 뜬다.
 * 움직임 줄이기면 CSS가 연출을 끄고 값만 바뀐다.
 */
export function PartyBar({
  id,
  hp,
  out,
}: {
  id: string;
  hp: number;
  /** 체력이 0이 되었거나 빠졌다 */
  out: boolean;
}) {
  const prev = useRef(hp);
  const seq = useRef(0);
  const [hit, setHit] = useState<{ key: number; amount: number } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = hp;
    if (hp >= before - 1e-6) return;
    seq.current += 1;
    const key = seq.current;
    setHit({ key, amount: before - hp });
    const timer = window.setTimeout(
      () => setHit((h) => (h?.key === key ? null : h)),
      HIT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [hp]);
  const pct = Math.max(0, Math.min(100, (hp / PARTY_HP) * 100));
  const low = hp > 0 && hp < PARTY_LOW;
  const shown = Math.max(0, Math.ceil(hp - 1e-9));
  return (
    <div
      data-cube-hp={id}
      data-cube-hp-value={shown}
      data-cube-hp-low={low ? "" : undefined}
      className="relative flex items-center gap-1.5"
    >
      <span
        aria-hidden
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
      >
        <span
          className="cube-party-lag absolute inset-y-0 left-0 rounded-full bg-rose-200/45"
          style={{ width: `${pct}%` }}
        />
        <span
          className={`cube-party-fill absolute inset-y-0 left-0 rounded-full ${
            out ? "bg-white/25" : low ? "bg-rose-400" : "bg-emerald-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span
        className={`w-6 shrink-0 text-right font-mono text-[11px] tabular-nums ${
          out ? "text-white/40" : low ? "text-rose-300" : "text-white/70"
        }`}
      >
        <span className="sr-only">체력 </span>
        {shown}
      </span>
      {hit && (
        <span
          key={hit.key}
          data-cube-hp-hit={id}
          className="cube-party-hit pointer-events-none absolute -top-3.5 right-0 font-mono font-semibold text-[11px] text-rose-300"
        >
          −{Math.round(hit.amount)}
        </span>
      )}
    </div>
  );
}
