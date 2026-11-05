"use client";

import {
  bestScore,
  type ChallengeEntry,
  type ChallengeKind,
  type ChallengePick,
  entriesFor,
  KIND_LABEL,
  LEVEL_LABEL,
  LOW_RATIO,
  ruleText,
} from "../challenge";
import { formatMs, type Split } from "../records";
import { SplitList } from "./SolveProgress";

/**
 * 제한 도전(`/cube/challenge`, docs/51 2-3) 화면 조각: 체력바, 결과 상자, 기록 칸.
 * 판의 진행은 `SolveSession`의 `limit`이 맡고 여기서는 그리기만 한다.
 */

/** 남은 체력 글: 시간은 「42.3초」, 수는 「57수」 */
export function hpText(kind: ChallengeKind, left: number): string {
  return kind === "time" ? `${(left / 1000).toFixed(1)}초` : `${left}수`;
}

/** 채움 표시(「+10초」)를 보이는 시간 */
export const REFILL_SHOW_MS = 1_200;

/**
 * 체력바 한 줄: 이름 · 막대 · 남은 체력 · 채움(「+10초」, 잠깐). 20% 아래면 붉게.
 * 막대는 처음 체력을 100%로 두고, 채워 넘친 몫은 글로만 보인다
 */
export function HpBar({
  kind,
  left,
  max,
  refill,
}: {
  kind: ChallengeKind;
  left: number;
  max: number;
  /** 방금 채운 양(ms). 없으면 null */
  refill: number | null;
}) {
  const ratio = max > 0 ? Math.min(1, left / max) : 0;
  const low = ratio < LOW_RATIO;
  return (
    <div
      data-cube-hp={kind}
      data-cube-hp-left={left}
      data-cube-hp-low={low ? "" : undefined}
      className="flex h-5 w-full max-w-md items-center gap-2"
    >
      <span className="shrink-0 text-white/60 text-xs">
        {KIND_LABEL[kind]} 체력
      </span>
      <span className="relative h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-white/10">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${
            low
              ? "bg-rose-400"
              : "bg-gradient-to-r from-amber-400 to-emerald-400"
          } ${kind === "moves" ? "transition-[width] duration-200 ease-out motion-reduce:transition-none" : ""}`}
          style={{ width: `${Math.round(ratio * 1000) / 10}%` }}
        />
      </span>
      <span
        className={`w-14 shrink-0 text-right font-mono text-sm tabular-nums ${
          low ? "text-rose-300" : "text-white/85"
        }`}
      >
        {hpText(kind, left)}
      </span>
      {/* 자리를 늘 비워 둬 채움이 뜰 때 줄이 흔들리지 않게 */}
      <span className="w-11 shrink-0 text-emerald-300 text-xs">
        {refill !== null && (
          <span data-cube-hp-refill className="cube-hp-refill inline-block">
            +{refill / 1000}초
          </span>
        )}
      </span>
    </div>
  );
}

const REASON_TEXT: Record<NonNullable<ChallengeEntry["reason"]>, string> = {
  time: "시간이 다했어요",
  moves: "수가 다했어요",
  inspection: "살펴보기 17초 넘김",
};

const REASON_SHORT: Record<NonNullable<ChallengeEntry["reason"]>, string> = {
  time: "시간",
  moves: "수",
  inspection: "살펴보기",
};

/** 결과 상자: 성공·끝난 까닭, 점수(최고면 표시), 단계·남은 체력, 구간 */
export function ChallengeResult({
  entry,
  best,
  splits,
  gold,
}: {
  entry: ChallengeEntry;
  /** 이 크기·체력·어려움의 새 최고 점수 */
  best: boolean;
  splits: readonly Split[];
  gold: ReadonlySet<number>;
}) {
  const ok = entry.ok;
  return (
    <div
      data-cube-result={ok ? "solved" : "dnf"}
      data-cube-challenge-result={ok ? "ok" : (entry.reason ?? "")}
      role="status"
      className={`flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 rounded-xl border px-4 py-2 ${
        ok
          ? "border-emerald-400/40 bg-emerald-400/10"
          : "border-rose-400/40 bg-rose-500/10"
      }`}
    >
      <span
        className={`font-bold text-xl ${ok ? "text-emerald-300" : "text-rose-200"}`}
      >
        {ok ? "성공" : REASON_TEXT[entry.reason ?? "time"]}
      </span>
      <span
        data-cube-score={entry.score}
        className="font-bold font-mono text-xl tabular-nums"
      >
        {entry.score}점
      </span>
      {best && (
        <span
          data-cube-challenge-best
          className="cube-gold rounded-full border px-2 py-0.5 font-semibold text-xs"
        >
          최고 점수
        </span>
      )}
      <span className="text-sm" data-cube-stages={entry.stages}>
        단계 {entry.stages}
        {ok && ` · 남은 ${hpText(entry.kind, entry.left)}`}
      </span>
      {ok && (
        <span className="font-mono text-sm tabular-nums">
          {formatMs(entry.ms)}
        </span>
      )}
      <span className="text-sm text-white/70">
        {entry.kind === "moves"
          ? `${entry.moves}/${entry.budget}수`
          : `${entry.moves}수`}
      </span>
      <SplitList splits={splits} gold={gold} />
    </div>
  );
}

/** 기록 칸: 지금 고른 크기·체력·어려움의 규칙, 최고 점수, 최근 도전 */
export function ChallengePanel({
  pick,
  entries,
}: {
  pick: ChallengePick;
  entries: readonly ChallengeEntry[];
}) {
  const mine = entriesFor(entries, pick);
  const best = bestScore(entries, pick);
  const okCount = mine.filter((e) => e.ok).length;
  return (
    <aside
      className="flex flex-col gap-2 text-sm"
      data-cube-challenge-panel
      data-cube-records
    >
      <h2 className="font-semibold">
        {pick.n}×{pick.n} {KIND_LABEL[pick.kind]} 체력 ·{" "}
        {LEVEL_LABEL[pick.level]}
      </h2>
      <p className="text-white/60 text-xs" data-cube-rule>
        {ruleText(pick.n, pick.kind, pick.level)}
      </p>
      <dl className="grid grid-cols-2 gap-1 text-center">
        <div className="rounded-lg bg-white/5 py-1">
          <dt className="text-white/50 text-xs">최고 점수</dt>
          <dd
            className="font-mono tabular-nums"
            data-cube-best-score={best ?? ""}
          >
            {best ?? "-"}
          </dd>
        </div>
        <div className="rounded-lg bg-white/5 py-1">
          <dt className="text-white/50 text-xs">성공</dt>
          <dd className="font-mono tabular-nums">
            {okCount}/{mine.length}
          </dd>
        </div>
      </dl>
      {mine.length === 0 ? (
        <p className="text-white/50 text-xs">아직 도전 기록이 없어요.</p>
      ) : (
        <ol className="flex max-h-80 flex-col gap-0.5 overflow-y-auto pr-1">
          {mine.slice(0, 30).map((e, i) => (
            <li
              key={`${e.at}-${e.scramble}`}
              data-cube-challenge-entry={e.ok ? "ok" : (e.reason ?? "")}
              className="flex items-center gap-2 rounded px-1 py-0.5"
            >
              <span className="w-6 text-right text-white/40 text-xs">
                {mine.length - i}
              </span>
              <span className="w-14 font-mono tabular-nums">{e.score}점</span>
              <span
                className={`text-xs ${e.ok ? "text-emerald-300" : "text-rose-300/80"}`}
              >
                {e.ok ? formatMs(e.ms) : REASON_SHORT[e.reason ?? "time"]}
              </span>
              <span className="ml-auto text-white/45 text-xs">
                단계 {e.stages}
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
