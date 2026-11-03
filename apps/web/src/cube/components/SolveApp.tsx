"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { realClock } from "@game/fair-play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { stickersFromState as stickersOf } from "../bridge";
import type { Command } from "../input";
import {
  addRecord,
  averageOf,
  formatMs,
  loadRecords,
  parseReplay,
  resultMs,
  type SolveMode,
  type SolveRecord,
} from "../records";
import { useCubeSettings } from "../settings";
import { type SessionCue, SolveSession } from "../solve-session";
import type { CubeView } from "../view";
import { scrambleInWorker, warmUpScramble } from "../worker";
import { CubePlay, playCubeCue } from "./CubePlay";

/**
 * 혼자 맞추기(`/cube/solo`)와 가상 블라인드(`/cube/blind`) 화면(docs/47 1·7절).
 * 진행은 `SolveSession`(엔진 상태가 기준), 3D는 `CubePlay`가 따라 그린다.
 */

const SIZES = [2, 3, 4, 5, 6, 7];

function eventFor(n: number, mode: SolveMode): ScrambleEvent {
  if (n === 3 && mode === "blind") return "333bf";
  return `${n}${n}${n}` as ScrambleEvent;
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const PHASE_HINT: Record<string, string> = {
  free: "",
  inspect: "살펴보는 중",
  ready: "준비",
  solving: "맞추는 중",
  memo: "외우는 중",
  blindSolve: "가린 채 맞추는 중",
  done: "끝",
};

export function SolveApp({ mode }: { mode: SolveMode }) {
  const settings = useCubeSettings();
  const [n, setN] = useState(3);
  const [version, setVersion] = useState(0);
  const [syncToken, setSyncToken] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [records, setRecords] = useState<SolveRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [, tick] = useState(0);
  const viewRef = useRef<CubeView | null>(null);
  const replayTimers = useRef<number[]>([]);
  /** 섞기 요청 번호. 답이 왔을 때 번호가 바뀌었으면(크기를 바꿨거나 화면을 떠났으면) 그 답을 버린다 */
  const scrambleRequest = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const sync = useCallback(() => setSyncToken((v) => v + 1), []);

  const session = useMemo(() => {
    const onCue = (cue: SessionCue) => {
      const s = settingsRef.current;
      if (cue === "inspect8" || cue === "inspect12")
        playCubeCue(s, "cubeInspect");
      else if (cue === "solved") playCubeCue(s, "cubeSolved");
      else playCubeCue(s, "invalid");
    };
    return new SolveSession({
      n,
      mode,
      inspection: true,
      clock: realClock,
      onChange: bump,
      onCue,
      onRecord: (r) => setRecords(addRecord(r)),
    });
  }, [n, mode, bump]);
  session.inspection = settings.inspection;

  useEffect(() => {
    setRecords(loadRecords(mode, n));
    sync();
    return () => {
      scrambleRequest.current++;
      session.dispose();
    };
  }, [session, mode, n, sync]);

  // 표가 필요한 섞기(2×2·3×3)는 화면을 열 때 워커에서 미리 만들어 둔다
  useEffect(() => {
    if (n <= 3) warmUpScramble(eventFor(n, mode));
  }, [n, mode]);

  // 시간이 흐르는 동안 시계 글을 다시 그린다
  useEffect(() => {
    if (!session.running) return;
    const id = window.setInterval(() => tick((t) => t + 1), 47);
    return () => window.clearInterval(id);
  });

  const stopReplay = useCallback(() => {
    for (const id of replayTimers.current) window.clearTimeout(id);
    replayTimers.current = [];
    setReplaying(false);
  }, []);

  const doScramble = useCallback(async () => {
    if (preparing) return;
    stopReplay();
    setPreparing(true);
    setNotice(null);
    const id = ++scrambleRequest.current;
    const stale = () => id !== scrambleRequest.current || session.disposed;
    const seed = randomSeed();
    try {
      const s = await scrambleInWorker(eventFor(n, mode), seed);
      if (stale()) return;
      session.start(s.text, seed);
      sync();
      if (!s.official) setNotice("임시 섞기");
    } catch {
      if (!stale()) setNotice("섞기를 만들지 못했습니다");
    } finally {
      if (id === scrambleRequest.current) setPreparing(false);
    }
  }, [preparing, n, mode, session, sync, stopReplay]);

  const onMove = useCallback(
    (move: Parameters<SolveSession["input"]>[0], notation: string) => {
      const r = session.input(move, notation);
      if (r === "blocked") {
        setNotice("외우는 동안에는 면을 돌릴 수 없습니다");
        return false;
      }
      return true;
    },
    [session],
  );

  const onCommand = useCallback(
    (c: Command) => {
      if (c === "undo") return session.undo();
      if (c === "reset") {
        stopReplay();
        session.reset();
        sync();
      } else if (c === "scramble") {
        void doScramble();
      } else if (c === "inspectionSkip") {
        const r = session.advance();
        if (r === "memoEnd" || r === "blindEnd") sync();
      }
      return null;
    },
    [session, sync, doScramble, stopReplay],
  );

  /** 기록 하나를 다시 본다: 섞인 상태에서 수를 그때 시각대로 */
  const replay = (r: SolveRecord) => {
    const view = viewRef.current;
    if (!view || r.n !== n) return;
    stopReplay();
    session.reset();
    const scrambled = applyMoves(n, solvedCube(n), parseMoves(n, r.scramble));
    view.setStickers(
      // 섞인 상태에서 시작
      stickersOf(n, scrambled),
    );
    setReplaying(true);
    const steps = parseReplay(r.replay);
    let at = 0;
    let prev = steps[0]?.[1] ?? 0;
    for (const [notation, t] of steps) {
      // 오래 멈춘 곳은 1초로 줄인다
      at += Math.min(1_000, Math.max(0, t - prev));
      prev = t;
      const moves = parseMoves(n, notation);
      replayTimers.current.push(
        window.setTimeout(() => {
          for (const m of moves) viewRef.current?.enqueue(m);
        }, at),
      );
    }
    replayTimers.current.push(
      window.setTimeout(() => {
        setReplaying(false);
        sync();
      }, at + 600),
    );
  };

  useEffect(() => stopReplay, [stopReplay]);

  const result = session.result;
  const phase = session.phase;
  const elapsed = session.elapsed();
  const inspecting = phase === "inspect";
  const last = records[0];
  const best = records.reduce<number | null>((b, r) => {
    const t = resultMs(r);
    return t !== null && (b === null || t < b) ? t : b;
  }, null);

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-cube-phase={phase}
        data-cube-version={version}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">
            {mode === "blind" ? "블라인드(가상)" : "혼자 맞추기"}
          </h1>
          <label className="ml-auto flex items-center gap-1 text-sm">
            크기
            <select
              data-cube-size
              value={n}
              disabled={preparing}
              onChange={(e) => {
                stopReplay();
                scrambleRequest.current++;
                setPreparing(false);
                setN(Number(e.target.value));
                e.target.blur();
              }}
              className="rounded bg-white/10 px-2 py-1 disabled:opacity-60"
            >
              {SIZES.map((s) => (
                <option key={s} value={s} className="bg-neutral-800">
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-cube-scramble-button
            onClick={() => void doScramble()}
            disabled={preparing}
            className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black text-sm disabled:opacity-60"
          >
            {preparing ? "섞기 준비 중…" : "섞기"}
          </button>
          {(phase === "memo" || phase === "blindSolve") && (
            <button
              type="button"
              onClick={() => onCommand("inspectionSkip")}
              className="rounded-lg bg-amber-400 px-4 py-1.5 font-semibold text-black text-sm"
            >
              {phase === "memo" ? "시작(가리기)" : "끝"}
            </button>
          )}
        </header>

        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <section className="flex flex-col items-center gap-2">
            <div className="flex w-full flex-wrap items-baseline justify-center gap-x-6 gap-y-1">
              <span
                data-cube-clock
                className={`font-mono font-semibold text-4xl tabular-nums ${
                  inspecting
                    ? elapsed > 12_000
                      ? "text-red-400"
                      : elapsed > 8_000
                        ? "text-amber-300"
                        : "text-sky-300"
                    : ""
                }`}
              >
                {inspecting
                  ? Math.max(0, Math.ceil((15_000 - elapsed) / 1000))
                  : formatMs(phase === "done" ? (result?.ms ?? null) : elapsed)}
              </span>
              <span className="text-sm text-white/70">
                수 <b data-cube-moves>{session.moveCount}</b>
              </span>
            </div>
            <p
              className="min-h-10 break-keep text-center font-mono text-sm text-white/80"
              data-cube-scramble={session.scramble}
            >
              {preparing ? "섞기 준비 중…" : session.scramble || " "}
            </p>
            <p className="break-keep text-center text-white/55 text-xs">
              {replaying ? "다시 보는 중" : PHASE_HINT[phase]}
            </p>
            {notice && (
              <p className="text-amber-300 text-xs" role="status">
                {notice}
              </p>
            )}

            {phase === "done" && result && (
              <ResultBox mode={mode} result={result} />
            )}

            <CubePlay
              n={n}
              state={session.state}
              mask={session.mask}
              syncToken={syncToken}
              settings={settings}
              onMove={onMove}
              onCommand={onCommand}
              locked={preparing || replaying}
              onView={(v) => {
                viewRef.current = v;
              }}
            />
          </section>

          <aside className="flex flex-col gap-2 text-sm" data-cube-records>
            <h2 className="font-semibold">
              {n}×{n} 기록
            </h2>
            <dl className="grid grid-cols-3 gap-1 text-center">
              <Stat label="최고" value={formatMs(best ?? undefined)} />
              <Stat label="5번 평균" value={formatMs(averageOf(records, 5))} />
              <Stat
                label="12번 평균"
                value={formatMs(averageOf(records, 12))}
              />
            </dl>
            {records.length === 0 ? (
              <p className="text-white/50 text-xs">아직 기록이 없습니다</p>
            ) : (
              <ol className="flex max-h-80 flex-col gap-0.5 overflow-y-auto pr-1">
                {records.slice(0, 30).map((r, i) => (
                  <li
                    key={`${r.at}-${r.scramble}`}
                    className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5"
                  >
                    <span className="w-6 text-right text-white/40 text-xs">
                      {records.length - i}
                    </span>
                    <span className="w-16 font-mono tabular-nums">
                      {formatMs(resultMs(r))}
                      {r.penalty > 0 && r.ms !== null ? "+" : ""}
                    </span>
                    <span className="text-white/50 text-xs">{r.moves}수</span>
                    {r.replay && (
                      <button
                        type="button"
                        onClick={() => replay(r)}
                        className="ml-auto text-sky-300 text-xs hover:underline"
                      >
                        다시 보기
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {last && (
              <p className="break-all text-white/40 text-xs">
                지난 섞기: {last.scramble}
              </p>
            )}
          </aside>
        </div>
      </main>
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

function ResultBox({
  mode,
  result,
}: {
  mode: SolveMode;
  result: NonNullable<SolveSession["result"]>;
}) {
  const total = result.ms === null ? null : result.ms + result.penalty;
  const tps =
    result.ms && result.ms > 0
      ? (result.moves / (result.ms / 1000)).toFixed(2)
      : "-";
  return (
    <div
      data-cube-result
      role="status"
      className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2"
    >
      <span className="font-bold text-emerald-300 text-xl">
        {result.ms === null
          ? result.dnfReason === "inspection"
            ? "DNF(살펴보기 17초 넘김)"
            : "DNF(맞지 않음)"
          : `${formatMs(total)}${result.penalty ? " (+2)" : ""}`}
      </span>
      {mode === "blind" && result.memoMs !== undefined && (
        <span className="text-sm">
          외우기 {formatMs(result.memoMs)} · 맞추기 {formatMs(result.execMs)}
        </span>
      )}
      <span className="text-sm">{result.moves}수</span>
      <span className="text-sm">초당 {tps}수</span>
    </div>
  );
}
