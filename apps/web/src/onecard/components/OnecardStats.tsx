"use client";

import type { StatsBook } from "@/stats/records";
import { Card, pct, ResultStrip, StatTile } from "@/stats/widgets";

import { summarizeOnecard } from "../kit";

/** 내 기록의 원카드 탭(ProfilePage가 탭으로 붙인다) */
export function OnecardStats({ book }: { book: StatsBook }) {
  const s = summarizeOnecard(book.rounds, book.games);
  if (s.games === 0)
    return (
      <Card title="아직 기록이 없습니다">
        <p className="text-sm text-white/70">
          원카드를 한 판 끝까지 하면 여기에 쌓입니다.
        </p>
      </Card>
    );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="1등"
          value={pct(s.wins, s.games)}
          sub={`${s.games}판 가운데 ${s.wins}판`}
        />
        <StatTile
          label="평균 등수"
          value={s.averageRank.toFixed(1)}
          sub={`다 냄 ${s.outs}번 · 파산 ${s.bankrupts}번`}
        />
        <StatTile label="잡은 횟수" value={s.catches} sub="원카드로 잡음" />
        <StatTile
          label="잡힌 횟수"
          value={s.caught}
          sub={`헛외침 ${s.falseShouts}번`}
        />
      </div>
      <Card title={`최근 ${s.recent.length}판`}>
        <ResultStrip
          title="최근 판 결과"
          results={s.recent.map((r) => ({ won: r > 0 }))}
        />
      </Card>
    </>
  );
}
