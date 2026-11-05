"use client";

import { formatMs } from "../records";
import { type CubeRoom, matchRules } from "./room";
import {
  FORMAT_LABELS,
  pointsMatch,
  SCORING_LABELS,
  standings,
} from "./standings";

/**
 * 판 사이 점수판과 마지막 판 뒤 최종 순위(docs/51 3-1, docs/47 9-3). 결과 상자 안 구간 표 아래에 둔다.
 * 점수·순위는 이 기기가 받은 판 결과로 계산한다(방장이 알린 경기 상태를 믿지 않는다, `CubeRoom.matchOver`).
 */
export function MatchBoard({ room }: { room: CubeRoom }) {
  const state = room.state;
  if (!state || room.rounds.length === 0) return null;
  const s = state.settings;
  if (s.format === "single") return null;
  const rules = matchRules(s);
  const players = state.race?.players ?? state.players.map((p) => p.id);
  const rows = standings(rules, players, room.rounds);
  const over = room.matchOver();
  const points = s.format === "points";
  const pm = points ? pointsMatch(rules, room.rounds) : undefined;
  const suddenDeath = !!pm && pm.played === pm.total && pm.tied.length > 1;

  let title: string;
  if (over) title = "최종 순위";
  else if (pm)
    title = suddenDeath
      ? "동점 · 다음 판 서든데스"
      : `점수 · ${pm.played}/${pm.total}판`;
  else title = "종합 순위";
  const sub = pm
    ? `${FORMAT_LABELS.points} ${pm.total}판 · ${SCORING_LABELS[rules.scoring ?? "wins"]}`
    : s.format === "firstTo"
      ? `${FORMAT_LABELS.firstTo}(${s.target}판)`
      : FORMAT_LABELS[s.format];
  const columns = pm ? pm.played : 0;

  return (
    <section
      className="flex flex-col gap-1 border-white/10 border-t pt-2"
      data-cube-match-board={over ? "over" : suddenDeath ? "sudden" : "between"}
    >
      <div className="flex items-baseline gap-2">
        <h3
          className={`font-semibold text-sm ${over ? "text-amber-200" : "text-white/90"}`}
        >
          {title}
        </h3>
        <span className="text-white/50 text-xs">{sub}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          {pm && (
            <thead className="text-white/50 text-xs">
              <tr>
                <th className="min-w-6" />
                <th className="w-full" />
                {Array.from({ length: columns }, (_, i) => (
                  <th
                    // biome-ignore lint/suspicious/noArrayIndexKey: 판 번호가 곧 열이다
                    key={i}
                    className="min-w-7 pl-2 text-right font-normal"
                  >
                    {i + 1}
                  </th>
                ))}
                {pm.suddenDeath > 0 && (
                  <th className="pl-2 text-right font-normal">서든데스</th>
                )}
                <th className="pl-3 text-right font-normal">점수</th>
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((r) => {
              const first = over && r.place === 1;
              const mine = r.id === room.me;
              return (
                <tr
                  key={r.id}
                  data-cube-match-row={r.id}
                  data-cube-match-place={r.place}
                  data-cube-match-points={pm ? r.points : undefined}
                  className={first ? "text-amber-100" : ""}
                >
                  <td className="min-w-6 pr-2 text-white/50 tabular-nums">
                    {r.place}
                  </td>
                  <td
                    className={`w-full max-w-0 truncate ${mine ? "font-semibold" : ""}`}
                  >
                    {room.playerName(r.id)}
                  </td>
                  {pm &&
                    r.roundPoints.map((p, i) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: 판 번호가 곧 열이다
                        key={i}
                        className={`min-w-7 pl-2 text-right font-mono text-xs tabular-nums ${
                          p ? "text-white/80" : "text-white/30"
                        }`}
                      >
                        {p === null ? "-" : p}
                      </td>
                    ))}
                  {pm && pm.suddenDeath > 0 && (
                    <td className="pl-2 text-right text-xs">
                      {pm.suddenDeathWinner === r.id
                        ? "승"
                        : pm.tied.includes(r.id)
                          ? "-"
                          : ""}
                    </td>
                  )}
                  <td className="pl-3 text-right font-mono font-semibold tabular-nums">
                    {pm
                      ? r.points
                      : s.format === "firstTo"
                        ? `${r.wins}승`
                        : r.value === null
                          ? "DNF"
                          : formatMs(r.value)}
                  </td>
                  {!pm && (
                    <td className="hidden pl-3 text-right font-mono text-white/40 text-xs sm:table-cell">
                      {r.times
                        .map((t) => (t === null ? "DNF" : formatMs(t)))
                        .join(" · ")}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 「다음 판」 단추 글. 점수제에서 정규 판이 끝나고 동점이면 「서든데스」 */
export function nextLabel(room: CubeRoom): string {
  const s = room.state?.settings;
  if (s?.format !== "points") return "다음 판";
  const m = pointsMatch(matchRules(s), room.rounds);
  return m.played === m.total && m.tied.length > 1 ? "서든데스" : "다음 판";
}
