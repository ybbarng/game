"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { patternById } from "../patterns/data";
import { SHAPE_START_LABELS, type ShapeStart } from "../patterns/race";
import { loadShapeRecords, type ShapeRecords } from "../patterns/shape-records";
import { formatMs } from "../records";
import { PatternsApp } from "./PatternsApp";
import { ShapeSoloApp } from "./ShapeSoloApp";

/**
 * 패턴(`/cube/patterns`, docs/47 16-2). 예전의 패턴 만들기와 모양 만들기를 한 화면의 탭 셋으로 합쳤다.
 * 보기(`?tab=see`, 기본, 카드는 `?p=<id>`) · 만들기(`?tab=make`, 목표 모양을 시간 재며 만들기) · 기록(`?tab=records`).
 * 둘은 같은 자료(`patterns/data.ts`)를 쓴다.
 */

export type PatternTab = "see" | "make" | "records";

const TABS: { id: PatternTab; title: string }[] = [
  { id: "see", title: "보기" },
  { id: "make", title: "만들기" },
  { id: "records", title: "기록" },
];

function readTab(search: string): PatternTab {
  const q = new URLSearchParams(search);
  if (q.get("p")) return "see";
  const t = q.get("tab");
  return t === "make" || t === "records" ? t : "see";
}

export function PatternsHub() {
  // undefined: 주소를 아직 안 읽음(미리 그린 HTML과 첫 그리기를 맞춘다)
  const [tab, setTab] = useState<PatternTab | undefined>();
  useEffect(() => {
    const read = () => setTab(readTab(window.location.search));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const choose = (t: PatternTab) => {
    setTab(t);
    window.history.pushState(
      null,
      "",
      t === "see" ? window.location.pathname : `?tab=${t}`,
    );
  };

  if (tab === undefined)
    return (
      <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white" />
    );
  const header = <HubHeader tab={tab} onTab={choose} />;
  if (tab === "see") return <PatternsApp key="see" header={header} />;
  if (tab === "make") return <ShapeSoloApp key="make" header={header} />;
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-pattern-records
      >
        {header}
        <RecordList />
      </main>
    </div>
  );
}

function HubHeader({
  tab,
  onTab,
}: {
  tab: PatternTab;
  onTab: (t: PatternTab) => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <a
        href="/cube"
        className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
      >
        ← 큐브
      </a>
      <h1 className="font-bold text-lg">패턴</h1>
      <nav
        aria-label="패턴 차례"
        className="flex gap-1 rounded-xl bg-white/5 p-1 text-sm"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-patterns-tab={t.id}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={(e) => {
              onTab(t.id);
              e.currentTarget.blur();
            }}
            className={cn(
              "rounded-lg px-3 py-1.5",
              t.id === tab
                ? "bg-white/15 font-semibold"
                : "text-white/70 hover:bg-white/10",
            )}
          >
            {t.title}
          </button>
        ))}
      </nav>
    </header>
  );
}

interface Row {
  key: string;
  name: string;
  size: number;
  start: ShapeStart;
  formula: boolean;
  best: number;
  bestMoves: number;
  count: number;
}

/** 만들기 기록을 모양마다 한 줄로(크기 → 이름 차례) */
export function recordRows(records: ShapeRecords): Row[] {
  const rows: Row[] = [];
  for (const [key, r] of Object.entries(records)) {
    const [id = "", start, flag] = key.split("|");
    const p = patternById(id);
    if (!p || (start !== "solved" && start !== "scrambled")) continue;
    rows.push({
      key,
      name: p.name,
      size: p.size,
      start,
      formula: flag === "formula",
      best: r.best,
      bestMoves: r.bestMoves,
      count: r.count,
    });
  }
  return rows.sort(
    (a, b) =>
      a.size - b.size ||
      a.name.localeCompare(b.name, "ko") ||
      a.start.localeCompare(b.start) ||
      Number(a.formula) - Number(b.formula),
  );
}

function RecordList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => setRows(recordRows(loadShapeRecords())), []);
  if (rows === null) return null;
  if (rows.length === 0)
    return (
      <p className="text-sm text-white/70" data-pattern-records-empty>
        아직 기록이 없어요. 「만들기」에서 목표 모양을 만들면 모양마다 가장 빠른
        기록이 남아요.
      </p>
    );
  return (
    <table className="w-full text-left text-sm" data-pattern-records>
      <thead className="text-white/60 text-xs">
        <tr>
          <th className="py-1 font-normal">모양</th>
          <th className="py-1 font-normal">시작</th>
          <th className="py-1 text-right font-normal">최고</th>
          <th className="py-1 text-right font-normal">수</th>
          <th className="py-1 text-right font-normal">횟수</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-white/10 border-t">
            <td className="py-1.5">
              {r.size}×{r.size} {r.name}
              {r.formula && (
                <span className="ml-1 text-white/50 text-xs">만드는 법 봄</span>
              )}
            </td>
            <td className="py-1.5 text-white/70">
              {SHAPE_START_LABELS[r.start]}
            </td>
            <td className="py-1.5 text-right font-mono">{formatMs(r.best)}</td>
            <td className="py-1.5 text-right">{r.bestMoves}</td>
            <td className="py-1.5 text-right">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
