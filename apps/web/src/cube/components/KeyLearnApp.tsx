"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import type { Command } from "../input/actions";
import { chordsFor, codeLabel, type KeyChord } from "../input/keymaps";
import {
  COLOR_NAME,
  type ColorId,
  describeInput,
  keysForMove,
  keyTextFor,
  loadLearn,
  migrateLearnDone,
  orientGoalText,
  pressesFor,
  rightKeyTag,
  StepRun,
  type StepRun as StepRunT,
  saveLearn,
  TUTORIAL_N,
  type TutorialTarget,
  targetLabel,
  tutorialSteps,
} from "../keys";
import { hexColor, useCubeSettings } from "../settings";
import { KeyboardMap } from "./KeyboardMap";
import { KeyGuide } from "./KeyGuide";
import { KeysHeader, useKeymap } from "./KeysApp";
import { MoveChip, type MoveKeysOf } from "./MoveChip";
import {
  LiveCube,
  type PracticeCube,
  type PracticeKey,
  useNoKeyboard,
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
  const noKeyboard = useNoKeyboard();

  // 옛 단계 id로 남은 진도는 지금 단계로 옮겨 다시 남긴다
  useEffect(() => {
    const saved = loadLearn().done;
    const next = migrateLearnDone(saved);
    if (next.join() !== saved.join()) saveLearn({ done: next });
    setDone(next);
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
  // 단계가 바뀌면 처음부터. 큐브도 맞춘 상태로 둔다(StepRun이 맞춘 상태에서 모양을 따라간다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계·배치가 바뀔 때만
  useEffect(() => {
    runRef.current = step ? new StepRun(TUTORIAL_N, step) : null;
    cube.reset();
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
        setFeedback({ kind: "miss", text: want ? `${said} ${want}` : said });
        return;
      }
      setWrong(null);
      if (outcomes.includes("done")) {
        if (step) markDone(step.id);
        setFeedback({ kind: "ok", text: "이 단계를 마쳤어요." });
      } else if (outcomes.includes("hit"))
        setFeedback({ kind: "ok", text: "맞아요." });
      else if (outcomes.includes("partial"))
        setFeedback({ kind: "ok", text: partialText(before, r) });
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
    // 목표 모양: 큐브 돌리기 키를 모두 빛낸다. 혼자 풀기는 답을 알려 주지 않는다
    if (current.kind === "orient")
      return ["x", "y", "z"].flatMap(
        (a) => pressesFor(keymap, TUTORIAL_N, a)[0] ?? [],
      );
    if (current.kind === "solve") return [];
    // 맞히기는 키를 빛내지 않는다
    if (current.ask) return [];
    return pressesFor(keymap, TUTORIAL_N, current.notation)[0] ?? [];
  }, [keymap, current]);

  // 키보드 없는 기기도 화면 키 그림으로 치므로 키캡을 보인다
  const keysOf: MoveKeysOf | null = useMemo(
    () =>
      keymap ? (nota: string) => keysForMove(keymap, TUTORIAL_N, nota) : null,
    [keymap],
  );
  const facing = run?.facing;

  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4"
        data-keys-page="learn"
        data-keys-ready={keymap ? "" : undefined}
        data-learn-step={step?.id}
        data-learn-finished={finished ? "" : undefined}
        data-learn-facing={facing ? `${facing.up}-${facing.front}` : undefined}
      >
        <KeysHeader current="/cube/keys/learn" keymap={keymap} />
        {/* 키보드 없는 휴대폰도 막다른 길이 되지 않게 맨 위에서 알린다(2026-11-05 점검) */}
        {noKeyboard && (
          <p
            className="break-keep rounded-xl bg-amber-400/10 px-3 py-2 text-amber-100 text-sm"
            data-learn-no-keyboard
          >
            키보드가 없으면 아래 키 그림을 눌러 쳐요. 데스크톱 키보드와 같은
            자리라 그대로 손에 익어요. 휴대폰으로만 할 거라면 키 대신{" "}
            <a href="/cube/learn" className="underline">
              맞추는 법 배우기
            </a>
            로 바로 가도 돼요.
          </p>
        )}
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="font-bold text-lg">
                  {index + 1}. {step.title}
                </h2>
                {step.hand && (
                  <p
                    data-learn-hand={step.hand.label}
                    className="flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-0.5 text-sm"
                  >
                    <span className="font-semibold">{step.hand.label}</span>
                    {step.hand.moves.map((m) => (
                      <MoveChip key={m} notation={m} keysOf={keysOf} />
                    ))}
                  </p>
                )}
              </div>
              {step.lines.map((l) => (
                <p key={l} className="break-keep text-sm text-white/85">
                  {l}
                </p>
              ))}
              {step.missing.length > 0 && (
                <p className="break-keep text-amber-200 text-xs">
                  이 배치에는 {step.missing.join(", ")} 키가 없어 건너뛰어요.{" "}
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
                      <span
                        className={cn(
                          "font-semibold",
                          t.kind === "move" && "font-mono",
                        )}
                      >
                        {targetLabel(t)}
                      </span>
                      <span className="flex min-h-[15px] items-center gap-0.5 text-[10px] text-white/60">
                        {t.kind === "orient"
                          ? [t.up, t.front].map((c, j) =>
                              c === undefined ? null : (
                                <Swatch
                                  // biome-ignore lint/suspicious/noArrayIndexKey: 위·앞 두 칸
                                  key={j}
                                  color={c}
                                  colors={settings.colors}
                                />
                              ),
                            )
                          : t.kind === "code" || t.kind === "solve"
                            ? ""
                            : t.kind === "move" && t.ask && state !== "done"
                              ? "?"
                              : keyOf(keymap, t)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {current?.kind === "orient" && (
                <p
                  data-learn-goal
                  className="flex flex-wrap items-center gap-2 break-keep text-sm"
                >
                  <span className="font-semibold">
                    {orientGoalText(current)}
                  </span>
                  {facing && (
                    <span className="flex items-center gap-1 text-white/70 text-xs">
                      지금 위
                      <Swatch color={facing.up} colors={settings.colors} />
                      {colorWord(facing.up)}, 앞
                      <Swatch color={facing.front} colors={settings.colors} />
                      {colorWord(facing.front)}
                    </span>
                  )}
                </p>
              )}
              {current?.kind === "move" && current.ask && (
                <p
                  data-learn-ask={current.notation}
                  className="flex flex-wrap items-center gap-2 break-keep text-sm"
                >
                  <span className="rounded bg-amber-400/20 px-1.5 font-mono font-semibold text-amber-200">
                    {current.notation}
                  </span>
                  <span>실마리: {current.ask}. 어느 키일까요? 쳐 보세요.</span>
                </p>
              )}
              {current?.kind === "solve" && (
                <p data-learn-goal className="break-keep text-sm">
                  혼자 풀어 보세요. 나중에 친 것부터 거꾸로 쳐요. 틀려도
                  되돌리기로 돌아올 수 있어요.
                </p>
              )}
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
                {finished && index === steps.length - 1 && (
                  <a
                    href="/cube/learn"
                    data-learn-to-lessons
                    className="rounded-lg bg-white/10 px-4 py-1.5 text-sm hover:bg-white/15"
                  >
                    맞추는 법 배우기
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

        {/* 키를 눌러 칠 수 있다(화면 키보드). 키보드 없는 기기는 큰 그림 대신 누르기 쉬운 작은 키 그림 */}
        {keymap &&
          (noKeyboard ? (
            <KeyGuide
              n={TUTORIAL_N}
              keymap={keymap}
              lit={pressed}
              want={finished ? [] : lit}
              hideActions={current?.kind === "move" && !!current.ask}
              pressable
              fingers
            />
          ) : (
            <KeyboardMap
              keymap={keymap}
              n={TUTORIAL_N}
              lit={finished ? [] : lit}
              pressed={pressed}
              wrong={wrong}
              hideActions={current?.kind === "move" && !!current.ask}
              pressable
            />
          ))}
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
  return a ? (keyTextFor(keymap, TUTORIAL_N, a) ?? "") : "";
}

function hint(
  keymap: Parameters<typeof keyTextFor>[0],
  t: TutorialTarget,
): string {
  if (t.kind === "orient") {
    const keys = ["x", "y", "z"]
      .map((a) => keyTextFor(keymap, TUTORIAL_N, a))
      .filter(Boolean)
      .join("·");
    return `면을 돌려도 보는 쪽은 그대로예요. 큐브 전체를 돌려요(${keys}).`;
  }
  if (t.kind === "solve") return "";
  return rightKeyTag(t.kind === "code" ? codeLabel(t.code) : keyOf(keymap, t));
}

/** 색 이름을 홀로 쓸 때(「흰」은 「흰 면」처럼 꾸밀 때만 쓰고, 홀로는 「흰색」) */
function colorWord(c: ColorId): string {
  return c === 0 ? "흰색" : COLOR_NAME[c];
}

/** 맞았지만 아직 그 칸을 마치지 않았을 때 */
function partialText(t: TutorialTarget | undefined, run: StepRunT): string {
  if (t?.kind === "orient") {
    const f = run.facing;
    return f
      ? `지금 위는 ${colorWord(f.up)}, 앞은 ${colorWord(f.front)}이에요.`
      : "";
  }
  if (t?.kind === "solve") return "아직이에요. 나중에 친 것부터 거꾸로.";
  return "한 번 더.";
}

/** 색 칸(사용자 색 설정대로) */
function Swatch({ color, colors }: { color: ColorId; colors: number[] }) {
  return (
    <span
      data-swatch={color}
      title={COLOR_NAME[color]}
      className="inline-block size-3 rounded-sm ring-1 ring-black/40"
      style={{ background: hexColor(colors[color] ?? 0) }}
    />
  );
}
