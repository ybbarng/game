"use client";

import type { GalaxyView, GameEvent } from "@game/galaxy-engine";
import { cn } from "@/lib/cn";

import { money } from "../format";
import { RECAP_ITEMS, recapOf } from "../recap";
import { ShipToken } from "./parts";

/**
 * 판 끝 「판 돌아보기」(docs/48 15-9): 1등(내가 1등이면 2등)과 항목별 차이, 놓친 기회.
 * 차이는 「내 자산 쪽으로 얼마나 앞섰나」로 적는다(낸 이용료는 적을수록 앞선다). 가장 크게 뒤진 항목을 굵게
 */
export function GameRecap({
  view,
  history,
  name,
}: {
  view: GalaxyView;
  history: readonly GameEvent[];
  name: (seat: number) => string;
}) {
  const standings = view.result?.standings ?? [];
  if (standings.length < 2) return null;
  const me = view.mySeat;
  const recap = recapOf(
    history,
    view,
    me,
    standings.map((s) => s.seat),
  );
  if (recap.rival === null || !recap.them) return null;
  const them = recap.them;
  const rows = RECAP_ITEMS.map((item) => {
    const a = recap.me[item.key];
    const b = them[item.key];
    return { ...item, a, b, gap: item.cost ? b - a : a - b };
  });
  const worst = Math.min(...rows.map((r) => r.gap));
  const section = (kind: "flow" | "hold", title: string) => (
    <>
      <tr>
        <th
          colSpan={4}
          className="pt-1.5 text-left font-normal text-[11px] text-white/45"
        >
          {title}
        </th>
      </tr>
      {rows
        .filter((r) => r.kind === kind)
        .map((r) => (
          <tr
            key={r.key}
            data-recap-row={r.key}
            className={cn(r.gap === worst && worst < 0 && "font-bold")}
          >
            <td className="py-0.5">{r.label}</td>
            <td className="text-right tabular-nums">{money(r.a)}</td>
            <td className="text-right text-white/70 tabular-nums">
              {money(r.b)}
            </td>
            <td
              className={cn(
                "text-right tabular-nums",
                r.gap > 0
                  ? "text-emerald-200"
                  : r.gap < 0
                    ? "text-rose-200"
                    : "text-white/40",
              )}
            >
              {r.gap === 0
                ? "—"
                : `${r.gap > 0 ? "앞" : "뒤"} ${money(Math.abs(r.gap))}`}
            </td>
          </tr>
        ))}
    </>
  );
  return (
    <section data-recap className="w-full">
      <h2 className="mb-1 font-bold text-sm">판 돌아보기</h2>
      <table className="w-full text-xs">
        <thead className="text-white/50">
          <tr>
            <th className="text-left font-normal" />
            <th className="text-right font-normal">나</th>
            <th className="text-right font-normal">
              <span className="inline-flex items-center gap-1">
                <ShipToken seat={recap.rival} size={9} />
                {name(recap.rival)}
              </span>
            </th>
            <th className="text-right font-normal">차이</th>
          </tr>
        </thead>
        <tbody>
          {section("flow", "판 동안")}
          {section("hold", "끝날 때 자산")}
        </tbody>
      </table>
      {recap.missed.length > 0 && (
        <div className="mt-2">
          <h3 className="mb-0.5 font-semibold text-white/80 text-xs">
            놓친 기회
          </h3>
          <ul data-recap-missed className="flex flex-col gap-0.5 text-xs">
            {recap.missed.map((line) => (
              <li key={line} className="text-white/80 leading-snug">
                · {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
