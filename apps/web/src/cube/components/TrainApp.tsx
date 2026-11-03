"use client";

import { applyMove, type CubeMove, invertMove } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
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

/**
 * 공식 훈련(`/cube/train`, docs/47 8-1). 묶음 → 상황 고르기 → 무작위로 내고, 결과 모양으로 채점해 시간·수를 남긴다.
 * 시간은 첫 면 돌리기에서 시작해 목표 모양이 되는 순간 멈춘다(큐브 전체 돌리기는 수로 세지 않는다).
 */

type Pick = "all" | "picked" | "weak";
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
};

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
  const [syncToken, setSyncToken] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => setBook(loadTrain()), []);

  const pool = useMemo(() => {
    const ids = set.cases.map((c) => c.id);
    if (pick === "picked") {
      const chosen = ids.filter((id) => picked.has(id));
      return chosen.length > 0 ? chosen : ids;
    }
    if (pick === "weak") return weakCases(ids, book);
    return ids;
  }, [set, pick, picked, book]);

  const live = useRef({ cur, state, history, phase, startedAt, settings });
  live.current = { cur, state, history, phase, startedAt, settings };

  const nextCase = useCallback(() => {
    const prev = live.current.cur?.c.id;
    const choices = pool.length > 1 ? pool.filter((id) => id !== prev) : pool;
    const id = choices[Math.floor(Math.random() * choices.length)];
    const c = set.cases.find((x) => x.id === id) ?? (set.cases[0] as AlgCase);
    const t = makeTrainCase(set, c, mode, randomSeed());
    live.current.state = t.state;
    live.current.phase = "ready";
    setCur({ c, t });
    setState(t.state);
    live.current.history = [];
    setHistory([]);
    setPhase("ready");
    setResult(null);
    setSyncToken((v) => v + 1);
  }, [pool, set, mode]);

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
    <div className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4"
        data-train-set={set.set}
        data-train-case={cur?.c.id}
        data-train-answer={cur?.t.answer}
        data-train-phase={phase}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">공식 훈련</h1>
          <a
            href="/cube/learn"
            className="ml-auto text-sm text-white/70 hover:text-white"
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
            options={(["all", "picked", "weak"] as const).map((p) => [
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
                  {phase === "gaveUp" && (
                    <span className="rounded-full bg-red-500/20 px-4 py-1 text-red-200">
                      포기(실패로 남김)
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
                {showAlgs && <AlgView c={cur.c} t={cur.t} />}
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
            <h2 className="font-semibold">
              {set.title} 상황{" "}
              <span className="text-white/50 text-xs">
                {pick === "picked" ? "(눌러서 고르기)" : "(이 기기 기록)"}
              </span>
            </h2>
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
                    <span className="flex-1 truncate text-xs" title={c.name}>
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
            <p className="text-white/40 text-xs">
              최고 · 최근 평균 · 실패. 결과 모양으로 채점하므로 다른 공식으로
              풀어도 됩니다.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

/** 대표·대안 공식과 손가락 표기 */
function AlgView({ c, t }: { c: AlgCase; t: TrainCase }) {
  const fingers = c.fingers?.split(/\s+/) ?? [];
  return (
    <div className="flex w-full max-w-xl flex-col gap-2 rounded-xl bg-white/5 p-3 text-sm">
      {t.preAuf && (
        <p className="text-white/70 text-xs">
          이 상황은 먼저 윗면을 <b className="font-mono">{t.preAuf}</b> 돌린 뒤
          공식.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {c.algs.map((alg, i) => (
          <li key={alg} className="flex flex-col gap-1">
            <span className="text-white/50 text-xs">
              {i === 0 ? "대표 공식" : `대안 ${i}`}
            </span>
            <span className="flex flex-wrap gap-1 font-mono">
              {algTokens(alg).map((tok, k) => {
                const f = i === 0 ? fingers[k] : undefined;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                    key={k}
                    title={f ? FINGER_NOTATION[f as FingerToken] : undefined}
                    className="flex min-w-8 flex-col items-center rounded bg-white/10 px-1"
                  >
                    {tok}
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
    </div>
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
