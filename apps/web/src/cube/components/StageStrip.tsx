"use client";

import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { useMemo, useState } from "react";

import { cn } from "@/lib/cn";
import { faceGrid } from "../bridge";
import { type Course, lessonPlace } from "../learn";
import type { LearnProgress } from "../learn/progress";
import type { CubeSettings } from "../settings";
import { CubeNet } from "./CubeNet";
import { DemoCube } from "./DemoCube";

/**
 * 과정의 단계 지도(docs/47 8-6). 단원 머리의 작은 띠(「7단계 중 3단계」)와,
 * 지도 단원의 그림 띠 + 단계별 시연. 단계 칸은 과정 자료(course.stages)에서, 그림은 지도 시연의 단계 끝 모습에서 온다.
 */

/** 지도 시연의 단계 시작 모습들(마지막은 다 맞춘 모습). 시연이 없으면 null */
function stageStates(course: Course): PuzzleState[] | null {
  const demo = course.stageDemo;
  if (!demo) return null;
  const n = course.size;
  let s = applyMoves(n, solvedCube(n), parseMoves(n, demo.scramble));
  const out = [s];
  for (const m of demo.moves) {
    s = applyMoves(n, s, parseMoves(n, m));
    out.push(s);
  }
  return out;
}

const stageDone = (course: Course, i: number, progress: LearnProgress) => {
  const st = course.stages?.[i];
  return (
    st !== undefined &&
    st.lessons.length > 0 &&
    st.lessons.every((id) => progress.lessons[id]?.done)
  );
};

/** 단원 머리: 지금 자리(준비·전체 흐름·k단계·마무리)와 단계 칸 */
export function StageHeader({
  course,
  lessonId,
  progress,
}: {
  course: Course;
  lessonId: string;
  progress: LearnProgress;
}) {
  const stages = course.stages;
  if (!stages || stages.length === 0) return null;
  const place = lessonPlace(course, lessonId);
  const label =
    place.kind === "stage"
      ? `${stages.length}단계 중 ${place.index + 1}단계`
      : place.kind === "prep"
        ? "준비"
        : place.kind === "map"
          ? `전체 ${stages.length}단계`
          : "마무리";
  const current = place.kind === "stage" ? place.index : -1;
  return (
    <nav
      aria-label="단계 지도"
      data-stage-header={place.kind}
      className="flex items-center gap-2 overflow-x-auto text-[11px]"
    >
      <span
        data-stage-label
        className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 font-semibold text-sky-200"
      >
        {label}
      </span>
      <ol className="flex shrink-0 items-center gap-1">
        {stages.map((st, i) => {
          const done = stageDone(course, i, progress);
          const first = st.lessons[0];
          const cell = (
            <span
              className={cn(
                "flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5",
                i === current
                  ? "bg-sky-500 font-bold text-black"
                  : done
                    ? "bg-emerald-500/30 text-emerald-100"
                    : "bg-white/10 text-white/60",
              )}
            >
              <span>{done && i !== current ? "✓" : i + 1}</span>
              <span className={i === current ? "" : "hidden sm:inline"}>
                {st.title}
              </span>
            </span>
          );
          return (
            <li
              key={st.title}
              data-stage={i}
              data-stage-done={done ? "" : undefined}
              aria-current={i === current ? "step" : undefined}
            >
              {first ? (
                <a href={`/cube/learn?lesson=${first}`} title={st.title}>
                  {cell}
                </a>
              ) : (
                cell
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * 마무리 해 보기의 진행 띠(docs/47 8-1): 지금 큐브가 몇 단계까지 맞았는지(`reached`, 이미 있는 목표 판정)와
 * 지금 할 단계. 칸마다 그 단원으로 가는 링크(「다시 보기」), 흰 면 위에서 하는 단계 표시와 뒤집기 안내.
 * `upTo`: 흰 면을 위로 들고 하는 단계 수(3×3 초보자는 흰 십자·첫 층 코너 둘)
 */
export function StageProgress({
  course,
  reached,
  upTo,
}: {
  course: Course;
  reached: number;
  upTo: number;
}) {
  const stages = course.stages ?? [];
  const all = reached >= stages.length;
  const now = stages[Math.min(reached, stages.length - 1)];
  const review = now?.lessons[0];
  return (
    <nav
      aria-label="맞춘 단계"
      data-finale-progress={reached}
      className="flex w-full max-w-xl flex-col gap-1.5"
    >
      <ol className="grid grid-cols-4 gap-1 sm:grid-cols-7">
        {stages.map((st, i) => {
          const done = i < reached;
          const current = i === reached;
          const first = st.lessons[0];
          return (
            <li
              key={st.title}
              data-finale-cell={i}
              data-done={done ? "" : undefined}
              aria-current={current ? "step" : undefined}
            >
              <a
                href={first ? `/cube/learn?lesson=${first}` : undefined}
                aria-label={`${i + 1}단계 ${st.title}${done ? "(맞음)" : ""} 단원 다시 보기`}
                title="이 단원 다시 보기"
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 text-center text-[11px] leading-tight",
                  current
                    ? "bg-sky-500 font-bold text-black"
                    : done
                      ? "bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/40"
                      : "bg-white/10 text-white/60 hover:bg-white/15",
                )}
              >
                <span>{done ? "✓" : i + 1}</span>
                <span className="break-keep">{st.title}</span>
                {i < upTo && (
                  <span
                    className={cn(
                      "text-[10px]",
                      current ? "text-black/70" : "text-white/45",
                    )}
                  >
                    흰 면 위
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ol>
      <p
        className="flex flex-wrap items-center justify-center gap-x-2 text-center text-white/70 text-xs"
        data-finale-now
      >
        {all ? (
          <span>일곱 단계를 다 맞췄어요</span>
        ) : (
          <>
            <span>
              지금 {reached + 1}단계 · {now?.title}
            </span>
            {review && (
              <a
                data-finale-review={review}
                href={`/cube/learn?lesson=${review}`}
                className="text-sky-300 underline hover:text-sky-200"
              >
                이 단원 다시 보기 →
              </a>
            )}
          </>
        )}
      </p>
      {upTo > 0 && (
        <p className="break-keep text-center text-[11px] text-white/45">
          1~{upTo}단계는 흰 면을 위로 들고 해요. 첫 층이 끝나면 큐브를
          뒤집어(z2) 흰 면을 아래로 두고 나머지를 해요.
        </p>
      )}
    </nav>
  );
}

/** 지도 단원의 그림 띠. `active`가 있으면 그 칸을 밝히고, `onPick`이 있으면 칸을 눌러 고른다 */
export function StageStrip({
  course,
  settings,
  active,
  onPick,
}: {
  course: Course;
  settings: CubeSettings;
  active?: number;
  onPick?: (i: number) => void;
}) {
  const states = useMemo(() => stageStates(course), [course]);
  const stages = course.stages ?? [];
  return (
    <ol
      data-stage-strip={stages.length}
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${Math.min(stages.length, 4)}, minmax(0, 1fr))`,
      }}
    >
      {stages.map((st, i) => {
        const after = states?.[i + 1];
        const body = (
          <>
            {after && (
              <CubeNet
                n={course.size}
                faces={faceGrid(course.size, after)}
                colors={settings.colors}
                hidden={settings.hidden}
                className="h-auto w-full"
              />
            )}
            <span className="flex items-baseline gap-1 break-keep text-[11px] leading-tight">
              <span className="font-bold">{i + 1}</span>
              <span>{st.title}</span>
            </span>
          </>
        );
        const cls = cn(
          "flex w-full flex-col items-center gap-1 rounded-lg border p-1.5 text-center",
          i === active
            ? "border-sky-300 bg-sky-500/25"
            : "border-white/10 bg-white/5",
        );
        return (
          <li
            key={st.title}
            data-stage={i}
            aria-current={i === active ? "step" : undefined}
          >
            {onPick ? (
              <button
                type="button"
                data-stage-pick={i}
                onClick={(e) => {
                  onPick(i);
                  e.currentTarget.blur();
                }}
                className={cn(cls, "hover:bg-white/10")}
              >
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** 지도 시연: 단계 하나씩 시연한다. 띠 칸이나 「다음 단계」로 고르고, 단계가 끝나면 멈춘다 */
export function StageMapDemo({
  course,
  settings,
  onWatched,
}: {
  course: Course;
  settings: CubeSettings;
  /** 마지막 단계까지 골라 봤다 */
  onWatched?: () => void;
}) {
  const [at, setAt] = useState(0);
  const states = useMemo(() => stageStates(course), [course]);
  const demo = course.stageDemo;
  const stages = course.stages ?? [];
  if (!demo || !states) return null;
  const pick = (i: number) => {
    setAt(i);
    if (i === stages.length - 1) onWatched?.();
  };
  return (
    <div className="flex flex-col gap-3" data-stage-demo={at}>
      <StageStrip
        course={course}
        settings={settings}
        active={at}
        onPick={pick}
      />
      <p className="text-center font-semibold text-sm" data-stage-now>
        {at + 1}단계 · {stages[at]?.title}
      </p>
      <DemoCube
        key={at}
        n={course.size}
        start={states[at] as PuzzleState}
        alg={demo.moves[at] as string}
        mask={null}
        settings={settings}
        tps={3}
        autoPlay
        arrowKeys
      />
      <div className="flex justify-center gap-2">
        <button
          type="button"
          disabled={at === 0}
          onClick={() => pick(at - 1)}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ◀ 이전 단계
        </button>
        <button
          type="button"
          data-stage-next
          disabled={at === stages.length - 1}
          onClick={() => pick(at + 1)}
          className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-black text-sm disabled:opacity-40"
        >
          다음 단계 ▶
        </button>
      </div>
    </div>
  );
}
