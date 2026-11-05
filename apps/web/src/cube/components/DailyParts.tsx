"use client";

import { useEffect, useRef, useState } from "react";

import {
  type DailyEntry,
  dailyEntry,
  entryMs,
  segmentAverages,
  shareText,
  shortDate,
} from "../daily";
import { formatMs, type SolveRecord } from "../records";

/**
 * 오늘의 섞기 화면 조각(docs/51 2-4): 공유 글 복사, 기록 칸(오늘·연속 일수·지난 날).
 * 진행·판정은 `SolveApp`이 하고, 저장은 `daily.ts`가 한다.
 */

/** 이 시도와 견줄 내 평균: 이 시도를 받기 전에 남긴 같은 크기 혼자 맞추기 기록 */
export function averagesFor(
  startedAt: number,
  records: readonly SolveRecord[],
): Map<string, number> {
  return segmentAverages(records.filter((r) => r.at < startedAt));
}

/** 공유 글 복사 단추. 복사를 못 하는 브라우저면 글을 골라 두어 직접 복사하게 한다 */
export function DailyShare({
  entry,
  showText = false,
}: {
  entry: DailyEntry;
  /** 공유 글을 그대로 보인다 */
  showText?: boolean;
}) {
  const text = shareText(entry);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const pre = useRef<HTMLPreElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("yes");
    } catch {
      setCopied("no");
      const el = pre.current;
      const sel = window.getSelection();
      if (el && sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 2_000);
  };
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      {(showText || copied === "no") && (
        <pre
          ref={pre}
          className="w-full whitespace-pre-wrap break-keep rounded-lg bg-black/30 px-3 py-2 text-left font-sans text-white/80 text-xs leading-relaxed"
        >
          {text}
        </pre>
      )}
      <button
        type="button"
        data-cube-share={text}
        data-cube-copied={copied ?? undefined}
        onClick={() => void copy()}
        className="rounded-full border border-white/20 bg-white/10 px-3 py-1 font-semibold text-xs hover:bg-white/15"
      >
        {copied === "yes"
          ? "복사했어요"
          : copied === "no"
            ? "골라 두었어요. 복사하세요"
            : "공유 글 복사"}
      </button>
    </div>
  );
}

/** 기록 칸: 오늘(크기별), 연속 일수, 지난 날 */
export function DailyPanel({
  today,
  n,
  entries,
  streak,
  live,
}: {
  today: string;
  n: number;
  entries: readonly DailyEntry[];
  streak: number;
  /** 지금 화면에서 하고 있는 시도(끝나기 전이라 「끝내지 않음」으로 보이지 않게) */
  live: boolean;
}) {
  const mine = dailyEntry(entries, today, n);
  const past = entries.filter((e) => !(e.date === today && e.n === n));
  return (
    <aside className="flex flex-col gap-3 text-sm" data-cube-daily-panel>
      <section className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">
            오늘 {shortDate(today)} · {n}×{n}
          </h2>
          <span
            data-cube-streak={streak}
            className="text-white/60 text-xs tabular-nums"
          >
            연속 <b className="text-white">{streak}</b>일
          </span>
        </div>
        {mine && !(live && mine.status === "started") ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="font-mono font-semibold text-xl tabular-nums">
                {result(mine)}
              </span>
              <span className="text-xs tracking-wider">
                {entryMs(mine) === null ? "" : mine.marks}
              </span>
            </p>
            <DailyShare entry={mine} showText />
          </>
        ) : (
          <p className="font-mono text-white/40 text-xl">-</p>
        )}
      </section>
      <section className="flex flex-col gap-1">
        <h2 className="font-semibold">지난 기록</h2>
        {past.length === 0 ? (
          <p className="text-white/50 text-xs">아직 없어요.</p>
        ) : (
          <ol
            data-cube-daily-history
            className="flex max-h-72 flex-col gap-0.5 overflow-y-auto pr-1"
          >
            {past.slice(0, 60).map((e) => (
              <li
                key={`${e.date}-${e.n}`}
                className="flex items-center gap-2 rounded px-1 py-0.5"
              >
                <span className="w-11 text-white/50 text-xs tabular-nums">
                  {shortDate(e.date)}
                </span>
                <span className="w-8 text-white/50 text-xs">
                  {e.n}×{e.n}
                </span>
                <span className="w-16 font-mono tabular-nums">{result(e)}</span>
                <span className="text-[10px] tracking-wider">
                  {entryMs(e) === null ? "" : e.marks}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}

function result(e: DailyEntry): string {
  const ms = entryMs(e);
  if (ms !== null) return `${formatMs(ms)}${e.penalty > 0 ? "+" : ""}`;
  return e.status === "started" ? "DNF(떠남)" : "DNF";
}
