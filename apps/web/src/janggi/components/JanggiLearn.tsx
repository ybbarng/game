"use client";

import { reviewRunFor } from "@/components/study/review-run";
import { StudyHome } from "@/components/study/StudyHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { useJanggiStudyProgress } from "@/study/progress";
import { ORDERED_JANGGI_SETS } from "../study-order";
import type { LearnScreen, Screen } from "./JanggiApp";
import { JanggiPuzzleScreen } from "./JanggiPuzzleScreen";
import { janggiTutorial } from "./janggi-tutorial";

/**
 * 장기 배우기·수 배우기 화면들. 「배우기」를 눌렀을 때 불러와 문제 자료를 첫 화면 묶음에 싣지 않는다
 * (JanggiApp이 next/dynamic으로 부른다, 2026-11-25 첫 화면 가볍게)
 */

/** 「오늘 복습」으로 연 문제의 복습 줄(없으면 보통으로 연 문제) */
type Review = readonly string[] | undefined;

/** 장기 화면들의 배경(JanggiApp과 같다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

/** 수 배우기 목록에 보일 문제 묶음(배우는 차례 `JANGGI_STUDY_ORDER`대로) */
const STUDY_SETS = ORDERED_JANGGI_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 배우기 화면 하나(튜토리얼 목록·단원, 수 배우기 목록·문제) */
export function JanggiLearn({
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
      progress: useJanggiStudyProgress,
      open: (puzzleId, q) => setScreen({ kind: "puzzle", puzzleId, review: q }),
      done: () => setScreen({ kind: "study", reviewDone: true }),
    });

  switch (screen.kind) {
    case "tutorial":
      return (
        <TutorialHome
          tutorial={janggiTutorial}
          onBack={onBack}
          onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
          extra={{
            title: "수 배우기",
            detail: `외통·상대 기물 얻기 문제와 끝내기 연습 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개가 있어요.`,
            onClick: () => setScreen({ kind: "study" }),
          }}
        />
      );
    case "study":
      return (
        <StudyHome
          title="장기 수 배우기"
          background={BG}
          sets={STUDY_SETS}
          progress={useJanggiStudyProgress}
          onOpen={(puzzleId, review) =>
            setScreen({ kind: "puzzle", puzzleId, review })
          }
          onBack={() => setScreen({ kind: "tutorial" })}
          reviewDone={screen.reviewDone ?? false}
        />
      );
    case "puzzle":
      return (
        <JanggiPuzzleScreen
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
          tutorial={janggiTutorial}
          lessonId={screen.lessonId}
          onExit={() => setScreen({ kind: "tutorial" })}
        />
      );
  }
}
