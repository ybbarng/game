"use client";

import type { CubeMove } from "@game/cube-engine";
import { realClock } from "@game/fair-play/clock";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { type AlgBook, loadAlgBook, watchAlgBook } from "../algs/store";
import type { Command } from "../input";
import type { Keymap } from "../input/keymaps";
import { loadKeymap } from "../input/storage";
import { ALG_SETS } from "../learn/alg-sets";
import { PRACTICE_N } from "../practice/problem";
import type { PracticeMode, RoundSummary } from "../practice/round";
import { PracticeSession } from "../practice/session";
import {
  METHOD_TITLE,
  MORE_SETS,
  PRACTICE_METHODS,
  PRACTICE_STAGES,
  stageById,
  stagesOf,
} from "../practice/stages";
import { loadPractice } from "../practice/store";
import type { PracticeMethod } from "../practice/types";
import { formatMs } from "../records";
import { useCubeSettings } from "../settings";
import { CubePlay, playCubeCue } from "./CubePlay";
import { KeyCaps, useMoveKeys } from "./MoveChip";

/**
 * 공식 연습(`/cube/train`, docs/47 16-9). 타자 연습의 짧은 글 연습처럼 한 판 10문제가 끊김 없이 이어진다.
 * - 따라 치기: 공식 글자는 보이고 키는 숨긴다. 틀린 수는 큐브에 넣지 않고 그 한 수의 키만 잠깐 보인다
 * - 보고 치기: 모양만 보고 친다. 「공식 보기」를 누르면 공식이 보인다. 결과 모양으로 채점한다
 * 출제·판정·시간·기록은 Cubie와 같은 진행기(`practice/session.ts`)가 맡고, 이 화면은 그 상태를 그리기만 한다.
 */

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const MORE_TITLE = new Map(ALG_SETS.map((s) => [s.set, s.title]));

export function PracticeApp() {
  const settings = useCubeSettings();
  const [stageId, setStageId] = useState<string>(
    PRACTICE_STAGES[0]?.id as string,
  );
  const stage = stageById(stageId) ?? (PRACTICE_STAGES[0] as never);
  const [mode, setMode] = useState<PracticeMode>("follow");
  const [ready, setReady] = useState(false);
  const [keymap, setKeymap] = useState<Keymap | null>(null);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [, bump] = useState(0);
  const { keysOf } = useMoveKeys(PRACTICE_N);

  const algBook = useRef<AlgBook>({});
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const live = useRef<PracticeSession | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const want = stageById(q.get("set")) ?? stageById(loadPractice().last);
    if (want) setStageId(want.id);
    if (q.get("mode") === "see") setMode("see");
    setKeymap(loadKeymap());
    algBook.current = loadAlgBook();
    setReady(true);
    return watchAlgBook((b) => {
      algBook.current = b;
    });
  }, []);

  /** 새 판. 「한 판 더」도 새 진행기를 만들어 그사이 바뀐 내 공식을 반영한다 */
  const newRound = useCallback(() => {
    if (!keymap) return;
    live.current?.dispose();
    const s = new PracticeSession({
      stage,
      mode,
      keymap,
      algBook: algBook.current,
      clock: realClock,
      seed: randomSeed,
      onChange: () => bump((x) => x + 1),
      onRepaint: () => setSyncToken((v) => v + 1),
      // 틀린 수의 소리는 CubePlay가 낸다(onMove가 false)
      onCue: (cue) => {
        if (cue === "solved") playCubeCue(settingsRef.current, "cubeSolved");
      },
    });
    live.current = s;
    setSession(s);
    setSyncToken((v) => v + 1);
  }, [keymap, stage, mode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계·방식·키 배치가 바뀔 때만 새 판
  useEffect(() => {
    if (!ready) return;
    newRound();
  }, [ready, stage.id, mode, keymap]);

  useEffect(() => () => live.current?.dispose(), []);

  const onMove = useCallback(
    (move: CubeMove) => live.current?.input(move) === "applied",
    [],
  );

  const onCommand = useCallback((cmd: Command): CubeMove | null => {
    // 보고 치기만 처음 모양으로 되돌리기를 받는다(따라 치기는 틀린 수가 큐브에 남지 않는다)
    if (cmd === "reset") live.current?.reset();
    return null;
  }, []);

  const round = session?.round;
  const prob = round?.current;
  const dc = session?.current;
  const judge = round?.follow;
  const tokens = session?.tokens ?? [];
  const common = session?.commonAlg ?? null;
  const phase = session?.phase ?? "play";
  const wrong = session?.wrong ?? null;
  const peek = session?.peeked ?? false;
  const summary: RoundSummary | null = session?.summary ?? null;
  const state = session?.state ?? null;
  const method: PracticeMethod = stage.method;
  const nameOf = (id: string) => session?.caseOf(id)?.name ?? id;

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4"
        data-practice-stage={stage.id}
        data-practice-mode={mode}
        data-practice-phase={session ? phase : undefined}
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
            {PRACTICE_METHODS.map((m) => (
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
            nameOf={nameOf}
            mode={mode}
            suggest={session?.suggestSee ?? false}
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
                  {common && (
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
                        session?.peek();
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
                mask={session?.board?.mask ?? null}
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
