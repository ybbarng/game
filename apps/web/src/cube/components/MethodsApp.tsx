"use client";

import { useEffect, useState } from "react";

import { setCurrentSize, sizeFor, useCurrentSize } from "../current-size";
import {
  BASICS,
  courseById,
  courseSizes,
  METHOD_COURSES,
} from "../learn/courses";
import { type LearnProgress, loadLearn } from "../learn/progress";
import {
  MAP_METHODS,
  type MapMethod,
  type MapMethodId,
} from "../learn/solve-map";
import type { Course } from "../learn/types";
import { BASICS_ICON, BASICS_TITLE, METHODS_TITLE } from "../nav/learn-names";
import { CourseGrid, findLesson } from "./LearnApp";
import { lessonHref } from "./LearnLinks";
import { SizePicker } from "./SizePicker";
import {
  MapScreen,
  MethodCards,
  mapSizeFor,
  patchQuery,
  useMethodCtx,
} from "./SolveMapApp";
import { MethodScreen } from "./SolveMapCards";
import "@/cube/components/cube-fx.css";

/**
 * 해법 배우기(`/cube/methods`, docs/47 16-2·16-26·16-27·16-30): 첫 모습은 그 크기의 해법 카드(초보자 → 고급), 그 아래 강의
 * 목록(강의마다 단원과 연습). 「전체 보기」(`?view=map`)는 해법 지도, 카드를 누르면 해법 화면(`?method=<해법>`, 세부 걸음과
 * 그 해법의 강의). `?m=<과정 id>`로 열면 그 강의를 보인다(예전 주소 그대로).
 */
export function MethodsApp() {
  const [progress, setProgress] = useState<LearnProgress | null>(null);
  const [query, setQuery] = useState<{
    picked: string | null;
    view: "map" | null;
    method: MapMethodId | null;
  } | null>(null);
  useEffect(() => {
    const read = () => {
      const q = new URLSearchParams(window.location.search);
      setQuery({
        picked: q.get("m"),
        view: q.get("view") === "map" ? "map" : null,
        method:
          (MAP_METHODS.find((m) => m.id === q.get("method"))?.id as
            | MapMethodId
            | undefined) ?? null,
      });
    };
    read();
    setProgress(loadLearn());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const ready = progress && query;
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex max-w-4xl flex-col gap-4 break-keep px-4 py-4"
        data-cube-learn="list"
        data-cube-methods={ready ? "" : undefined}
      >
        {ready && (
          <MethodsHome
            progress={progress}
            picked={query.picked}
            view={query.view}
            method={query.method}
            go={(patch) => {
              patchQuery(patch, "push");
              setQuery(
                (q) =>
                  q && {
                    ...q,
                    ...("view" in patch
                      ? { view: patch.view === "map" ? "map" : null }
                      : {}),
                    ...("method" in patch
                      ? { method: (patch.method as MapMethodId | null) ?? null }
                      : {}),
                  },
              );
              window.scrollTo({ top: 0 });
            }}
          />
        )}
      </main>
    </div>
  );
}

/** 크기별로 과정을 묶는다(3×3 → 2×2 → 4×4 → 5×5 → 6×6 → 7×7, 크기 안에서는 COURSES 차례) */
const COURSES_BY_SIZE: [number, Course[]][] = [3, 2, 4, 5, 6, 7]
  .map((size): [number, Course[]] => [
    size,
    METHOD_COURSES.filter((c) => courseSizes(c).includes(size)),
  ])
  .filter(([, list]) => list.length > 0);
/** 해법 배우기에서 고를 수 있는 크기(과정이 있는 크기) */
const COURSE_SIZES = COURSES_BY_SIZE.map(([s]) => s);

function MethodsHome({
  progress,
  picked,
  view,
  method,
  go,
}: {
  progress: LearnProgress;
  picked: string | null;
  view: "map" | null;
  method: MapMethodId | null;
  go: (patch: Record<string, string | null>) => void;
}) {
  // 이어서 하기는 해법 과정 단원만(기초 단원은 큐브의 기초 페이지에 있다)
  const found = progress.last ? findLesson(progress.last) : null;
  const last = found && found.course.id !== BASICS.id ? found : null;
  const pickedCourse = picked ? courseById(picked) : undefined;
  // 보이는 크기: 지금 크기(이 화면에 없으면 3×3, docs/47 16-28). `?m=`로 연 해법은 그 해법 크기를 보이되 지금 크기는
  // 그대로 둔다(보기). 크기 단추를 누르면 지금 크기도 바뀐다
  const current = useCurrentSize();
  // 두 크기에 보이는 과정(6×6·7×7로 넓히기)은 지금 크기가 그 가운데 하나면 지금 크기 그대로
  const [viewing, setViewing] = useState<number | null>(() =>
    pickedCourse && !courseSizes(pickedCourse).includes(current)
      ? pickedCourse.size
      : null,
  );
  const size = viewing ?? sizeFor(COURSE_SIZES, current);
  const pickSize = (s: number) => {
    setViewing(null);
    setCurrentSize(s);
  };
  useEffect(() => {
    if (pickedCourse && !view && !method)
      document
        .getElementById(`course-${pickedCourse.id}`)
        ?.scrollIntoView({ block: "start" });
  }, [pickedCourse, view, method]);
  const mapN = mapSizeFor(size);

  if (view === "map")
    return (
      <MapScreen
        size={mapN ?? 3}
        progress={progress}
        onSize={pickSize}
        onBack={() =>
          go({ view: null, sel: null, from: null, x: null, more: null })
        }
      />
    );
  const open = method ? MAP_METHODS.find((m) => m.id === method) : undefined;
  if (open)
    return (
      <OpenMethod
        m={open}
        progress={progress}
        onBack={() => go({ method: null, x: null })}
      />
    );

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <a href="/cube" className="text-sm text-white/70 hover:text-white">
          ← 큐브
        </a>
        <h1 className="font-bold text-lg">{METHODS_TITLE}</h1>
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
        <a
          href="/cube/basics"
          data-learn-basics
          className="rounded-full border border-white/15 px-2.5 py-1 hover:bg-white/10"
        >
          {BASICS_ICON} {BASICS_TITLE}
        </a>
      </p>
      <SizePicker
        attr="data-course-sizes"
        optionAttr="data-size-tab"
        sizes={COURSE_SIZES}
        value={size}
        onPick={pickSize}
        badge={(s) => COURSES_BY_SIZE.find(([k]) => k === s)?.[1].length ?? 0}
        className="self-start"
      />
      {mapN && (
        <MethodCards
          key={mapN}
          n={mapN}
          progress={progress}
          onOpen={(m) => go({ method: m.id })}
          onMap={() => go({ view: "map" })}
        />
      )}
      {COURSES_BY_SIZE.filter(([s]) => s === size).map(([s, courses]) => (
        <section
          key={s}
          data-course-size={s}
          className="cube-rise flex flex-col gap-2"
        >
          {mapN && <h2 className="font-semibold">강의</h2>}
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

/** 해법 화면: 세부 걸음과 그 아래 그 해법의 강의(단원·연습) */
function OpenMethod({
  m,
  progress,
  onBack,
}: {
  m: MapMethod;
  progress: LearnProgress;
  onBack: () => void;
}) {
  const ctx = useMethodCtx(m, progress);
  const course = m.course ? courseById(m.course) : undefined;
  return (
    <MethodScreen m={m} ctx={ctx} onBack={onBack}>
      {course && (
        <section className="flex flex-col gap-2" data-method-course>
          <h3 className="font-semibold">강의</h3>
          <CourseGrid
            courses={[course]}
            progress={progress}
            picked={course.id}
          />
        </section>
      )}
    </MethodScreen>
  );
}
