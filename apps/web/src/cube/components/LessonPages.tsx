"use client";

import { cn } from "@/lib/cn";
import type { LessonStep } from "../learn/types";
import { KIND_LABEL } from "./step-kinds";

/** 쪽 하나의 읽는 이름: 「3쪽 문제, 지금 쪽」·「2쪽 따라 하기, 마침」 */
export function pageName(
  i: number,
  kind: LessonStep["kind"],
  state: { current: boolean; done: boolean },
): string {
  const tail = [state.current && "지금 쪽", state.done && "마침"].filter(
    Boolean,
  );
  return `${i + 1}쪽 ${KIND_LABEL[kind]}${tail.length ? `, ${tail.join(", ")}` : ""}`;
}

/**
 * 강 위 쪽 칸(docs/47 16-31). 아이콘만으로 뜻을 짐작하게 하지 않는다: 지금 쪽은 「5쪽 / 16쪽 문제」로 크게, 칸은 진행
 * 막대처럼 번호(마친 쪽 ✓)와 지금 쪽 테두리. 칸마다 읽는 이름은 번호·종류·지금/마침. 아무 쪽이나 눌러 간다(차례대로
 * 잠그지 않는다)
 */
export function LessonPages({
  steps,
  at,
  isDone,
  onPick,
}: {
  steps: LessonStep[];
  at: number;
  isDone: (i: number) => boolean;
  onPick: (i: number) => void;
}) {
  const now = steps[at];
  return (
    <nav aria-label="쪽" data-lesson-pages className="flex flex-col gap-1.5">
      {now && (
        <p
          className="flex flex-wrap items-baseline gap-x-2 break-keep"
          data-page-now
        >
          <span className="font-bold text-base text-sky-300">
            {at + 1}쪽
            <span className="font-normal text-sm text-white/50">
              {" "}
              / {steps.length}쪽
            </span>
          </span>{" "}
          {/* 「16쪽 문제」가 「문제가 16쪽」으로 읽히지 않게 가른다(처음 보는 독자 검토) */}
          <span aria-hidden className="text-white/40">
            ·
          </span>{" "}
          <span className="font-semibold text-base">
            {KIND_LABEL[now.kind]}
          </span>
        </p>
      )}
      {/* 칸 폭을 고르게(줄이 바뀌어도 칸이 위아래로 맞게) */}
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(1.5rem,1fr))] gap-0.5">
        {steps.map((s, i) => {
          const current = i === at;
          const done = isDone(i);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 쪽 차례가 곧 열쇠다
            <li key={`${i}-${s.kind}`}>
              <button
                type="button"
                onClick={(e) => {
                  onPick(i);
                  e.currentTarget.blur();
                }}
                data-step-to={s.kind}
                data-step-done={done ? "" : undefined}
                aria-current={current ? "step" : undefined}
                aria-label={pageName(i, s.kind, { current, done })}
                className={cn(
                  "relative flex h-7 w-full items-center justify-center rounded-sm text-[10px] tabular-nums transition",
                  current
                    ? "bg-sky-500 font-bold text-black ring-2 ring-sky-200"
                    : done
                      ? "bg-emerald-500/70 text-black hover:bg-emerald-400/80"
                      : "bg-white/10 text-white/70 hover:bg-white/20",
                )}
              >
                {/* 마친 쪽도 번호는 남기고(세어 보지 않게) 구석에 작은 ✓ */}
                <span aria-hidden>{i + 1}</span>
                {done && (
                  <span
                    aria-hidden
                    className="absolute top-0 right-0.5 text-[8px] leading-none"
                  >
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
