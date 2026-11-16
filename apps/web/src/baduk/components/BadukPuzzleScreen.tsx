"use client";

import {
  type BadukState,
  legalPoints,
  pointAt,
  pointName,
  step,
} from "@game/baduk-engine";
import { useState } from "react";

import {
  findInSets,
  PuzzleScreen,
  usePuzzleRun,
} from "@/components/study/PuzzleScreen";

import { useBadukStudyProgress } from "../progress";
import {
  BADUK_PUZZLE_SETS,
  type BadukPuzzle,
  type BadukPuzzleSet,
  type CaptureTheme,
  LIFE_SHAPE_NAMES,
} from "../puzzles";
import {
  defenseFor,
  explainSolved,
  judgeMove,
  koPointOf,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  targetOf,
} from "../study";
import { BadukBoard } from "./BadukBoard";

/** 잡기 문제 모양마다 보이는 글. `follow`는 둘째 수부터의 안내(없으면 "계속 몰아 따내세요") */
const CAPTURE_TEXT: Record<
  CaptureTheme,
  { prompt: string; hint: string; follow?: string }
> = {
  atari: {
    prompt: "△ 백 돌을 따내세요",
    hint: "단수를 어느 쪽에서 치느냐가 중요해요. 백이 넓은 쪽으로 못 나오게 막아요",
  },
  ladder: {
    prompt: "축으로 △ 백 돌을 잡으세요",
    hint: "계속 단수를 치며 몰아요. 백이 뻗을 때마다 활로가 하나뿐이어야 해요",
  },
  net: {
    prompt: "장문으로 △ 백 돌을 잡으세요",
    hint: "바로 단수 치면 달아나요. 한 칸 떨어져 길을 막아 봐요",
  },
  snapback: {
    prompt: "한 점을 내주고 △ 백 돌을 되따내세요",
    hint: "백 무리에 붙은 빈 자리에 일부러 들어가 봐요. 따이더라도 다시 두면 더 많이 따내요",
    follow: "같은 자리에 다시 두어 되따내세요",
  },
  ko: {
    prompt: "패를 따내며 △ 백 돌을 잡으세요",
    hint: "백 돌 하나를 따내면서 △ 백 돌을 단수로 만드는 자리를 찾아요",
    follow: "백은 되따내지 못했어요. 이제 따내세요",
  },
  "long-ladder": {
    prompt: "축으로 △ 백 돌을 판 끝까지 몰아 잡으세요.",
    hint: "단수를 치면 백은 남은 활로로 뻗어요. 그 자리 옆에 흑 돌이 있어야 뻗어도 활로가 둘뿐이라 다시 단수를 칠 수 있어요.",
  },
  breaker: {
    prompt: "□ 축머리를 피해 축으로 △ 백 돌을 잡으세요.",
    hint: "두 쪽 단수를 차례로 이어 두어 보세요. 백이 뻗어 가는 길에 □ 돌이 나오는 쪽은 안 돼요.",
  },
};

/** 패로 버티기 글. `follow`는 백이 받은 뒤 */
const KO_FIGHT_TEXT = {
  threat: {
    prompt: "× 자리는 지금 되따낼 수 없어요. 팻감을 쓰세요.",
    follow: "백이 받았어요. 이제 패를 되따내세요.",
    hint: "활로가 둘인 백 돌을 찾아 단수로 몰아요. 백이 받지 않으면 따낼 수 있어야 팻감이에요.",
    solved: "되따냈어요!",
    wrong: "그 수는 팻감이 아니에요",
  },
  answer: {
    prompt: "백이 팻감을 썼어요. △ 흑 돌을 살려 받으세요.",
    follow: "",
    hint: "△ 흑 돌은 활로가 하나뿐이에요. 그 활로에 두어 이웃 흑 돌과 이어요.",
    solved: "받았어요!",
    wrong: "그 수로는 △ 흑 돌을 잃어요",
  },
} as const;

/** 바둑 문제 하나. 흑이 둔다 */
export function BadukPuzzleScreen({
  puzzleId,
  onExit,
  onOpen,
}: {
  puzzleId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const found = findInSets<BadukPuzzle>(BADUK_PUZZLE_SETS, puzzleId);
  if (!found) return null;
  return (
    <BadukPuzzleRun
      set={found.set as BadukPuzzleSet}
      index={found.index}
      puzzle={found.puzzle}
      onExit={onExit}
      onOpen={onOpen}
    />
  );
}

function BadukPuzzleRun({
  set,
  index,
  puzzle,
  onExit,
  onOpen,
}: {
  set: BadukPuzzleSet;
  index: number;
  puzzle: BadukPuzzle;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const solve = useBadukStudyProgress((s) => s.solve);
  const miss = useBadukStudyProgress((s) => s.miss);
  const [aim, setAim] = useState<number | null>(null);
  const [placed, setPlaced] = useState(0);
  const run = usePuzzleRun<BadukState, number>({
    initial: () => puzzleState(puzzle),
    sounds: { move: "stone", capture: "badukCapture" },
    judge: (state, move, at) => judgeMove(puzzle, state, move, at),
    apply: (state, move) => {
      const result = step(state, 0, { type: "place", at: move });
      if (!result.ok) return null;
      setPlaced((n) => n + 1);
      return {
        state: result.state,
        capture: result.state.prisoners[1] > state.prisoners[1],
      };
    },
    reply: (state) => {
      const answer = defenseFor(puzzle, state, placed - 1);
      const result = step(state, 1, answer);
      if (!result.ok) return null;
      return {
        state: result.state,
        move: answer.type === "place" ? answer.at : null,
        capture: result.state.prisoners[2] > state.prisoners[2],
      };
    },
    explain: (before, move) =>
      explainSolved(puzzle, before.board, move, placed + 1),
    solve: () => solve(puzzle.id),
    miss: () => miss(puzzle.id),
  });
  const { state, status, shown } = run;
  const nextId = set.puzzles[index + 1]?.id ?? null;
  const answer = solutionOf(puzzle);
  const target = targetOf(puzzle);

  const legal = status === "play" ? legalPoints(state) : [];
  const capture = puzzle.kind === "capture" ? CAPTURE_TEXT[puzzle.theme] : null;
  const ko = puzzle.kind === "kofight" ? KO_FIGHT_TEXT[puzzle.mode] : null;
  const live = puzzle.kind === "life" && puzzle.goal === "live";
  const shape = puzzle.kind === "life" ? puzzle.shape : undefined;
  const goal = ko
    ? run.step === 0
      ? ko.prompt
      : ko.follow
    : capture
      ? run.step === 0
        ? capture.prompt
        : (capture.follow ?? "계속 몰아 따내세요")
      : live
        ? "△ 흑 무리를 살리세요"
        : "△ 백 무리를 잡으세요";
  const marks: Record<number, string> = {};
  if (puzzle.kind === "kofight") {
    // 팻감 쓰기: 첫 수 앞에는 되따낼 수 없는 자리를 ×로. 팻감 받기: 노림받은 흑 돌을 △로
    if (puzzle.mode === "threat" && run.step === 0 && status !== "solved")
      marks[koPointOf(puzzle)] = "×";
    if (puzzle.mode === "answer" && state.board[target]) marks[target] = "△";
  } else {
    if (state.board[target]) marks[target] = "△";
    if (puzzle.kind === "capture" && puzzle.breaker) {
      const breaker = pointAt(puzzle.breaker, PUZZLE_SIZE);
      if (state.board[breaker]) marks[breaker] = "□";
    }
  }
  // 손가락은 한 번 겨누고 다시 눌러 둔다(대국 화면과 같다).
  const prompt =
    aim !== null
      ? `${pointName(aim, PUZZLE_SIZE)}: 한 번 더 누르면 둔다`
      : goal;

  return (
    <PuzzleScreen
      game="baduk"
      setTitle={set.title}
      index={index}
      total={set.puzzles.length}
      boardClassName="aspect-square w-[min(100%,calc(100dvh-16rem))] split:w-[min(calc(100dvh-1.5rem),36rem)]"
      board={
        <BadukBoard
          board={state.board}
          size={PUZZLE_SIZE}
          myStone={1}
          canPlay={status === "play"}
          legal={shown && status === "play" ? [shown] : legal}
          lastMove={run.lastMove}
          aim={aim}
          onAim={setAim}
          onPlace={(at) => {
            setAim(null);
            run.play(at);
          }}
          marks={marks}
        />
      }
      status={status}
      prompt={prompt}
      waitingText="백이 받는 중…"
      solvedText={
        ko
          ? ko.solved
          : capture
            ? "따냈어요!"
            : live
              ? "살았어요!"
              : "잡았어요!"
      }
      wrongText={
        ko
          ? ko.wrong
          : capture
            ? "그 수로는 못 따내요"
            : live
              ? "그 수로는 살 수 없어요"
              : "그 수로는 백이 살아요"
      }
      wrongHint={
        ko
          ? ko.hint
          : capture
            ? capture.hint
            : shape
              ? `${LIFE_SHAPE_NAMES[shape]}의 급소를 먼저 차지해요`
              : live
                ? "눈 자리를 둘로 나누는 곳을 찾아요"
                : "백이 두면 두 눈이 되는 자리(급소)를 먼저 차지해요"
      }
      shown={shown !== null}
      explain={run.explain}
      canHint={run.step === 0}
      onHint={() => setAim(answer)}
      onReveal={() => {
        run.reveal(answer);
        setPlaced(0);
        setAim(answer);
      }}
      onRestart={() => {
        run.restart();
        setPlaced(0);
        setAim(null);
      }}
      onNext={nextId ? () => onOpen(nextId) : null}
      onExit={onExit}
    />
  );
}
