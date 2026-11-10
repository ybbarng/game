"use client";

import { cn } from "@/lib/cn";
import { METHOD_TITLE, PRACTICE_METHODS, stagesOf } from "../practice/stages";
import type { VersusRule } from "../practice/versus";

/**
 * 공식 연습 대결 규칙 고르기(친구와 대결 대기실·컴퓨터와 대결, docs/47 16-14). 단계는 혼자 공식 연습과 같은 목록이고,
 * 방식은 따라 치기(기본)·보고 치기.
 */
export function PracticeRulePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: VersusRule;
  onChange: (rule: VersusRule) => void;
  disabled?: boolean;
}) {
  const mode = value.mode ?? "follow";
  const set = (patch: { stage?: string; mode?: "see" | undefined }) => {
    const next = { ...value, ...patch };
    onChange(
      next.mode === "see"
        ? { stage: next.stage, mode: "see" }
        : { stage: next.stage },
    );
  };
  return (
    <fieldset
      className="flex flex-col gap-2 text-sm"
      disabled={disabled}
      data-cube-practice-rule
    >
      <legend className="mb-1">공식 연습 단계</legend>
      {PRACTICE_METHODS.map((m) => (
        <div key={m} className="flex flex-wrap items-center gap-1">
          <span className="w-14 shrink-0 text-white/60 text-xs">
            {METHOD_TITLE[m]}
          </span>
          {stagesOf(m).map((s) => (
            <button
              key={s.id}
              type="button"
              data-cube-practice-stage={s.id}
              aria-pressed={value.stage === s.id}
              onClick={() => set({ stage: s.id })}
              className={cn(
                "rounded-full px-2.5 py-1 disabled:opacity-50",
                value.stage === s.id
                  ? "bg-emerald-400 font-semibold text-black"
                  : "bg-white/10",
              )}
            >
              {s.title}
            </button>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-14 shrink-0 text-white/60 text-xs">방식</span>
        {(["follow", "see"] as const).map((k) => (
          <button
            key={k}
            type="button"
            data-cube-practice-mode={k}
            aria-pressed={mode === k}
            onClick={() => set({ mode: k === "see" ? "see" : undefined })}
            className={cn(
              "rounded-lg px-3 py-1 disabled:opacity-50",
              mode === k
                ? "bg-sky-500 font-semibold text-black"
                : "bg-white/10",
            )}
          >
            {k === "follow" ? "따라 치기" : "보고 치기"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
