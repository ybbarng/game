"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";

import { setupFor } from "../learn/notation";
import { LL_COMPARE_TABLE, TWO_LOOK_GROUPS } from "../learn/two-look-sheets";
import { AlgPicture } from "./AlgPicture";

/**
 * 「마지막 층을 공식으로」 첫 단원의 표 둘(docs/47 16-24). 모양 그림은 윗면 평면도(`AlgPicture`, 윗면 + 옆면 윗줄)이고
 * 전개도는 쓰지 않는다(docs/standing-rules.md 2-1절).
 */

/** 2단계 네 걸음의 모양 16가지 */
export function TwoLookCasesSheet({ colors }: { colors: readonly number[] }) {
  return (
    <div
      data-sheet="2look-cases"
      className="flex flex-col gap-3 rounded-xl bg-black/25 p-3 text-sm"
    >
      {TWO_LOOK_GROUPS.map((g) => (
        <section
          key={g.title}
          data-sheet-group={g.title}
          className="flex flex-col gap-1.5"
        >
          <h3 className="font-semibold">{g.title}</h3>
          <p className="break-keep text-white/70 text-xs">{g.look}</p>
          <ul className="flex flex-wrap gap-2">
            {g.cases.map((c) => (
              <li
                key={c.id}
                data-sheet-case={c.id}
                className="flex w-20 flex-col items-center gap-1"
              >
                <AlgPicture
                  set={g.set}
                  n={3}
                  state={applyMoves(
                    3,
                    solvedCube(3),
                    parseMoves(3, setupFor(c.alg, "z2")),
                  )}
                  colors={colors}
                  {...(g.mask ? { mask: g.mask } : {})}
                  className="h-16 w-16"
                />
                <span className="break-keep text-center text-[11px] text-white/70">
                  {c.caption}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** 초보자 해법 마지막 층과 나란히 */
export function LlCompareSheet() {
  const t = LL_COMPARE_TABLE;
  return (
    <div
      data-sheet="ll-compare"
      className="flex flex-col gap-2 rounded-xl bg-black/25 p-3 text-sm"
    >
      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr className="text-white/60 text-xs">
            <th className="w-10 py-1" />
            {t.heads.map((h) => (
              <th key={h} className="py-1 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={r.join()} className="border-white/10 border-t">
              <td className="py-1 text-white/50 text-xs">{i + 1}</td>
              {r.map((cell, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 칸 차례가 곧 열
                <td key={k} className="break-keep py-1">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {t.numbers.map((n) => (
            <tr
              key={n.label}
              data-compare={n.label}
              className="border-white/10 border-t"
            >
              <td className="break-keep py-1 text-white/50 text-xs">
                {n.label}
              </td>
              {n.values.map((v, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 칸 차례가 곧 열
                <td key={k} className="py-1 font-semibold">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
