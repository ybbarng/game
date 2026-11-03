"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import type { Command } from "../input/actions";
import { chordsFor, type KeyChord } from "../input/keymaps";
import {
  describeInput,
  keyTextFor,
  loadLearn,
  pressesFor,
  StepRun,
  type StepRun as StepRunT,
  saveLearn,
  TUTORIAL_N,
  type TutorialTarget,
  targetLabel,
  tutorialSteps,
} from "../keys";
import { useCubeSettings } from "../settings";
import { KeyboardMap } from "./KeyboardMap";
import { KeysHeader, useKeymap } from "./KeysApp";
import {
  LiveCube,
  type PracticeCube,
  type PracticeKey,
  usePracticeCube,
  usePracticeKeys,
} from "./PracticeCube";

/**
 * 키 익히기 튜토리얼(`/cube/keys/learn`, docs/47 4절). 단계마다 설명 → 키보드 그림에서 칠 키가 빛남 → 직접 쳐서
 * 맞으면 다음. 틀리면 친 키가 무슨 동작이었는지 알린다. 문구의 키는 지금 배치에서 읽는다. 진도는 이 기기에 남는다.
 */

type Feedback =
  | { kind: "ok"; text: string }
  | { kind: "miss"; text: string }
  | null;

export function KeyLearnApp() {
  const keymap = useKeymap();
  const settings = useCubeSettings();
  const steps = useMemo(() => (keymap ? tutorialSteps(keymap) : []), [keymap]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [, bump] = useState(0);
  const cube = usePracticeCube(TUTORIAL_N, settings);

  useEffect(() => {
    const p = loadLearn();
    setDone(p.done);
  }, []);

  // 처음 열면 아직 안 마친 첫 단계로
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || steps.length === 0) return;
    opened.current = true;
    const first = steps.findIndex((s) => !done.includes(s.id));
    if (first > 0) setIndex(first);
  }, [steps, done]);

  const step = steps[index];
  const runRef = useRef<StepRunT | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계가 바뀌면 처음부터
  useEffect(() => {
    runRef.current = step ? new StepRun(TUTORIAL_N, step) : null;
    setFeedback(null);
    setWrong(null);
    bump((x) => x + 1);
  }, [step?.id, keymap]);

  const run = runRef.current;
  const finished = !!run?.done;

  const markDone = useCallback((id: string) => {
    setDone((d) => {
      if (d.includes(id)) return d;
      const next = [...d, id];
      saveLearn({ done: next });
      return next;
    });
  }, []);

  const onKey = useCallback(
    ({ input, result }: PracticeKey) => {
      const r = runRef.current;
      if (!r || !keymap || r.done) return;
      setPressed(input.code);
      window.setTimeout(
        () => setPressed((c) => (c === input.code ? null : c)),
        200,
      );
      const before = r.current;
      const outcomes = [r.feed({ kind: "code", code: input.code })];
      if (result?.kind === "move") {
        cube.move(result.move);
        outcomes.push(r.feed({ kind: "move", move: result.move }));
      } else if (result?.kind === "command") {
        runCommand(cube, result.command);
        outcomes.push(r.feed({ kind: "command", command: result.command }));
      } else if (result === null && before?.kind !== "code")
        outcomes.push("miss");
      bump((x) => x + 1);
      if (outcomes.includes("miss")) {
        const said = describeInput(keymap, TUTORIAL_N, input).text;
        const want = before ? hint(keymap, before) : "";
        setWrong(input.code);
        setFeedback({ kind: "miss", text: `${said} · ${want}` });
        return;
      }
      setWrong(null);
      if (outcomes.includes("done")) {
        if (step) markDone(step.id);
        setFeedback({ kind: "ok", text: "이 단계를 마쳤습니다" });
      } else if (outcomes.includes("hit"))
        setFeedback({ kind: "ok", text: "맞아요" });
      else if (outcomes.includes("partial"))
        setFeedback({ kind: "ok", text: "한 번 더" });
    },
    [keymap, cube, step, markDone],
  );

  usePracticeKeys(TUTORIAL_N, keymap, true, onKey);

  const current = run?.current;
  const lit: KeyChord[] = useMemo(() => {
    if (!keymap || !current) return [];
    if (current.kind === "code") return [{ code: current.code }];
    if (current.kind === "command")
      return chordsFor(keymap, current.command).slice(0, 1);
    return pressesFor(keymap, TUTORIAL_N, current.notation)[0] ?? [];
  }, [keymap, current]);

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-keys-page="learn"
        data-keys-ready={keymap ? "" : undefined}
        data-learn-step={step?.id}
        data-learn-finished={finished ? "" : undefined}
      >
        <KeysHeader current="/cube/keys/learn" keymap={keymap} />
        <ol className="flex flex-wrap gap-1" aria-label="단계">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                data-learn-tab={s.id}
                aria-current={i === index ? "step" : undefined}
                onClick={(e) => {
                  setIndex(i);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs",
                  i === index
                    ? "bg-sky-500/30 font-semibold"
                    : "bg-white/5 hover:bg-white/10",
                )}
              >
                {done.includes(s.id) ? "✓ " : `${i + 1}. `}
                {s.title}
              </button>
            </li>
          ))}
        </ol>

        {step && run && keymap && (
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <section className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4">
              <h2 className="font-bold text-lg">
                {index + 1}. {step.title}
              </h2>
              {step.lines.map((l) => (
                <p key={l} className="break-keep text-sm text-white/85">
                  {l}
                </p>
              ))}
              {step.missing.length > 0 && (
                <p className="break-keep text-amber-200 text-xs">
                  이 배치에는 {step.missing.join(", ")} 키가 없어 건너뜁니다.{" "}
                  <a href="/cube/settings" className="underline">
                    설정에서 놓기
                  </a>
                </p>
              )}
              <ol className="flex flex-wrap gap-1.5" data-learn-targets>
                {step.targets.map((t, i) => {
                  const state =
                    i < run.index ? "done" : i === run.index ? "now" : "next";
                  return (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: 같은 수가 되풀이된다
                      key={i}
                      data-target-state={state}
                      className={cn(
                        "flex min-w-12 flex-col items-center rounded-lg px-2 py-1",
                        state === "done" &&
                          "bg-emerald-500/25 text-emerald-100",
                        state === "now" &&
                          "bg-amber-400/25 ring-2 ring-amber-300",
                        state === "next" && "bg-white/5 text-white/60",
                      )}
                    >
                      <span className="font-mono font-semibold">
                        {targetLabel(t)}
                      </span>
                      <span className="text-[10px] text-white/60">
                        {t.kind === "code" ? "" : keyOf(keymap, t)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p
                role="status"
                data-learn-feedback={feedback?.kind}
                className={cn(
                  "min-h-5 break-keep text-sm",
                  feedback?.kind === "miss"
                    ? "text-red-300"
                    : "text-emerald-300",
                )}
              >
                {feedback?.text ?? ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    runRef.current = new StepRun(TUTORIAL_N, step);
                    cube.reset();
                    setFeedback(null);
                    bump((x) => x + 1);
                    e.currentTarget.blur();
                  }}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm"
                >
                  처음부터
                </button>
                {(finished || step.targets.length === 0) &&
                  index < steps.length - 1 && (
                    <button
                      type="button"
                      data-learn-next
                      onClick={(e) => {
                        if (step.targets.length === 0) markDone(step.id);
                        setIndex(index + 1);
                        e.currentTarget.blur();
                      }}
                      className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black text-sm"
                    >
                      다음 단계
                    </button>
                  )}
                {finished && index === steps.length - 1 && (
                  <a
                    href="/cube/keys/drill"
                    data-learn-drill
                    className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black text-sm"
                  >
                    조작 훈련으로
                  </a>
                )}
              </div>
            </section>
            <LiveCube
              cube={cube}
              settings={settings}
              className="mx-auto w-full max-w-[260px]"
            />
          </div>
        )}

        {keymap && (
          <KeyboardMap
            keymap={keymap}
            n={TUTORIAL_N}
            lit={finished ? [] : lit}
            pressed={pressed}
            wrong={wrong}
          />
        )}
        <p className="break-keep text-white/50 text-xs">
          휴대폰에서는 키보드가 없어 큐브를 밀어서 돌립니다. 키 익히기는
          키보드가 있는 기기에서 하세요
        </p>
      </main>
    </div>
  );
}

function runCommand(cube: PracticeCube, command: Command): void {
  if (command === "undo") cube.undo();
  else if (command === "reset") cube.reset();
  else if (command === "scramble") cube.scramble();
}

function keyOf(
  keymap: Parameters<typeof keyTextFor>[0],
  t: TutorialTarget,
): string {
  const a =
    t.kind === "move" ? t.notation : t.kind === "command" ? t.command : "";
  return keyTextFor(keymap, TUTORIAL_N, a) ?? "";
}

function hint(
  keymap: Parameters<typeof keyTextFor>[0],
  t: TutorialTarget,
): string {
  if (t.kind === "code") return `지금은 ${targetLabel(t)}를 누르세요`;
  return `「${targetLabel(t)}」은 ${keyOf(keymap, t)}`;
}
