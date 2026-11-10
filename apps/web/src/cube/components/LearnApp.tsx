"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { backViewText } from "../back-view";
import {
  type BesideCube,
  COURSES,
  type Course,
  courseById,
  type Lesson,
  type LessonStep,
} from "../learn";
import {
  demoBodyParts,
  demoOffersTurn,
  stepIsActive,
  stepPicture,
} from "../learn/interact";
import { maskFor, stepStart } from "../learn/judge";
import { practiceLinks } from "../learn/practice";
import {
  LESSON_RENAMES,
  type LearnProgress,
  loadLearn,
  markLessonDone,
  markLessonOpened,
  markStepActed,
  markStepSeen,
  markTryPassed,
  resumeStep,
} from "../learn/progress";
import { redirectTarget } from "../nav/redirect";
import { type CubeSettings, useCubeSettings } from "../settings";
import { touchText } from "../touch-text";
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
  PlayPanel,
  QuizPanel,
  TurnPanel,
  WelcomePanel,
} from "./LessonActs";
import { MoveText } from "./MoveChip";
import { BuildPanel, PartsPanel } from "./PieceStage";
import { useNoKeyboard } from "./PracticeCube";
import { StageHeader, StageMapDemo, StageStrip } from "./StageStrip";
import { StillCube } from "./StillCube";
import { KIND_LABEL, KIND_MARK } from "./step-kinds";
import { TryPanel } from "./TryPanel";

/**
 * 배우기 단원(`/cube/learn?lesson=<id>`, docs/47 8-1): 설명 → 시연 → 직접 해보기. 과정 목록은 해법 익히기(`MethodsApp`, `/cube/methods`)로 옮겼다.
 * 단원은 `?lesson=<id>`로 연다. 진도는 이 기기에 남고, 다음 단원을 잠그지는 않지만 차례를 보여 준다.
 */

function findLesson(id: string): { course: Course; lesson: Lesson } | null {
  // 새로 짠 단원의 옛 주소(`?lesson=<옛 id>`)도 새 단원으로 연다
  const want = LESSON_RENAMES[id] ?? id;
  for (const course of COURSES) {
    const lesson = course.lessons.find((l) => l.id === want);
    if (lesson) return { course, lesson };
  }
  return null;
}

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
  // 과정 목록은 해법 익히기로 옮겼다(docs/47 16-6): 단원이 없는 주소는 그리로 넘긴다
  useEffect(() => {
    if (lessonId !== undefined && !found)
      window.location.replace(
        redirectTarget("/cube/methods", window.location.search),
      );
  }, [lessonId, found]);
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4"
        data-cube-learn={found ? found.lesson.id : "list"}
      >
        {found ? (
          <LessonView
            key={found.lesson.id}
            course={found.course}
            lesson={found.lesson}
            progress={progress}
            setProgress={setProgress}
          />
        ) : null}
      </main>
    </div>
  );
}

/**
 * 해법 익히기(`/cube/methods`, docs/47 16-2): 해법(과정)을 고르면 그 해법의 배우기(단원)와 연습(공식 훈련 묶음·십자 훈련·
 * 내 공식)이 한 카드에 보인다. `?m=<과정 id>`로 열면 그 해법 카드를 보인다. 예전 배우기 과정 목록(`/cube/learn`)을 옮겼다.
 */
export function MethodsApp() {
  const [progress, setProgress] = useState<LearnProgress | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    setProgress(loadLearn());
    setPicked(new URLSearchParams(window.location.search).get("m"));
  }, []);
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4"
        data-cube-learn="list"
        data-cube-methods={progress ? "" : undefined}
      >
        {progress && <CourseList progress={progress} picked={picked} />}
      </main>
    </div>
  );
}

function CourseList({
  progress,
  picked,
}: {
  progress: LearnProgress;
  picked: string | null;
}) {
  const last = progress.last ? findLesson(progress.last) : null;
  const pickedCourse = picked ? courseById(picked) : undefined;
  // 처음 보이는 크기: 고른 해법, 마지막으로 연 단원의 크기, 없으면 3×3
  const [size, setSize] = useState<number>(
    () => pickedCourse?.size ?? last?.course.size ?? 3,
  );
  useEffect(() => {
    if (pickedCourse)
      document
        .getElementById(`course-${pickedCourse.id}`)
        ?.scrollIntoView({ block: "start" });
  }, [pickedCourse]);
  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <a href="/cube" className="text-sm text-white/70 hover:text-white">
          ← 큐브
        </a>
        <h1 className="font-bold text-lg">해법 익히기</h1>
        <a
          href="/cube/train"
          className="ml-auto rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          공식 연습
        </a>
        <a
          href="/cube/algs"
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          내 공식
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
      {/* 배우기 전에 볼 것(처음 온 사람의 길이 여기서도 이어지게, 2026-11-05 점검) */}
      <p
        className="flex flex-wrap gap-2 text-white/70 text-xs"
        data-learn-before
      >
        <a
          href="/cube/intro"
          className="rounded-full border border-white/15 px-2.5 py-1 hover:bg-white/10"
        >
          👋 사이트 쓰는 법
        </a>
      </p>
      {/* 크기 탭: 고급 해법까지 모두 펼치면 2×2까지 한참 내려가야 했다(2026-11-04 점검) */}
      <div
        role="tablist"
        aria-label="큐브 크기"
        className="flex gap-1 self-start rounded-xl bg-white/5 p-1"
      >
        {COURSES_BY_SIZE.map(([s, courses]) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === size}
            data-size-tab={s}
            onClick={(e) => {
              setSize(s);
              e.currentTarget.blur();
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition active:scale-[0.97]",
              s === size
                ? "bg-white/15 font-semibold text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white",
            )}
          >
            {s}×{s}
            <span className="ml-1 text-[11px] text-white/45">
              {courses.length}
            </span>
          </button>
        ))}
      </div>
      {COURSES_BY_SIZE.filter(([s]) => s === size).map(([s, courses]) => (
        <section
          key={s}
          data-course-size={s}
          role="tabpanel"
          className="cube-rise flex flex-col gap-2"
        >
          <CourseGrid
            courses={courses}
            progress={progress}
            picked={pickedCourse?.id ?? null}
          />
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
  picked,
}: {
  courses: Course[];
  progress: LearnProgress;
  picked: string | null;
}) {
  return (
    // items-start: 펼친 카드 옆의 접힌 카드가 같은 높이로 늘어나 비어 보이지 않게(2026-11-10 사용자 「프리드리히는 왜 내용이 거의 없어 보여?」)
    <div className="grid items-start gap-4 md:grid-cols-2">
      {courses.map((course, index) => {
        const done = course.lessons.filter(
          (l) => progress.lessons[l.id]?.done,
        ).length;
        // 단원 목록은 그 크기의 첫 과정·고른 과정·손댄 과정만 펼친다(나머지는 눌러서)
        const open =
          index === 0 ||
          course.id === picked ||
          course.lessons.some((l) => progress.lessons[l.id]);
        const practice = practiceLinks(course, drillTitle);
        // 앞 과정(예: 3×3 초보자)을 다 끝냈고 이 과정은 아직이면 눈에 띄게
        const before = COURSES.find((c) => c.id === course.recommendAfter);
        const recommended =
          before !== undefined &&
          done < course.lessons.length &&
          before.lessons.every((l) => progress.lessons[l.id]?.done);
        return (
          <section
            key={course.id}
            id={`course-${course.id}`}
            data-course={course.id}
            data-course-recommended={recommended ? "" : undefined}
            data-course-picked={course.id === picked ? "" : undefined}
            className={cn(
              // min-w-0: 접힌 카드의 단원 이름 한 줄(truncate)이 칸 폭을 밀어 넓히지 않게
              "flex min-w-0 scroll-mt-4 flex-col gap-2 rounded-2xl border p-4",
              // 단원을 펼쳐 둔 과정은 가로를 다 쓴다(옆 칸이 크게 비지 않게)
              open && "md:col-span-2",
              course.id === picked
                ? "border-amber-300/70 bg-amber-400/10"
                : recommended
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
            <details
              data-course-lessons={course.id}
              open={open}
              className="group"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 rounded-lg px-2 py-1 text-white/60 text-xs hover:bg-white/5 hover:text-white">
                <span
                  aria-hidden
                  className="inline-block transition-transform group-open:rotate-90"
                >
                  ▸
                </span>
                배우기 · 단원 {course.lessons.length}개
                {done > 0 && ` · ${done}개 끝냄`}
                {/* 접혀 있어도 무엇을 배우는지 보이게 단원 이름을 한 줄로 */}
                <span
                  data-course-lesson-names
                  className="basis-full truncate pl-3 text-white/40 group-open:hidden"
                >
                  {course.lessons.map((l) => l.title).join(" · ")}
                </span>
              </summary>
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
            </details>
            {practice.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-1.5 px-2"
                data-course-practice={course.id}
              >
                <span className="text-white/60 text-xs">연습</span>
                {practice.map((p) => (
                  <a
                    key={p.href}
                    href={p.href}
                    data-practice={p.kind}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10"
                  >
                    {p.title}
                  </a>
                ))}
              </div>
            )}
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
  const noKeyboard = useNoKeyboard();
  // 나갔다 들어오면 마지막으로 본 단계로 연다(진도는 단원을 그리기 전에 읽혀 있다)
  const [at, setAt] = useState(() =>
    resumeStep(progress, lesson.id, lesson.steps.length),
  );
  const [masked, setMasked] = useState(true);
  const step = lesson.steps[at] ?? lesson.steps[0];
  const lessonIndex = course.lessons.indexOf(lesson);
  const next = course.lessons[lessonIndex + 1];
  const passed = progress.lessons[lesson.id]?.passed ?? [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: 단원을 열 때 한 번
  useEffect(() => {
    setProgress(markLessonOpened(lesson.id));
  }, [lesson.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계를 옮길 때마다 남긴다
  useEffect(() => {
    setProgress(markStepSeen(lesson.id, at));
  }, [lesson.id, at]);

  // 해낸 상호작용 단계(해 보기는 `passed`, 나머지는 `acted`. 둘 다 진도에 남아 다시 열어도 초록)
  const acted = progress.lessons[lesson.id]?.acted ?? [];
  // 시연 단계는 한 번에 하나만: 「보기」(재생·한 수씩) → 「해 보기」(그 공식을 쳐 보기)
  const [demoTurn, setDemoTurn] = useState(false);
  // 재생을 끝까지 봤나(「이제 해 보세요」로 넘긴다)
  const [demoSeen, setDemoSeen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계를 옮길 때마다 처음(보기)으로
  useEffect(() => {
    setDemoTurn(false);
    setDemoSeen(false);
  }, [at]);

  // 시연·해보기가 아닌 단계는 단원이 노리는 조각이 보이게 그림을 고른다(stepPicture)
  const picture = useMemo(
    () =>
      step &&
      step.kind !== "demo" &&
      step.kind !== "try" &&
      step.kind !== "play" &&
      step.kind !== "welcome" &&
      step.kind !== "parts" &&
      step.kind !== "build"
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
  // 단원 마지막 해 보기(「혼자 해 보기 남음」 꼬리표)
  const lastTry = lesson.steps.findLastIndex((s) => s.kind === "try");
  // 마지막 해 보기를 아직 안 했으면 「다음 단원」을 강조색으로 두지 않는다(2026-11-05 점검)
  const tryLeft = lastTry >= 0 && !passed.includes(lastTry);
  const hasMask = picture.mask !== undefined && picture.mask !== "all";
  const done =
    !stepIsActive(step) ||
    acted.includes(at) ||
    (step.kind === "try" && passed.includes(at));
  const markActed = () => {
    if (!acted.includes(at)) setProgress(markStepActed(lesson.id, at));
  };

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <a
          href={`/cube/methods?m=${course.id}`}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 해법 익히기
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
        {lesson.steps.map((s, i) => {
          const stepDone =
            (s.kind === "try" && passed.includes(i)) || acted.includes(i);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 단계 차례가 곧 열쇠다
            <li key={`${i}-${s.kind}`}>
              <button
                type="button"
                onClick={() => setAt(i)}
                data-step-to={s.kind}
                data-step-done={stepDone ? "" : undefined}
                aria-current={i === at ? "step" : undefined}
                title={KIND_LABEL[s.kind]}
                className={cn(
                  "h-7 min-w-7 rounded-md px-1.5 text-xs",
                  i === at
                    ? "bg-sky-500 font-bold text-black"
                    : stepDone
                      ? "bg-emerald-500/70 text-black"
                      : "bg-white/10 text-white/70",
                )}
              >
                {s.kind === "text" ? i + 1 : KIND_MARK[s.kind]}
              </button>
            </li>
          );
        })}
      </ol>
      {/* 아이콘 뜻(마우스를 올려야 나오던 것을 보이게, 2026-11-05 점검) */}
      <p
        className="-mt-2 flex flex-wrap gap-x-3 text-[11px] text-white/45"
        data-step-legend
      >
        {stepLegend(lesson.steps.map((s) => s.kind)).map(([mark, label]) => (
          <span key={mark}>
            {mark} {label}
          </span>
        ))}
      </p>

      <section
        className="flex flex-col gap-3"
        data-step={at}
        data-step-kind={step.kind}
      >
        <p className="text-sky-300 text-xs">
          {KIND_LABEL[step.kind]} · {at + 1}/{lesson.steps.length}
        </p>
        <p className="break-keep text-base leading-relaxed" data-step-body>
          {step.kind === "demo" ? (
            // 시연: 「보기」에서는 치라는 말을 흐리게, 키캡은 「해 보기」에서만
            demoBodyParts(step.body).map((part, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 문장 차례가 곧 열쇠다
                key={i}
                data-body-doing={part.doing ? "" : undefined}
                className={cn(part.doing && !demoTurn && "text-white/40")}
              >
                <MoveText
                  text={touchText(part.text, noKeyboard)}
                  n={lesson.size}
                  letters={lesson.id.startsWith("bld")}
                  keys={demoTurn}
                />
              </span>
            ))
          ) : (
            <MoveText
              text={touchText(
                backViewText(step.body, settings.backView),
                noKeyboard,
              )}
              n={lesson.size}
              letters={lesson.id.startsWith("bld")}
            />
          )}
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
        {step.kind === "demo" && step.alg && !step.stageMap && (
          <DemoPhases
            offersTurn={demoOffersTurn(lesson, at)}
            turning={demoTurn}
            seen={demoSeen}
            onTurning={setDemoTurn}
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
              passedText={step.passedText}
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
              showKeys={false}
              onEnd={() => {
                setDemoSeen(true);
                // 끝까지 본 시연도 단계 표시를 초록으로
                markActed();
              }}
            />
          ))}
        {step.kind === "turn" && step.alg && (
          <TurnPanel
            key={`${lesson.id}-${at}`}
            n={lesson.size}
            start={start}
            alg={step.alg}
            mask={mask}
            settings={settings}
            passedText={step.passedText}
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
        {step.kind === "welcome" && (
          <WelcomePanel
            onStart={() => {
              markActed();
              setAt((i) => Math.min(i + 1, lesson.steps.length - 1));
            }}
          />
        )}
        {step.kind === "parts" && (
          <PartsPanel
            key={`${lesson.id}-${at}`}
            settings={settings}
            onPassed={markActed}
          />
        )}
        {step.kind === "build" && (
          <BuildPanel
            key={`${lesson.id}-${at}`}
            settings={settings}
            onPassed={markActed}
          />
        )}
        {step.kind === "play" && (
          <PlayPanel
            key={`${lesson.id}-${at}`}
            lesson={lesson}
            step={step}
            start={start}
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
                이 공식 연습하기: {drillTitle(lesson.drill)}
              </a>
            )}
            {next && tryLeft && at !== lastTry && (
              <button
                type="button"
                data-lesson-try-left={lastTry}
                onClick={(e) => {
                  setAt(lastTry);
                  e.currentTarget.blur();
                }}
                title="단원 마지막 해 보기로 가기"
                className="cube-rise ml-auto rounded-full border border-amber-300/50 bg-amber-400/10 px-2.5 py-1 text-amber-200 text-xs transition hover:bg-amber-400/20 active:scale-[0.97]"
              >
                혼자 해 보기 남음
              </button>
            )}
            {next && (
              <a
                href={lessonHref(next.id)}
                data-lesson-next={tryLeft ? "plain" : "strong"}
                onClick={() => setProgress(markLessonDone(lesson.id))}
                className={cn(
                  "ml-auto rounded-lg px-4 py-2 text-sm",
                  tryLeft
                    ? "bg-white/10 text-white/80 hover:bg-white/15"
                    : "bg-sky-500 font-semibold text-black",
                )}
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

/** 단계 띠 아이콘 뜻: 이 단원에 나오는 아이콘만, 같은 아이콘은 이름을 묶는다(✋ 해보기·따라 하기) */
function stepLegend(kinds: LessonStep["kind"][]): [string, string][] {
  const byMark = new Map<string, string[]>();
  for (const k of kinds) {
    if (k === "text") continue;
    const mark = KIND_MARK[k];
    const labels = byMark.get(mark) ?? [];
    if (!labels.includes(KIND_LABEL[k])) labels.push(KIND_LABEL[k]);
    byMark.set(mark, labels);
  }
  return [...byMark].map(([mark, labels]) => [mark, labels.join("·")]);
}

/** 곁 그림: 다른 크기 큐브를 정지 그림으로(예: 2×2 단원의 코너만 보이는 3×3) */
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

/**
 * 시연 단계의 두 상태 띠: ① 보기(재생·한 수씩, 키 안내 없음) → ② 해 보기(그 공식을 쳐 보기, 키캡·「쳐 보세요」).
 * 재생을 끝까지 보면 「해 보기」 칸이 「이제 해 보세요」로 눈에 띈다. 같은 공식의 해 보기가 단원에 따로 있으면
 * 「해 보기」 칸 대신 「다음 단계에서 해 봐요」로 적는다
 */
function DemoPhases({
  offersTurn,
  turning,
  seen,
  onTurning,
}: {
  offersTurn: boolean;
  turning: boolean;
  seen: boolean;
  onTurning: (v: boolean) => void;
}) {
  const tab = (on: boolean) =>
    cn(
      "flex-1 rounded-md px-3 py-1.5 text-sm",
      on ? "bg-sky-500 font-semibold text-black" : "bg-white/5 text-white/70",
    );
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex w-full max-w-sm items-center gap-1 rounded-lg bg-white/5 p-1"
        data-demo-phase={turning ? "do" : "see"}
      >
        <button
          type="button"
          aria-pressed={!turning}
          onClick={(e) => {
            onTurning(false);
            e.currentTarget.blur();
          }}
          className={tab(!turning)}
        >
          ① 보기
        </button>
        <span className="text-white/40" aria-hidden>
          →
        </span>
        {offersTurn ? (
          <button
            type="button"
            data-demo-turn
            aria-pressed={turning}
            onClick={(e) => {
              onTurning(true);
              e.currentTarget.blur();
            }}
            className={cn(
              tab(turning),
              !turning && seen && "animate-pulse bg-amber-400 text-black",
            )}
          >
            ② 해 보기
          </button>
        ) : (
          <span className="flex-1 px-3 py-1.5 text-center text-white/50 text-xs">
            해 보기는 다음 단계에서
          </span>
        )}
      </div>
      {/* 「해 보기」의 안내는 따라 하기 칸이 맡는다 */}
      {!turning && (
        <p className="text-white/60 text-xs" data-demo-say>
          {seen && offersTurn
            ? "다 봤어요. 이제 「해 보기」로 직접 해 보세요."
            : "먼저 보세요. ▶ 재생이나 한 수씩 넘겨 봐요."}
        </p>
      )}
    </div>
  );
}
