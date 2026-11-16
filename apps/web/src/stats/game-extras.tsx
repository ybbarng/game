"use client";

import type { KitStats } from "@/game/kit";
import { cn } from "@/lib/cn";

import { achievementsOf } from "./achievements";
import { type GameRecords, resultsOf } from "./outcome";
import { byPerson } from "./people";
import type { StatsBook } from "./records";
import { Card, pct } from "./widgets";

/*
 * 모든 게임 탭에 같은 칸: 같이 한 사람별 기록과 업적. 게임마다 다른 것(승패 단위·그 게임 업적)은
 * 게임 키트의 `stats.result`·`stats.achievements`가 정한다.
 */

type Spec = Pick<KitStats<unknown, unknown>, "result" | "achievements">;

/** 한 게임 것만 */
export function recordsOf(book: StatsBook, game: string): GameRecords {
  return {
    rounds: book.rounds.filter((r) => r.game === game),
    games: book.games.filter((g) => g.game === game),
  };
}

/** 같이 한 사람별 판 수와 승률. 친구와 한 기록에 이름이 없으면 그리지 않는다 */
export function PeopleCard({
  spec,
  records,
  fallback,
}: {
  spec: Spec;
  records: GameRecords;
  fallback: ReadonlyMap<string, readonly string[]>;
}) {
  const people = byPerson(resultsOf(spec.result, records), fallback);
  if (people.length === 0) return null;
  const unit = spec.result.unit === "round" ? "판" : "게임";
  return (
    <Card title="같이 한 사람">
      <ul className="flex flex-col gap-2" aria-label="같이 한 사람">
        {people.slice(0, 12).map((p) => (
          <li
            key={p.name}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm"
          >
            <span className="truncate text-white/90">{p.name}</span>
            <span className="text-white/60 text-xs tabular-nums">
              {p.n}
              {unit} · {p.won}승 {p.lost}패{p.drawn > 0 ? ` ${p.drawn}무` : ""}
            </span>
            <b className="w-12 text-right tabular-nums">{pct(p.won, p.n)}</b>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 업적: 받은 것은 밝게, 아직인 것은 흐리게. 기간과 상관없이 모든 기록으로 계산한다 */
export function AchievementsCard({
  spec,
  records,
}: {
  spec: Spec;
  records: GameRecords;
}) {
  const list = achievementsOf(spec, records);
  const earned = list.filter((a) => a.earned).length;
  return (
    <Card title={`업적 ${earned}/${list.length}`}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((a) => (
          <li
            key={a.id}
            data-achievement={a.id}
            data-earned={a.earned}
            className={cn(
              "flex min-w-0 flex-col gap-0.5 rounded-2xl border px-3 py-2",
              a.earned
                ? "border-amber-300/70 bg-amber-300/10"
                : "border-white/10 bg-white/[0.03] opacity-55",
            )}
          >
            <span
              className={cn(
                "font-semibold text-sm",
                a.earned ? "text-amber-100" : "text-white/80",
              )}
            >
              {a.earned ? "🏅 " : ""}
              {a.name}
            </span>
            <span className="text-white/60 text-xs">{a.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
