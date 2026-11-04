"use client";

import { isRotation, parseMoves, solvedCube } from "@game/cube-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";
import { presetKeymap } from "../input";
import { keysForMove } from "../keys/move-keys";
import { TWO_HAND_RULE, TWO_HAND_RULES } from "../keys/two-hand";
import {
  algTokens,
  FINGER_DRILLS,
  FINGER_INTRO,
  FINGER_NOTATION,
  type FingerDrill,
  type FingerToken,
} from "../learn";
import { fingerQuiz } from "../learn/interact";
import { useCubeSettings } from "../settings";
import { DemoCube } from "./DemoCube";
import { KeyCaps } from "./MoveChip";
import { useNoKeyboard } from "./PracticeCube";

/** 핑거 트릭 옆의 「두 손」 키(실물 손가락을 옮긴 배치, `keys/two-hand.ts`). 사용자 배치와 상관없이 두 손 배치로 보인다 */
const TWO_HAND = presetKeymap("twoHand");

/**
 * 핑거 트릭(`/cube/fingers`, docs/47 8-3). 실물 큐브를 들고 하는 연습.
 * 공식과 수마다 손가락 표기를 보여 주고, 가상 큐브가 정한 빠르기로 시연한다.
 * 반복 횟수를 정하고 Space로 한 번씩 표시하면 반복마다 시간·초당 수를 남긴다. 박자 소리(메트로놈)를 켤 수 있다.
 */

const SOLVED3 = solvedCube(3);

function moveCount(alg: string): number {
  return parseMoves(3, alg).filter((m) => !isRotation(3, m)).length;
}

type Phase = "idle" | "running" | "done";

export function FingersApp() {
  const settings = useCubeSettings();
  const [drillId, setDrillId] = useState(FINGER_DRILLS[0]?.id ?? "");
  const drill =
    FINGER_DRILLS.find((d) => d.id === drillId) ??
    (FINGER_DRILLS[0] as FingerDrill);
  const [tps, setTps] = useState(2);
  const [reps, setReps] = useState(drill.reps);
  const [metronome, setMetronome] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [laps, setLaps] = useState<number[]>([]);
  const lastMark = useRef(0);

  const tokens = useMemo(() => algTokens(drill.alg), [drill.alg]);
  const fingers = useMemo(() => drill.fingers.split(/\s+/), [drill.fingers]);
  const moves = useMemo(() => moveCount(drill.alg), [drill.alg]);
  const noKeyboard = useNoKeyboard();

  const reset = useCallback(() => {
    setPhase("idle");
    setLaps([]);
  }, []);

  useEffect(() => {
    setReps(drill.reps);
    reset();
  }, [drill, reset]);

  const live = useRef({ phase, laps, reps });
  live.current = { phase, laps, reps };

  /** Space 한 번: 처음이면 시작, 그다음부터 반복 하나 끝 */
  const mark = useCallback(() => {
    const c = live.current;
    const now = performance.now();
    if (c.phase === "done") return;
    if (c.phase === "idle") {
      lastMark.current = now;
      setPhase("running");
      return;
    }
    const lap = now - lastMark.current;
    lastMark.current = now;
    const next = [...c.laps, lap];
    setLaps(next);
    if (next.length >= c.reps) setPhase("done");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT")) return;
      e.preventDefault();
      mark();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mark]);

  // 메트로놈: 한 수에 한 박, 공식 첫 수에 센 박
  useEffect(() => {
    if (!metronome) return;
    let beat = 0;
    // 박자 소리는 따로 켜고 끄므로 큐브 소리 설정과 상관없이 낸다(전체 음량은 따른다)
    const id = window.setInterval(() => {
      play(beat % Math.max(1, moves) === 0 ? "cubeBeatAccent" : "cubeBeat");
      beat++;
    }, 1000 / tps);
    return () => window.clearInterval(id);
  }, [metronome, tps, moves]);

  const tpsOf = (ms: number) => moves / (ms / 1000);
  const best = laps.length > 0 ? Math.max(...laps.map(tpsOf)) : 0;
  const avgMs =
    laps.length > 0 ? laps.reduce((a, b) => a + b, 0) / laps.length : 0;

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-fingers={drill.id}
        data-fingers-phase={phase}
      >
        <header className="flex flex-wrap items-center gap-3">
          <a
            href="/cube"
            className="-ml-1 inline-flex min-h-8 items-center px-1 text-sm text-white/70 hover:text-white"
          >
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">핑거 트릭</h1>
        </header>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <nav className="flex flex-col gap-1" aria-label="손가락 연습">
            {FINGER_DRILLS.map((d) => (
              <button
                key={d.id}
                type="button"
                data-drill={d.id}
                aria-current={d.id === drillId ? "true" : undefined}
                onClick={(e) => {
                  setDrillId(d.id);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-lg px-3 py-2 text-left text-sm",
                  d.id === drillId
                    ? "bg-sky-500 font-semibold text-black"
                    : "bg-white/5 hover:bg-white/10",
                )}
              >
                {d.title}
                <span className="block font-mono text-[11px] opacity-70">
                  {d.alg}
                </span>
              </button>
            ))}
            <GripChecklist />
            <details className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
              <summary className="cursor-pointer">손가락 표기 모음</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-white/70">
                {Object.entries(FINGER_NOTATION).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-mono text-amber-200">{k}</dt>
                    <dd className="break-keep">{v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </nav>

          <section className="flex flex-col gap-3">
            <p className="break-keep text-sm text-white/80">{drill.note}</p>
            {!noKeyboard && (
              <p
                className="break-keep text-white/55 text-xs"
                data-fingers-keys-note
              >
                칸 아래 키는 「두 손」 배치에서 같은 수를 치는 키예요.{" "}
                {TWO_HAND_RULE}
              </p>
            )}
            <ol className="flex flex-wrap gap-1.5">
              {tokens.map((t, i) => {
                const f = fingers[i] as FingerToken | undefined;
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                    key={i}
                    className="flex min-w-14 flex-col items-center rounded-lg bg-white/10 px-2 py-1"
                  >
                    <span className="font-mono font-semibold">{t}</span>
                    {f && (
                      <span
                        className="text-[11px] text-amber-200"
                        title={FINGER_NOTATION[f]}
                      >
                        {f}
                      </span>
                    )}
                    {f && (
                      <span className="max-w-28 break-keep text-center text-[10px] leading-tight text-white/55">
                        {FINGER_NOTATION[f]?.split("(")[0]}
                      </span>
                    )}
                    {!noKeyboard && (
                      <span
                        className="mt-0.5 flex items-center gap-1 text-[10px] text-sky-200"
                        data-fingers-key={t}
                        title={
                          TWO_HAND_RULES.find((r) => r.move === t)?.finger ??
                          undefined
                        }
                      >
                        <span className="opacity-70">두 손</span>
                        <KeyCaps keys={keysForMove(TWO_HAND, 3, t)} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            <FingerQuiz key={drill.id} tokens={tokens} fingers={fingers} />

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                빠르기
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={tps}
                  onChange={(e) => setTps(Number(e.target.value))}
                />
                <span className="w-16 font-mono">초당 {tps}수</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-sky-400"
                  checked={metronome}
                  onChange={(e) => setMetronome(e.target.checked)}
                />
                박자 소리
              </label>
              <label className="flex items-center gap-2">
                반복
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={reps}
                  data-fingers-reps
                  onChange={(e) => {
                    setReps(
                      Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                    );
                    reset();
                  }}
                  className="w-16 rounded bg-white/10 px-2 py-1"
                />
                번
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DemoCube
                key={`${drill.id}-${tps}`}
                n={3}
                start={SOLVED3}
                alg={drill.alg}
                mask={null}
                settings={settings}
                tps={tps}
                autoPlay
                loop
                showKeys={false}
                labels={fingers}
              />

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-fingers-mark
                    onClick={(e) => {
                      mark();
                      e.currentTarget.blur();
                    }}
                    disabled={phase === "done"}
                    className="rounded-lg bg-sky-500 px-4 py-2 font-semibold text-black disabled:opacity-40"
                  >
                    {phase === "idle" ? "시작(Space)" : "한 번 끝(Space)"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      reset();
                      e.currentTarget.blur();
                    }}
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm"
                  >
                    다시
                  </button>
                  <span className="text-sm text-white/70" data-fingers-count>
                    {laps.length}/{reps}
                  </span>
                </div>
                <p className="text-white/50 text-xs">한 번 {moves}수</p>
                {laps.length > 0 && (
                  <>
                    <LapChart laps={laps} tpsOf={tpsOf} reps={reps} />
                    <p className="text-sm">
                      평균 {(avgMs / 1000).toFixed(2)}초 · 초당{" "}
                      {tpsOf(avgMs).toFixed(2)}수 · 가장 빠름 초당{" "}
                      {best.toFixed(2)}수
                    </p>
                    <ol
                      data-fingers-laps
                      className="grid max-h-56 grid-cols-[auto_1fr_1fr] gap-x-4 overflow-y-auto font-mono text-xs"
                    >
                      {laps.map((ms, i) => (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: 반복 차례가 곧 열쇠다
                          key={i}
                          className="contents"
                        >
                          <span className="text-white/50">{i + 1}</span>
                          <span>{(ms / 1000).toFixed(2)}초</span>
                          <span>초당 {tpsOf(ms).toFixed(2)}수</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                {phase === "done" && (
                  <p role="status" className="font-semibold text-emerald-300">
                    {reps}번 끝
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/** 쥐는 법: 실물 큐브로 한 줄씩 따라 하고 「따라 했어요」를 누른다 */
function GripChecklist() {
  const [done, setDone] = useState<number[]>([]);
  return (
    <section
      className="mt-2 flex flex-col gap-1.5 rounded-lg bg-white/5 p-2 text-xs"
      data-fingers-grip={done.length}
    >
      <h2 className="font-semibold text-sm">
        쥐는 법 따라 하기 {done.length}/{FINGER_INTRO.length}
      </h2>
      <ol className="flex flex-col gap-1.5">
        {FINGER_INTRO.map((t, i) => {
          const on = done.includes(i);
          return (
            <li key={t} className="flex flex-col gap-1">
              <span
                className={cn(
                  "break-keep",
                  on ? "text-white/50" : "text-white/80",
                )}
              >
                {i + 1}. {t}
              </span>
              <button
                type="button"
                aria-pressed={on}
                onClick={(e) => {
                  setDone((d) => (on ? d.filter((x) => x !== i) : [...d, i]));
                  e.currentTarget.blur();
                }}
                className={cn(
                  "min-h-8 self-start rounded-md px-3 py-1",
                  on
                    ? "bg-emerald-500/70 text-black"
                    : "bg-white/10 hover:bg-white/15",
                )}
              >
                {on ? "✓ 따라 했어요" : "따라 했어요"}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** 손가락 맞히기: 공식의 수마다 어느 손가락으로 돌리는지 셋 중에서 고른다 */
function FingerQuiz({
  tokens,
  fingers,
}: {
  tokens: readonly string[];
  fingers: readonly string[];
}) {
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<FingerToken | null>(null);
  const [score, setScore] = useState(0);
  const q = useMemo(
    () => fingerQuiz(tokens, fingers, round),
    [tokens, fingers, round],
  );
  const right = picked === q.answer;
  return (
    <div
      className="flex flex-col gap-2 rounded-xl bg-black/25 p-3"
      data-fingers-quiz={q.index}
    >
      <p className="text-sm">
        손가락 맞히기 ({score}개 맞힘): <b className="font-mono">{q.move}</b>
        {` 는 어느 손가락으로 돌릴까요?`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {q.choices.map((c) => (
          <button
            key={c}
            type="button"
            data-choice={c}
            onClick={(e) => {
              e.currentTarget.blur();
              if (right) return;
              setPicked(c);
              if (c === q.answer) setScore((s) => s + 1);
            }}
            className={cn(
              "break-keep rounded-lg px-3 py-1.5 text-left text-xs",
              picked === c
                ? c === q.answer
                  ? "bg-emerald-500/30"
                  : "bg-red-500/30"
                : "bg-white/5 hover:bg-white/10",
            )}
          >
            <span className="font-mono text-amber-200">{c}</span>{" "}
            {FINGER_NOTATION[c]?.split("(")[0]}
          </button>
        ))}
      </div>
      {picked && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-xs">
          {right
            ? "맞아요! 실물로도 한 번 돌려 보세요."
            : "아쉬워요. 다시 골라 보세요."}
          {right && (
            <button
              type="button"
              data-fingers-quiz-next
              onClick={(e) => {
                setRound((r) => r + 1);
                setPicked(null);
                e.currentTarget.blur();
              }}
              className="rounded-md bg-sky-500 px-2 py-0.5 font-semibold text-black"
            >
              다음 수 →
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** 반복마다 초당 수 막대 그래프(핑거 트릭·공식 따라 치기) */
export function LapChart({
  laps,
  tpsOf,
  reps,
}: {
  laps: number[];
  tpsOf: (ms: number) => number;
  reps: number;
}) {
  const values = laps.map(tpsOf);
  const max = Math.max(1, ...values);
  return (
    <div
      className="flex h-28 items-stretch gap-1 rounded-lg bg-white/5 p-2"
      role="img"
      aria-label={`반복마다 초당 수: ${values.map((v) => v.toFixed(1)).join(", ")}`}
    >
      {Array.from({ length: reps }, (_, i) => {
        const v = values[i];
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 반복 차례
            key={i}
            className="flex flex-1 flex-col items-center justify-end gap-0.5"
          >
            {v !== undefined && (
              <span className="text-[9px] text-white/60">{v.toFixed(1)}</span>
            )}
            <div
              className={cn(
                "w-full rounded-t",
                v === undefined ? "bg-white/5" : "bg-sky-400",
              )}
              style={{ height: v === undefined ? 4 : `${(v / max) * 80}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
