"use client";

import { reviewRunFor } from "@/components/study/review-run";
import { StudyHome } from "@/components/study/StudyHome";
import { LessonPlayer } from "@/components/tutorial/LessonPlayer";
import { TutorialHome } from "@/components/tutorial/TutorialHome";
import { ENDGAME_SETS } from "../endgame";
import { CHESS_OPENING_SET } from "../openings";
import { useChessStudyProgress } from "../progress";
import { CHESS_PUZZLE_SETS } from "../puzzles";
import { CHESS_STUDY_ORDER } from "../study-order";
import type { LearnScreen, Screen } from "./ChessApp";
import { ChessEndgameScreen } from "./ChessEndgameScreen";
import { ChessLineScreen } from "./ChessLineScreen";
import { ChessPuzzleScreen } from "./ChessPuzzleScreen";
import { chessTutorial } from "./chess-tutorial";

/**
 * 체스 배우기·수 배우기 화면들. 오프닝·문제·엔드게임 자료가 크므로 「배우기」를 눌렀을 때 불러온다
 * (ChessApp이 next/dynamic으로 부른다, 2026-11-25 첫 화면 가볍게)
 */

/** 「오늘 복습」으로 연 문제의 복습 줄(없으면 보통으로 연 문제) */
type Review = readonly string[] | undefined;

/** 체스 화면들의 배경(ChessApp과 같다) */
const BG = "bg-[radial-gradient(ellipse_at_center,#44403c_0%,#1c1917_80%)]";

/** 수 배우기 목록에 보일 문제 묶음 */
const STUDY_SETS = CHESS_PUZZLE_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.puzzles.map((p) => p.id),
}));

/** 수 배우기 목록에 보일 기본 엔드게임 연습 묶음(퀸·룩 하나·룩 둘·폰을 퀸으로 만들기) */
const ENDGAME_STUDY_SETS = ENDGAME_SETS.map((s) => ({
  id: s.id,
  title: s.title,
  summary: s.summary,
  puzzleIds: s.drills.map((d) => d.id),
}));

/** 수 배우기 목록에 보일 오프닝 수순 묶음 */
const OPENING_SET = {
  id: CHESS_OPENING_SET.id,
  title: CHESS_OPENING_SET.title,
  summary: CHESS_OPENING_SET.summary,
  puzzleIds: CHESS_OPENING_SET.lines.map((l) => l.id),
  labels: CHESS_OPENING_SET.lines.map((l) => l.name),
};

/** 배우는 차례(`CHESS_STUDY_ORDER`)대로 늘어놓은 수 배우기 목록 */
const ORDERED_STUDY_SETS = (() => {
  const all = [OPENING_SET, ...STUDY_SETS, ...ENDGAME_STUDY_SETS];
  return CHESS_STUDY_ORDER.map((id) => {
    const set = all.find((s) => s.id === id);
    if (!set) throw new Error(`수 배우기 목록에 없는 묶음: ${id}`);
    return set;
  });
})();

/** 목록에서 고른 것이 수순이면 수순 화면, 엔드게임 연습이면 연습 화면, 아니면 문제 화면 */
const studyScreen = (id: string, review?: Review): Screen =>
  id.startsWith("line-")
    ? { kind: "line", lineId: id, review }
    : id.startsWith("end-")
      ? { kind: "endgame", drillId: id, review }
      : { kind: "puzzle", puzzleId: id, review };

/** 배우기 화면 하나(튜토리얼 목록·단원, 수 배우기 목록·문제·수순·엔드게임 연습) */
export function ChessLearn({
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
      progress: useChessStudyProgress,
      open: (id, q) => setScreen(studyScreen(id, q)),
      done: () => setScreen({ kind: "study", reviewDone: true }),
    });

  switch (screen.kind) {
    case "tutorial":
      return (
        <TutorialHome
          tutorial={chessTutorial}
          onBack={onBack}
          onOpen={(lessonId) => setScreen({ kind: "lesson", lessonId })}
          extra={{
            title: "수 배우기",
            detail: `이름난 첫 수들 ${OPENING_SET.puzzleIds.length}개, 메이트·상대 기물 얻기 문제 ${STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개, 퀸·룩 하나·룩 둘로 메이트하고 폰을 퀸으로 만드는 엔드게임 연습 ${ENDGAME_STUDY_SETS.reduce((n, s) => n + s.puzzleIds.length, 0)}개가 있어요.`,
            onClick: () => setScreen({ kind: "study" }),
          }}
        />
      );
    case "study":
      return (
        <StudyHome
          title="체스 수 배우기"
          background={BG}
          sets={ORDERED_STUDY_SETS}
          progress={useChessStudyProgress}
          onOpen={(id, review) => setScreen(studyScreen(id, review))}
          onBack={() => setScreen({ kind: "tutorial" })}
          reviewDone={screen.reviewDone ?? false}
        />
      );
    case "puzzle":
      return (
        <ChessPuzzleScreen
          key={screen.puzzleId}
          puzzleId={screen.puzzleId}
          onExit={() => setScreen({ kind: "study" })}
          onOpen={(puzzleId) => setScreen({ kind: "puzzle", puzzleId })}
          review={reviewOf(screen.review, screen.puzzleId)}
        />
      );
    case "line":
      return (
        <ChessLineScreen
          key={screen.lineId}
          lineId={screen.lineId}
          onExit={() => setScreen({ kind: "study" })}
          onOpen={(id) => setScreen(studyScreen(id))}
          review={reviewOf(screen.review, screen.lineId)}
        />
      );
    case "endgame":
      return (
        <ChessEndgameScreen
          key={screen.drillId}
          drillId={screen.drillId}
          onExit={() => setScreen({ kind: "study" })}
          onOpen={(id) => setScreen(studyScreen(id))}
          review={reviewOf(screen.review, screen.drillId)}
        />
      );
    case "lesson":
      return (
        <LessonPlayer
          key={screen.lessonId}
          tutorial={chessTutorial}
          lessonId={screen.lessonId}
          onExit={() => setScreen({ kind: "tutorial" })}
        />
      );
  }
}
