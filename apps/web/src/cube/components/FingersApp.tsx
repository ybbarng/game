"use client";

import { isRotation, parseMoves, solvedCube } from "@game/cube-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { play } from "@/game/sound";
import { cn } from "@/lib/cn";
import {
  algTokens,
  FINGER_DRILLS,
  FINGER_INTRO,
  FINGER_NOTATION,
  type FingerDrill,
  type FingerToken,
} from "../learn";
import { useCubeSettings } from "../settings";
import { DemoCube } from "./DemoCube";

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
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
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
            <details className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
              <summary className="cursor-pointer">쥐는 법·표기</summary>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-white/70">
                {FINGER_INTRO.map((t) => (
                  <li key={t} className="break-keep">
                    {t}
                  </li>
                ))}
              </ul>
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
                  </li>
                );
              })}
            </ol>

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
