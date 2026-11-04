"use client";

import { applyMove, type CubeMove, invertMove } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { setOf } from "../algs/check";
import {
  type HabitLog,
  habitAverage,
  loadHabit,
  pickHabitCase,
  readyForKnown,
  recordHabitFail,
  recordHabitSolve,
} from "../algs/habit";
import { algLink } from "../algs/link";
import { sameAlg } from "../algs/same-alg";
import {
  type AlgBook,
  algsOf,
  commitAlgBook,
  habitList,
  habitOf,
  loadAlgBook,
  setHabit,
  setUsed,
  usedAlg,
  watchAlgBook,
} from "../algs/store";
import type { Command } from "../input";
import {
  ALG_SETS,
  type AlgCase,
  type AlgSetInfo,
  algTokens,
  FINGER_NOTATION,
  type FingerToken,
  GOALS,
} from "../learn";
import {
  countsAsMove,
  goalMet,
  makeTrainCase,
  type TrainCase,
  type TrainMode,
} from "../learn/judge";
import {
  averageMs,
  loadTrain,
  recordFail,
  recordSolve,
  type TrainBook,
  weakCases,
} from "../learn/progress";
import { formatMs } from "../records";
import { useCubeSettings } from "../settings";
import { CubePlay, playCubeCue } from "./CubePlay";
import { KeyCaps, useMoveKeys } from "./MoveChip";

/**
 * 공식 훈련(`/cube/train`, docs/47 8-1). 묶음 → 상황 고르기 → 무작위로 내고, 결과 모양으로 채점해 시간·수를 남긴다.
 * 시간은 첫 면 돌리기에서 시작해 목표 모양이 되는 순간 멈춘다(큐브 전체 돌리기는 수로 세지 않는다).
 */

type Pick = "all" | "picked" | "weak" | "mine";
type Phase = "ready" | "solving" | "done" | "gaveUp";

interface Current {
  c: AlgCase;
  t: TrainCase;
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const PICK_LABEL: Record<Pick, string> = {
  all: "전부",
  picked: "고른 것",
  weak: "약한 것",
  mine: "내 목록",
};

/** 앞뒤 윗면 돌리기를 봐주는 묶음(훈련 상황에 무작위 윗면 돌리기를 붙이는 묶음) */
const AUF_SETS = new Set([
  "oll",
  "pll",
  "f2l",
  "2look-oll",
  "2look-pll",
  "ortega-oll",
]);

/** 이번 판이 내 공식으로 풀렸나(버릇 상태가 있는 상황만 본다) */
type SameResult = "mine" | "other" | null;

export function TrainApp() {
  const settings = useCubeSettings();
  const [setId, setSetId] = useState<AlgSetInfo["set"]>("pll");
  const set =
    ALG_SETS.find((s) => s.set === setId) ?? (ALG_SETS[0] as AlgSetInfo);
  const [pick, setPick] = useState<Pick>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<TrainMode>("mask");
  const [book, setBook] = useState<TrainBook>({});
  const [cur, setCur] = useState<Current | null>(null);
  const [state, setState] = useState<PuzzleState | null>(null);
  const [history, setHistory] = useState<CubeMove[]>([]);
  const [phase, setPhase] = useState<Phase>("ready");
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<{ ms: number; moves: number } | null>(
    null,
  );
  const [showAlgs, setShowAlgs] = useState(false);
  const [same, setSame] = useState<SameResult>(null);
  const [habitLog, setHabitLog] = useState<HabitLog>({});
  const [syncToken, setSyncToken] = useState(0);
  const [, tick] = useState(0);

  const [algBook, setAlgBook] = useState<AlgBook>({});
  useEffect(() => {
    setBook(loadTrain());
    setAlgBook(loadAlgBook());
    setHabitLog(loadHabit());
    // 일람표의 「내 목록 훈련」 링크
    if (new URLSearchParams(window.location.search).get("pick") === "mine")
      setPick("mine");
    // 공식 모음을 다른 탭에서 고치면 다시 읽는다
    return watchAlgBook(setAlgBook);
  }, []);

  const pool = useMemo(() => {
    const ids = set.cases.map((c) => c.id);
    if (pick === "picked") {
      const chosen = ids.filter((id) => picked.has(id));
      return chosen.length > 0 ? chosen : ids;
    }
    if (pick === "weak") return weakCases(ids, book);
    return ids;
  }, [set, pick, picked, book]);

  const live = useRef({
    cur,
    state,
    history,
    phase,
    startedAt,
    settings,
    algBook,
  });
  live.current = {
    cur,
    state,
    history,
    phase,
    startedAt,
    settings,
    algBook,
  };

  const [empty, setEmpty] = useState(false);
  const nextCase = useCallback(() => {
    const prev = live.current.cur?.c.id;
    let c: AlgCase;
    if (pick === "mine") {
      // 내 목록: 묶음과 상관없이, 덜 익은 것을 더 자주(저장소를 바로 읽는다: 처음 열 때도 맞게)
      const list = habitList(loadAlgBook());
      const id = pickHabitCase(
        list.map((x) => ({ id: x.c.id, state: x.state })),
        loadHabit(),
        Date.now(),
        Math.random(),
        prev,
      );
      const hit = list.find((x) => x.c.id === id);
      setEmpty(!hit);
      if (!hit) {
        live.current.cur = null;
        setCur(null);
        setState(null);
        return;
      }
      c = hit.c;
    } else {
      setEmpty(false);
      const choices = pool.length > 1 ? pool.filter((id) => id !== prev) : pool;
      const id = choices[Math.floor(Math.random() * choices.length)];
      c = set.cases.find((x) => x.id === id) ?? (set.cases[0] as AlgCase);
    }
    const t = makeTrainCase(setOf(c), c, mode, randomSeed());
    live.current.state = t.state;
    live.current.phase = "ready";
    setCur({ c, t });
    setState(t.state);
    live.current.history = [];
    setHistory([]);
    setPhase("ready");
    setResult(null);
    setSame(null);
    setSyncToken((v) => v + 1);
  }, [pool, set, mode, pick]);

  // 묶음·고르기·가리기가 바뀌면 새 상황
  // biome-ignore lint/correctness/useExhaustiveDependencies: 고른 값이 바뀔 때만
  useEffect(() => nextCase(), [setId, mode, pick]);

  useEffect(() => {
    if (phase !== "solving") return;
    const id = window.setInterval(() => tick((t) => t + 1), 47);
    return () => window.clearInterval(id);
  }, [phase]);

  const onMove = useCallback((move: CubeMove) => {
    const c = live.current;
    if (!c.cur || !c.state) return false;
    const n = c.cur.t.n;
    const next = applyMove(n, c.state, move);
    c.state = next;
    setState(next);
    c.history = [...c.history, move];
    setHistory(c.history);
    if (c.phase === "ready" && countsAsMove(n, move)) {
      c.phase = "solving";
      c.startedAt = performance.now();
      setStartedAt(c.startedAt);
      setPhase("solving");
    }
    if (c.phase === "solving" && goalMet(n, next, c.cur.t.goal)) {
      const ms = Math.round(performance.now() - c.startedAt);
      const moves = c.history.filter((m) => countsAsMove(n, m)).length;
      c.phase = "done";
      setPhase("done");
      setResult({ ms, moves });
      setBook(recordSolve(c.cur.c.id, ms, moves));
      const caseNow = c.cur.c;
      if (habitOf(c.algBook, caseNow)) {
        const mine = sameAlg(n, c.history, usedAlg(c.algBook, caseNow), {
          auf: AUF_SETS.has(caseNow.set),
        });
        setSame(mine ? "mine" : "other");
        setHabitLog(
          recordHabitSolve(caseNow.id, { ms, mine, now: Date.now() }),
        );
      }
      playCubeCue(c.settings, "cubeSolved");
    }
    return true;
  }, []);

  const giveUp = useCallback(() => {
    const c = live.current;
    if (!c.cur || c.phase === "done" || c.phase === "gaveUp") return;
    c.phase = "gaveUp";
    setPhase("gaveUp");
    setShowAlgs(true);
    setBook(recordFail(c.cur.c.id));
    if (habitOf(c.algBook, c.cur.c))
      setHabitLog(recordHabitFail(c.cur.c.id, Date.now()));
  }, []);

  const onCommand = useCallback(
    (cmd: Command): CubeMove | null => {
      const c = live.current;
      if (cmd === "undo") {
        const lastMove = c.history.at(-1);
        if (!lastMove || !c.cur || !c.state) return null;
        const back = invertMove(lastMove);
        c.state = applyMove(c.cur.t.n, c.state, back);
        setState(c.state);
        c.history = c.history.slice(0, -1);
        setHistory(c.history);
        return back;
      }
      if (cmd === "scramble") nextCase();
      else if (cmd === "reset" && c.cur) {
        // 같은 상황을 처음부터(시간도 다시)
        c.state = c.cur.t.state;
        c.phase = "ready";
        setState(c.state);
        live.current.history = [];
        setHistory([]);
        setPhase("ready");
        setResult(null);
        setSame(null);
        setSyncToken((v) => v + 1);
      }
      return null;
    },
    [nextCase],
  );

  const elapsed =
    phase === "solving" ? performance.now() - startedAt : (result?.ms ?? null);
  const stats = cur ? book[cur.c.id] : undefined;

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4"
        data-train-set={set.set}
        data-train-case={cur?.c.id}
        data-train-answer={
          cur ? `${cur.t.preAuf} ${usedAlg(algBook, cur.c)}`.trim() : undefined
        }
        data-train-phase={phase}
        data-train-pick={pick}
        data-train-same={same ?? undefined}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">공식 훈련</h1>
          <a
            href="/cube/algs"
            className="ml-auto text-sm text-white/70 hover:text-white"
          >
            내 공식
          </a>
          <a
            href="/cube/learn"
            className="text-sm text-white/70 hover:text-white"
          >
            배우기
          </a>
        </header>

        {/* 묶음 고르기 */}
        <fieldset
          className="flex min-w-0 flex-wrap gap-1.5"
          aria-label="공식 묶음"
        >
          {ALG_SETS.map((s) => (
            <button
              key={s.set}
              type="button"
              aria-pressed={s.set === setId}
              data-train-set-button={s.set}
              onClick={(e) => {
                setSetId(s.set);
                setPicked(new Set());
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-full px-3 py-1 text-sm",
                s.set === setId
                  ? "bg-sky-500 font-semibold text-black"
                  : "bg-white/10 hover:bg-white/15",
              )}
            >
              {s.title}
            </button>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Toggle
            label="상황"
            value={pick}
            options={(["all", "picked", "weak", "mine"] as const).map((p) => [
              p,
              PICK_LABEL[p],
            ])}
            onChange={setPick}
          />
          <Toggle
            label="보기"
            value={mode}
            options={[
              ["mask", "가리기"],
              ["normal", "보통"],
            ]}
            onChange={setMode}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_300px]">
          <section className="flex flex-col items-center gap-2">
            {empty && (
              <p
                className="rounded-xl bg-white/5 p-4 text-sm text-white/70"
                data-train-empty
              >
                내 목록이 비었어요.{" "}
                <a
                  href="/cube/algs"
                  className="text-sky-300 hover:text-sky-200"
                >
                  내 공식 일람표
                </a>
              </p>
            )}
            {cur && (
              <>
                <div className="flex w-full flex-wrap items-baseline justify-center gap-x-5 gap-y-1">
                  <span className="font-mono font-semibold text-4xl tabular-nums">
                    {phase === "gaveUp" ? "-" : formatMs(elapsed ?? 0)}
                  </span>
                  <span className="text-sm text-white/70">
                    수{" "}
                    <b>
                      {history.filter((m) => countsAsMove(cur.t.n, m)).length}
                    </b>
                  </span>
                </div>
                <p className="text-sm text-white/70">
                  <b className="text-white">{cur.c.name}</b> · 목표:{" "}
                  {GOALS[cur.t.goal]}
                </p>
                <div className="flex min-h-9 flex-wrap items-center justify-center gap-2 text-sm">
                  {phase === "done" && result && (
                    <span
                      role="status"
                      data-train-result
                      className="rounded-full border border-emerald-400/50 bg-emerald-400/15 px-4 py-1 font-bold text-emerald-300"
                    >
                      맞춤! {formatMs(result.ms)} · {result.moves}수
                    </span>
                  )}
                  {phase === "done" && same && (
                    <span
                      data-train-same-message
                      className={cn(
                        "rounded-full px-3 py-1 text-xs",
                        same === "mine"
                          ? "bg-sky-500/20 text-sky-200"
                          : "bg-amber-500/20 text-amber-200",
                      )}
                    >
                      {same === "mine"
                        ? `내 공식으로 · 연속 ${habitLog[cur.c.id]?.streak ?? 0}`
                        : "다른 공식으로 풀었어요"}
                    </span>
                  )}
                  {phase === "done" &&
                    habitOf(algBook, cur.c) === "learning" &&
                    readyForKnown(habitLog[cur.c.id], cur.c.set) && (
                      <button
                        type="button"
                        data-train-promote
                        onClick={(e) => {
                          setAlgBook(
                            commitAlgBook(
                              algBook,
                              setHabit(algBook, cur.c, "known"),
                            ),
                          );
                          e.currentTarget.blur();
                        }}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-black"
                      >
                        익숙함으로 옮기기
                      </button>
                    )}
                  {phase === "gaveUp" && (
                    <span className="rounded-full bg-red-500/20 px-4 py-1 text-red-200">
                      포기
                    </span>
                  )}
                  <button
                    type="button"
                    data-train-next
                    onClick={(e) => {
                      nextCase();
                      e.currentTarget.blur();
                    }}
                    className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black"
                  >
                    다음 상황(Enter)
                  </button>
                  {(phase === "ready" || phase === "solving") && (
                    <button
                      type="button"
                      onClick={(e) => {
                        giveUp();
                        e.currentTarget.blur();
                      }}
                      className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
                    >
                      포기
                    </button>
                  )}
                  <button
                    type="button"
                    aria-expanded={showAlgs}
                    onClick={(e) => {
                      setShowAlgs((v) => !v);
                      e.currentTarget.blur();
                    }}
                    className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
                  >
                    {showAlgs ? "공식 숨기기" : "공식 보기"}
                  </button>
                </div>
                {showAlgs && (
                  <AlgView
                    c={cur.c}
                    t={cur.t}
                    book={algBook}
                    onUse={(alg) => {
                      // 바꾼 상황만 저장해 다른 탭의 변경을 덮지 않는다
                      setAlgBook(
                        commitAlgBook(algBook, setUsed(algBook, cur.c, alg)),
                      );
                    }}
                  />
                )}
                {state && (
                  <CubePlay
                    n={cur.t.n}
                    state={state}
                    mask={cur.t.mask}
                    syncToken={syncToken}
                    settings={settings}
                    onMove={onMove}
                    onCommand={onCommand}
                  />
                )}
              </>
            )}
          </section>

          <aside className="flex flex-col gap-2 text-sm">
            {stats && (
              <dl className="grid grid-cols-3 gap-1 text-center">
                <Stat label="최고" value={formatMs(stats.best ?? undefined)} />
                <Stat
                  label="평균"
                  value={formatMs(averageMs(stats) ?? undefined)}
                />
                <Stat label="실패" value={String(stats.fails)} />
              </dl>
            )}
            {pick === "mine" ? (
              <MineList book={algBook} log={habitLog} current={cur?.c.id} />
            ) : (
              <>
                <h2 className="font-semibold">{set.title} 상황</h2>
                <ul
                  data-train-stats
                  className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto pr-1"
                >
                  {set.cases.map((c) => {
                    const s = book[c.id];
                    const on = picked.has(c.id);
                    return (
                      <li
                        key={c.id}
                        data-case={c.id}
                        data-solves={s?.solves ?? 0}
                        className={cn(
                          "flex items-center gap-2 rounded px-1 py-0.5",
                          cur?.c.id === c.id && "bg-sky-500/15",
                          pool.includes(c.id) ? "" : "opacity-50",
                        )}
                      >
                        {pick === "picked" && (
                          <input
                            type="checkbox"
                            data-case-pick={c.id}
                            checked={on}
                            aria-label={c.name}
                            onChange={() =>
                              setPicked((p) => {
                                const nextSet = new Set(p);
                                if (on) nextSet.delete(c.id);
                                else nextSet.add(c.id);
                                return nextSet;
                              })
                            }
                          />
                        )}
                        <span
                          className="flex-1 truncate text-xs"
                          title={c.name}
                        >
                          {c.name}
                        </span>
                        <span className="w-12 text-right font-mono text-xs tabular-nums">
                          {formatMs(s?.best ?? undefined)}
                        </span>
                        <span className="w-12 text-right font-mono text-white/60 text-xs tabular-nums">
                          {formatMs(averageMs(s) ?? undefined)}
                        </span>
                        <span className="w-6 text-right text-red-300/80 text-xs">
                          {s?.fails ? `✗${s.fails}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-white/40 text-xs">최고 · 최근 평균 · 실패</p>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/** 대표·대안·내 공식과 손가락 표기(대표만). 쓰는 공식을 여기서도 고른다 */
function AlgView({
  c,
  t,
  book,
  onUse,
}: {
  c: AlgCase;
  t: TrainCase;
  book: AlgBook;
  onUse: (alg: string) => void;
}) {
  const fingers = c.fingers?.split(/\s+/) ?? [];
  const used = usedAlg(book, c);
  const list = algsOf(book, c);
  // 쓰는 공식에만 그 사람의 키를 붙인다(줄마다 붙이면 복잡해진다)
  const { keysOf } = useMoveKeys(t.n);
  return (
    <div className="flex w-full max-w-xl flex-col gap-2 rounded-xl bg-white/5 p-3 text-sm">
      {t.preAuf && (
        <p className="text-white/70 text-xs">
          이 상황은 먼저 윗면을 <b className="font-mono">{t.preAuf}</b> 돌린 뒤
          공식.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {list.map(({ alg, kind }, i) => (
          <li key={alg} className="flex flex-col gap-1" data-train-alg={kind}>
            <span className="flex items-center gap-2 text-white/50 text-xs">
              {kind === "main"
                ? "대표 공식"
                : kind === "alt"
                  ? `대안 ${i}`
                  : "내 공식"}
              <button
                type="button"
                aria-pressed={alg === used}
                onClick={(e) => {
                  onUse(alg);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded px-1.5 py-0.5",
                  alg === used
                    ? "bg-sky-500 font-semibold text-black"
                    : "bg-white/10 text-white/80 hover:bg-white/15",
                )}
              >
                {alg === used ? "쓰는 중" : "쓰기"}
              </button>
            </span>
            <span className="flex flex-wrap gap-1 font-mono">
              {algTokens(alg).map((tok, k) => {
                const f = kind === "main" ? fingers[k] : undefined;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                    key={k}
                    title={f ? FINGER_NOTATION[f as FingerToken] : undefined}
                    className="flex min-w-8 flex-col items-center rounded bg-white/10 px-1"
                  >
                    <span data-move-chip={tok}>{tok}</span>
                    {alg === used && keysOf && (
                      <KeyCaps keys={keysOf(tok)} className="text-white/80" />
                    )}
                    {f && (
                      <span className="font-sans text-[10px] text-amber-200/80">
                        {f}
                      </span>
                    )}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ol>
      {c.note && <p className="break-keep text-white/60 text-xs">{c.note}</p>}
      <a
        href={algLink(c.id)}
        data-train-algs-link
        className="self-start text-sky-300 text-xs hover:text-sky-200"
      >
        내 공식 일람표
      </a>
    </div>
  );
}

/** 내 목록(버릇 들이는 중·익숙함)과 상황별 연속·평균 */
function MineList({
  book,
  log,
  current,
}: {
  book: AlgBook;
  log: HabitLog;
  current: string | undefined;
}) {
  const list = habitList(book);
  return (
    <>
      <h2 className="font-semibold">내 목록 {list.length}</h2>
      <ul
        data-train-mine-list
        className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto pr-1"
      >
        {list.map(({ c, state }) => {
          const s = log[c.id];
          return (
            <li
              key={c.id}
              data-mine-case={c.id}
              className={cn(
                "flex items-center gap-2 rounded px-1 py-0.5",
                current === c.id && "bg-sky-500/15",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  state === "known" ? "bg-emerald-400" : "bg-amber-400",
                )}
              />
              <span className="flex-1 truncate text-xs" title={c.name}>
                {c.name}
              </span>
              <span className="w-8 text-right font-mono text-xs tabular-nums">
                {s?.streak ?? 0}
              </span>
              <span className="w-12 text-right font-mono text-white/60 text-xs tabular-nums">
                {formatMs(habitAverage(s) ?? undefined)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-white/40 text-xs">연속(내 공식) · 평균</p>
    </>
  );
}

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-white/60">{label}</span>
      <fieldset
        aria-label={label}
        className="flex rounded-lg bg-white/10 p-0.5"
      >
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            data-toggle={`${label}:${v}`}
            onClick={(e) => {
              onChange(v);
              e.currentTarget.blur();
            }}
            className={cn(
              "rounded-md px-3 py-1",
              value === v && "bg-white/20 font-semibold",
            )}
          >
            {text}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-1">
      <dt className="text-white/50 text-xs">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
