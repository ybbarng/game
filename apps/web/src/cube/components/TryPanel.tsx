"use client";

import { applyMove, type CubeMove, invertMove } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import type { Command } from "../input";
import { algTokens, GOALS, type Lesson, type LessonStep } from "../learn";
import {
  countsAsMove,
  goalMet,
  maskFor,
  stepIsRandom,
  stepStart,
} from "../learn/judge";
import type { CubeSettings } from "../settings";
import { CubePlay, playCubeCue } from "./CubePlay";

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] as number;
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

/**
 * 단원의 「직접 해보기」(docs/47 8-1). 정해진 상황에서 목표 모양을 만들면 통과.
 * 채점은 결과 모양(GOALS)으로 하므로 모범 답과 다른 공식으로 풀어도 된다. 힌트는 모범 답을 한 수씩 연다.
 */
export function TryPanel({
  lesson,
  step,
  masked,
  settings,
  onPassed,
}: {
  lesson: Lesson;
  step: LessonStep;
  /** 「가리기」를 골랐다(단계에 마스크가 있을 때만 가린다) */
  masked: boolean;
  settings: CubeSettings;
  onPassed: () => void;
}) {
  const n = lesson.size;
  const random = stepIsRandom(step);
  const [seed, setSeed] = useState(() => (random ? randomSeed() : 1));
  const start = useMemo(
    () => stepStart(lesson, step, seed),
    [lesson, step, seed],
  );
  const [state, setState] = useState<PuzzleState>(start);
  const [history, setHistory] = useState<CubeMove[]>([]);
  const [passed, setPassed] = useState(false);
  const [hints, setHints] = useState(0);
  const [syncToken, setSyncToken] = useState(0);
  const mask = masked ? maskFor(n, step.mask) : null;
  const goal = step.goal ?? "solved";
  const answer = useMemo(() => algTokens(step.alg ?? ""), [step.alg]);

  // 가리기를 바꾸면 장면을 다시 칠한다
  // biome-ignore lint/correctness/useExhaustiveDependencies: masked가 바뀔 때만
  useEffect(() => setSyncToken((t) => t + 1), [masked]);

  const live = useRef({ state, history, passed, settings, onPassed });
  live.current = { state, history, passed, settings, onPassed };

  const restart = useCallback(
    (nextSeed?: number) => {
      const s =
        nextSeed === undefined ? start : stepStart(lesson, step, nextSeed);
      if (nextSeed !== undefined) setSeed(nextSeed);
      live.current.state = s;
      setState(s);
      live.current.history = [];
      setHistory([]);
      setPassed(false);
      setHints(0);
      setSyncToken((t) => t + 1);
    },
    [start, lesson, step],
  );

  const onMove = useCallback(
    (move: CubeMove) => {
      const c = live.current;
      const next = applyMove(n, c.state, move);
      c.state = next;
      setState(next);
      c.history = [...c.history, move];
      setHistory(c.history);
      if (!c.passed && goalMet(n, next, goal)) {
        c.passed = true;
        setPassed(true);
        playCubeCue(c.settings, "cubeSolved");
        c.onPassed();
      }
      return true;
    },
    [n, goal],
  );

  const onCommand = useCallback(
    (cmd: Command): CubeMove | null => {
      const c = live.current;
      if (cmd === "undo") {
        const lastMove = c.history.at(-1);
        if (!lastMove) return null;
        const back = invertMove(lastMove);
        c.state = applyMove(n, c.state, back);
        setState(c.state);
        c.history = c.history.slice(0, -1);
        setHistory(c.history);
        return back;
      }
      if (cmd === "reset") restart();
      else if (cmd === "scramble") restart(random ? randomSeed() : undefined);
      return null;
    },
    [n, restart, random],
  );

  const faceMoves = history.filter((m) => countsAsMove(n, m)).length;
  return (
    <div
      className="flex flex-col items-center gap-2"
      data-cube-try
      data-cube-passed={passed ? "" : undefined}
    >
      <p className="text-sm text-white/70">
        목표: <b className="text-white">{GOALS[goal]}</b>
      </p>
      <div className="flex min-h-9 flex-wrap items-center justify-center gap-2">
        {passed ? (
          <span
            role="status"
            data-cube-pass
            className="rounded-full border border-emerald-400/50 bg-emerald-400/15 px-4 py-1 font-bold text-emerald-300"
          >
            통과! ({faceMoves}수)
          </span>
        ) : (
          <span className="text-white/60 text-xs">수 {faceMoves}</span>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 text-sm">
        {answer.length > 0 && (
          <button
            type="button"
            data-cube-hint-button
            disabled={hints >= answer.length}
            onClick={(e) => {
              setHints((h) => Math.min(answer.length, h + 1));
              e.currentTarget.blur();
            }}
            className="rounded-lg bg-amber-400/90 px-3 py-1.5 font-semibold text-black disabled:opacity-40"
          >
            힌트(다음 수)
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            restart();
            e.currentTarget.blur();
          }}
          className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
        >
          처음 상황으로(Esc)
        </button>
        {random && (
          <button
            type="button"
            data-cube-next-situation
            onClick={(e) => {
              restart(randomSeed());
              e.currentTarget.blur();
            }}
            className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
          >
            다른 상황(Enter)
          </button>
        )}
      </div>
      {hints > 0 && (
        <p className="flex flex-wrap justify-center gap-1 font-mono text-sm">
          <span className="font-sans text-white/60 text-xs">모범 답:</span>
          {answer.slice(0, hints).map((t, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
              key={`${i}-${t}`}
              data-cube-hint={i === hints - 1 ? t : undefined}
              className={cn(
                "rounded px-1.5",
                i === hints - 1 ? "bg-amber-400 text-black" : "bg-white/10",
              )}
            >
              {t}
            </span>
          ))}
          {hints < answer.length && <span className="text-white/40">…</span>}
        </p>
      )}
      {answer.length === 0 && (
        <p className="text-white/50 text-xs">정해진 모범 답 없음</p>
      )}

      <CubePlay
        n={n}
        state={state}
        mask={mask}
        syncToken={syncToken}
        settings={settings}
        onMove={onMove}
        onCommand={onCommand}
      />
    </div>
  );
}
