"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { BASICS } from "../learn/courses";
import { type LearnProgress, loadLearn } from "../learn/progress";
import {
  BASICS_TITLE,
  METHODS_HREF,
  METHODS_ICON,
  METHODS_TITLE,
} from "../nav/learn-names";
import { useCubeSettings } from "../settings";
import { CoreCube } from "./CoreCube";
import { lessonHref } from "./LearnLinks";
import "@/cube/components/cube-fx.css";

/**
 * 큐브의 기초(`/cube/basics`, docs/47 16-27): 큐브 상태를 바꾸지 않는 기초. 맨 위에 분해한 큐브의 속 3D, 그 아래 기초 단원
 * 셋(이름과 진행 ✓만), 해법과 상관없이 모두가 쓰는 연습(키 익히기·핑거 트릭), 맨 아래 다음 걸음인 해법 배우기.
 * 덧붙임 문구는 두지 않는다(docs/standing-rules.md 3절): 제목, 단원 이름, 칸 이름만.
 */

interface Link {
  icon: string;
  title: string;
  href: string;
  attr: string;
}

/** 해법과 상관없이 모두가 쓰는 연습 */
const PRACTICE: Link[] = [
  {
    icon: "⌨️",
    title: "키 익히기",
    href: "/cube/intro?part=keys",
    attr: "data-basics-keys",
  },
  {
    icon: "✋",
    title: "핑거 트릭",
    href: "/cube/fingers",
    attr: "data-basics-fingers",
  },
];

const cardClass =
  "flex min-w-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-3 transition hover:bg-white/10 active:scale-[0.98]";

export function BasicsApp() {
  const settings = useCubeSettings();
  const [progress, setProgress] = useState<LearnProgress>({ lessons: {} });
  useEffect(() => setProgress(loadLearn()), []);
  return (
    <div data-game="cube" className="min-h-dvh bg-neutral-900 text-white">
      <main
        className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4"
        data-cube-basics
      >
        <header className="flex items-center gap-3">
          <a href="/cube" className="text-sm text-white/70 hover:text-white">
            ← 큐브
          </a>
          <h1 className="font-bold text-lg">{BASICS_TITLE}</h1>
        </header>
        {/* 검은 조각·연결부가 바탕에 묻히지 않게 조금 밝은 판 위에 둔다 */}
        <div
          className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_50%_45%,#4a4a52_0%,#2a2a30_55%,#1f1f23_100%)]"
          data-basics-model
        >
          <CoreCube colors={settings.colors} />
        </div>
        <section className="flex flex-col gap-1.5">
          <h2 className="px-1 font-semibold text-white/50 text-xs">단원</h2>
          <ol className="flex flex-col gap-2">
            {BASICS.lessons.map((l, i) => {
              const done = progress.lessons[l.id]?.done === true;
              return (
                <li key={l.id}>
                  <a
                    href={lessonHref(l.id)}
                    data-lesson={l.id}
                    data-lesson-done={done ? "" : undefined}
                    className={cardClass}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
                        done
                          ? "bg-emerald-500 font-bold text-black"
                          : "bg-white/10 text-white/70",
                      )}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className="truncate font-bold text-sm">
                      {l.title}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="flex flex-col gap-1.5">
          <h2 className="px-1 font-semibold text-white/50 text-xs">연습</h2>
          <div className="grid grid-cols-2 gap-2">
            {PRACTICE.map((p) => (
              <a
                key={p.href}
                href={p.href}
                {...{ [p.attr]: "" }}
                className={cardClass}
              >
                <span aria-hidden className="text-xl">
                  {p.icon}
                </span>
                <span className="truncate font-bold text-sm">{p.title}</span>
              </a>
            ))}
          </div>
        </section>
        <a
          href={METHODS_HREF}
          data-basics-methods
          className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-sky-300/50 bg-sky-500/15 px-4 py-3 transition hover:bg-sky-500/25 active:scale-[0.98]"
        >
          <span aria-hidden className="text-2xl">
            {METHODS_ICON}
          </span>
          <span className="truncate font-bold">{METHODS_TITLE} →</span>
        </a>
      </main>
    </div>
  );
}
