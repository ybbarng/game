"use client";

import { applyMove, type CubeMove, invertMove } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { fitsStart } from "../algs/check";
import { caseOfAlg, loadAlgBook, usedAlg } from "../algs/store";
import type { Command } from "../input";
import {
  algTokens,
  courseById,
  GOALS,
  type Lesson,
  type LessonStep,
} from "../learn";
import {
  countsAsMove,
  goalMet,
  maskFor,
  stepIsRandom,
  stepStart,
} from "../learn/judge";
import type { HintPlan, TaughtHint } from "../learn/taught-hint";
import { BEGINNER_COURSE_ID, taughtHintKind } from "../learn/taught-kind";
import type { CubeSettings } from "../settings";
import { CubePlay, playCubeCue } from "./CubePlay";
import { MoveChip, useMoveKeys } from "./MoveChip";
import { StageProgress } from "./StageStrip";

type HintModule = typeof import("../learn/taught-hint");

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
  // 모범 답이 없는 3×3 초보자 해 보기·마무리: 두 단계 힌트(1 = 지금 경우, 2 = 다음 수). 계산은 필요할 때 불러온다
  const taught = useMemo(() => taughtHintKind(lesson, step), [lesson, step]);
  const [hintMod, setHintMod] = useState<HintModule | null>(null);
  useEffect(() => {
    if (!taught) return;
    let live = true;
    import("../learn/taught-hint").then((m) => live && setHintMod(m));
    return () => {
      live = false;
    };
  }, [taught]);
  const beginner = taught === "finale" ? courseById(BEGINNER_COURSE_ID) : null;
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  const planRef = useRef<HintPlan | null>(null);
  const taughtHint = useMemo((): TaughtHint | null | undefined => {
    if (!hintMod || !taught) return undefined;
    const prev = planRef.current;
    return taught === "finale"
      ? hintMod.finaleHint(state, prev)
      : hintMod.nextHint(taught, state, prev);
  }, [hintMod, taught, state]);
  // 계획을 이어 쓰고, 다음 경우(토막)로 넘어가면 힌트를 접는다(스스로 다음 경우를 보게)
  const segKey = taughtHint
    ? `${taughtHint.plan.keys[0]}:${taughtHint.segment}`
    : "";
  const lastSeg = useRef(segKey);
  useEffect(() => {
    if (taughtHint) planRef.current = taughtHint.plan;
    if (lastSeg.current !== segKey) {
      lastSeg.current = segKey;
      setLevel(0);
    }
  }, [taughtHint, segKey]);
  const reached = useMemo(() => {
    if (!hintMod || taught !== "finale") return null;
    const fromGoals = hintMod.finaleReached(state);
    // 힌트 계획대로 공식을 치는 도중(앞 단계가 잠깐 흐트러짐)에는 계획의 단계를 보인다
    const onPlan = taughtHint
      ? hintMod.BEGINNER_TAUGHT.indexOf(taughtHint.stage)
      : -1;
    return Math.max(fromGoals, onPlan);
  }, [hintMod, taught, state, taughtHint]);
  // 모범 답이 공식 모음의 상황이고 쓰는 공식을 바꿔 뒀으면 힌트 옆에 내 공식도 보인다.
  // 내 공식의 앞 윗면 돌리기는 공식 모음의 쥔 방향 기준이라 단원 상황과 어긋날 수 있다:
  // 지금 단원 상황에 그대로 해 봐서 목표가 될 때만 보인다
  const [mine, setMine] = useState<string | null>(null);
  useEffect(() => {
    const c = step.alg ? caseOfAlg(step.alg) : undefined;
    const used = c ? usedAlg(loadAlgBook(), c) : null;
    setMine(
      c && used && used !== c.algs[0] && fitsStart(n, start, used, goal)
        ? used
        : null,
    );
  }, [step.alg, n, start, goal]);

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
      setLevel(0);
      planRef.current = null;
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
  // 힌트로 연 마지막 수의 키를 키 그림에서 밝힌다(통과하면 끈다)
  const { keysOf } = useMoveKeys(n);
  const hinted = passed
    ? undefined
    : taught
      ? level >= 2
        ? taughtHint?.move
        : undefined
      : hints > 0
        ? answer[hints - 1]
        : undefined;
  const want = hinted && keysOf ? keysOf(hinted) : null;
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

      {taught === "finale" && reached !== null && beginner && (
        <StageProgress
          course={beginner}
          reached={passed ? (beginner.stages?.length ?? 7) : reached}
          upTo={2}
        />
      )}
      <div className="flex flex-wrap justify-center gap-1.5 text-sm">
        {taught && !passed && (
          <>
            <button
              type="button"
              data-cube-hint-case
              aria-pressed={level >= 1}
              disabled={taughtHint === undefined}
              onClick={(e) => {
                setLevel((l) => (l >= 1 ? l : 1));
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 font-semibold transition active:scale-[0.97] disabled:opacity-40",
                level >= 1
                  ? "bg-amber-400/25 text-amber-100"
                  : "bg-amber-400/90 text-black",
              )}
            >
              힌트 1 · 지금 경우
            </button>
            <button
              type="button"
              data-cube-hint-move
              aria-pressed={level >= 2}
              disabled={taughtHint === undefined}
              onClick={(e) => {
                setLevel(2);
                e.currentTarget.blur();
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 font-semibold transition active:scale-[0.97] disabled:opacity-40",
                level >= 2
                  ? "bg-amber-400/25 text-amber-100"
                  : level === 1
                    ? "bg-amber-400/90 text-black"
                    : "bg-white/10 text-white/80 hover:bg-white/15",
              )}
            >
              힌트 2 · 다음 수
            </button>
          </>
        )}
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
              <MoveChip
                notation={t}
                keysOf={i === hints - 1 ? keysOf : null}
                link
              />
            </span>
          ))}
          {hints < answer.length && <span className="text-white/40">…</span>}
        </p>
      )}
      {hints > 0 && mine && (
        <p
          className="flex flex-wrap justify-center gap-1 text-sm"
          data-cube-hint-mine
        >
          <span className="text-white/60 text-xs">내 공식:</span>
          <span className="font-mono">{mine}</span>
        </p>
      )}
      {taught && !passed && level >= 1 && (
        <div
          className="flex min-h-14 w-full max-w-md flex-col items-center gap-1.5 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-center cube-rise"
          data-cube-taught-hint
        >
          {taughtHint ? (
            <>
              <p
                className="break-keep font-semibold text-amber-100 text-sm"
                data-cube-taught-case={taughtHint.label}
              >
                {taughtHint.label}
              </p>
              {level >= 2 ? (
                <p className="flex items-center gap-1.5 text-sm">
                  <span className="text-white/60 text-xs">다음 수</span>
                  <span
                    data-cube-hint={taughtHint.move}
                    className="rounded bg-amber-400 px-1.5 font-mono text-black"
                  >
                    <MoveChip notation={taughtHint.move} keysOf={keysOf} link />
                  </span>
                </p>
              ) : (
                <p className="text-white/50 text-xs">
                  막히면 「힌트 2」로 다음 수를 봐요.
                </p>
              )}
            </>
          ) : (
            <p
              className="break-keep text-sm text-white/70"
              data-cube-taught-stuck
            >
              지금 모양은 이 단원 방식으로 바로 이어 갈 수 없어요. 하던 수를
              되돌리거나 「처음 상황으로」를 눌러요.
            </p>
          )}
        </div>
      )}
      {answer.length === 0 && !taught && (
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
        want={want}
      />
    </div>
  );
}
