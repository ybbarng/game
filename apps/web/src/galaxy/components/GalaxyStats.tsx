"use client";

import { boardOfSky, DEFAULT_SKY } from "@game/galaxy-engine";
import { useEffect, useState } from "react";
import type { StatsBook } from "@/stats/records";
import { Card, pct, StatTile } from "@/stats/widgets";

import { money } from "../format";
import { summarizeGalaxy } from "../kit";
import { loadMet } from "../met-stars";

/** 내 기록(/profile)의 은하 한 바퀴 탭: 순위·자산·완성 별자리·만난 별 */
export function GalaxyStats({ book }: { book: StatsBook }) {
  const s = summarizeGalaxy(book.rounds);
  // 별 도감은 이 기기 기록(galaxy-met-stars)과 판 기록을 합친다
  const [local, setLocal] = useState<string[]>([]);
  useEffect(() => setLocal(loadMet()), []);
  const met = [...new Set([...s.met, ...local])];
  if (s.rounds === 0)
    return (
      <p className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/60">
        아직 끝낸 은하 한 바퀴 판이 없습니다. 한 판 하고 오세요.
      </p>
    );
  const board = boardOfSky(DEFAULT_SKY);
  const stars = board.squares.flatMap((sq) => (sq.star ? [sq.star.star] : []));
  const metHere = stars.filter((star) => met.includes(star.id));
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="1등"
          value={pct(s.firsts, s.rounds)}
          sub={`${s.rounds}판 중 ${s.firsts}번 1등`}
        />
        <StatTile
          label="평균 순위"
          value={s.averageRank > 0 ? `${s.averageRank.toFixed(1)}등` : "—"}
          sub={`평균 자산 ${money(Math.round(s.averageAssets))}`}
        />
        <StatTile
          label="완성한 별자리"
          value={`${s.completed}`}
          sub={`가장 큰 자산 ${money(s.bestAssets)}`}
        />
        <StatTile
          label="만난 별"
          value={`${metHere.length}/${stars.length}`}
          sub={board.skyKo}
        />
      </div>
      <Card title="별 도감">
        <ul className="flex flex-col gap-1 text-sm">
          {board.groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-1">
              <span className="w-28 text-white/60 text-xs">
                {g.ko}
                {s.completedBy[g.id] ? ` · 완성 ${s.completedBy[g.id]}번` : ""}
              </span>
              {g.squares.map((sq) => {
                const star = board.squares[sq]?.star?.star;
                if (!star) return null;
                const seen = met.includes(star.id);
                return (
                  <span
                    key={sq}
                    className={
                      seen
                        ? "rounded-full border border-sky-200/40 bg-sky-200/10 px-2 py-0.5 text-xs"
                        : "rounded-full border border-white/10 px-2 py-0.5 text-white/30 text-xs"
                    }
                  >
                    {seen ? star.ko : "?"}
                  </span>
                );
              })}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="이용료">
        <p className="text-sm text-white/80">
          낸 이용료 {money(s.rentPaid)} · 받은 이용료 {money(s.rentReceived)}
        </p>
      </Card>
    </>
  );
}
