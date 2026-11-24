"use client";

import { reviewRunFor } from "@/components/study/review-run";
import { StudyHome } from "@/components/study/StudyHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { BADUK_FUSEKI_SET } from "../fuseki";
import { BADUK_JOSEKI_SET } from "../joseki";
import { useBadukStudyProgress, useBadukTutorialProgress } from "../progress";
import { BADUK_PUZZLE_SETS } from "../puzzles";
import {
  BADUK_STUDY_LESSON_SUMMARY,
  BADUK_STUDY_LESSONS,
} from "../study-lessons";
import type { LearnScreen, Screen } from "./BadukApp";
import { BadukLineScreen } from "./BadukLineScreen";
import { BadukPuzzleScreen } from "./BadukPuzzleScreen";
import { badukStudyLessons, badukTutorial } from "./baduk-tutorial";

/**
 * 바둑 배우기·수 배우기 화면들. 문제·정석·포석·단원 자료가 크므로 첫 화면 묶음에 싣지 않고 「배우기」를 눌렀을 때
 * 불러온다(BadukApp이 next/dynamic으로 부른다, 2026-11-25 첫 화면 가볍게)
 */

/** 「오늘 복습」으로 연 문제의 복습 줄(없으면 보통으로 연 문제) */
type Review = readonly string[] | undefined;

/** 바둑 화면들의 배경(BadukApp과 같다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#57534e_0%,#1c1917_80%)]";

/** 수 배우기 목록에 보일 문제 묶음 */
const STUDY_SETS = BADUK_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 수 배우기 단원(읽고 퀴즈 풀기). 끝내면 수 배우기 진행에도 끝냄으로 남긴다 */
const LESSON_SET = {
  id: "lessons",
  title: "단원 읽기",
  summary: BADUK_STUDY_LESSON_SUMMARY,
  puzzleIds: BADUK_STUDY_LESSONS.map((l) => l.id),
  labels: BADUK_STUDY_LESSONS.map((l) => l.title),
};

/** 수 배우기 목록 차례: 처음 배우던 문제, 단원, 단원을 익히는 문제, 따라 두기 */
const FIRST_SETS = [
  "atari",
  "ladder",
  "net",
  "snapback",
  "ko",
  "live",
  "kill",
  "shapes",
];
const studySets = () => [
  ...STUDY_SETS.filter((s) => FIRST_SETS.includes(s.id)),
  LESSON_SET,
  ...STUDY_SETS.filter((s) => !FIRST_SETS.includes(s.id)),
  JOSEKI_SET,
  FUSEKI_SET,
];

/** 수 배우기 목록에 보일 정석 수순 묶음(이름 목록) */
const JOSEKI_SET = {
  id: BADUK_JOSEKI_SET.id,
  title: BADUK_JOSEKI_SET.title,
  summary: BADUK_JOSEKI_SET.summary,
  puzzleIds: BADUK_JOSEKI_SET.lines.map((l) => l.id),
  labels: BADUK_JOSEKI_SET.lines.map((l) => l.name),
};

/** 수 배우기 목록에 보일 포석 수순 묶음(이름 목록) */
const FUSEKI_SET = {
  id: BADUK_FUSEKI_SET.id,
  title: BADUK_FUSEKI_SET.title,
  summary: BADUK_FUSEKI_SET.summary,
  puzzleIds: BADUK_FUSEKI_SET.lines.map((l) => l.id),
  labels: BADUK_FUSEKI_SET.lines.map((l) => l.name),
};

/** 목록에서 고른 것이 수순이면 수순 화면, 단원이면 단원 화면, 아니면 문제 화면 */
const studyScreen = (id: string, review?: Review): Screen =>
  id.startsWith("line-")
    ? { kind: "line", lineId: id, review }
    : id.startsWith("lesson-")
      ? { kind: "studyLesson", lessonId: id }
      : { kind: "puzzle", puzzleId: id, review };

/** 배우기 화면 하나(튜토리얼 목록·단원, 수 배우기 목록·문제·수순·단원) */
export function BadukLearn({
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
      progress: useBadukStudyProgress,
      open: (id, q) => setScreen(studyScreen(id, q)),
      done: () => setScreen({ kind: "study", reviewDone: true }),
    });

  switch (screen.kind) {
    case "tutorial":
      return (
        <TutorialHome
          tutorial={badukTutorial}
          onBack={onBack}
          onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
          extra={{
            title: "수 배우기",
            detail: `돌 잡기·살리기 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개, 읽는 단원 ${LESSON_SET.puzzleIds.length}개, 구석에서 흔히 두는 정해진 수 ${JOSEKI_SET.puzzleIds.length}개, 빈 판 첫 몇 수 ${FUSEKI_SET.puzzleIds.length}개가 있어요.`,
            onClick: () => setScreen({ kind: "study" }),
          }}
        />
      );
    case "study":
      return (
        <StudyHome
          title="바둑 수 배우기"
          background={BG}
          sets={studySets()}
          progress={useBadukStudyProgress}
          onOpen={(id, review) => setScreen(studyScreen(id, review))}
          onBack={() => setScreen({ kind: "tutorial" })}
          reviewDone={screen.reviewDone ?? false}
        />
      );
    case "studyLesson":
      return (
        <LessonPlayer
          key={screen.lessonId}
          tutorial={badukStudyLessons}
          lessonId={screen.lessonId}
          onExit={() => {
            // 끝낸 단원은 수 배우기 목록에도 ✓로 남긴다
            const id = screen.lessonId;
            if (useBadukTutorialProgress.getState().completed.includes(id))
              useBadukStudyProgress.getState().solve(id);
            setScreen({ kind: "study" });
          }}
        />
      );
    case "line":
      return (
        <BadukLineScreen
          key={screen.lineId}
          lineId={screen.lineId}
          onExit={() => setScreen({ kind: "study" })}
          onOpen={(id) => setScreen(studyScreen(id))}
          review={reviewOf(screen.review, screen.lineId)}
        />
      );
    case "puzzle":
      return (
        <BadukPuzzleScreen
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
          tutorial={badukTutorial}
          lessonId={screen.lessonId}
          onExit={() => setScreen({ kind: "tutorial" })}
        />
      );
  }
}
