"use client";

import { useState } from "react";

import { ActionButton } from "@/components/panels/common";
import { RichText } from "@/components/tutorial/RichText";
import { cn } from "@/lib/cn";

import { useGalaxyStarQuiz } from "../progress";
import { type StarQuestion, starQuestion } from "../star-quiz";
import { GALAXY_BG } from "./GalaxyGame";
import { GalaxySceneView } from "./galaxy-tutorial";

/**
 * 별자리 퀴즈(docs/48 5-6): 사계절 하늘 8 별자리·24별로 끝없이 낸다. 기록은 이 기기에만 남고
 * 게임 안 이득은 없다. 처음 고른 답으로 맞힘을 센다
 */
export function GalaxyStarQuiz({ onBack }: { onBack: () => void }) {
  const [question, setQuestion] = useState<StarQuestion>(() => starQuestion());
  const [chosen, setChosen] = useState<number | null>(null);
  const progress = useGalaxyStarQuiz();
  const right = chosen === question.answer;

  const choose = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    progress.record(i === question.answer);
  };
  const next = () => {
    setChosen(null);
    setQuestion(starQuestion());
  };

  return (
    <main
      data-star-quiz
      className={cn("flex min-h-dvh justify-center p-4 text-white", GALAXY_BG)}
    >
      <div className="flex w-full max-w-lg flex-col gap-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">별자리 퀴즈</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            배우기로
          </button>
        </div>
        <p className="text-sm text-white/70" data-star-quiz-score>
          맞힌 문제 {progress.correct}/{progress.answered} · 이어 맞힘{" "}
          {progress.streak} · 가장 길게 {progress.best}
        </p>
        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          <h2 className="font-bold text-lg">
            <RichText text={question.question} />
          </h2>
          <GalaxySceneView scenario={question.scene} />
          <div className="flex flex-col gap-2">
            {question.options.map((option, i) => {
              const correct = i === question.answer;
              return (
                <button
                  key={option}
                  type="button"
                  data-star-option
                  disabled={chosen !== null}
                  onClick={() => choose(i)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left font-semibold transition",
                    chosen === null &&
                      "border-white/15 bg-white/5 hover:bg-white/10",
                    chosen !== null &&
                      correct &&
                      "border-emerald-300 bg-emerald-500/25",
                    chosen === i &&
                      !correct &&
                      "border-rose-300 bg-rose-500/25",
                    chosen !== null &&
                      !correct &&
                      chosen !== i &&
                      "border-white/5 opacity-50",
                  )}
                >
                  {option}
                  {chosen !== null && correct && " ✓"}
                </button>
              );
            })}
          </div>
          {chosen !== null && (
            <>
              <div
                className={cn(
                  "rounded-2xl p-3 text-sm",
                  right ? "bg-emerald-500/15" : "bg-rose-500/15",
                )}
              >
                <p className="mb-1 font-bold">
                  {right ? "정답이에요!" : "아쉬워요"}
                </p>
                <RichText text={question.explain} />
              </div>
              <ActionButton className="py-3 text-base" onClick={next}>
                다음 문제
              </ActionButton>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
