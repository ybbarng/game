"use client";

import { cn } from "@/lib/cn";
import { nextPuzzle, type StudyProgressStore } from "@/study/progress";

export interface StudySetSummary {
  id: string;
  title: string;
  summary: string;
  puzzleIds: readonly string[];
  /** 수순 묶음처럼 번호 대신 이름으로 보일 때, puzzleIds와 같은 차례의 이름 */
  labels?: readonly string[];
}

/**
 * 수 배우기 목록(docs/23): 문제 묶음마다 진행 막대와 번호 칸. 푼 문제는 ✓.
 * "이어 풀기"는 안 푼 문제부터, 다 풀었으면 많이 틀린 문제부터 낸다. 모든 판 게임이 함께 쓴다
 */
export function StudyHome({
  title,
  background,
  sets,
  progress,
  onOpen,
  onBack,
}: {
  title: string;
  background: string;
  sets: readonly StudySetSummary[];
  progress: StudyProgressStore;
  onOpen: (puzzleId: string) => void;
  onBack: () => void;
}) {
  const records = progress((s) => s.records);
  return (
    <main
      className={cn("flex min-h-dvh justify-center p-4 text-white", background)}
    >
      <div className="flex w-full max-w-md flex-col gap-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">{title}</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>
        {sets.map((set) => {
          const solved = set.puzzleIds.filter(
            (id) => records[id]?.solvedAt,
          ).length;
          const next = nextPuzzle(set.puzzleIds, records);
          return (
            <section
              key={set.id}
              aria-label={set.title}
              className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-black/40 p-4 shadow-xl"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-bold text-lg">{set.title}</h2>
                <span className="text-sm tabular-nums opacity-80">
                  {solved}/{set.puzzleIds.length}
                </span>
              </div>
              <p className="text-sm opacity-70">{set.summary}</p>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
                  style={{
                    width: `${(solved / Math.max(1, set.puzzleIds.length)) * 100}%`,
                  }}
                />
              </div>
              {set.labels ? (
                <div className="flex flex-col gap-1.5">
                  {set.puzzleIds.map((id, i) => {
                    const done = Boolean(records[id]?.solvedAt);
                    const label = set.labels?.[i] ?? `${i + 1}`;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-label={`${label}${done ? " (끝냄)" : ""}`}
                        onClick={() => onOpen(id)}
                        className={cn(
                          "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                          done
                            ? "bg-emerald-500/30 text-emerald-100"
                            : "bg-white/10 hover:bg-white/15",
                        )}
                      >
                        <span>{label}</span>
                        {done && <span aria-hidden>✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1.5">
                  {set.puzzleIds.map((id, i) => {
                    const done = Boolean(records[id]?.solvedAt);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-label={`${set.title} ${i + 1}번${done ? " (풂)" : ""}`}
                        onClick={() => onOpen(id)}
                        className={cn(
                          "aspect-square rounded-lg font-semibold text-sm",
                          done
                            ? "bg-emerald-500/30 text-emerald-100"
                            : "bg-white/10 hover:bg-white/15",
                        )}
                      >
                        {done ? "✓" : i + 1}
                      </button>
                    );
                  })}
                </div>
              )}
              {next && (
                <button
                  type="button"
                  onClick={() => onOpen(next)}
                  className="rounded-xl bg-amber-400 py-2 font-semibold text-black"
                >
                  {set.labels
                    ? solved === 0
                      ? "따라 두기 시작"
                      : solved === set.puzzleIds.length
                        ? "틀렸던 수순 다시 두기"
                        : "이어 두기"
                    : solved === 0
                      ? "풀기 시작"
                      : solved === set.puzzleIds.length
                        ? "틀렸던 문제 다시 풀기"
                        : "이어 풀기"}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
