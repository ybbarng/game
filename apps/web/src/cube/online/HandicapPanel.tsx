"use client";

import type { MilestoneId } from "@game/cube-engine";

import { formatMs } from "../records";
import {
  DELAY_CHOICES,
  goalChoices,
  type Handicap,
  HELPS,
  type Help,
  helpChoices,
  helpLabel,
  recommendDelays,
} from "./handicap";
import type { CubeRoom } from "./room";

/**
 * 대기실의 핸디캡 칸(docs/51 4절, docs/47 9-5·9-8). 방장이 사람마다 출발 늦추기·목표·도움을, 방 전체에 점수(시간·평균 대비)를
 * 고른다. 손님은 보기만 한다. 컴퓨터는 단계로 이미 맞추니 줄에 넣지 않는다.
 */
export function HandicapPanel({ room }: { room: CubeRoom }) {
  const state = room.state;
  if (!state) return null;
  const s = state.settings;
  const host = room.isHost;
  const h: Handicap = s.handicap ?? {};
  const humans = state.players.filter((p) => p.bot === undefined);
  // 「평균 대비」는 시간 순위라 5판 평균·체력바와는 함께 쓰지 않는다
  // 모양 만들기는 시간 순위·완성 하나라 「평균 대비」와 「목표」를 쓰지 않는다
  const ao5 = s.format === "ao5" || !!s.party || !!s.shape;
  const avg = h.score === "avg" && !ao5;
  const noGoal = avg || !!s.shape;
  const goals = goalChoices(s.n);
  const averages = Object.fromEntries(
    humans.map((p) => [p.id, room.averageOf(p.id)]),
  );
  const recommended = recommendDelays(averages);
  const set = (
    patch: {
      [K in keyof Handicap]?: Handicap[K] | undefined;
    },
  ) => {
    const next = { ...h, ...patch } as Handicap;
    for (const k of ["delay", "goal", "help"] as const) {
      const v = next[k];
      if (v && Object.keys(v).length === 0) delete next[k];
    }
    if (next.score === undefined) delete next.score;
    room.setHandicap(next);
  };
  const setOne = <K extends "delay" | "goal" | "help">(
    k: K,
    id: string,
    value: NonNullable<Handicap[K]>[string] | null,
  ) => {
    const map = { ...(h[k] ?? {}) } as Record<string, unknown>;
    if (value === null) delete map[id];
    else map[id] = value;
    set({ [k]: map });
  };

  return (
    <section
      data-cube-handicap
      className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3 text-sm"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="font-semibold">핸디캡</h2>
        <span className="text-white/50 text-xs">
          친구끼리 믿는 모드 · 평균과 도움은 각 기기에서
        </span>
      </div>
      {!ao5 && (
        <label className="flex items-center justify-between gap-2">
          순위
          <select
            disabled={!host}
            data-cube-handicap-score
            value={avg ? "avg" : "time"}
            onChange={(e) =>
              e.target.value === "avg"
                ? set({ score: "avg" })
                : set({ score: undefined })
            }
            className="rounded bg-white/10 px-2 py-1"
          >
            <option value="time" className="bg-neutral-800">
              시간
            </option>
            <option value="avg" className="bg-neutral-800">
              내 평균 대비
            </option>
          </select>
        </label>
      )}
      <table className="w-full text-xs">
        <thead className="text-white/50">
          <tr>
            <th className="text-left font-normal">사람</th>
            <th className="text-right font-normal">평균</th>
            <th className="pl-2 text-right font-normal">출발</th>
            {!noGoal && <th className="pl-2 text-right font-normal">목표</th>}
            <th className="pl-2 text-right font-normal">도움</th>
          </tr>
        </thead>
        <tbody>
          {humans.map((p) => {
            const a = averages[p.id];
            return (
              <tr key={p.id} data-cube-handicap-row={p.id}>
                <td className="max-w-24 truncate">{room.playerName(p.id)}</td>
                <td className="text-right font-mono text-white/60 tabular-nums">
                  {a == null ? "-" : formatMs(a)}
                </td>
                <td className="pl-2 text-right">
                  <select
                    disabled={!host}
                    aria-label={`${room.playerName(p.id)} 출발 늦추기`}
                    data-cube-handicap-delay={p.id}
                    value={h.delay?.[p.id] ?? 0}
                    onChange={(e) => {
                      const k = Number(e.target.value);
                      setOne("delay", p.id, k > 0 ? k : null);
                    }}
                    className="rounded bg-white/10 px-1 py-0.5"
                  >
                    {DELAY_CHOICES.map((k) => (
                      <option key={k} value={k} className="bg-neutral-800">
                        {k === 0 ? "바로" : `+${k}초`}
                      </option>
                    ))}
                  </select>
                </td>
                {!noGoal && (
                  <td className="pl-2 text-right">
                    <select
                      disabled={!host}
                      aria-label={`${room.playerName(p.id)} 목표`}
                      data-cube-handicap-goal={p.id}
                      value={h.goal?.[p.id] ?? ""}
                      onChange={(e) =>
                        setOne(
                          "goal",
                          p.id,
                          e.target.value
                            ? (e.target.value as MilestoneId)
                            : null,
                        )
                      }
                      className="rounded bg-white/10 px-1 py-0.5"
                    >
                      <option value="" className="bg-neutral-800">
                        완성
                      </option>
                      {goals.map((g) => (
                        <option
                          key={g.id}
                          value={g.id}
                          className="bg-neutral-800"
                        >
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="pl-2 text-right">
                  <select
                    disabled={!host}
                    aria-label={`${room.playerName(p.id)} 도움`}
                    data-cube-handicap-help={p.id}
                    value={h.help?.[p.id] ?? ""}
                    onChange={(e) =>
                      setOne(
                        "help",
                        p.id,
                        e.target.value ? (e.target.value as Help) : null,
                      )
                    }
                    className="max-w-28 rounded bg-white/10 px-1 py-0.5"
                  >
                    <option value="" className="bg-neutral-800">
                      그대로
                    </option>
                    {HELPS.filter(
                      (k) =>
                        helpChoices(s.n).includes(k) || h.help?.[p.id] === k,
                    ).map((k) => (
                      <option key={k} value={k} className="bg-neutral-800">
                        {helpLabel(s.n, k)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {host && Object.keys(recommended).length > 0 && (
        <button
          type="button"
          data-cube-handicap-recommend
          onClick={() => set({ delay: recommended })}
          className="self-end rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/15"
        >
          평균 차이로 출발 늦추기 채우기
        </button>
      )}
    </section>
  );
}
