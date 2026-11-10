"use client";

import {
  applyMove,
  type CubeMove,
  invertMove,
  solvedCube,
} from "@game/cube-engine";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import type { StickerMarks } from "../bridge";
import {
  type Command,
  chordsFor,
  type Keymap,
  type KeymapPreset,
  loadKeymap,
  presetKeymap,
  resolveAction,
  saveKeymap,
} from "../input";
import { TWO_HAND_RULE, TWO_HAND_RULES } from "../keys/two-hand";
import { COURSES, type Lesson, type LessonStep } from "../learn";
import {
  FACE_WORDS,
  INTRO_TRIES,
  ROTATION_WORDS,
  SLICE_WORDS,
  WIDE_WORDS,
} from "../learn/intro";
import { useCubeSettings } from "../settings";
import type { MarkTone } from "../view/types";
import { CubePlay } from "./CubePlay";
import { KeyGuide } from "./KeyGuide";
import { KeyTryBox } from "./KeyTryBox";
import { LookPanel, TurnPanel } from "./LessonActs";
import { KeyCaps, MoveChip, useMoveKeys } from "./MoveChip";
import { useNoKeyboard } from "./PracticeCube";
import { StillCube } from "./StillCube";
import { KIND_LABEL, KIND_MARK } from "./step-kinds";

/**
 * 사이트 쓰는 법(`/cube/intro`, `CubeGuideApp`)의 단계들(2026-11-04 사용자가 정함, 2026-11-10 키 익히기와 합침, docs/47 16-8):
 * 큐브 맞추는 법이 아니라 **우리 화면 쓰는 법**. 「읽기」는 세 가지 말(표기·공식·단축키) → 면 여섯과 이름의 뜻 → 방향 →
 * 우리 화면에서 읽기 → 키 배치 고르기 → 보는 법. 키 익히기와 겹치는 x·y·z, M·E·S, 넓게·큰 큐브, 단축키 모음은 「더 알아보기」.
 * 모든 단계는 직접 해 본다. 조각(스티커가 아니라 조각) 이야기는 배우기 3×3 초보자 과정 첫 단원이 맡는다.
 * 정의는 `learn/intro.ts`(엔진과 시험), 「두 손」 소개는 `keys/two-hand.ts`(실제 배치와 시험).
 */

interface Step {
  id: string;
  title: string;
}

const ALL_STEPS: Step[] = [
  { id: "words", title: "세 가지 말" },
  { id: "faces", title: "면 여섯" },
  { id: "turns", title: "방향" },
  { id: "rotate", title: "x·y·z" },
  { id: "slices", title: "M·E·S" },
  { id: "wide", title: "넓게·큰 큐브" },
  { id: "screen", title: "화면 읽기" },
  { id: "layout", title: "키 배치" },
  { id: "keys", title: "단축키 모음" },
  { id: "view", title: "보는 법" },
];

/**
 * 사이트 쓰는 법 「읽기」 부분(docs/47 16-8). 키 익히기와 겹치는 것은 빼고 「더 알아보기」로.
 * 보는 법은 큐브 전체 돌리기를 쓰므로 키 배치 뒤에 둔다
 */
export const READ_STEPS = [
  "words",
  "faces",
  "turns",
  "screen",
  "layout",
  "view",
] as const;
/** 「다음」 부분의 더 알아보기(키 익히기와 겹쳐 본 흐름에서 뺀 것) */
export const MORE_STEPS = ["rotate", "slices", "wide", "keys"] as const;

/** 배우기 첫 단원: 3×3 초보자 과정의 맨 앞. 과정이 바뀌어도 따라간다 */
export const FIRST_LESSON = COURSES.find((c) => c.id === "333-beginner")
  ?.lessons[0];

const FACE_NAME = ["위", "오른쪽", "앞", "아래", "왼쪽", "뒤"];

function Quiz({
  question,
  choices,
  answer,
  why,
  onRight,
}: {
  question: string;
  choices: string[];
  answer: number;
  why: string;
  onRight: () => void;
}) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div
      className="flex flex-col gap-2 rounded-xl bg-black/25 p-3"
      data-intro-quiz
    >
      <p className="font-semibold text-sm">{question}</p>
      {choices.map((c, i) => (
        <button
          key={c}
          type="button"
          data-choice={i}
          onClick={() => {
            setPick(i);
            if (i === answer) onRight();
          }}
          className={cn(
            "rounded-lg px-3 py-2 text-left text-sm",
            pick === i
              ? i === answer
                ? "bg-emerald-500/30"
                : "bg-red-500/30"
              : "bg-white/5 hover:bg-white/10",
          )}
        >
          {c}
        </button>
      ))}
      {pick !== null && (
        <p role="status" className="text-white/80 text-xs">
          {pick === answer ? `맞아요! ${why}` : "다시 골라 보세요."}
        </p>
      )}
    </div>
  );
}

/**
 * 안내 단계 묶음 하나(사이트 쓰는 법의 「읽기」, 또는 「더 알아보기」의 한 단계). 머리와 바깥 틀은 `CubeGuideApp`이 그린다.
 * 마지막 단계의 「다음」은 `onFinish`(다음 부분으로).
 */
export function CubeIntroSteps({
  only,
  onFinish,
  finishLabel = "다음",
}: {
  only: readonly string[];
  onFinish?: () => void;
  finishLabel?: string;
}) {
  const STEPS = useMemo(
    () => ALL_STEPS.filter((s) => only.includes(s.id)),
    [only],
  );
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const step = STEPS[index] ?? (STEPS[0] as Step);
  const pass = useCallback(
    (id: string) => () => setDone((d) => (d[id] ? d : { ...d, [id]: true })),
    [],
  );
  const last = index >= STEPS.length - 1;

  return (
    <div className="flex flex-col gap-4" data-cube-intro={step.id}>
      {STEPS.length > 1 && (
        <nav className="flex flex-wrap gap-1" aria-label="안내 차례">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs",
                i === index
                  ? "bg-sky-500/30 font-semibold"
                  : done[s.id]
                    ? "bg-emerald-500/20"
                    : "bg-white/5",
              )}
            >
              {s.title}
            </button>
          ))}
        </nav>
      )}

      <section
        className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4"
        data-intro-step={step.id}
        data-intro-done={done[step.id] ? "" : undefined}
      >
        <div className="flex items-baseline gap-2">
          <h2 className="font-bold text-lg">{step.title}</h2>
          {STEPS.length > 1 && (
            <span className="ml-auto text-white/60 text-xs" data-intro-progress>
              {index + 1}/{STEPS.length}
            </span>
          )}
        </div>
        <StepBody id={step.id} onDone={pass(step.id)} />
      </section>

      {(STEPS.length > 1 || onFinish) && (
        <div className="flex justify-between">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className={cn(
              "rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-30",
              STEPS.length === 1 && "invisible",
            )}
          >
            이전
          </button>
          {(!last || onFinish) && (
            <button
              type="button"
              data-intro-next
              onClick={() => (last ? onFinish?.() : setIndex((i) => i + 1))}
              className={cn(
                "rounded-xl px-4 py-2 font-semibold text-sm",
                done[step.id]
                  ? "bg-sky-500 text-black"
                  : "bg-white/10 text-white/70",
              )}
            >
              {last ? finishLabel : done[step.id] ? "다음" : "건너뛰기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StepBody({ id, onDone }: { id: string; onDone: () => void }) {
  const settings = useCubeSettings();
  switch (id) {
    case "words":
      return (
        <>
          <ul className="flex flex-col gap-1.5 break-keep text-sm text-white/85">
            <li>
              <b>표기</b>: 돌리기 하나를 적는 글자예요. 예: <code>R</code>,{" "}
              <code>U'</code>
            </li>
            <li>
              <b>공식</b>: 정해진 차례로 이어 두는 돌리기 묶음이에요. 예:{" "}
              <code>R U R' U'</code>
            </li>
            <li>
              <b>단축키</b>: 이 화면에서 그 돌리기를 치는 내 키보드 키예요. 고른
              배치에 따라 달라요.
            </li>
          </ul>
          <Quiz
            question="R U R' U'은 무엇일까요?"
            choices={["표기 하나", "공식", "단축키"]}
            answer={1}
            why="표기 넷을 차례로 이은 공식이에요."
            onRight={onDone}
          />
        </>
      );
    case "faces":
      return <FacesStep onDone={onDone} />;
    case "turns":
      return (
        <>
          <p className="break-keep text-sm text-white/85">
            글자만 쓰면 그 면을 <b>마주 보고</b> 시계 방향으로 90° 돌려요.{" "}
            <b>'</b>(프라임)는 반대 방향, <b>2</b>는 반 바퀴예요. 마주 본다는 게
            중요해요. 앞에서 보면 R과 L은 반대로 돌아요. L·D·B는 그 면 쪽으로
            돌아가서 본다고 생각해요.
          </p>
          <TurnPanel
            n={3}
            start={solvedCube(3)}
            alg={INTRO_TRIES.turns.alg}
            mask={null}
            settings={settings}
            onPassed={onDone}
          />
        </>
      );
    case "rotate":
      return (
        <>
          <p className="break-keep text-sm text-white/85">
            x·y·z는 큐브 전체를 돌려 쥐는 것이에요. 수학의 세 축 이름이에요.
            빨간 화살표가 x, 초록이 y, 파랑이 z예요.
          </p>
          <ul className="flex flex-col gap-1 break-keep text-sm text-white/80">
            {ROTATION_WORDS.map((w) => (
              <li key={w.move}>
                <b className="font-mono">{w.move}</b>: {w.why}
              </li>
            ))}
          </ul>
          <TurnPanel
            n={3}
            start={solvedCube(3)}
            alg={INTRO_TRIES.rotate.alg}
            mask={null}
            settings={settings}
            onPassed={onDone}
            axes
          />
        </>
      );
    case "slices":
      return (
        <>
          <ul className="flex flex-col gap-1 break-keep text-sm text-white/80">
            {SLICE_WORDS.map((w) => (
              <li key={w.move}>
                <b className="font-mono">{w.move}</b> = {w.word}: {w.why}
              </li>
            ))}
          </ul>
          <p className="break-keep text-white/60 text-xs">
            뒤의 「키 배치」 단계에서 고를 「두 손」 배치에서는 E가 2, E'이 9,
            S가 0, S'이 1 키예요. 넓게는 Shift + 면 키로도 쳐요.
          </p>
          <TurnPanel
            n={3}
            start={solvedCube(3)}
            alg={INTRO_TRIES.slices.alg}
            mask={null}
            settings={settings}
            onPassed={onDone}
          />
        </>
      );
    case "wide":
      return <WideStep onDone={onDone} />;
    case "screen":
      return <ScreenStep onDone={onDone} />;
    case "layout":
      return <LayoutStep onDone={onDone} />;
    case "keys":
      return <KeysStep onDone={onDone} />;
    default:
      return <ViewStep onDone={onDone} />;
  }
}

// ── 면 여섯 ──────────────────────────────────────────

const ASK = ["R", "U", "F", "L", "D", "B"] as const;

function faceMarks(faces: readonly number[], tone: MarkTone): StickerMarks {
  const out: (MarkTone | null)[] = new Array(54).fill(null);
  for (const f of faces) for (let k = 0; k < 9; k++) out[f * 9 + k] = tone;
  return out;
}

function FacesStep({ onDone }: { onDone: () => void }) {
  const settings = useCubeSettings();
  const [at, setAt] = useState(0);
  const [miss, setMiss] = useState<string | null>(null);
  const start = useMemo(() => solvedCube(3), []);
  const word = FACE_WORDS.find((w) => w.letter === ASK[at]);
  const found = FACE_WORDS.filter((w) =>
    ASK.slice(0, at).includes(w.letter),
  ).map((w) => w.face);
  return (
    <>
      <ul className="grid grid-cols-3 gap-1 text-sm sm:grid-cols-6">
        {FACE_WORDS.map((w) => (
          <li
            key={w.letter}
            className={cn(
              "flex flex-col items-center rounded-lg py-1.5",
              found.includes(w.face) ? "bg-emerald-500/20" : "bg-white/5",
            )}
          >
            <b className="font-mono text-lg">{w.letter}</b>
            <span className="text-white/70 text-xs">
              {w.word} · {w.ko}
            </span>
          </li>
        ))}
      </ul>
      <p
        className="break-keep text-sm"
        role="status"
        data-intro-face={word?.letter ?? "done"}
      >
        {word
          ? (miss ??
            `${word.letter}(${word.word})는 어느 면일까요? 그 면의 칸을 눌러 보세요.`)
          : "여섯 면을 다 찾았어요. 영어 머리글자라 외우기 쉬워요."}
      </p>
      <StillCube
        n={3}
        state={start}
        mask={null}
        settings={settings}
        marks={faceMarks(found, "right")}
        onSticker={(sticker) => {
          if (!word) return;
          const face = Math.floor(sticker / 9);
          if (face === word.face) {
            setMiss(null);
            const next = at + 1;
            setAt(next);
            if (next >= ASK.length) onDone();
          } else
            setMiss(
              `그건 ${FACE_NAME[face]} 면이에요. ${word.letter}는 ${word.ko}이에요.`,
            );
        }}
      />
    </>
  );
}

// ── 넓게·큰 큐브 ───────────────────────────────────────

function WideStep({ onDone }: { onDone: () => void }) {
  const settings = useCubeSettings();
  const tries = [INTRO_TRIES.wide3, INTRO_TRIES.wide4, INTRO_TRIES.wide5];
  const [at, setAt] = useState(0);
  const t = tries[at];
  return (
    <>
      <ul className="flex flex-col gap-1 break-keep text-sm text-white/80">
        {WIDE_WORDS.map((w) => (
          <li key={`${w.n}-${w.move}`}>
            {w.n}×{w.n} <b className="font-mono">{w.move}</b>: {w.why}
          </li>
        ))}
      </ul>
      <div className="flex gap-1 text-xs" data-intro-wide={at}>
        {tries.map((x, i) => (
          <span
            key={x.n}
            className={cn(
              "rounded-lg px-2 py-1",
              i < at
                ? "bg-emerald-500/30"
                : i === at
                  ? "bg-sky-500/30 font-semibold"
                  : "bg-white/5",
            )}
          >
            {x.n}×{x.n}
          </span>
        ))}
      </div>
      {t ? (
        <TurnPanel
          key={t.n}
          n={t.n}
          start={solvedCube(t.n)}
          alg={t.alg}
          mask={null}
          settings={settings}
          onPassed={() => {
            if (at + 1 >= tries.length) onDone();
            window.setTimeout(
              () => setAt((i) => Math.min(i + 1, tries.length)),
              600,
            );
          }}
        />
      ) : (
        <p className="text-emerald-300 text-sm" role="status">
          세 크기 모두 해 봤어요.
        </p>
      )}
    </>
  );
}

// ── 화면 읽기 ─────────────────────────────────────────

function ScreenStep({ onDone }: { onDone: () => void }) {
  const { keysOf } = useMoveKeys(3);
  const marks = (["demo", "turn", "find", "quiz", "play", "look"] as const).map(
    (k) => [KIND_MARK[k], KIND_LABEL[k]] as const,
  );
  return (
    <>
      <ul className="flex flex-col gap-2 break-keep text-sm text-white/85">
        <li>
          수 옆에 키보드 키 모양으로 붙은 작은 표시(키캡)가 <b>내 키</b>예요:{" "}
          <MoveChip
            notation="R"
            keysOf={keysOf}
            className="rounded bg-white/10 px-1 font-semibold"
          />
          {keysOf ? "" : " (휴대폰은 키캡 없이 표기만 보여요)"}
        </li>
        <li>
          시연은 <b>① 보기 → ② 해 보기</b> 차례예요. 보기에서는 재생·한 수씩만,
          해 보기에서 키캡을 보며 쳐요.
        </li>
        <li>
          해 보기가 막히면 「힌트」를 눌러요. 다음 수와 내 키를 알려 줘요.
        </li>
        <li>
          단원 위 단계 띠의 아이콘:{" "}
          {marks.map(([m, label]) => (
            <span key={label} className="mr-2 inline-flex items-center gap-1">
              <span className="rounded bg-white/10 px-1.5">{m}</span>
              <span className="text-white/70 text-xs">{label}</span>
            </span>
          ))}
        </li>
      </ul>
      <Quiz
        question="단계 띠에서 ✋는 무엇일까요?"
        choices={["시연(보기만)", "직접 쳐 보는 단계", "고르기 문제"]}
        answer={1}
        why="✋는 해 보기·따라 하기예요. 내 키로 직접 쳐요."
        onRight={onDone}
      />
    </>
  );
}

// ── 키 배치 고르기 ────────────────────────────────────

const TWO_HAND = presetKeymap("twoHand");

const LAYOUT_TAGS: Record<"notation" | "twoHand", string[]> = {
  notation: ["외울 것 적음", "반대 방향은 Shift + 키"],
  twoHand: ["한 수에 키 하나", "실물 큐브를 돌리는 손가락과 같게"],
};

function LayoutStep({ onDone }: { onDone: () => void }) {
  const [preset, setPreset] = useState<KeymapPreset | null>(null);
  useEffect(() => setPreset(loadKeymap().preset), []);
  const keymap = useMemo<Keymap>(
    () =>
      preset === "notation"
        ? presetKeymap("notation")
        : presetKeymap("twoHand"),
    [preset],
  );
  const choose = (p: "notation" | "twoHand") => {
    saveKeymap(presetKeymap(p));
    setPreset(p);
    onDone();
  };
  return (
    <>
      <p className="break-keep text-sm text-white/85">
        키 배치를 골라요. 고르면 설정에 남고, 언제든 설정에서 바꿀 수 있어요.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["twoHand", "notation"] as const).map((p) => (
          <button
            key={p}
            type="button"
            data-layout-pick={p}
            aria-pressed={preset === p}
            onClick={(e) => {
              choose(p);
              e.currentTarget.blur();
            }}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left",
              preset === p
                ? "border-sky-300 bg-sky-500/20"
                : "border-white/10 bg-white/5 hover:bg-white/10",
            )}
          >
            <span className="font-bold">
              {p === "twoHand" ? "빠른 두 손" : "외우기 쉬운 표기"}
              {p === "twoHand" && (
                <span className="ml-1 font-normal text-white/60 text-xs">
                  기본
                </span>
              )}
            </span>
            <span className="flex flex-wrap gap-1">
              {LAYOUT_TAGS[p].map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/10 px-2 py-0.5 text-xs"
                >
                  {t}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <p className="text-white/60 text-xs">
          지금은 설정에서 만든 사용자 배치를 쓰고 있어요. 아래는 「두 손」
          규칙이에요.
        </p>
      )}
      {preset === "notation" ? (
        <p
          className="break-keep text-sm text-white/85"
          data-layout-rule="notation"
        >
          규칙 하나: <b>글자 그대로 치고, Shift를 함께 누르면 반대 방향</b>. R
          키 = R, Shift+R = R'. 두 번 치면 R2예요.
        </p>
      ) : (
        <div className="flex flex-col gap-2" data-layout-rule="twoHand">
          <p className="break-keep text-sm text-white/85">
            「두 손」은 실물 큐브를 손가락으로 빠르게 돌리는 요령(핑거 트릭)을
            키보드로 옮긴 배치예요. <b>{TWO_HAND_RULE}</b>
          </p>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {TWO_HAND_RULES.filter((r) => !r.exception).map((r) => (
              <li
                key={r.move}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1"
              >
                <b className="w-8 font-mono text-sm">{r.move}</b>
                <KeyCaps
                  keys={chordsFor(TWO_HAND, r.move).filter(
                    (c) => c.code === r.code,
                  )}
                />
                <span className="text-white/50">
                  {r.hand === "right" ? "오른손" : "왼손"}{" "}
                  {r.row === "up" ? "↑" : r.row === "down" ? "↓" : "·"}
                </span>
                <span className="break-keep text-white/75">{r.finger}</span>
              </li>
            ))}
          </ul>
          <p className="break-keep text-white/60 text-xs">
            {TWO_HAND_RULES.find((r) => r.exception)?.exception} csTimer(큐브
            연습에 널리 쓰는 웹 사이트) 같은 가상 큐브 사이트와 같은 배치라 다른
            곳에서도 그대로 써요. 덧붙인 것: Shift + 면 키 = 넓게. csTimer와
            다른 곳: Space는 살펴보기·블라인드 시작이에요. 큰 큐브는
            3·4(왼손)·7·8(오른손)로 함께 돌릴 층 수를 골라요.
          </p>
        </div>
      )}
      <div className="hidden sm:block">
        <KeyGuide n={3} keymap={keymap} lit={null} />
      </div>
    </>
  );
}

// ── 단축키 쳐 보기 ─────────────────────────────────────

type Task = "move" | "undo" | "reset" | "scramble" | "peek";
const TASK_LABEL: Record<Task, string> = {
  move: "면 하나 돌리기",
  undo: "되돌리기",
  reset: "맞춘 상태로",
  scramble: "다시 섞기",
  peek: "뒤 살짝 보기(누르는 동안)",
};

function KeysStep({ onDone }: { onDone: () => void }) {
  const settings = useCubeSettings();
  const noKeyboard = useNoKeyboard();
  const { keymap, keysOf } = useMoveKeys(3);
  const tasks = useMemo<Task[]>(
    () =>
      noKeyboard
        ? ["move", "undo"]
        : ["move", "undo", "reset", "scramble", "peek"],
    [noKeyboard],
  );
  const [got, setGot] = useState<Task[]>([]);
  const start = useMemo(() => solvedCube(3), []);
  const [state, setState] = useState(start);
  const [history, setHistory] = useState<CubeMove[]>([]);
  const [sync, setSync] = useState(0);
  const mark = useCallback(
    (t: Task) => setGot((g) => (g.includes(t) ? g : [...g, t])),
    [],
  );
  useEffect(() => {
    if (tasks.every((t) => got.includes(t))) onDone();
  }, [got, tasks, onDone]);
  // 살짝 보기는 장면이 맡아 명령으로 오지 않으므로 키로 본다
  useEffect(() => {
    if (!keymap) return;
    const on = (e: KeyboardEvent) => {
      const a = resolveAction(keymap, e);
      if (a === "peekBack" || a === "peekDown") mark("peek");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [keymap, mark]);
  const chord = (a: string) =>
    keymap?.bindings.find((b) => b.action === a) ?? null;
  return (
    <>
      <KeyTryBox />
      <ul className="flex flex-wrap gap-1.5 text-xs" data-intro-tasks>
        {tasks.map((t) => {
          const c = t === "move" ? null : chord(t === "peek" ? "peekBack" : t);
          return (
            <li
              key={t}
              data-intro-task={t}
              data-task-done={got.includes(t) ? "" : undefined}
              className={cn(
                "flex items-center gap-1 rounded-lg px-2 py-1",
                got.includes(t) ? "bg-emerald-500/30" : "bg-white/5",
              )}
            >
              {got.includes(t) ? "✓ " : ""}
              {TASK_LABEL[t]}
              {c && keysOf && <KeyCaps keys={[c]} />}
            </li>
          );
        })}
      </ul>
      <CubePlay
        n={3}
        state={state}
        mask={null}
        syncToken={sync}
        settings={settings}
        onMove={(m) => {
          mark("move");
          setState((s) => applyMove(3, s, m));
          setHistory((h) => [...h, m]);
          return true;
        }}
        onCommand={(cmd: Command) => {
          if (cmd === "undo") {
            mark("undo");
            const last = history.at(-1);
            if (!last) return null;
            const back = invertMove(last);
            setState((s) => applyMove(3, s, back));
            setHistory((h) => h.slice(0, -1));
            return back;
          }
          if (cmd === "reset" || cmd === "scramble") {
            mark(cmd);
            setState(start);
            setHistory([]);
            setSync((s) => s + 1);
          }
          return null;
        }}
      />
      <p className="break-keep text-white/60 text-xs">
        {noKeyboard
          ? "휴대폰은 큐브를 밀어서 돌려요. 칸 위를 밀면 그 줄이, 빈 곳을 밀면 큐브 전체가 돌아요. 아래 단추 줄도 있어요."
          : "키보드 그림은 지금 배치의 키예요. 굵은 글은 그냥 칠 때의 수예요. 배치는 설정에서 바꿔요."}{" "}
        더 익히려면{" "}
        <a href="/cube/intro?part=keys" className="underline" data-intro-keys>
          키 익히기
        </a>
        .
      </p>
    </>
  );
}

// ── 보는 법 ──────────────────────────────────────────

const LOOK_LESSON: Lesson = {
  id: "intro-look",
  size: 3,
  title: "보는 법",
  summary: "",
  steps: [],
};
const LOOK_STEP: LessonStep = {
  kind: "look",
  body: "",
  look: { color: "F", on: "U" },
};

/** 뒤에 숨은 세 면(아래 D, 왼쪽 L, 뒤 B)의 면 번호. 거울 판 차례(뒤·왼쪽·아래)로 묻는다 */
const BACK_FACES = [5, 4, 3] as const;

function ViewStep({ onDone }: { onDone: () => void }) {
  const settings = useCubeSettings();
  const start = useMemo(() => solvedCube(3), []);
  const back = settings.backView;
  // 뒷면 보기를 끈 사람은 뒤 면 찾기를 건너뛴다
  const [seen, setSeen] = useState<number[]>([]);
  const [miss, setMiss] = useState<string | null>(null);
  const backDone = back === "off" || seen.length >= BACK_FACES.length;
  const ask = BACK_FACES.find((f) => !seen.includes(f));
  return (
    <>
      <ul className="flex list-disc flex-col gap-1 break-keep pl-5 text-sm text-white/80">
        <li>큐브를 끌면 보는 각만 바뀌어요(큐브는 돌지 않아요).</li>
        {back === "mirror" ? (
          <li data-intro-mirror>
            큐브 둘레의 작은 판 셋은 거울이에요. 안 보이는 뒤(오른쪽
            위)·왼쪽·아래 면이 비쳐 보여요. 거울에 비친 모습이라 큐브 모서리와
            판의 칸이 바로 이어져요. 큐브를 둘러보는 동안에는 판이 흐려져요.
          </li>
        ) : null}
        <li>휴대폰은 칸 위를 밀면 그 줄이, 빈 곳을 밀면 큐브 전체가 돌아요.</li>
        <li>
          뒷면 보기(거울·끔)는{" "}
          <a href="/cube/settings" className="underline">
            설정
          </a>
          에서 바꿔요.
        </li>
      </ul>
      {!backDone ? (
        <>
          <p
            className="break-keep text-sm"
            role="status"
            data-intro-back={ask === undefined ? "done" : FACE_NAME[ask]}
          >
            {miss ??
              `해 봐요: 거울에서 ${FACE_NAME[ask ?? 5]} 면의 칸을 눌러 보세요.`}
          </p>
          <StillCube
            n={3}
            state={start}
            mask={null}
            settings={settings}
            marks={faceMarks(seen, "right")}
            onSticker={(sticker) => {
              if (ask === undefined) return;
              const face = Math.floor(sticker / 9);
              if (face === ask) {
                setMiss(null);
                setSeen((s) => [...s, face]);
              } else
                setMiss(
                  `그건 ${FACE_NAME[face]} 면이에요. ${FACE_NAME[ask]} 면은 거울에서 찾아요.`,
                );
            }}
          />
        </>
      ) : (
        <>
          <p className="break-keep text-sm">
            해 봐요: 초록 면이 위로 오게 큐브 전체를 돌려 보세요(x, 또는 빈 곳을
            위로 밀기).
            {back === "mirror" &&
              " 큐브를 돌리면 거울에는 그때 안 보이는 면이 비쳐요."}
          </p>
          <LookPanel
            lesson={LOOK_LESSON}
            step={LOOK_STEP}
            start={start}
            mask={null}
            settings={settings}
            onPassed={onDone}
          />
        </>
      )}
    </>
  );
}
