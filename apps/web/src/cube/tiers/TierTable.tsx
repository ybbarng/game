"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { loadBestFive, loadRecords } from "../records";
import { type MyTier, myTier, tierName } from "./rank";
import { DIVISIONS, TIER_LABEL, TIER_TABLE, type TierId } from "./table";

/**
 * 티어 화면 조각(docs/47 14절). 사이트의 티어표(`/cube/tiers`)와 혼자 맞추기 기록 칸이 쓰고, Cubie 미니 모드도 그대로
 * 가져다 쓸 수 있게 크기·내 티어만 받는다(저장소 읽기는 `useMyTier` 하나).
 */

/** 티어마다 글자 색(롤 문장을 흉내 내지 않고 이름 색만) */
export const TIER_TONE: Readonly<Record<TierId, string>> = {
  iron: "text-stone-400",
  bronze: "text-orange-300",
  silver: "text-slate-200",
  gold: "text-yellow-300",
  platinum: "text-teal-300",
  emerald: "text-emerald-400",
  diamond: "text-sky-300",
  master: "text-fuchsia-300",
  grandmaster: "text-rose-400",
  challenger: "text-amber-200",
};

/** 상한 시간 글: 1분 아래 「9.3초」, 1시간 아래 「2:30」, 그 위 「1:10:00」, 끝없음 「다 맞춤」 */
export function cutText(sec: number): string {
  if (!Number.isFinite(sec)) return "다 맞춤";
  if (sec < 60) return `${sec}초`;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 이 기기의 크기 `n` 혼자 맞추기 최고 티어(기록이 바뀌면 `version`을 바꿔 다시 읽는다) */
export function useMyTier(n: number, version: unknown = 0): MyTier | null {
  const [mine, setMine] = useState<MyTier | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version은 다시 읽을 때를 알리는 값
  useEffect(() => {
    setMine(myTier(n, loadRecords("solo", n), loadBestFive(n)));
  }, [n, version]);
  return mine;
}

/** 작은 티어 표시(기록 칸·결과 상자). 누르면 그 크기 티어표 */
export function TierLink({
  mine,
  className,
}: {
  mine: MyTier;
  className?: string;
}) {
  return (
    <a
      href={`/cube/tiers?n=${mine.n}`}
      data-cube-tier={mine.place.tier}
      data-cube-tier-step={mine.place.step}
      className={cn(
        "inline-flex items-center gap-1 font-semibold hover:underline",
        TIER_TONE[mine.place.tier],
        className,
      )}
    >
      {tierName(mine.place)}
    </a>
  );
}

/** 크기 `n`의 기준표. `mine`이 있으면 그 칸을 짚는다 */
export function TierTable({ n, mine }: { n: number; mine?: MyTier | null }) {
  const table = TIER_TABLE[n];
  if (!table) return null;
  const here = mine && mine.n === n ? mine.place : null;
  return (
    <table
      data-cube-tier-table={n}
      className="w-full table-fixed border-separate border-spacing-y-1 text-sm tabular-nums"
    >
      <caption className="sr-only">
        {n}×{n} 티어 기준(최고 Ao5가 칸의 시간 이하면 그 구간)
      </caption>
      <thead className="text-white/50 text-xs">
        <tr>
          <th scope="col" className="w-[30%] text-left font-normal sm:w-[22%]">
            티어
          </th>
          {DIVISIONS.map((d) => (
            <th key={d} scope="col" className="font-normal">
              {d}
            </th>
          ))}
          <th
            scope="col"
            className="hidden w-[24%] text-right font-normal sm:table-cell"
          >
            WCA 경기자 중
          </th>
        </tr>
      </thead>
      <tbody>
        {[...table].reverse().map((row) => {
          const mineRow = here?.tier === row.tier;
          const wca = row.wca
            ? `상위 ${row.wca.percent}% · ${row.wca.people.toLocaleString("ko-KR")}명`
            : "대회 밖";
          const bg = mineRow ? "bg-white/10" : "";
          return (
            <tr
              key={row.tier}
              data-cube-tier-row={row.tier}
              {...(mineRow ? { "data-cube-tier-mine": "" } : {})}
            >
              <th
                scope="row"
                className={cn(
                  "rounded-l-lg py-1.5 pl-2 text-left font-semibold",
                  bg,
                )}
              >
                <span className={TIER_TONE[row.tier]}>
                  {TIER_LABEL[row.tier]}
                </span>
                <span className="block font-normal text-[11px] text-white/45 sm:hidden">
                  {row.wca ? `상위 ${row.wca.percent}%` : "대회 밖"}
                </span>
              </th>
              {row.cuts.length === 4 ? (
                row.cuts.map((cut, d) => {
                  const on = mineRow && here?.division === DIVISIONS[d];
                  return (
                    <td
                      key={DIVISIONS[d]}
                      {...(on ? { "data-cube-tier-cell": "" } : {})}
                      className={cn(
                        "px-0.5 text-center text-xs sm:text-sm",
                        bg,
                        on &&
                          "rounded-md font-bold text-amber-200 outline outline-1 outline-amber-300/70",
                      )}
                    >
                      {cutText(cut)}
                    </td>
                  );
                })
              ) : (
                <td
                  colSpan={4}
                  {...(mineRow ? { "data-cube-tier-cell": "" } : {})}
                  className={cn(
                    "text-center text-xs sm:text-sm",
                    bg,
                    mineRow && "font-bold text-amber-200",
                  )}
                >
                  {Number.isFinite(row.cuts[0] as number)
                    ? `${cutText(row.cuts[0] as number)} 이하`
                    : "다 맞춤"}
                </td>
              )}
              <td
                className={cn(
                  "hidden rounded-r-lg pr-2 text-right text-white/60 text-xs sm:table-cell",
                  bg,
                )}
              >
                {wca}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
