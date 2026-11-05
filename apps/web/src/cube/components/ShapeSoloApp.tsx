"use client";

import {
  applyMove,
  applyMoves,
  type CubeMove,
  invertMove,
  isRotation,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import type { Command } from "../input";
import { eventForSize } from "../online/race-game";
import { LEVEL_LABEL, type Pattern } from "../patterns/data";
import {
  SHAPE_START_LABELS,
  SHAPE_STARTS,
  type ShapeStart,
  shapeGoal,
  shapeLevel,
  shapeProgress,
  shapeSupports,
  shapesFor,
} from "../patterns/race";
import {
  addShapeResult,
  introSeen,
  loadShapeRecords,
  markIntroSeen,
  recordKey,
  type ShapeRecords,
  saveShapeRecords,
} from "../patterns/shape-records";
import { formatMs } from "../records";
import { type CubeSettings, useCubeSettings } from "../settings";
import { scrambleInWorker, warmUpScramble } from "../worker";
import { CubePlay, playCubeCue } from "./CubePlay";
import { CubePosterPair } from "./CubePosterPair";

/**
 * 혼자 하는 모양 만들기(`/cube/shape`, docs/47 9-10). 목표 모양을 고르고, 맞춘 큐브(또는 섞인 큐브)에서 그 모양을 만든다.
 * 첫 면 돌리기에 시간이 흐르고 목표와 같은 모양이 되면 멈춘다. 기록은 모양·시작마다 이 기기에 둔다.
 * 목표는 펼친 그림이 아니라 비스듬한 큐브 그림 둘로 보인다
 */

const SIZES = [3, 2, 4, 5].filter(shapeSupports);

/** 큐브 돌리기(x·y·z)를 뺀 수 */
function turnsOf(n: number, h: readonly CubeMove[]): number {
  return h.filter((m) => !isRotation(n, m)).length;
}

type Run =
  | { phase: "pick" }
  | { phase: "scrambling"; pattern: Pattern }
  | {
      phase: "play";
      pattern: Pattern;
      start: PuzzleState;
      scramble: string;
    };

export function ShapeSoloApp() {
  const settings = useCubeSettings();
  const [n, setN] = useState(3);
  const [startMode, setStartMode] = useState<ShapeStart>("solved");
  const [run, setRun] = useState<Run>({ phase: "pick" });
  const [records, setRecords] = useState<ShapeRecords>({});
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    setRecords(loadShapeRecords());
    setIntro(!introSeen());
  }, []);
  useEffect(() => {
    if (startMode === "scrambled") warmUpScramble(eventForSize(n));
  }, [n, startMode]);

  const begin = useCallback(
    (pattern: Pattern) => {
      const size = pattern.size;
      if (startMode === "solved") {
        setRun({
          phase: "play",
          pattern,
          start: solvedCube(size),
          scramble: "",
        });
        return;
      }
      setRun({ phase: "scrambling", pattern });
      const seed = Math.floor(Math.random() * 0xffffffff);
      void Promise.resolve(scrambleInWorker(eventForSize(size), seed)).then(
        (s) =>
          setRun((r) =>
            r.phase === "scrambling" && r.pattern.id === pattern.id
              ? {
                  phase: "play",
                  pattern,
                  start: applyMoves(
                    size,
                    solvedCube(size),
                    parseMoves(size, s.text),
                  ),
                  scramble: s.text,
                }
              : r,
          ),
        () => setRun({ phase: "pick" }),
      );
    },
    [startMode],
  );

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-shape-solo={run.phase}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">모양 만들기</h1>
        </header>

        {intro && (
          <section
            data-cube-shape-intro
            className="flex flex-col gap-2 rounded-2xl border border-violet-300/30 bg-violet-300/10 p-4 text-sm"
          >
            <b className="text-violet-50">처음이라면</b>
            <p className="break-keep text-white/80">
              목표 모양을 하나 고르면 내 큐브 옆에 그 모양이 큐브 그림으로
              보여요. 큐브를 돌려 같은 모양을 만들면 끝이에요. 첫 수를 두면
              시간이 흐르고, 모양마다 가장 빠른 기록이 남아요.
            </p>
            <p className="break-keep text-white/60 text-xs">
              큐브를 어느 쪽으로 들고 만들어도 같은 모양이면 돼요. 공식이
              궁금하면 「패턴 만들기」에서 볼 수 있어요.
            </p>
            <button
              type="button"
              data-cube-shape-intro-ok
              onClick={() => {
                markIntroSeen();
                setIntro(false);
              }}
              className="self-start rounded-lg bg-violet-300 px-3 py-1.5 font-semibold text-black"
            >
              알겠어요
            </button>
          </section>
        )}

        {run.phase === "pick" ? (
          <ShapePicker
            n={n}
            onSize={setN}
            start={startMode}
            onStart={setStartMode}
            records={records}
            settings={settings}
            onPick={begin}
          />
        ) : run.phase === "scrambling" ? (
          <p className="p-6 text-center text-sm text-white/70">섞는 중…</p>
        ) : (
          <ShapePlay
            key={`${run.pattern.id}|${run.scramble}`}
            pattern={run.pattern}
            startMode={startMode}
            start={run.start}
            scramble={run.scramble}
            settings={settings}
            record={records[recordKey(run.pattern.id, startMode)]}
            onDone={(ms, moves) => {
              const key = recordKey(run.pattern.id, startMode);
              const made = addShapeResult(loadShapeRecords(), key, ms, moves);
              saveShapeRecords(made.records);
              setRecords(made.records);
              return made.best;
            }}
            onAgain={() => begin(run.pattern)}
            onBack={() => setRun({ phase: "pick" })}
          />
        )}
      </main>
    </div>
  );
}

function ShapePicker({
  n,
  onSize,
  start,
  onStart,
  records,
  settings,
  onPick,
}: {
  n: number;
  onSize: (n: number) => void;
  start: ShapeStart;
  onStart: (s: ShapeStart) => void;
  records: ShapeRecords;
  settings: CubeSettings;
  onPick: (p: Pattern) => void;
}) {
  const list = shapesFor(n);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {SIZES.map((k) => (
          <button
            key={k}
            type="button"
            data-cube-shape-size={k}
            aria-pressed={n === k}
            onClick={() => onSize(k)}
            className={cn(
              "rounded-lg px-3 py-1.5",
              n === k ? "bg-sky-500 font-semibold text-black" : "bg-white/10",
            )}
          >
            {k}×{k}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        {SHAPE_STARTS.map((s) => (
          <button
            key={s}
            type="button"
            data-cube-shape-start={s}
            aria-pressed={start === s}
            onClick={() => onStart(s)}
            className={cn(
              "rounded-lg px-3 py-1.5",
              start === s ? "bg-violet-300 text-black" : "bg-white/10",
            )}
          >
            {SHAPE_START_LABELS[s]}
          </button>
        ))}
        <button
          type="button"
          data-cube-shape-random
          onClick={() => {
            const p = list[Math.floor(Math.random() * list.length)];
            if (p) onPick(p);
          }}
          className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
        >
          아무 모양이나
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((p) => {
          const rec = records[recordKey(p.id, start)];
          return (
            <li key={p.id}>
              <button
                type="button"
                data-cube-shape-card={p.id}
                onClick={() => onPick(p)}
                className="flex w-full flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-2 text-sm hover:bg-white/10"
              >
                <CubePosterPair
                  n={p.size}
                  state={shapeGoal(p.id).target}
                  settings={settings}
                  captions={false}
                  className="w-full max-w-40"
                />
                <b className="break-keep">{p.name}</b>
                <span className="text-white/60 text-xs">
                  {LEVEL_LABEL[shapeLevel(p)]}
                  {rec ? ` · 최고 ${formatMs(rec.best)} · ${rec.count}번` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShapePlay({
  pattern,
  startMode,
  start,
  scramble,
  settings,
  record,
  onDone,
  onAgain,
  onBack,
}: {
  pattern: Pattern;
  startMode: ShapeStart;
  start: PuzzleState;
  scramble: string;
  settings: CubeSettings;
  record: ShapeRecords[string] | undefined;
  /** 완성: 새 기록이면 true */
  onDone: (ms: number, moves: number) => boolean;
  onAgain: () => void;
  onBack: () => void;
}) {
  const n = pattern.size;
  const goal = useMemo(() => shapeGoal(pattern.id), [pattern.id]);
  const [state, setState] = useState(start);
  const [history, setHistory] = useState<CubeMove[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<{
    ms: number;
    moves: number;
    best: boolean;
  } | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [, tick] = useState(0);
  const live = useRef({ state, history, startedAt, result, settings });
  live.current = { state, history, startedAt, result, settings };

  useEffect(() => {
    if (startedAt === null || result) return;
    const id = window.setInterval(() => tick((t) => t + 1), 53);
    return () => window.clearInterval(id);
  }, [startedAt, result]);

  const onMove = useCallback(
    (move: CubeMove) => {
      const c = live.current;
      if (c.result) return false;
      const next = applyMove(n, c.state, move);
      const history = [...c.history, move];
      let at = c.startedAt;
      if (at === null && !isRotation(n, move)) {
        at = performance.now();
        setStartedAt(at);
      }
      c.state = next;
      c.history = history;
      c.startedAt = at;
      setState(next);
      setHistory(history);
      if (at !== null && goal.matcher.matches(next)) {
        const ms = Math.round(performance.now() - at);
        const moves = turnsOf(n, history);
        const best = onDone(ms, moves);
        c.result = { ms, moves, best };
        setResult(c.result);
        playCubeCue(c.settings, best ? "cubeBest" : "cubeSolved");
      }
      return true;
    },
    [n, goal, onDone],
  );

  const onCommand = useCallback(
    (cmd: Command): CubeMove | null => {
      const c = live.current;
      if (cmd === "undo") {
        if (c.result) return null;
        const last = c.history.at(-1);
        if (!last) return null;
        const back = invertMove(last);
        c.state = applyMove(n, c.state, back);
        c.history = c.history.slice(0, -1);
        setState(c.state);
        setHistory(c.history);
        return back;
      }
      if (cmd === "reset" || cmd === "scramble") {
        if (startMode === "scrambled") {
          onAgain();
          return null;
        }
        c.state = start;
        c.history = [];
        c.startedAt = null;
        c.result = null;
        setState(start);
        setHistory([]);
        setStartedAt(null);
        setResult(null);
        setSyncToken((t) => t + 1);
      }
      return null;
    },
    [n, start, startMode, onAgain],
  );

  const elapsed = result
    ? result.ms
    : startedAt === null
      ? 0
      : performance.now() - startedAt;
  const progress = shapeProgress(goal, state, startMode);
  return (
    <section
      className="flex flex-col gap-3"
      data-cube-shape-pattern={pattern.id}
    >
      <div className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1">
        <span
          data-cube-clock
          className="font-mono font-semibold text-4xl tabular-nums"
        >
          {formatMs(elapsed)}
        </span>
        <span className="text-sm text-white/70">
          수{" "}
          <b data-cube-moves className="text-base text-white">
            {turnsOf(n, history)}
          </b>
        </span>
        <span className="text-sm text-white/60">
          {record ? `최고 ${formatMs(record.best)}` : "첫 기록"}
        </span>
      </div>
      <div className="flex min-h-10 flex-wrap items-center justify-center gap-2">
        {result ? (
          <span
            role="status"
            data-cube-shape-done
            data-cube-shape-best={result.best ? "" : undefined}
            className="rounded-full border border-emerald-400/50 bg-emerald-400/15 px-4 py-1 font-bold text-emerald-300"
          >
            완성! {formatMs(result.ms)} · {result.moves}수
            {result.best ? " · 새 기록" : ""}
          </span>
        ) : (
          <span className="text-white/60 text-xs">
            {startedAt === null
              ? "첫 수를 두면 시간이 흘러요"
              : `목표 ${Math.round(progress * 100)}%`}
          </span>
        )}
        <button
          type="button"
          data-cube-shape-again
          onClick={(e) => {
            e.currentTarget.blur();
            if (startMode === "scrambled") onAgain();
            else onCommand("reset");
          }}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm",
            result
              ? "bg-sky-500 font-semibold text-black"
              : "bg-white/10 hover:bg-white/15",
          )}
        >
          {result ? "한 번 더" : "처음부터(Esc)"}
        </button>
        <button
          type="button"
          data-cube-shape-back
          onClick={onBack}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          다른 모양
        </button>
      </div>
      {scramble && (
        <p className="break-keep text-center font-mono text-white/70 text-xs">
          {scramble}
        </p>
      )}
      <div className="flex flex-col items-center gap-3 md:flex-row md:items-start md:justify-center">
        <div
          data-cube-shape-target={pattern.id}
          className="flex shrink-0 items-center gap-3 rounded-xl border border-violet-300/30 bg-violet-300/10 p-2 md:w-56 md:flex-col"
        >
          <CubePosterPair
            n={n}
            state={goal.target}
            settings={settings}
            captions={false}
            className="w-32 md:w-full"
          />
          <div className="flex flex-col gap-0.5 text-sm md:items-center">
            <span className="text-violet-100/70 text-xs">만들 모양</span>
            <b className="break-keep text-violet-50">{pattern.name}</b>
            <span className="text-white/60 text-xs">
              {LEVEL_LABEL[shapeLevel(pattern)]} ·{" "}
              {SHAPE_START_LABELS[startMode]}
            </span>
          </div>
        </div>
        <div className="w-full min-w-0 flex-1">
          <CubePlay
            n={n}
            state={state}
            mask={null}
            syncToken={syncToken}
            settings={settings}
            onMove={onMove}
            onCommand={onCommand}
            locked={!!result}
          />
        </div>
      </div>
    </section>
  );
}
