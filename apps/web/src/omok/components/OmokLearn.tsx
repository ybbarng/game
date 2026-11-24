"use client";

import { reviewRunFor } from "@/components/study/review-run";
import { StudyHome } from "@/components/study/StudyHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useOmokStudyProgress } from "../progress";
import { OMOK_PUZZLE_SETS } from "../puzzles";
import type { LearnScreen, Screen } from "./OmokApp";
import { OmokPuzzleScreen } from "./OmokPuzzleScreen";
import { omokTutorial } from "./omok-tutorial";

/**
 * 오목 배우기·수 배우기 화면들. 「배우기」를 눌렀을 때 불러와 첫 화면 묶음에 싣지 않는다
 * (OmokApp이 next/dynamic으로 부른다, 2026-11-25 첫 화면 가볍게)
 */

/** 「오늘 복습」으로 연 문제의 복습 줄(없으면 보통으로 연 문제) */
type Review = readonly string[] | undefined;

/** 오목 화면들의 배경(OmokApp과 같다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

/** 수 배우기 목록에 보일 문제 묶음 */
const STUDY_SETS = OMOK_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 배우기 화면 하나(튜토리얼 목록·단원, 수 배우기 목록·문제) */
export function OmokLearn({
  screen,
  setScreen,
  onBack,
}: {
  screen: LearnScreen;
  setScreen: (screen: Screen) => void;
  /** 배우기 목록에서 뒤로(첫 화면) */
  onBack: () => void;
}) {
  // 「오늘 복습」으로 연 문제: 다 풀면 복습 줄의 다음 문제로, 줄 끝이면 목록으로
  const reviewOf = (queue: Review, current: string) =>
    reviewRunFor({
      queue,
      current,
      progress: useOmokStudyProgress,
      open: (puzzleId, q) => setScreen({ kind: "puzzle", puzzleId, review: q }),
      done: () => setScreen({ kind: "study", reviewDone: true }),
    });

  switch (screen.kind) {
    case "tutorial":
      return (
        <TutorialHome
          tutorial={omokTutorial}
          onBack={onBack}
          onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
          extra={{
            title: "수 배우기",
            detail: `넷으로 몰아 이기기·막기 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개가 있어요.`,
            onClick: () => setScreen({ kind: "study" }),
          }}
        />
      );
    case "study":
      return (
        <StudyHome
          title="오목 수 배우기"
          background={BG}
          sets={STUDY_SETS}
          progress={useOmokStudyProgress}
          onOpen={(puzzleId, review) =>
            setScreen({ kind: "puzzle", puzzleId, review })
          }
          onBack={() => setScreen({ kind: "tutorial" })}
          reviewDone={screen.reviewDone ?? false}
        />
      );
    case "puzzle":
      return (
        <OmokPuzzleScreen
          key={screen.puzzleId}
          puzzleId={screen.puzzleId}
          onExit={() => setScreen({ kind: "study" })}
          onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
          review={reviewOf(screen.review, screen.puzzleId)}
        />
      );
    case "lesson":
      return (
        <LessonPlayer
          key={screen.lessonId}
          tutorial={omokTutorial}
          lessonId={screen.lessonId}
          onExit={() => setScreen({ kind: "tutorial" })}
        />
      );
  }
}
