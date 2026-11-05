"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";
import { realClock } from "@game/fair-play";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { caseById, shortName } from "../algs/check";
import { spotCase } from "../algs/spot";
import {
  type AlgBook,
  habitList,
  loadAlgBook,
  usedAlg,
  watchAlgBook,
} from "../algs/store";
import { stickersFromState as stickersOf } from "../bridge";
import {
  beginDaily,
  DAILY_SIZES,
  type DailyEntry,
  dailyEntry,
  dailyEvent,
  dailySeed,
  dailyStreak,
  finishDaily,
  kstDate,
  loadDaily,
  markString,
  shortDate,
} from "../daily";
import { COMBO_SHOW } from "../flow/strip";
import type { Command } from "../input";
import type { AlgCase } from "../learn";
import { NEAR_LIMIT, type ShortSolution } from "../progress/distance";
import { bestSegments, goldSplits, isPersonalBest } from "../progress/gold";
import { groupSplits } from "../progress/splits";
import {
  addRecord,
  averageOf,
  formatMs,
  loadRecords,
  parseReplay,
  parseSplits,
  resultMs,
  type SolveMode,
  type SolveRecord,
} from "../records";
import { useCubeSettings } from "../settings";
import { type SessionCue, SolveSession } from "../solve-session";
import { useRenewable } from "../use-renewable";
import type { CubeView } from "../view";
import {
  distanceInWorker,
  scrambleInWorker,
  shortSolutionInWorker,
  warmUpScramble,
} from "../worker";
import { AlgChips } from "./AlgChips";
import { CubePlay, playCubeCue } from "./CubePlay";
import { averagesFor, DailyPanel, DailyShare } from "./DailyParts";
import { useMoveKeys } from "./MoveChip";
import { MilestoneChips, ProgressMeter, SplitList } from "./SolveProgress";

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

/** 오늘의 섞기 한 판: 그날 처음 받은 섞기면 기록(official), 아니면 연습 */
interface DailyAttempt {
  kind: "official" | "practice";
  date: string;
  startedAt: number;
}

/**
 * `daily`: 오늘의 섞기(`/cube/daily`, docs/51 2-4). 혼자 맞추기와 같은 판에 날짜 씨앗 섞기·하루 한 번 기록·공유 글을 더한다.
 * 살펴보기는 설정과 상관없이 늘 켠다(모두 같은 조건으로 견주게)
 */
export function SolveApp({
  mode,
  daily = false,
}: {
  mode: SolveMode;
  daily?: boolean;
}) {
  const settings = useCubeSettings();
  const [n, setN] = useState(3);
  const sizes: readonly number[] = daily ? DAILY_SIZES : SIZES;
  // 오늘의 섞기: 날짜(한국 시각), 이 기기의 날마다 기록, 지금 판
  const [today, setToday] = useState("");
  const [dailyList, setDailyList] = useState<DailyEntry[]>([]);
  const [attempt, setAttempt] = useState<DailyAttempt | null>(null);
  const attemptRef = useRef<DailyAttempt | null>(null);
  attemptRef.current = attempt;
  const officialLiveRef = useRef(false);
  useEffect(() => {
    const check = () => setToday(kstDate(Date.now()));
    check();
    setDailyList(loadDaily());
    // 화면을 켜 둔 채 자정을 넘기면 날짜를 바꾼다
    const id = window.setInterval(check, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [version, setVersion] = useState(0);
  const [syncToken, setSyncToken] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [records, setRecords] = useState<SolveRecord[]>([]);
  /**
   * 이번 판을 섞은 때의 기록(구간 골드·개인 최고를 견줄 옛 기록, docs/51 2-2). 판이 끝나 기록이 더해져도 이번 판과
   * 견주지 않게 섞을 때 떠 둔다
   */
  const [prior, setPrior] = useState<SolveRecord[]>([]);
  const bests = useMemo(() => bestSegments(prior), [prior]);
  const [notice, setNotice] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [, tick] = useState(0);
  const viewRef = useRef<CubeView | null>(null);
  const replayTimers = useRef<number[]>([]);
  /** 섞기 요청 번호. 답이 왔을 때 번호가 바뀌었으면(크기를 바꿨거나 화면을 떠났으면) 그 답을 버린다 */
  const scrambleRequest = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // 상황 알림(설정에서 켰을 때, 혼자 맞추기 3×3): 내 목록 상황에 이르면 구석에 이름과 내 공식
  const [algBook, setAlgBook] = useState<AlgBook>({});
  const [spotted, setSpotted] = useState<AlgCase | null>(null);
  /** 이번 판에서 만난 내 목록 상황(기록에 남긴다) */
  const metRef = useRef<string[]>([]);
  const [met, setMet] = useState<string[]>([]);
  const alertOn = settings.caseAlert && mode === "solo" && n === 3;
  const myCases = useRef<AlgCase[]>([]);
  myCases.current = habitList(algBook).map((x) => x.c);
  const { keysOf } = useMoveKeys(3);
  useEffect(() => {
    setAlgBook(loadAlgBook());
    return watchAlgBook(setAlgBook);
  }, []);
  const clearMet = useCallback(() => {
    metRef.current = [];
    setMet([]);
    setSpotted(null);
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const sync = useCallback(() => setSyncToken((v) => v + 1), []);

  // 크기·방식마다 세션 하나. 효과 정리에서 치우고, 개발 모드처럼 효과가 다시 돌면 새로 만든다
  const session = useRenewable(() => {
    const onCue = (cue: SessionCue) => {
      const s = settingsRef.current;
      if (cue === "inspect8" || cue === "inspect12")
        playCubeCue(s, "cubeInspect");
      else if (cue === "solved") playCubeCue(s, "cubeSolved");
      else playCubeCue(s, "invalid");
    };
    const made: SolveSession = new SolveSession({
      n,
      mode,
      inspection: true,
      clock: realClock,
      onChange: bump,
      onCue,
      onRecord: (r) => {
        const a = attemptRef.current;
        if (daily) {
          // 연습은 어디에도 남기지 않는다. 기록 시도는 혼자 맞추기 기록(평균·골드)과 날마다 기록에 함께
          if (a?.kind !== "official") return;
          const before = loadRecords(mode, n);
          setRecords(addRecord({ ...r, daily: a.date }));
          setDailyList(
            finishDaily(a.date, {
              ...r,
              ...(made.result?.dnfReason
                ? { dnfReason: made.result.dnfReason }
                : {}),
              marks: markString(made.splits, averagesFor(a.startedAt, before)),
            }),
          );
          return;
        }
        setRecords(
          addRecord(
            metRef.current.length > 0
              ? { ...r, myCases: [...metRef.current] }
              : r,
          ),
        );
      },
    });
    return made;
  }, `${n}-${mode}`);
  session.inspection = daily || settings.inspection;

  useEffect(() => {
    setRecords(loadRecords(mode, n));
    sync();
    return () => {
      scrambleRequest.current++;
    };
  }, [mode, n, sync]);

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
    const date = kstDate(Date.now());
    const seed = daily ? dailySeed(date, n) : randomSeed();
    try {
      const s = await scrambleInWorker(
        daily ? dailyEvent(n) : eventFor(n, mode),
        seed,
      );
      if (stale()) return;
      clearMet();
      setPrior(loadRecords(mode, n));
      if (daily) {
        const now = Date.now();
        const begun = beginDaily({ date, n, seed, scramble: s.text, now });
        setDailyList(begun.entries);
        setToday(date);
        setAttempt({ kind: begun.kind, date, startedAt: now });
      }
      session.start(s.text, seed);
      sync();
      if (!s.official) setNotice(TEMP_SCRAMBLE);
    } catch {
      if (!stale()) setNotice("섞기를 만들지 못했어요. 다시 눌러 보세요.");
    } finally {
      if (id === scrambleRequest.current) setPreparing(false);
    }
  }, [preparing, n, mode, daily, session, sync, stopReplay, clearMet]);

  const onMove = useCallback(
    (move: Parameters<SolveSession["input"]>[0], notation: string) => {
      const r = session.input(move, notation);
      if (r === "blocked") {
        setNotice(MEMO_BLOCKED);
        return false;
      }
      if (alertOn && myCases.current.length > 0) {
        const c =
          session.phase === "solving"
            ? spotCase(3, session.state, myCases.current)
            : null;
        setSpotted(c);
        if (c && !metRef.current.includes(c.id)) {
          metRef.current = [...metRef.current, c.id];
          setMet(metRef.current);
        }
      }
      return true;
    },
    [session, alertOn],
  );

  const onCommand = useCallback(
    (c: Command) => {
      if (c === "undo") return session.undo();
      // 오늘의 섞기 기록 시도 중에는 섞기·처음으로 키를 받지 않는다(잘못 눌러 하루 한 번을 날리지 않게)
      if ((c === "reset" || c === "scramble") && officialLiveRef.current)
        return null;
      if (c === "reset") {
        stopReplay();
        clearMet();
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
    [session, sync, doScramble, stopReplay, clearMet],
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
  /** 오늘의 섞기 기록 시도가 진행 중(크기 바꾸기·섞기를 막는다) */
  const officialLive =
    daily &&
    attempt?.kind === "official" &&
    (phase === "inspect" || phase === "ready" || phase === "solving");
  officialLiveRef.current = officialLive;
  const todayEntry = today ? dailyEntry(dailyList, today, n) : undefined;
  const doneToday = !!todayEntry && !officialLive;
  // 「외우는 동안에는…」은 외우는 동안만. 맞추기를 시작하거나 끝나면 지운다
  useEffect(() => {
    if (phase !== "memo") setNotice((v) => (v === MEMO_BLOCKED ? null : v));
  }, [phase]);
  // 완성까지 거리(2×2·3×3, 8수 안쪽일 때만 보인다). 수마다 워커에 묻고, 답이 왔을 때 상태가 바뀌었으면 버린다
  const [near, setNear] = useState<number | null>(null);
  const tracking = mode === "solo" && n <= 3 && phase === "solving";
  // biome-ignore lint/correctness/useExhaustiveDependencies: 수마다(version) 다시 묻는다
  useEffect(() => {
    if (!tracking) {
      setNear(null);
      return;
    }
    const asked = session.state;
    let live = true;
    distanceInWorker(n, asked, NEAR_LIMIT)
      .then((d) => {
        if (live && session.state === asked) setNear(d);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [tracking, version, n, session]);
  // 이 섞기의 짧은 풀이(결과 상자, 2×2·3×3)
  const [short, setShort] = useState<{
    scramble: string;
    value: ShortSolution;
  } | null>(null);
  const solvedScramble =
    mode === "solo" && n <= 3 && phase === "done" && session.result?.ms != null
      ? session.scramble
      : null;
  useEffect(() => {
    if (!solvedScramble) return;
    let live = true;
    const start = applyMoves(n, solvedCube(n), parseMoves(n, solvedScramble));
    shortSolutionInWorker(n, start)
      .then((v) => {
        if (live && v) setShort({ scramble: solvedScramble, value: v });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [solvedScramble, n]);
  const elapsed = session.elapsed();
  const inspecting = phase === "inspect";
  const showProgress =
    mode === "solo" &&
    (phase === "inspect" ||
      phase === "ready" ||
      phase === "solving" ||
      phase === "done");
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
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">
            {daily
              ? "오늘의 섞기"
              : mode === "blind"
                ? "블라인드(가상)"
                : "혼자 맞추기"}
          </h1>
          {daily && today && (
            <span className="text-sm text-white/60 tabular-nums">
              {shortDate(today)}
            </span>
          )}
          {daily && doneToday && (
            <span
              data-cube-daily-done
              className="rounded-full border border-emerald-300/50 bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-200 text-xs"
            >
              오늘 완료
            </span>
          )}
          {!daily && mode === "solo" && <DailyLink />}
          <label className="ml-auto flex items-center gap-1 text-sm">
            크기
            <select
              data-cube-size
              value={n}
              disabled={preparing || officialLive}
              onChange={(e) => {
                stopReplay();
                scrambleRequest.current++;
                setPreparing(false);
                setAttempt(null);
                setN(Number(e.target.value));
                e.target.blur();
              }}
              className="rounded bg-white/10 px-2 py-1 disabled:opacity-60"
            >
              {sizes.map((s) => (
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
            disabled={preparing || officialLive}
            className={`rounded-lg px-4 py-1.5 font-semibold text-sm disabled:opacity-60 ${
              daily && doneToday
                ? "border border-white/25 bg-white/10 text-white"
                : "bg-sky-500 text-black"
            }`}
          >
            {preparing
              ? "섞기 준비 중…"
              : !daily
                ? "섞기"
                : doneToday
                  ? "연습으로 다시"
                  : "오늘의 섞기 받기"}
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

        <div
          className="grid gap-4 md:grid-cols-[1fr_260px]"
          data-cube-daily-attempt={daily ? (attempt?.kind ?? "") : undefined}
        >
          <section className="relative flex flex-col items-center gap-2">
            {alertOn && spotted && phase === "solving" && (
              <div
                data-case-alert={spotted.id}
                className="pointer-events-none absolute right-0 bottom-0 z-10 flex max-w-64 flex-col gap-0.5 rounded-lg bg-black/60 px-2 py-1 text-xs"
              >
                <span className="font-semibold">{shortName(spotted)}</span>
                <AlgChips
                  alg={usedAlg(algBook, spotted)}
                  keysOf={keysOf}
                  className="font-mono text-[11px] text-white/80"
                />
              </div>
            )}
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
              {/* 지금 단계(살펴보는 중·맞추는 중…)는 시간 줄 끝에 작게(큐브 칸 위를 납작하게) */}
              <span className="text-white/55 text-xs">
                {replaying ? "다시 보는 중" : PHASE_HINT[phase]}
              </span>
            </div>
            <p
              className="min-h-10 break-keep text-center font-mono text-sm text-white/80 sm:min-h-5"
              data-cube-scramble={session.scramble}
            >
              {preparing ? "섞기 준비 중…" : session.scramble || " "}
            </p>
            {notice && (
              <p className="text-amber-300 text-xs" role="status">
                {notice}
              </p>
            )}

            {showProgress && (
              <>
                <ProgressMeter
                  n={n}
                  progress={session.progress}
                  best={session.bestProgress}
                  near={phase === "solving" ? near : null}
                />
                {phase !== "done" && (
                  <MilestoneChips
                    splits={session.splits}
                    gold={goldSplits(session.splits, bests)}
                  />
                )}
              </>
            )}
            {phase === "done" && result && (
              <ResultBox
                mode={mode}
                result={result}
                splits={session.splits}
                gold={goldSplits(session.splits, bests)}
                best={isPersonalBest(
                  result.ms === null ? null : result.ms + result.penalty,
                  prior,
                )}
                combo={session.longestCombo}
                practice={daily && attempt?.kind === "practice"}
                short={
                  short && short.scramble === session.scramble
                    ? short.value
                    : null
                }
              />
            )}
            {phase === "done" &&
              daily &&
              attempt?.kind === "official" &&
              todayEntry?.status === "done" &&
              todayEntry.date === attempt.date && (
                <div className="flex items-center gap-3 md:hidden">
                  {todayEntry.marks && entryMarks(todayEntry)}
                  <DailyShare entry={todayEntry} />
                </div>
              )}
            {phase === "done" && met.length > 0 && (
              <p
                className="text-white/70 text-xs"
                data-cube-met={met.join(" ")}
              >
                만난 내 상황:{" "}
                {met
                  .map((id) => caseById(id))
                  .filter((c): c is AlgCase => !!c)
                  .map(shortName)
                  .join(" · ")}
              </p>
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
              flow={mode === "solo" ? "large" : undefined}
              combo={mode === "solo"}
              fitViewport
            />
          </section>

          {daily ? (
            <DailyPanel
              today={today}
              n={n}
              entries={dailyList}
              streak={today ? dailyStreak(dailyList, today) : 0}
              live={officialLive}
            />
          ) : (
            <aside className="flex flex-col gap-2 text-sm" data-cube-records>
              <h2 className="font-semibold">
                {n}×{n} 기록
              </h2>
              <dl className="grid grid-cols-3 gap-1 text-center">
                <Stat label="최고" value={formatMs(best ?? undefined)} />
                <Stat
                  label="5번 평균"
                  value={formatMs(averageOf(records, 5))}
                />
                <Stat
                  label="12번 평균"
                  value={formatMs(averageOf(records, 12))}
                />
              </dl>
              {records.length === 0 ? (
                <p className="text-white/50 text-xs">
                  아직 기록이 없어요. 섞고 맞추면 여기에 쌓여요.
                </p>
              ) : (
                <ol className="flex max-h-80 flex-col gap-0.5 overflow-y-auto pr-1">
                  {records.slice(0, 30).map((r, i) => (
                    <li
                      key={`${r.at}-${r.scramble}`}
                      title={splitTitle(r)}
                      className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5"
                    >
                      <span className="w-6 text-right text-white/40 text-xs">
                        {r.no ?? records.length - i}
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
          )}
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

const MEMO_BLOCKED =
  "외우는 동안에는 면을 돌릴 수 없어요. 큐브 돌리기(x·y·z)로 둘러보세요.";
/** 4×4부터는 무작위 상태 섞기가 없어 무작위 수로 섞는다(타이머의 「임시: 무작위 수」와 같은 뜻) */
const TEMP_SCRAMBLE =
  "임시 섞기: 대회 방식(무작위 상태) 대신 무작위 수로 섞었어요.";

/** 기록 줄에 대면 보이는 구간 기록 */
function splitTitle(r: SolveRecord): string | undefined {
  const groups = groupSplits(parseSplits(r.splits));
  if (groups.length === 0) return undefined;
  return groups.map((g) => `${g.label} ${formatMs(g.ms)}`).join(" · ");
}

function ResultBox({
  mode,
  result,
  splits,
  gold,
  best,
  combo,
  practice,
  short,
}: {
  mode: SolveMode;
  result: NonNullable<SolveSession["result"]>;
  splits: SolveSession["splits"];
  /** 골드 구간(칩 시각 ms) */
  gold: ReadonlySet<number>;
  /** 개인 최고(이 크기·방식의 옛 기록보다 빠름) */
  best: boolean;
  /** 가장 긴 흐름 콤보 */
  combo: number;
  /** 오늘의 섞기 연습(기록에 넣지 않았다) */
  practice: boolean;
  short: ShortSolution | null;
}) {
  const total = result.ms === null ? null : result.ms + result.penalty;
  const dnf = result.ms === null;
  const tps =
    result.ms && result.ms > 0
      ? (result.moves / (result.ms / 1000)).toFixed(2)
      : null;
  return (
    <div
      data-cube-result={dnf ? "dnf" : "solved"}
      role="status"
      className={`flex flex-wrap items-baseline justify-center gap-x-5 gap-y-1 rounded-xl border px-4 py-2 ${
        dnf
          ? "border-rose-400/40 bg-rose-500/10"
          : "border-emerald-400/40 bg-emerald-400/10"
      }`}
    >
      <span
        className={`font-bold text-xl ${dnf ? "text-rose-200" : "text-emerald-300"}`}
      >
        {result.ms === null
          ? result.dnfReason === "inspection"
            ? "DNF(살펴보기 17초 넘김)"
            : "DNF(맞지 않음)"
          : `${formatMs(total)}${result.penalty ? " (+2)" : ""}`}
      </span>
      {practice && (
        <span
          data-cube-practice
          className="rounded-full border border-white/25 px-2 py-0.5 font-semibold text-white/70 text-xs"
        >
          연습
        </span>
      )}
      {best && !practice && (
        <span
          data-cube-pb
          className="cube-gold rounded-full border px-2 py-0.5 font-semibold text-xs"
        >
          개인 최고
        </span>
      )}
      {mode === "blind" && result.memoMs !== undefined && (
        <span className="text-sm">
          외우기 {formatMs(result.memoMs)} · 맞추기 {formatMs(result.execMs)}
        </span>
      )}
      <span className="text-sm">{result.moves}수</span>
      {/* DNF는 맞추지 못했으니 빠르기를 보이지 않는다 */}
      {!dnf && tps && <span className="text-sm">초당 {tps}수</span>}
      {!dnf && combo >= COMBO_SHOW && (
        <span className="text-sm text-white/70" data-cube-best-combo={combo}>
          가장 긴 콤보 {combo}
        </span>
      )}
      {!dnf && short && (
        <span className="text-sm text-white/70" data-cube-short={short.moves}>
          {short.exact
            ? `이 섞기의 가장 짧은 풀이 ${short.moves}수`
            : `컴퓨터 풀이 ${short.moves}수`}
        </span>
      )}
      {!dnf && <SplitList splits={splits} gold={gold} />}
    </div>
  );
}

function entryMarks(e: DailyEntry) {
  return (
    <span data-cube-daily-marks={e.marks} className="text-sm tracking-wider">
      {e.marks}
    </span>
  );
}

/** 혼자 맞추기 머리의 「오늘의 섞기」 길. 오늘 이 기기에서 한 크기가 있으면 「완료」 */
function DailyLink() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const today = kstDate(Date.now());
    setDone(loadDaily().some((e) => e.date === today));
  }, []);
  return (
    <a
      href="/cube/daily"
      data-cube-daily-link
      data-cube-daily-done={done ? "" : undefined}
      className="inline-flex min-h-8 items-center gap-1 rounded-full border border-white/15 px-2.5 text-white/80 text-xs hover:bg-white/10"
    >
      오늘의 섞기
      {done && <span className="text-emerald-300">✓</span>}
    </a>
  );
}
