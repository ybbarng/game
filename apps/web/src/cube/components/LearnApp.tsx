"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { COURSES, type Course, type Lesson } from "../learn";
import { maskFor, stepStart } from "../learn/judge";
import {
  type LearnProgress,
  loadLearn,
  markLessonDone,
  markLessonOpened,
  markTryPassed,
} from "../learn/progress";
import { useCubeSettings } from "../settings";
import { DemoCube } from "./DemoCube";
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

const KIND_LABEL = { text: "설명", demo: "시연", try: "해보기" } as const;

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

const lessonHref = (id: string) => `/cube/learn?lesson=${id}`;

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
          href="/cube/fingers"
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
        >
          핑거 트릭
        </a>
      </header>
      <p className="break-keep text-sm text-white/70">
        단원을 차례대로 따라 하면 끝까지 맞출 수 있습니다. 순서를 건너뛰어도
        되지만, 처음이라면 3×3 초보자부터. 진도는 이 기기에만 남습니다.
      </p>
      {last && (
        <a
          href={lessonHref(last.lesson.id)}
          className="self-start rounded-xl bg-sky-500 px-4 py-2 font-semibold text-black text-sm"
        >
          이어서 하기: {last.course.title} · {last.lesson.title}
        </a>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {COURSES.map((course) => {
          const done = course.lessons.filter(
            (l) => progress.lessons[l.id]?.done,
          ).length;
          return (
            <section
              key={course.id}
              data-course={course.id}
              className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-white/5 p-4"
            >
              <div className="flex items-baseline gap-2">
                <h2 className="font-bold">{course.title}</h2>
                <span className="ml-auto text-white/50 text-xs">
                  {done}/{course.lessons.length}
                </span>
              </div>
              <p className="break-keep text-white/60 text-xs">
                {course.summary}
              </p>
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
    </>
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

  const demoStart = useMemo(
    () => (step && step.kind === "demo" ? stepStart(lesson, step, 1) : null),
    [lesson, step],
  );
  const demoMask = useMemo(
    () => (masked ? maskFor(lesson.size, step?.mask) : null),
    [masked, lesson.size, step?.mask],
  );
  if (!step) return null;
  const isLast = at === lesson.steps.length - 1;
  const hasMask = step.mask !== undefined && step.mask !== "all";

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

      {/* 단계 표시 */}
      <ol className="flex flex-wrap gap-1" aria-label="단계">
        {lesson.steps.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 단계 차례가 곧 열쇠다
          <li key={`${i}-${s.kind}`}>
            <button
              type="button"
              onClick={() => setAt(i)}
              aria-current={i === at ? "step" : undefined}
              title={KIND_LABEL[s.kind]}
              className={cn(
                "h-7 min-w-7 rounded-md px-1.5 text-xs",
                i === at
                  ? "bg-sky-500 font-bold text-black"
                  : s.kind === "try" && passed.includes(i)
                    ? "bg-emerald-500/70 text-black"
                    : "bg-white/10 text-white/70",
              )}
            >
              {s.kind === "try" ? "✋" : s.kind === "demo" ? "▶" : i + 1}
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
        <p className="break-keep text-base leading-relaxed">{step.body}</p>
        {step.kind === "demo" && demoStart && step.alg && (
          <DemoCube
            n={lesson.size}
            start={demoStart}
            alg={step.alg}
            mask={demoMask}
            settings={settings}
            arrowKeys
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
            className="ml-auto rounded-lg bg-sky-500 px-4 py-2 font-semibold text-black text-sm"
          >
            다음 →
          </button>
        )}
      </nav>
    </>
  );
}
