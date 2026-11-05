"use client";

import { type BotPlan, botSkillLabel } from "@game/cube-ai";
import type { PuzzleState } from "@game/puzzle-core";
import { useMemo } from "react";

import { botChoices } from "../online/bot-choices";
import { formatMs } from "../records";
import { type RivalOutcome, rivalAt, rivalShown, rivalVerdict } from "../rival";
import type { CubeSettings } from "../settings";
import { CubePosterPair } from "./CubePosterPair";

/** 오늘의 섞기·제한 도전 머리의 「컴퓨터」 고르기(끄기·단계·내 실력에 맞춤, 예상 시간을 붙인다) */
export function RivalSelect({
  n,
  average,
  value,
  disabled,
  onChange,
}: {
  n: number;
  average: number | null;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-sm">
      컴퓨터
      <select
        data-cube-rival-pick
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          e.target.blur();
        }}
        className="rounded bg-white/10 px-2 py-1 disabled:opacity-60"
      >
        <option value="" className="bg-neutral-800">
          없이
        </option>
        {botChoices(n, average).map((c) => (
          <option key={c.value} value={c.value} className="bg-neutral-800">
            {c.label} · {c.time}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * 나란히 맞추는 컴퓨터 한 줄: 작은 큐브 그림(내가 출발한 뒤 계획 시각대로 바뀐다)·이름·수·상태, 끝나면 나와 견준 결과.
 * `t`는 내가 맞추기를 시작한 뒤 흐른 시간(출발 전이면 null)
 */
export function RivalPanel({
  n,
  bot,
  start,
  plan,
  outcome,
  t,
  mine,
  settings,
  scored,
}: {
  n: number;
  bot: string;
  start: PuzzleState;
  plan: BotPlan | null;
  outcome: RivalOutcome | null;
  t: number | null;
  /** 내 판이 끝났으면 내 결과(시간은 벌점 포함, 제한 도전은 점수) */
  mine: { total: number | null; score: number | null } | null;
  settings: CubeSettings;
  /** 제한 도전(점수로 견준다) */
  scored: boolean;
}) {
  const shown =
    plan && outcome && t !== null ? rivalShown(plan, outcome, t) : 0;
  // 둔 수가 바뀔 때만 다시 계산한다
  const now = useMemo(
    () => (plan ? rivalAt(n, start, plan, shown) : { state: start, turns: 0 }),
    [n, start, plan, shown],
  );
  const ended = outcome !== null && t !== null && t >= outcome.endAt;
  // 시간으로 견줄 때 내가 먼저 맞췄으면 컴퓨터가 끝나기를 기다리지 않는다
  const early =
    !scored &&
    mine?.total != null &&
    outcome !== null &&
    t !== null &&
    t >= mine.total &&
    (outcome.doneAt === null || outcome.doneAt > mine.total);
  const verdict =
    (ended || early) && mine && outcome ? rivalVerdict(mine, outcome) : null;
  const status = !plan
    ? "계획 세우는 중"
    : t === null
      ? "내가 시작하면 출발"
      : !ended
        ? "맞추는 중"
        : outcome?.doneAt != null
          ? `맞춤 ${formatMs(outcome.doneAt)}`
          : outcome?.reason === "moves"
            ? "수 체력 다함"
            : "시간 체력 다함";
  return (
    <div
      data-cube-rival={ended ? "done" : t === null ? "wait" : "racing"}
      data-cube-rival-verdict={verdict ?? undefined}
      className="flex w-full max-w-md items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm"
    >
      <div className="w-14 shrink-0" aria-hidden>
        <CubePosterPair
          n={n}
          state={now.state}
          settings={settings}
          captions={false}
          frontOnly
          className="w-full"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate">
          🤖 컴퓨터{" "}
          <span className="text-white/60">{botSkillLabel(bot, n)}</span>
        </span>
        <span className="text-white/70 text-xs" data-cube-rival-status>
          {status} · {now.turns}수
          {scored && ended && outcome?.score != null
            ? ` · 점수 ${outcome.score}`
            : ""}
        </span>
      </div>
      {verdict && (
        <b
          className={`shrink-0 ${verdict === "win" ? "text-emerald-300" : verdict === "lose" ? "text-rose-300" : "text-white/80"}`}
        >
          {verdict === "win"
            ? "내가 이김"
            : verdict === "lose"
              ? "컴퓨터 승"
              : "비김"}
        </b>
      )}
    </div>
  );
}
