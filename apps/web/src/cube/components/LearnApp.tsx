"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import {
  type BesideCube,
  COURSES,
  type Course,
  courseById,
  type Lesson,
} from "../learn";
import { demoOffersTurn, stepIsActive, stepPicture } from "../learn/interact";
import { maskFor, stepStart } from "../learn/judge";
import {
  type LearnProgress,
  loadLearn,
  markLessonDone,
  markLessonOpened,
  markTryPassed,
} from "../learn/progress";
import { type CubeSettings, useCubeSettings } from "../settings";
import { DemoCube } from "./DemoCube";
import {
  CourseNext,
  drillTitle,
  LessonSheet,
  lessonHref,
  trainHref,
} from "./LearnLinks";
import {
  FindPanel,
  LookPanel,
  QuizPanel,
  StillCube,
  TurnPanel,
} from "./LessonActs";
import { MoveText } from "./MoveChip";
import { StageHeader, StageMapDemo, StageStrip } from "./StageStrip";
import { TryPanel } from "./TryPanel";

/**
 * 배우기(`/cube/learn`, docs/47 8-1). 과정 목록 → 단원(설명 → 시연 → 직접 해보기).
 * 단원은 `?lesson=<id>`로 연다. 진도는 이 기기에 남고, 다음 단원을 잠그지는 않지만 차례를 보여 준다.
 */

function findLesson(id: string): { course: Course; lesson: Lesson } | null {
  for (const course of COURSES) {
    const lesson = course.lessons.find((l) => l.id === id);
    if (lesson) return { course, lesson };
  }
  return null;
}

const KIND_LABEL = {
  text: "설명",
  demo: "시연",
  try: "해보기",
  look: "둘러보기",
  find: "찾아보기",
  quiz: "문제",
  turn: "따라 하기",
} as const;

const KIND_MARK = {
  demo: "▶",
  try: "✋",
  look: "↻",
  find: "◎",
  quiz: "?",
  turn: "✋",
} as const;

export function LearnApp() {
  // undefined: 주소를 아직 안 읽음(미리 그린 HTML과 첫 그리기를 맞춘다)
  const [lessonId, setLessonId] = useState<string | null | undefined>();
  const [progress, setProgress] = useState<LearnProgress>({ lessons: {} });

  useEffect(() => {
    const read = () =>
      setLessonId(new URLSearchParams(window.location.search).get("lesson"));
    read();
    setProgress(loadLearn());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const found = lessonId ? findLesson(lessonId) : null;
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4"
        data-cube-learn={found ? found.lesson.id : "list"}
      >
        {lessonId === undefined ? null : found ? (
          <LessonView
            key={found.lesson.id}
            course={found.course}
            lesson={found.lesson}
            progress={progress}
            setProgress={setProgress}
          />
        ) : (
          <CourseList progress={progress} />
        )}
      </main>
    </div>
  );
}

function CourseList({ progress }: { progress: LearnProgress }) {
  const last = progress.last ? findLesson(progress.last) : null;
  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <a href="/cube" className="text-sm text-white/70 hover:text-white">
          ← 큐브
        </a>
        <h1 className="font-bold text-lg">배우기</h1>
        <a
          href="/cube/train"
          className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          공식 훈련
        </a>
        <a
          href="/cube/algs"
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          공식 모음
        </a>
        <a
          href="/cube/fingers"
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          핑거 트릭
        </a>
      </header>
      {last && (
        <a
          href={lessonHref(last.lesson.id)}
          className="self-start rounded-xl bg-sky-500 px-4 py-2 font-semibold text-black text-sm"
        >
          이어서 하기: {last.course.title} · {last.lesson.title}
        </a>
      )}
      {COURSES_BY_SIZE.map(([size, courses]) => (
        <section
          key={size}
          data-course-size={size}
          className="flex flex-col gap-2"
        >
          <h2 className="font-bold text-lg">
            {size}×{size}
          </h2>
          <CourseGrid courses={courses} progress={progress} />
        </section>
      ))}
    </>
  );
}

/** 크기별로 과정을 묶는다(3×3 → 2×2 → 4×4 → 5×5, 크기 안에서는 COURSES 차례) */
const COURSES_BY_SIZE: [number, Course[]][] = [3, 2, 4, 5]
  .map((size): [number, Course[]] => [
    size,
    COURSES.filter((c) => c.size === size),
  ])
  .filter(([, list]) => list.length > 0);

function CourseGrid({
  courses,
  progress,
}: {
  courses: Course[];
  progress: LearnProgress;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {courses.map((course) => {
        const done = course.lessons.filter(
          (l) => progress.lessons[l.id]?.done,
        ).length;
        // 앞 과정(예: 3×3 초보자)을 다 끝냈고 이 과정은 아직이면 눈에 띄게
        const before = COURSES.find((c) => c.id === course.recommendAfter);
        const recommended =
          before !== undefined &&
          done < course.lessons.length &&
          before.lessons.every((l) => progress.lessons[l.id]?.done);
        return (
          <section
            key={course.id}
            data-course={course.id}
            data-course-recommended={recommended ? "" : undefined}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border p-4",
              recommended
                ? "border-sky-300/70 bg-sky-500/15"
                : "border-white/15 bg-white/5",
            )}
          >
            <div className="flex items-baseline gap-2">
              <h3 className="font-bold">{course.title}</h3>
              {course.stages && course.stages.length > 0 && (
                <span
                  data-course-stages={course.stages.length}
                  className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70"
                >
                  {course.stages.length}단계
                </span>
              )}
              {recommended && (
                <span className="rounded-full bg-sky-400 px-2 py-0.5 font-semibold text-black text-xs">
                  추천
                </span>
              )}
              <span className="ml-auto text-white/50 text-xs">
                {done}/{course.lessons.length}
              </span>
            </div>
            <p className="break-keep text-white/60 text-xs">{course.summary}</p>
            {course.requires && course.requires.length > 0 && (
              <p
                data-course-requires={course.requires.join(" ")}
                className="break-keep text-[11px] text-amber-200/80"
              >
                먼저 배우면 좋아요:{" "}
                {course.requires.map((id, i) => {
                  const c = courseById(id);
                  const first = c?.lessons[0];
                  return (
                    <span key={id}>
                      {i > 0 && ", "}
                      {first ? (
                        <a
                          href={lessonHref(first.id)}
                          className="underline hover:text-amber-100"
                        >
                          {c?.title}
                        </a>
                      ) : (
                        id
                      )}
                    </span>
                  );
                })}
              </p>
            )}
            <ol className="flex flex-col gap-1">
              {course.lessons.map((l, i) => {
                const p = progress.lessons[l.id];
                const tries = l.steps.filter((s) => s.kind === "try").length;
                return (
                  <li key={l.id}>
                    <a
                      href={lessonHref(l.id)}
                      data-lesson={l.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                          p?.done
                            ? "bg-emerald-500 text-black"
                            : "bg-white/10 text-white/70",
                        )}
                      >
                        {p?.done ? "✓" : i + 1}
                      </span>
                      <span className="flex flex-1 flex-col">
                        <span className="text-sm">{l.title}</span>
                        <span className="break-keep text-[11px] text-white/50">
                          {l.summary}
                        </span>
                      </span>
                      {tries > 0 && (
                        <span className="shrink-0 text-[11px] text-white/50">
                          해보기 {p?.passed.length ?? 0}/{tries}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function LessonView({
  course,
  lesson,
  progress,
  setProgress,
}: {
  course: Course;
  lesson: Lesson;
  progress: LearnProgress;
  setProgress: (p: LearnProgress) => void;
}) {
  const settings = useCubeSettings();
  const [at, setAt] = useState(0);
  const [masked, setMasked] = useState(true);
  const step = lesson.steps[at] ?? lesson.steps[0];
  const lessonIndex = course.lessons.indexOf(lesson);
  const next = course.lessons[lessonIndex + 1];
  const passed = progress.lessons[lesson.id]?.passed ?? [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: 단원을 열 때 한 번
  useEffect(() => {
    setProgress(markLessonOpened(lesson.id));
  }, [lesson.id]);

  // 이 화면에서 해낸 상호작용 단계(해보기는 진도에 남고, 나머지는 단원을 여는 동안만)
  const [acted, setActed] = useState<number[]>([]);
  // 시연 단계의 「직접 해 보기」를 열었나
  const [demoTurn, setDemoTurn] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계를 옮길 때마다 닫는다
  useEffect(() => setDemoTurn(false), [at]);

  // 시연·해보기가 아닌 단계는 단원이 노리는 조각이 보이게 그림을 고른다(stepPicture)
  const picture = useMemo(
    () =>
      step && step.kind !== "demo" && step.kind !== "try"
        ? stepPicture(lesson, at)
        : { setup: step?.setup, mask: step?.mask },
    [lesson, at, step],
  );
  const start = useMemo(
    () => (step ? stepStart(lesson, step, 1) : null),
    [lesson, step],
  );
  const mask = useMemo(
    () => (masked ? maskFor(lesson.size, picture.mask) : null),
    [masked, lesson.size, picture.mask],
  );
  if (!step || !start) return null;
  const isLast = at === lesson.steps.length - 1;
  const hasMask = picture.mask !== undefined && picture.mask !== "all";
  const done =
    !stepIsActive(step) ||
    acted.includes(at) ||
    (step.kind === "try" && passed.includes(at));
  const markActed = () => setActed((a) => (a.includes(at) ? a : [...a, at]));

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <a
          href="/cube/learn"
          className="text-sm text-white/70 hover:text-white"
        >
          ← {course.title}
        </a>
        <h1 className="font-bold text-lg">
          {lessonIndex + 1}. {lesson.title}
        </h1>
        {hasMask && (
          <fieldset
            aria-label="가리기"
            className="ml-auto flex rounded-lg bg-white/10 p-0.5 text-sm"
          >
            {(
              [
                [true, "가리기"],
                [false, "보통"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={masked === v}
                onClick={(e) => {
                  setMasked(v);
                  e.currentTarget.blur();
                }}
                className={cn(
                  "rounded-md px-3 py-1",
                  masked === v && "bg-white/20 font-semibold",
                )}
              >
                {label}
              </button>
            ))}
          </fieldset>
        )}
      </header>

      <StageHeader course={course} lessonId={lesson.id} progress={progress} />

      {/* 단계 표시 */}
      <ol className="flex flex-wrap gap-1" aria-label="단계">
        {lesson.steps.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 단계 차례가 곧 열쇠다
          <li key={`${i}-${s.kind}`}>
            <button
              type="button"
              onClick={() => setAt(i)}
              data-step-to={s.kind}
              aria-current={i === at ? "step" : undefined}
              title={KIND_LABEL[s.kind]}
              className={cn(
                "h-7 min-w-7 rounded-md px-1.5 text-xs",
                i === at
                  ? "bg-sky-500 font-bold text-black"
                  : (s.kind === "try" && passed.includes(i)) ||
                      acted.includes(i)
                    ? "bg-emerald-500/70 text-black"
                    : "bg-white/10 text-white/70",
              )}
            >
              {s.kind === "text" ? i + 1 : KIND_MARK[s.kind]}
            </button>
          </li>
        ))}
      </ol>

      <section
        className="flex flex-col gap-3"
        data-step={at}
        data-step-kind={step.kind}
      >
        <p className="text-sky-300 text-xs">
          {KIND_LABEL[step.kind]} · {at + 1}/{lesson.steps.length}
        </p>
        <p className="break-keep text-base leading-relaxed" data-step-body>
          <MoveText
            text={step.body}
            n={lesson.size}
            letters={lesson.id.startsWith("bld")}
          />
        </p>
        {step.sheet && <LessonSheet name={step.sheet} />}
        {step.beside && (
          <Beside
            key={`${lesson.id}-${at}-beside`}
            beside={step.beside}
            masked={masked}
            settings={settings}
          />
        )}
        {step.kind === "text" && (
          <StillCube
            n={lesson.size}
            state={start}
            mask={mask}
            settings={settings}
          />
        )}
        {lesson.stageMap && !step.stageMap && (
          <StageStrip course={course} settings={settings} />
        )}
        {step.kind === "demo" && step.stageMap && (
          <StageMapDemo
            key={`${lesson.id}-${at}-map`}
            course={course}
            settings={settings}
            onWatched={markActed}
          />
        )}
        {step.kind === "demo" &&
          step.alg &&
          !step.stageMap &&
          (demoTurn ? (
            <TurnPanel
              key={`${lesson.id}-${at}-turn`}
              n={lesson.size}
              start={start}
              alg={step.alg}
              mask={mask}
              settings={settings}
              onPassed={markActed}
            />
          ) : (
            <DemoCube
              n={lesson.size}
              start={start}
              alg={step.alg}
              mask={mask}
              settings={settings}
              arrowKeys
            />
          ))}
        {step.kind === "demo" &&
          step.alg &&
          !step.stageMap &&
          demoOffersTurn(lesson, at) && (
            <button
              type="button"
              data-demo-turn
              aria-pressed={demoTurn}
              onClick={(e) => {
                setDemoTurn((v) => !v);
                e.currentTarget.blur();
              }}
              className="self-center rounded-lg border border-sky-300/60 bg-sky-500/20 px-4 py-1.5 text-sm hover:bg-sky-500/30"
            >
              {demoTurn ? "시연 다시 보기" : "직접 해 보기"}
            </button>
          )}
        {step.kind === "turn" && step.alg && (
          <TurnPanel
            key={`${lesson.id}-${at}`}
            n={lesson.size}
            start={start}
            alg={step.alg}
            mask={mask}
            settings={settings}
            onPassed={markActed}
          />
        )}
        {step.kind === "find" && (
          <FindPanel
            key={`${lesson.id}-${at}`}
            lesson={lesson}
            step={step}
            start={start}
            mask={mask}
            settings={settings}
            onPassed={markActed}
          />
        )}
        {step.kind === "quiz" && (
          <QuizPanel
            key={`${lesson.id}-${at}`}
            lesson={lesson}
            step={step}
            start={start}
            mask={mask}
            settings={settings}
            onPassed={markActed}
          />
        )}
        {step.kind === "look" && (
          <LookPanel
            key={`${lesson.id}-${at}`}
            lesson={lesson}
            step={step}
            start={start}
            mask={mask}
            settings={settings}
            onPassed={markActed}
          />
        )}
        {step.kind === "try" && (
          <TryPanel
            key={`${lesson.id}-${at}`}
            lesson={lesson}
            step={step}
            masked={masked}
            settings={settings}
            onPassed={() => setProgress(markTryPassed(lesson.id, at))}
          />
        )}
      </section>

      <nav className="flex flex-wrap items-center gap-2 border-white/10 border-t pt-3">
        <button
          type="button"
          disabled={at === 0}
          onClick={() => setAt((i) => i - 1)}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm disabled:opacity-40"
        >
          ← 이전
        </button>
        {isLast ? (
          <>
            <button
              type="button"
              data-lesson-done
              onClick={() => setProgress(markLessonDone(lesson.id))}
              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-black text-sm"
            >
              {progress.lessons[lesson.id]?.done
                ? "끝낸 단원 ✓"
                : "단원 끝내기"}
            </button>
            {lesson.drill && (
              <a
                data-lesson-drill={lesson.drill}
                href={trainHref(lesson.drill)}
                onClick={() => setProgress(markLessonDone(lesson.id))}
                className="rounded-lg border border-sky-300/60 bg-sky-500/20 px-4 py-2 text-sm hover:bg-sky-500/30"
              >
                이 공식 훈련하기: {drillTitle(lesson.drill)}
              </a>
            )}
            {next && (
              <a
                href={lessonHref(next.id)}
                onClick={() => setProgress(markLessonDone(lesson.id))}
                className="ml-auto rounded-lg bg-sky-500 px-4 py-2 font-semibold text-black text-sm"
              >
                다음 단원: {next.title} →
              </a>
            )}
          </>
        ) : (
          <button
            type="button"
            data-step-next
            onClick={() => setAt((i) => i + 1)}
            className={cn(
              "ml-auto rounded-lg px-4 py-2 text-sm",
              done
                ? "bg-sky-500 font-semibold text-black"
                : "bg-white/10 text-white/70",
            )}
          >
            {done ? "다음 →" : "건너뛰기 →"}
          </button>
        )}
      </nav>
      {isLast && !next && <CourseNext course={course} />}
    </>
  );
}

/** 곁 그림: 다른 크기 큐브를 정지 그림으로(예: 2×2 단원의 꼭짓점만 보이는 3×3) */
function Beside({
  beside,
  masked,
  settings,
}: {
  beside: BesideCube;
  masked: boolean;
  settings: CubeSettings;
}) {
  const n = beside.size;
  const state = useMemo(
    () =>
      beside.setup
        ? applyMoves(n, solvedCube(n), parseMoves(n, beside.setup.alg))
        : solvedCube(n),
    [n, beside.setup],
  );
  const mask = useMemo(
    () => (masked ? maskFor(n, beside.mask) : null),
    [masked, n, beside.mask],
  );
  return (
    <figure
      className="mx-auto flex w-full max-w-[220px] flex-col items-center gap-1"
      data-step-beside={n}
    >
      <StillCube n={n} state={state} mask={mask} settings={settings} />
      <figcaption className="break-keep text-center text-white/60 text-xs">
        {beside.caption}
      </figcaption>
    </figure>
  );
}
