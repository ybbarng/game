"use client";

import type { SolveProgress } from "@game/cube-engine";
import { useState } from "react";

import { groupSplits } from "../progress/splits";
import { formatMs, type Split } from "../records";

/**
 * 진행 막대와 이정표 칩(docs/51 1-2). 혼자 맞추기가 쓰고, 대결 화면(1-3)도 같은 판정(`@game/cube-engine`의
 * `solveProgress`·`milestonesOf`)으로 그린다.
 * - 막대는 지금 값, 눈금은 이번 판 가장 높았던 곳. 막대를 누르면 「제자리 n · 방향까지 m」.
 * - 큰 큐브는 센터 → 엣지 짝 → 조각 차례로 지금 단계의 숫자를 보인다.
 * - 「완성까지 k수」는 8수 안쪽일 때만(2×2·3×3, 워커가 셈한다).
 */
export function ProgressMeter({
  n,
  progress,
  best,
  near,
}: {
  n: number;
  progress: SolveProgress;
  /** 이번 판 가장 높았던 값(0~1) */
  best: number;
  /** 완성까지 남은 수(8수 안쪽일 때만) */
  near: number | null;
}) {
  const [detail, setDetail] = useState(false);
  const p = progress.pieces;
  const label =
    progress.focus === "centers"
      ? `센터 ${progress.centers}/6`
      : progress.focus === "edges"
        ? `엣지 짝 ${progress.pairs}/12`
        : `${trim(p.score)}/${p.max}`;
  const pct = Math.round(progress.value * 1000) / 10;
  const detailText =
    progress.focus === "pieces" || n <= 3
      ? `제자리 ${p.placed} · 방향까지 ${p.oriented}`
      : `센터 ${progress.centers}/6 · 엣지 짝 ${progress.pairs}/12 · 조각 ${trim(p.score)}/${p.max}`;
  // 한 줄로 납작하게: 막대 · 숫자(누르면 자세히) · 완성까지 k수
  return (
    <button
      type="button"
      data-cube-progress={trim(p.score)}
      data-cube-progress-best={Math.round(best * 1000) / 10}
      aria-pressed={detail}
      onClick={() => setDetail((v) => !v)}
      title={detailText}
      className="flex h-5 w-full max-w-md items-center gap-2 text-left"
    >
      <span className="relative h-1.5 min-w-16 flex-1 rounded-full bg-white/10">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
        {best > progress.value && (
          <span
            data-cube-progress-mark
            className="-top-1 absolute h-3.5 w-0.5 rounded-full bg-white/60"
            style={{ left: `calc(${Math.round(best * 1000) / 10}% - 1px)` }}
          />
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap font-mono text-white/60 text-xs tabular-nums">
        {detail ? detailText : label}
      </span>
      {near !== null && near > 0 && (
        <span
          data-cube-near={near}
          className="shrink-0 whitespace-nowrap text-emerald-300/90 text-xs"
        >
          완성까지 {near}수
        </span>
      )}
    </button>
  );
}

/**
 * 지나간 이정표 칩(같은 순간은 하나로, 가장 나아간 단계 + 나머지 수). 한 줄 안에 두고, 넘치면 앞(오래된) 칩이
 * 왼쪽으로 밀려 사라진다. 칩을 누르면 그 순간 켜진 단계를 모두 보인다. 새로 켜진 칩은 살짝 떠오른다
 */
export function MilestoneChips({
  splits,
  gold = NO_GOLD,
}: {
  splits: readonly Split[];
  /** 골드 칩의 시각(ms, docs/51 2-2): 내 최고 구간보다 빠른 칩은 금색 */
  gold?: ReadonlySet<number>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  // 한 줄에 최근 넷까지
  const groups = groupSplits(splits).slice(-4);
  return (
    <ol
      data-cube-milestones={groups.map((g) => g.ids.join("+")).join(" ")}
      className="flex h-6 w-full max-w-xl items-center justify-center gap-1 overflow-hidden"
    >
      {groups.map((g) => (
        <li key={`${g.ms}-${g.ids.join("+")}`} className="shrink-0">
          <button
            type="button"
            data-milestone={g.ids.join("+")}
            data-gold={gold.has(g.ms) ? "" : undefined}
            title={g.full}
            aria-expanded={g.ids.length > 1 ? open === g.ms : undefined}
            onClick={() => setOpen((v) => (v === g.ms ? null : g.ms))}
            className={`${gold.has(g.ms) ? "cube-gold" : "cube-milestone-in"} block max-w-[18rem] truncate rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-100`}
          >
            {open === g.ms ? g.full : g.label}{" "}
            <span
              className={`font-mono tabular-nums ${gold.has(g.ms) ? "text-amber-200" : "text-sky-200/80"}`}
            >
              {formatMs(g.ms)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** 결과 상자의 구간 기록: 이정표마다 지난 시각과 걸린 구간 */
export function SplitList({
  splits,
  gold = NO_GOLD,
}: {
  splits: readonly Split[];
  gold?: ReadonlySet<number>;
}) {
  const groups = groupSplits(splits);
  if (groups.length === 0) return null;
  return (
    <ol
      data-cube-splits={groups.map((g) => g.ids.join("+")).join(" ")}
      data-cube-gold-splits={groups
        .filter((g) => gold.has(g.ms))
        .map((g) => g.ids.join("+"))
        .join(" ")}
      className="flex w-full flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs"
    >
      {groups.map((g) => (
        <li
          key={`${g.ms}-${g.ids.join("+")}`}
          data-gold={gold.has(g.ms) ? "" : undefined}
          className="whitespace-nowrap"
        >
          <span className={gold.has(g.ms) ? "text-amber-200" : "text-white/70"}>
            {g.full}
          </span>{" "}
          <span className="font-mono tabular-nums">{formatMs(g.ms)}</span>{" "}
          <span
            className={`font-mono tabular-nums ${gold.has(g.ms) ? "rounded bg-amber-400/15 px-1 text-amber-200" : "text-white/45"}`}
            title={gold.has(g.ms) ? "이 구간 내 최고" : undefined}
          >
            +{formatMs(g.lap)}
          </span>
        </li>
      ))}
    </ol>
  );
}

const NO_GOLD: ReadonlySet<number> = new Set();

const trim = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
