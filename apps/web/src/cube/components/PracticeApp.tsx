"use client";

import { applyMove, applyMoves, type CubeMove } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { type AlgBook, loadAlgBook, watchAlgBook } from "../algs/store";
import type { Command } from "../input";
import type { Keymap } from "../input/keymaps";
import { loadKeymap } from "../input/storage";
import { ALG_SETS } from "../learn";
import { countsAsMove, goalMet } from "../learn/judge";
import { loadTrain, recordSolve } from "../learn/progress";
import { drawRound } from "../practice/deck";
import { pickAlg } from "../practice/pick-alg";
import { boardFor, PRACTICE_N, type ProblemBoard } from "../practice/problem";
import {
  type PracticeMode,
  PracticeRound,
  type RoundSummary,
} from "../practice/round";
import {
  METHOD_TITLE,
  MORE_SETS,
  PRACTICE_STAGES,
  stageById,
  stagesOf,
} from "../practice/stages";
import {
  loadPractice,
  type PracticeRecord,
  recordFollow,
  recordRound,
  rememberStage,
  suggestSee,
} from "../practice/store";
import type { DrillCase, PracticeMethod } from "../practice/types";
import { formatMs } from "../records";
import { useCubeSettings } from "../settings";
import { CubePlay, playCubeCue } from "./CubePlay";
import { KeyCaps, useMoveKeys } from "./MoveChip";

/**
 * 공식 연습(`/cube/train`, docs/47 16-9). 타자 연습의 짧은 글 연습처럼 한 판 10문제가 끊김 없이 이어진다.
 * - 따라 치기: 공식 글자는 보이고 키는 숨긴다. 틀린 수는 큐브에 넣지 않고 그 한 수의 키만 잠깐 보인다
 * - 보고 치기: 모양만 보고 친다. 「공식 보기」를 누르면 공식이 보인다. 결과 모양으로 채점한다
 */

/** 다 맞춘 모습을 보이는 시간 */
const SOLVED_PAUSE_MS = 700;
/** 틀린 수의 키를 보이는 시간 */
const WRONG_SHOW_MS = 1500;

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const MORE_TITLE = new Map(ALG_SETS.map((s) => [s.set, s.title]));

interface Play {
  round: PracticeRound;
  board: ProblemBoard | null;
  /** 상황 id → 고른 공식(앞 윗면 돌리기 빼고) */
  picked: Map<string, string>;
  /** 상황 id → 실물에서 흔한 공식 */
  common: Map<string, string>;
}

export function PracticeApp() {
  const settings = useCubeSettings();
  const [stageId, setStageId] = useState<string>(
    PRACTICE_STAGES[0]?.id as string,
  );
  const stage = stageById(stageId) ?? (PRACTICE_STAGES[0] as never);
  const [mode, setMode] = useState<PracticeMode>("follow");
  const [ready, setReady] = useState(false);
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  const [algBook, setAlgBook] = useState<AlgBook>({});
  const [record, setRecord] = useState<PracticeRecord>({
    follow: {},
    rounds: {},
  });
  const [play, setPlay] = useState<Play | null>(null);
  const [state, setState] = useState<PuzzleState | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [phase, setPhase] = useState<"play" | "pause" | "over">("play");
  const [wrong, setWrong] = useState<{ index: number; token: string } | null>(
    null,
  );
  const [peek, setPeek] = useState(false);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [, bump] = useState(0);
  const { keysOf } = useMoveKeys(PRACTICE_N);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const rec = loadPractice();
    setRecord(rec);
    const want = stageById(q.get("set")) ?? stageById(rec.last);
    if (want) setStageId(want.id);
    if (q.get("mode") === "see") setMode("see");
    setKeymap(loadKeymap());
    setAlgBook(loadAlgBook());
    setReady(true);
    return watchAlgBook(setAlgBook);
  }, []);

  const cases = useMemo(
    () => new Map(stage.cases.map((c) => [c.id, c])),
    [stage],
  );

  const live = useRef({
    play: null as Play | null,
    state: null as PuzzleState | null,
    phase: "play" as "play" | "pause" | "over",
    settings,
    stageId,
  });
  live.current.settings = settings;
  live.current.stageId = stage.id;

  /** 새 판(단계·방식·키 배치가 바뀌면 새 판) */
  const newRound = useCallback(() => {
    if (!keymap) return;
    const algs = new Map<string, string>();
    const common = new Map<string, string>();
    for (const c of stage.cases) {
      const p = pickAlg(c, keymap, algBook);
      algs.set(c.id, p.alg);
      common.set(c.id, p.common);
    }
    const book = mode === "follow" ? loadPractice().follow : loadTrain();
    const problems = drawRound(
      stage.cases.map((c) => c.id),
      {
        seed: randomSeed(),
        algOf: (id) => algs.get(id) as string,
        book,
        auf: stage.auf,
      },
    );
    const round = new PracticeRound(
      problems,
      mode,
      (p) => boardFor(stage, cases.get(p.caseId) as DrillCase, p).tokens,
    );
    const first = problems[0];
    const board = first
      ? boardFor(stage, cases.get(first.caseId) as DrillCase, first)
      : null;
    const next: Play = { round, board, picked: algs, common };
    live.current.play = next;
    live.current.state = board?.start ?? null;
    live.current.phase = "play";
    setPlay(next);
    setState(board?.start ?? null);
    setPhase("play");
    setWrong(null);
    setPeek(false);
    setSummary(null);
    setSyncToken((v) => v + 1);
  }, [keymap, algBook, stage, mode, cases]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계·방식·키 배치가 바뀔 때만 새 판
  useEffect(() => {
    if (!ready) return;
    newRound();
    rememberStage(stage.id);
  }, [ready, stage.id, mode, keymap]);

  const wrongTimer = useRef<number | null>(null);
  const flashWrong = useCallback((index: number, token: string) => {
    setWrong({ index, token });
    if (wrongTimer.current !== null) window.clearTimeout(wrongTimer.current);
    wrongTimer.current = window.setTimeout(() => {
      setWrong(null);
      wrongTimer.current = null;
    }, WRONG_SHOW_MS);
  }, []);

  /** 문제 하나를 끝냈다: 잠깐 다 맞춘 모습을 보인 뒤 다음 문제(또는 판 끝) */
  const advance = useCallback(() => {
    const c = live.current;
    c.phase = "pause";
    setPhase("pause");
    playCubeCue(c.settings, "cubeSolved");
    window.setTimeout(() => {
      const p = c.play;
      if (!p) return;
      if (!p.round.next()) {
        c.phase = "over";
        setPhase("over");
        setSummary(p.round.summary());
        setRecord(recordRound(c.stageId, p.round.mode));
        return;
      }
      const prob = p.round.current;
      const st = stageById(c.stageId);
      if (!prob || !st) return;
      const dc = st.cases.find((x) => x.id === prob.caseId) as DrillCase;
      const board = boardFor(st, dc, prob);
      c.play = { ...p, board };
      c.state = board.start;
      c.phase = "play";
      setPlay(c.play);
      setState(board.start);
      setPhase("play");
      setWrong(null);
      setPeek(false);
      setSyncToken((v) => v + 1);
    }, SOLVED_PAUSE_MS);
  }, []);

  const onMove = useCallback(
    (move: CubeMove) => {
      const c = live.current;
      const p = c.play;
      if (!p?.board || !c.state || c.phase !== "play") return false;
      const now = performance.now();
      const n = PRACTICE_N;
      if (p.round.mode === "follow") {
        const r = p.round.feedFollow(move, now);
        if (!r) return false;
        if (r.step.kind === "miss") {
          const token = p.round.follow?.expected ?? "";
          flashWrong(r.step.index, token);
          if (r.step.undo.length > 0) {
            // 반 바퀴의 반쪽까지 되돌린다(장면은 다시 칠한다)
            c.state = applyMoves(n, c.state, r.step.undo);
            setState(c.state);
            setSyncToken((v) => v + 1);
          }
          bump((x) => x + 1);
          return false;
        }
        c.state = applyMove(n, c.state, move);
        setState(c.state);
        if (r.result) {
          setRecord(
            recordFollow(
              r.result.caseId,
              Math.round(r.result.ms),
              r.result.moves,
              r.result.misses,
            ),
          );
          advance();
        }
        bump((x) => x + 1);
        return true;
      }
      c.state = applyMove(n, c.state, move);
      setState(c.state);
      if (countsAsMove(n, move)) p.round.typedSee(now);
      if (goalMet(n, c.state, p.board.goal)) {
        const res = p.round.solvedSee(now);
        if (res && !res.peeked)
          recordSolve(res.caseId, Math.round(res.ms), res.moves);
        advance();
      }
      bump((x) => x + 1);
      return true;
    },
    [advance, flashWrong],
  );

  const onCommand = useCallback((cmd: Command): CubeMove | null => {
    const c = live.current;
    const p = c.play;
    // 보고 치기만 처음 모양으로 되돌리기를 받는다(따라 치기는 틀린 수가 큐브에 남지 않는다)
    if (!p?.board || p.round.mode !== "see" || c.phase !== "play") return null;
    if (cmd === "reset") {
      c.state = p.board.start;
      setState(c.state);
      setSyncToken((v) => v + 1);
    }
    return null;
  }, []);

  const round = play?.round;
  const prob = round?.current;
  const dc = prob ? cases.get(prob.caseId) : undefined;
  const judge = round?.follow;
  const tokens = play?.board?.tokens ?? [];
  const common = prob ? play?.common.get(prob.caseId) : undefined;
  const showCommon =
    !!common && !!prob && common !== play?.picked.get(prob.caseId);
  const method: PracticeMethod = stage.method;

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4"
        data-practice-stage={stage.id}
        data-practice-mode={mode}
        data-practice-phase={play ? phase : undefined}
        data-practice-index={round && !round.over ? round.index : undefined}
        data-practice-case={prob?.caseId}
        data-practice-answer={prob?.alg}
        data-practice-next={judge?.expected}
        data-practice-combo={round?.combo.current ?? 0}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube/methods"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 해법 익히기
          </a>
          <h1 className="font-bold text-lg">공식 연습</h1>
          <a
            href="/cube/algs"
            className="ml-auto text-sm text-white/70 hover:text-white"
          >
            내 공식
          </a>
        </header>

        <nav className="flex flex-col gap-2" aria-label="단계">
          <div className="flex flex-wrap items-center gap-2">
            {(["beginner", "cfop"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === method}
                data-practice-method={m}
                onClick={(e) => {
                  if (m !== method) setStageId(stagesOf(m)[0]?.id as string);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-lg px-3 py-1 text-sm",
                  m === method
                    ? "bg-white/20 font-semibold"
                    : "bg-white/5 text-white/70 hover:bg-white/10",
                )}
              >
                {METHOD_TITLE[m]}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-white/15" />
            {(["follow", "see"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === mode}
                data-practice-mode-button={m}
                onClick={(e) => {
                  setMode(m);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-lg px-3 py-1 text-sm",
                  m === mode
                    ? "bg-sky-500 font-semibold text-black"
                    : "bg-white/5 text-white/70 hover:bg-white/10",
                )}
              >
                {m === "follow" ? "따라 치기" : "보고 치기"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stagesOf(method).map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === stage.id}
                data-practice-stage-button={s.id}
                onClick={(e) => {
                  setStageId(s.id);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-sm",
                  s.id === stage.id
                    ? "bg-emerald-400 font-semibold text-black"
                    : "bg-white/10 hover:bg-white/15",
                )}
              >
                {s.title}
                <span className="ml-1 text-xs opacity-60">
                  {s.cases.length}
                </span>
              </button>
            ))}
          </div>
        </nav>

        {phase === "over" && summary ? (
          <Summary
            summary={summary}
            nameOf={(id) => cases.get(id)?.name ?? id}
            mode={mode}
            suggest={mode === "follow" && suggestSee(record, stage.id)}
            onAgain={newRound}
            onSee={() => setMode("see")}
            onFollow={() => setMode("follow")}
          />
        ) : (
          round &&
          prob &&
          dc &&
          state && (
            <section className="flex flex-col items-center gap-3">
              <div className="flex w-full max-w-xl items-baseline justify-between gap-3 text-sm">
                <span className="font-mono text-white/70 tabular-nums">
                  {round.index + 1} / {round.problems.length}
                </span>
                <span className="truncate font-semibold" data-practice-name>
                  {dc.name}
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    round.combo.current > 0
                      ? "text-amber-300"
                      : "text-white/40",
                  )}
                >
                  콤보 {round.combo.current}
                </span>
              </div>

              {mode === "follow" ? (
                <div className="flex w-full max-w-xl flex-col items-center gap-1">
                  <ol
                    className="flex flex-wrap justify-center gap-1.5"
                    data-practice-tokens
                  >
                    {tokens.map((t, i) => {
                      const at = judge?.index ?? 0;
                      const done = phase === "pause" || i < at;
                      const now = !done && i === at;
                      const miss = now && wrong?.index === i;
                      return (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                          key={i}
                          data-token-state={
                            miss
                              ? "wrong"
                              : done
                                ? "done"
                                : now
                                  ? "now"
                                  : "next"
                          }
                          className={cn(
                            "flex min-w-10 flex-col items-center rounded-lg px-2 py-1 font-mono font-semibold text-lg transition-colors duration-300",
                            done && "bg-emerald-500/25 text-emerald-100",
                            now && !miss && "bg-white/15 ring-2 ring-sky-300",
                            miss && "bg-red-500/40 ring-2 ring-red-400",
                            !done && !now && "bg-white/5 text-white/60",
                          )}
                        >
                          {t}
                          {miss && (
                            <span data-practice-wrong-keys>
                              {keysOf ? (
                                <KeyCaps
                                  keys={keysOf(t)}
                                  className="text-white"
                                />
                              ) : null}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {showCommon && (
                    <p className="text-white/45 text-xs" data-practice-common>
                      실물에서 흔한 공식{" "}
                      <span className="font-mono">{common}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex min-h-10 w-full max-w-xl flex-col items-center gap-1">
                  {peek || phase === "pause" ? (
                    <p
                      className="flex flex-wrap justify-center gap-1.5 font-mono font-semibold text-lg"
                      data-practice-peek
                    >
                      {tokens.map((t, i) => (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                          key={i}
                          className="rounded-lg bg-white/10 px-2 py-0.5"
                        >
                          {t}
                        </span>
                      ))}
                    </p>
                  ) : (
                    <button
                      type="button"
                      data-practice-peek-button
                      onClick={(e) => {
                        round.peek();
                        setPeek(true);
                        e.currentTarget.blur();
                      }}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
                    >
                      공식 보기
                    </button>
                  )}
                </div>
              )}

              <CubePlay
                n={PRACTICE_N}
                state={state}
                mask={play?.board?.mask ?? null}
                syncToken={syncToken}
                settings={settings}
                onMove={onMove}
                onCommand={onCommand}
                locked={phase !== "play"}
                hideKeys
              />
            </section>
          )
        )}

        <details className="text-sm text-white/70" data-practice-more>
          <summary className="cursor-pointer select-none">더 보기</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MORE_SETS.map((s) => (
              <a
                key={s}
                href={`/cube/train?mode=free&set=${s}`}
                className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/15"
              >
                {MORE_TITLE.get(s)}
              </a>
            ))}
            <a
              href="/cube/train?mode=free"
              className="rounded-full bg-white/10 px-3 py-1 hover:bg-white/15"
            >
              자유 훈련
            </a>
          </div>
        </details>
      </main>
    </div>
  );
}

function Summary({
  summary,
  nameOf,
  mode,
  suggest,
  onAgain,
  onSee,
  onFollow,
}: {
  summary: RoundSummary;
  nameOf: (id: string) => string;
  mode: PracticeMode;
  suggest: boolean;
  onAgain: () => void;
  onSee: () => void;
  onFollow: () => void;
}) {
  return (
    <section
      className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-2xl bg-white/5 p-5"
      data-practice-summary
    >
      <h2 className="font-bold text-lg">한 판 끝</h2>
      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Stat
          label="정확도"
          value={`${Math.round(summary.accuracy * 100)}%`}
          data="accuracy"
        />
        <Stat label="평균 시간" value={formatMs(summary.avgMs)} data="avg" />
        <Stat
          label="1분에 친 수"
          value={String(Math.round(summary.perMinute))}
          data="per-minute"
        />
        <Stat
          label="가장 긴 콤보"
          value={String(summary.bestCombo)}
          data="combo"
        />
      </dl>
      {summary.slow.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm text-white/60">느렸던 공식</h3>
          <ol className="flex flex-col gap-1 text-sm" data-practice-slow>
            {summary.slow.map((s) => (
              <li key={s.caseId} className="flex justify-between gap-3">
                <span className="truncate">{nameOf(s.caseId)}</span>
                <span className="font-mono tabular-nums">{formatMs(s.ms)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-practice-again
          onClick={onAgain}
          className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-black"
        >
          한 판 더
        </button>
        {suggest && (
          <button
            type="button"
            data-practice-suggest-see
            onClick={onSee}
            className="rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-black"
          >
            외워서 쳐 보기
          </button>
        )}
        {mode === "see" && (
          <button
            type="button"
            onClick={onFollow}
            className="rounded-lg bg-white/10 px-4 py-2"
          >
            따라 치기로
          </button>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  data,
}: {
  label: string;
  value: string;
  data: string;
}) {
  return (
    <div className="rounded-lg bg-white/5 py-2" data-stat={data}>
      <dt className="text-white/50 text-xs">{label}</dt>
      <dd className="font-mono text-lg tabular-nums">{value}</dd>
    </div>
  );
}
