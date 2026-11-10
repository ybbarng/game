"use client";

import { type Clock, realClock } from "@game/fair-play";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cn } from "@/lib/cn";
import { actionLabel, type Command } from "../input/actions";
import type { KeyChord, Keymap } from "../input/keymaps";
import {
  avgMs,
  countMoves,
  DRILL_LEVELS,
  type DrillLevel,
  type DrillRecord,
  DrillRound,
  describeInput,
  drillPool,
  FormulaRun,
  hitRate,
  keyTextFor,
  levelSize,
  loadDrill,
  makeQuiz,
  pressesFor,
  type QuizQuestion,
  ROUND_LIMITS,
  recordAnswer,
  rightKeyTag,
  saveDrill,
  summarize,
  weakKeys,
} from "../keys";
import { FINGER_DRILLS } from "../learn/fingers";
import { algTokens } from "../learn/notation";
import type { FingerDrill } from "../learn/types";
import { type CubeSettings, useCubeSettings } from "../settings";
import { LapChart } from "./FingersApp";
import { KeyboardMap } from "./KeyboardMap";
import { chip, useKeymap } from "./KeysApp";
import {
  LiveCube,
  type PracticeCube,
  type PracticeKey,
  usePracticeCube,
  usePracticeKeys,
} from "./PracticeCube";

/**
 * 조작 훈련(사이트 쓰는 법의 「연습」 `/cube/intro?part=practice`, 옛 `/cube/keys/drill`, docs/47 4절·16-8). 수 보고 치기·키 보고 맞히기·공식 따라 치기. 키(동작)별 맞힘률과
 * 반응 시간을 이 기기에 남기고, 약한 키를 다음 판에 더 자주 낸다. 시간은 `Clock`으로 잰다.
 */

type Mode = "see" | "quiz" | "formula";
const MODES: { id: Mode; title: string }[] = [
  { id: "see", title: "수 보고 치기" },
  { id: "quiz", title: "키 보고 맞히기" },
  { id: "formula", title: "공식 따라 치기" },
];

/** 키 보고 맞히기: 정답을 고른 뒤 다음 문제까지(맞은 보기·키를 알아볼 만큼) */
export const QUIZ_NEXT_MS = 900;

/** 주소의 `?mode=`(옛 조작 훈련 주소에서 넘어온 것 포함) */
export function readDrillMode(search: string): Mode {
  const m = new URLSearchParams(search).get("mode");
  return m === "quiz" || m === "formula" ? m : "see";
}

export function KeyDrillApp({
  clock = realClock,
  initialMode = "see",
  onFinish,
}: {
  clock?: Clock;
  initialMode?: Mode;
  onFinish: () => void;
}) {
  const keymap = useKeymap();
  const settings = useCubeSettings();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [record, setRecord] = useState<DrillRecord | null>(null);
  useEffect(() => setRecord(loadDrill()), []);
  const save = useCallback((r: DrillRecord) => {
    setRecord(r);
    saveDrill(r);
  }, []);

  const ready = keymap && record;
  return (
    <div
      className="flex flex-col gap-4"
      data-keys-page="drill"
      data-keys-ready={ready ? "" : undefined}
      data-drill-mode={mode}
    >
      <div className="flex flex-wrap items-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            data-drill-tab={m.id}
            aria-pressed={m.id === mode}
            onClick={(e) => {
              setMode(m.id);
              e.currentTarget.blur();
            }}
            className={chip(m.id === mode)}
          >
            {m.title}
          </button>
        ))}
        <button
          type="button"
          data-drill-finish
          onClick={onFinish}
          className="ml-auto rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black text-sm"
        >
          다음
        </button>
      </div>
      {ready && mode === "see" && (
        <SeeDrill
          keymap={keymap}
          settings={settings}
          record={record}
          save={save}
          clock={clock}
        />
      )}
      {ready && mode === "quiz" && (
        <QuizDrill keymap={keymap} record={record} save={save} clock={clock} />
      )}
      {ready && mode === "formula" && (
        <FormulaDrill
          keymap={keymap}
          settings={settings}
          record={record}
          save={save}
          clock={clock}
        />
      )}
    </div>
  );
}

interface DrillProps {
  keymap: Keymap;
  record: DrillRecord;
  save: (r: DrillRecord) => void;
  clock: Clock;
}

function LevelPicker({
  level,
  setLevel,
  bigN,
  setBigN,
  disabled,
}: {
  level: DrillLevel;
  setLevel: (l: DrillLevel) => void;
  bigN: number;
  setBigN: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="text-white/60">단계</span>
      {DRILL_LEVELS.map((l) => (
        <button
          key={l.id}
          type="button"
          data-drill-level={l.id}
          aria-pressed={l.id === level}
          disabled={disabled}
          onClick={(e) => {
            setLevel(l.id);
            e.currentTarget.blur();
          }}
          className={cn(chip(l.id === level), "disabled:opacity-50")}
        >
          {l.title}
        </button>
      ))}
      {level === "inner" && (
        <span className="ml-2 flex items-center gap-1">
          <span className="text-white/60">크기</span>
          {[4, 5, 6, 7].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === bigN}
              disabled={disabled}
              onClick={(e) => {
                setBigN(s);
                e.currentTarget.blur();
              }}
              className={cn(chip(s === bigN), "disabled:opacity-50")}
            >
              {s}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function runCommand(cube: PracticeCube, command: Command): void {
  if (command === "undo") cube.undo();
  else if (command === "reset") cube.reset();
  else if (command === "scramble") cube.scramble();
}

function useFlash(): [string | null, (code: string) => void] {
  const [pressed, setPressed] = useState<string | null>(null);
  const flash = useCallback((code: string) => {
    setPressed(code);
    window.setTimeout(() => setPressed((c) => (c === code ? null : c)), 200);
  }, []);
  return [pressed, flash];
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}초`;
const percent = (x: number) => `${Math.round(x * 100)}%`;

// ---------------------------------------------------------------- 수 보고 치기

function SeeDrill({
  keymap,
  settings,
  record,
  save,
  clock,
}: DrillProps & { settings: CubeSettings }) {
  const [level, setLevel] = useState<DrillLevel>("faces");
  const [bigN, setBigN] = useState(4);
  const [limitId, setLimitId] = useState("time30");
  const [showCube, setShowCube] = useState(true);
  const n = levelSize(level, bigN);
  const pool = useMemo(() => drillPool(keymap, level, n), [keymap, level, n]);
  const cube = usePracticeCube(n, settings);
  const [round, setRound] = useState<DrillRound | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [pressed, flash] = useFlash();

  const snap = useSyncExternalStore(
    useCallback((fn) => round?.subscribe(fn) ?? (() => {}), [round]),
    () => round?.snapshot ?? null,
    () => null,
  );
  const phase = snap?.phase ?? "ready";

  // 남은 시간 표시(판정은 DrillRound의 시계가 한다)
  const [, tick] = useState(0);
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => tick((x) => x + 1), 200);
    return () => window.clearInterval(id);
  }, [phase]);

  // 기록은 문제를 맞힐 때마다 남긴다(판 도중에 떠나도 그때까지의 기록이 남는다)
  const liveRecord = useRef(record);
  liveRecord.current = record;

  const limit =
    ROUND_LIMITS.find((l) => l.id === limitId)?.limit ??
    ({ kind: "time", ms: 30_000 } as const);
  const start = () => {
    if (pool.length === 0) return;
    const r = new DrillRound({
      n,
      pool,
      stats: record.see,
      limit,
      clock,
      rand: Math.random,
    });
    cube.reset();
    setRound(r);
    setMessage(null);
    setWrong(null);
    setShowAnswer(false);
    r.start();
  };

  const onKey = useCallback(
    ({ input, result }: PracticeKey) => {
      flash(input.code);
      if (round?.snapshot.phase !== "running") return;
      if (result?.kind === "command") {
        runCommand(cube, result.command);
        return;
      }
      if (result?.kind === "depth") return;
      if (result?.kind !== "move") {
        setWrong(input.code);
        setMessage(describeInput(keymap, n, input).text);
        return;
      }
      if (showCube) cube.move(result.move);
      const r = round.feed(result.move);
      if (r === "miss") {
        setWrong(input.code);
        setShowAnswer(true);
        setMessage(describeInput(keymap, n, input, result.notation).text);
      } else if (r === "hit") {
        setWrong(null);
        setShowAnswer(false);
        setMessage(null);
        save({ ...liveRecord.current, see: round.statsNow });
      }
    },
    [round, cube, keymap, n, showCube, flash, save],
  );
  usePracticeKeys(n, keymap, true, onKey);

  const prompt = snap?.prompt ?? "";
  const lit: KeyChord[] =
    phase === "running" && showAnswer
      ? (pressesFor(keymap, n, prompt)[0] ?? [])
      : [];
  const summary = snap ? summarize(snap) : null;
  const remaining = round?.remainingMs();
  const weak = weakKeys(record.see, pool);

  return (
    <section
      className="flex flex-col gap-3"
      data-drill="see"
      data-drill-phase={phase}
    >
      <LevelPicker
        level={level}
        setLevel={setLevel}
        bigN={bigN}
        setBigN={setBigN}
        disabled={phase === "running"}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/60">한 판</span>
        {ROUND_LIMITS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={l.id === limitId}
            disabled={phase === "running"}
            onClick={(e) => {
              setLimitId(l.id);
              e.currentTarget.blur();
            }}
            className={cn(chip(l.id === limitId), "disabled:opacity-50")}
          >
            {l.title}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-sky-400"
            checked={showCube}
            onChange={(e) => setShowCube(e.target.checked)}
          />
          큐브 보기
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-4">
          {phase === "running" ? (
            <>
              <div className="flex w-full justify-between text-white/70 text-xs">
                <span data-drill-score>
                  맞힘 {snap?.hits ?? 0} · 틀림 {snap?.misses ?? 0}
                </span>
                <span>
                  {limit.kind === "time"
                    ? `남은 시간 ${Math.ceil((remaining ?? 0) / 1000)}초`
                    : `${snap?.hits ?? 0}/${limit.moves}수`}
                </span>
              </div>
              <span
                data-drill-prompt={prompt}
                className="py-4 font-bold font-mono text-6xl"
              >
                {prompt}
              </span>
              <p
                role="status"
                className="min-h-5 break-keep text-center text-red-300 text-sm"
              >
                {message ?? ""}
                {showAnswer && message
                  ? ` ${rightKeyTag(keyTextFor(keymap, n, prompt) ?? "")}`
                  : ""}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  round?.finish();
                  e.currentTarget.blur();
                }}
                className="rounded-lg bg-white/10 px-3 py-1 text-xs"
              >
                그만
              </button>
            </>
          ) : (
            <>
              {phase === "done" && summary && (
                <dl
                  data-drill-result
                  className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm"
                >
                  <dt className="text-white/60">맞힌 수</dt>
                  <dd data-drill-hits>{summary.hits}</dd>
                  <dt className="text-white/60">틀린 수</dt>
                  <dd>{summary.misses}</dd>
                  <dt className="text-white/60">한 번에 맞힘</dt>
                  <dd>{percent(summary.firstTry)}</dd>
                  <dt className="text-white/60">평균 반응 시간</dt>
                  <dd>{seconds(summary.avgMs)}</dd>
                </dl>
              )}
              {pool.length === 0 ? (
                <p className="text-amber-200 text-sm">
                  이 배치에는 이 단계에서 칠 수 있는 키가 없어요.
                </p>
              ) : (
                <button
                  type="button"
                  data-drill-start
                  onClick={(e) => {
                    start();
                    e.currentTarget.blur();
                  }}
                  className="rounded-xl bg-sky-500 px-5 py-2 font-semibold text-black"
                >
                  {phase === "done" ? "한 판 더" : "시작"}
                </button>
              )}
              <p className="text-white/50 text-xs">
                문제 {pool.length}개 · {pool.join(" ")}
              </p>
            </>
          )}
        </div>
        {showCube && (
          <LiveCube
            cube={cube}
            settings={settings}
            className="mx-auto w-full max-w-[240px]"
          />
        )}
      </div>

      <KeyboardMap
        keymap={keymap}
        n={n}
        lit={lit}
        pressed={pressed}
        wrong={wrong}
      />
      <StatsTable
        title="키별 기록"
        stats={record.see}
        pool={pool}
        weak={weak.map((w) => w.action)}
        keyText={(a) => keyTextFor(keymap, n, a) ?? ""}
      />
    </section>
  );
}

function StatsTable({
  title,
  stats,
  pool,
  weak,
  keyText,
}: {
  title: string;
  stats: DrillRecord["see"];
  pool: readonly string[];
  weak: string[];
  keyText: (a: string) => string;
}) {
  const rows = pool.filter((a) => (stats[a]?.tries ?? 0) > 0);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-drill-stats>
      <h3 className="font-semibold text-sm">{title}</h3>
      {weak.length > 0 && (
        <p className="text-amber-200 text-xs" data-drill-weak>
          약한 키:{" "}
          {weak.map((a) => `${actionLabel(a)}(${keyText(a)})`).join(" · ")}
        </p>
      )}
      <table className="w-full max-w-lg text-xs">
        <thead className="text-left text-white/50">
          <tr>
            <th className="py-1 font-normal">동작</th>
            <th className="py-1 font-normal">키</th>
            <th className="py-1 font-normal">한 번에 맞힘</th>
            <th className="py-1 font-normal">평균 반응</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const s = stats[a];
            if (!s) return null;
            return (
              <tr key={a} data-stat={a} className="border-white/5 border-t">
                <td className="py-0.5 font-mono">{actionLabel(a)}</td>
                <td className="py-0.5 font-mono text-white/70">{keyText(a)}</td>
                <td className="py-0.5">
                  {percent(hitRate(s))} ({s.hits}/{s.tries})
                </td>
                <td className="py-0.5">{seconds(avgMs(s))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------- 키 보고 맞히기

function QuizDrill({ keymap, record, save, clock }: DrillProps) {
  const [level, setLevel] = useState<DrillLevel>("primes");
  const [bigN, setBigN] = useState(4);
  const n = levelSize(level, bigN);
  const pool = useMemo(() => drillPool(keymap, level, n), [keymap, level, n]);
  const [q, setQ] = useState<QuizQuestion | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const askedAt = useRef(0);
  const live = useRef(record);
  live.current = record;

  const next = useCallback(
    (avoid?: string) => {
      setQ(makeQuiz(keymap, pool, live.current.quiz, Math.random, avoid));
      setPicked([]);
      askedAt.current = clock.now();
    },
    [keymap, pool, clock],
  );
  // 정답 뒤 다음 문제로 넘어가기를 기다리는 중이면 끄는 함수
  const cancelNext = useRef<(() => void) | null>(null);
  useEffect(() => {
    next();
    return () => {
      cancelNext.current?.();
      cancelNext.current = null;
    };
  }, [next]);

  const choose = (a: string) => {
    if (!q || picked.includes(a) || picked.includes(q.answer)) return;
    setPicked((p) => [...p, a]);
    if (a !== q.answer) {
      setTally((t) => ({ ...t, wrong: t.wrong + 1 }));
      return;
    }
    const ok = picked.length === 0;
    setTally((t) => ({ ...t, right: t.right + 1 }));
    save({
      ...record,
      quiz: recordAnswer(
        record.quiz,
        q.answer,
        ok,
        clock.now() - askedAt.current,
      ),
    });
    cancelNext.current?.();
    cancelNext.current = clock.after(QUIZ_NEXT_MS, () => {
      cancelNext.current = null;
      next(q.answer);
    });
  };

  const weak = weakKeys(record.quiz, pool);
  return (
    <section className="flex flex-col gap-3" data-drill="quiz">
      <LevelPicker
        level={level}
        setLevel={setLevel}
        bigN={bigN}
        setBigN={setBigN}
        disabled={false}
      />
      {q ? (
        <>
          <KeyboardMap keymap={keymap} n={n} lit={[q.chord]} hideActions />
          <div
            className="flex flex-wrap items-center gap-2"
            data-quiz-answer={q.answer}
          >
            {q.choices.map((c) => (
              <button
                key={c}
                type="button"
                data-quiz-choice={c}
                onClick={(e) => {
                  choose(c);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "min-w-16 rounded-xl px-4 py-2 font-mono font-semibold text-lg",
                  picked.includes(c)
                    ? c === q.answer
                      ? "bg-emerald-500/40"
                      : "bg-red-500/40"
                    : "bg-white/10 hover:bg-white/15",
                )}
              >
                {actionLabel(c)}
              </button>
            ))}
            <span className="ml-auto text-sm text-white/70" data-quiz-tally>
              맞힘 {tally.right} · 틀림 {tally.wrong}
            </span>
          </div>
        </>
      ) : (
        <p className="text-amber-200 text-sm">
          이 단계에서 키 하나로 치는 동작이 넷보다 적어 퀴즈를 낼 수 없어요.
        </p>
      )}
      <StatsTable
        title="키별 기록"
        stats={record.quiz}
        pool={pool}
        weak={weak.map((w) => w.action)}
        keyText={(a) => keyTextFor(keymap, n, a) ?? ""}
      />
    </section>
  );
}

// ---------------------------------------------------------------- 공식 따라 치기

const FORMULAS = FINGER_DRILLS;

function FormulaDrill({
  keymap,
  settings,
  record,
  save,
  clock,
}: DrillProps & { settings: CubeSettings }) {
  const [id, setId] = useState(
    FORMULAS.find((f) => f.id === "sexy")?.id ?? FORMULAS[0]?.id ?? "",
  );
  const drill =
    FORMULAS.find((f) => f.id === id) ?? (FORMULAS[0] as FingerDrill);
  const tokens = useMemo(() => algTokens(drill.alg), [drill.alg]);
  const moves = countMoves(tokens);
  const [reps, setReps] = useState(5);
  const cube = usePracticeCube(3, settings);
  const runRef = useRef(new FormulaRun(3, tokens));
  const [laps, setLaps] = useState<number[]>([]);
  const [, bump] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [pressed, flash] = useFlash();
  const lapStart = useRef<number | null>(null);
  const done = laps.length >= reps;

  const restart = useCallback(() => {
    runRef.current = new FormulaRun(3, tokens);
    lapStart.current = null;
    setLaps([]);
    setMessage(null);
    setWrong(null);
    cube.reset();
    bump((x) => x + 1);
  }, [tokens, cube]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 공식·반복이 바뀌면 처음부터
  useEffect(() => restart(), [id, reps]);

  const live = useRef({ laps, reps, record });
  live.current = { laps, reps, record };

  const onKey = useCallback(
    ({ input, result }: PracticeKey) => {
      flash(input.code);
      const c = live.current;
      if (c.laps.length >= c.reps) return;
      if (result?.kind === "command") {
        runCommand(cube, result.command);
        return;
      }
      if (result?.kind !== "move") {
        if (result === null) {
          setWrong(input.code);
          setMessage(describeInput(keymap, 3, input).text);
        }
        return;
      }
      cube.move(result.move);
      const run = runRef.current;
      const r = run.feed(result.move);
      if (r === "miss") {
        setWrong(input.code);
        setMessage(describeInput(keymap, 3, input, result.notation).text);
        bump((x) => x + 1);
        return;
      }
      setWrong(null);
      setMessage(null);
      if (lapStart.current === null) lapStart.current = clock.now();
      if (r === "done") {
        const now = clock.now();
        const lap = now - (lapStart.current ?? now);
        lapStart.current = now;
        const next = [...c.laps, lap];
        setLaps(next);
        run.restart();
        if (next.length >= c.reps) {
          const best = Math.max(...next.map((ms) => moves / (ms / 1000)));
          const prev = c.record.formulas[drill.id] ?? 0;
          if (Number.isFinite(best) && best > prev)
            save({
              ...c.record,
              formulas: { ...c.record.formulas, [drill.id]: best },
            });
        }
      }
      bump((x) => x + 1);
    },
    [cube, keymap, clock, moves, drill.id, save, flash],
  );
  usePracticeKeys(3, keymap, true, onKey);

  const run = runRef.current;
  const current = tokens[run.index];
  const lit = !done && current ? (pressesFor(keymap, 3, current)[0] ?? []) : [];
  const tpsOf = (ms: number) => moves / Math.max(0.001, ms / 1000);
  const avg =
    laps.length > 0 ? laps.reduce((a, b) => a + b, 0) / laps.length : 0;
  const best = record.formulas[drill.id];

  return (
    <section className="flex flex-col gap-3" data-drill="formula">
      <div className="flex flex-wrap gap-1">
        {FORMULAS.map((f) => (
          <button
            key={f.id}
            type="button"
            data-formula={f.id}
            aria-pressed={f.id === id}
            onClick={(e) => {
              setId(f.id);
              e.currentTarget.blur();
            }}
            className={chip(f.id === id)}
          >
            {f.title}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4">
          <ol className="flex flex-wrap gap-1.5" data-formula-tokens>
            {tokens.map((t, i) => {
              const state =
                done || i < run.index
                  ? "done"
                  : i === run.index
                    ? "now"
                    : "next";
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                  key={i}
                  data-target-state={state}
                  className={cn(
                    "flex min-w-12 flex-col items-center rounded-lg px-2 py-1",
                    state === "done" && "bg-emerald-500/25",
                    state === "now" && "bg-amber-400/25 ring-2 ring-amber-300",
                    state === "next" && "bg-white/5 text-white/60",
                  )}
                >
                  <span className="font-mono font-semibold">{t}</span>
                  <span className="text-[10px] text-white/60">
                    {keyTextFor(keymap, 3, t) ?? "키 없음"}
                  </span>
                </li>
              );
            })}
          </ol>
          <p role="status" className="min-h-5 break-keep text-red-300 text-sm">
            {message ?? ""}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              반복
              <input
                type="number"
                min={1}
                max={30}
                value={reps}
                onChange={(e) =>
                  setReps(
                    Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                  )
                }
                className="w-16 rounded bg-white/10 px-2 py-1"
              />
              번
            </label>
            <span data-formula-count className="text-white/70">
              {laps.length}/{reps}
            </span>
            <button
              type="button"
              onClick={(e) => {
                restart();
                e.currentTarget.blur();
              }}
              className="rounded-lg bg-white/10 px-3 py-1"
            >
              다시
            </button>
            {best !== undefined && (
              <span className="text-white/60 text-xs">
                이 기기 최고 초당 {best.toFixed(2)}수
              </span>
            )}
          </div>
          <p className="text-white/50 text-xs">한 번 {moves}수</p>
          {laps.length > 0 && (
            <>
              <LapChart laps={laps} tpsOf={tpsOf} reps={reps} />
              <p className="text-sm">
                평균 {seconds(avg)} · 초당 {tpsOf(avg).toFixed(2)}수
              </p>
            </>
          )}
          {done && (
            <p role="status" className="font-semibold text-emerald-300">
              {reps}번 끝
            </p>
          )}
        </div>
        <LiveCube
          cube={cube}
          settings={settings}
          className="mx-auto w-full max-w-[240px]"
        />
      </div>
      <KeyboardMap
        keymap={keymap}
        n={3}
        lit={lit}
        pressed={pressed}
        wrong={wrong}
      />
    </section>
  );
}
