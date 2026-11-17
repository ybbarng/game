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
import type { ReviewRun } from "@/components/study/review-run";
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
  judgeMove,
  koPointOf,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  spotMoveOf,
  spotsOf,
  targetOf,
} from "../study";
import { explainSolved, SPOT_LABELS } from "../study-explain";
import { BadukBoard } from "./BadukBoard";

/** 잡기 문제 모양마다 보이는 글. `follow`는 둘째 수부터의 안내(없으면 "계속 몰아 따내세요.") */
const CAPTURE_TEXT: Record<
  CaptureTheme,
  { prompt: string; hint: string; follow?: string }
> = {
  atari: {
    prompt: "△ 백 돌을 따내세요.",
    hint: "단수를 어느 쪽에서 치느냐가 중요해요. 백이 넓은 쪽으로 못 나오게 막아요.",
  },
  ladder: {
    prompt: "축으로 △ 백 돌을 잡으세요.",
    hint: "계속 단수를 치며 몰아요. 백이 뻗을 때마다 활로가 하나뿐이어야 해요.",
  },
  net: {
    prompt: "장문으로 △ 백 돌을 잡으세요.",
    hint: "바로 단수 치면 달아나요. 한 칸 떨어져 길을 막아 봐요.",
  },
  snapback: {
    prompt: "한 점을 내주고 △ 백 돌을 되따내세요.",
    hint: "백 무리에 붙은 빈 자리에 일부러 들어가 봐요. 따이더라도 다시 두면 더 많이 따내요.",
    follow: "같은 자리에 다시 두어 되따내세요.",
  },
  ko: {
    prompt: "패를 따내며 △ 백 돌을 잡으세요.",
    hint: "백 돌 하나를 따내면서 △ 백 돌을 단수로 만드는 자리를 찾아요.",
    follow: "백은 되따내지 못했어요. 이제 따내세요.",
  },
  "long-ladder": {
    prompt: "축으로 △ 백 돌을 판 끝까지 몰아 잡으세요.",
    hint: "단수를 치면 백은 남은 활로로 뻗어요. 그 자리의 위·아래·왼쪽·오른쪽에 흑 돌이 있어야 뻗어도 활로가 둘뿐이라 다시 단수를 칠 수 있어요.",
  },
  "blocked-net": {
    prompt: "□ 축머리가 두 쪽에 있어요. 장문으로 △ 백 돌을 잡으세요.",
    hint: "두 쪽 단수 모두 축머리에 막혀요. 바로 단수 치지 않고 한 칸 떨어져 백이 나올 길을 막아 봐요.",
  },
  breaker: {
    prompt: "□ 축머리를 피해 축으로 △ 백 돌을 잡으세요.",
    hint: "단수와 뻗기를 번갈아 둔다고 생각하며 두 쪽 길을 따라가 봐요. 길 위나 바로 옆에 □ 돌이 나오는 쪽은 안 돼요.",
  },
};

/** 패로 버티기 글. `follow`는 백이 받은 뒤 */
const KO_FIGHT_TEXT = {
  threat: {
    prompt: "× 자리는 지금 되따낼 수 없어요. 팻감을 쓰세요.",
    follow: "백이 받았어요. 이제 패를 되따내세요.",
    hint: "활로가 둘인 백 돌을 찾아 단수를 쳐요. 백이 받지 않으면 따낼 수 있어야 팻감이에요.",
    solved: "되따냈어요!",
    wrong: "그 수는 팻감이 아니에요.",
  },
  answer: {
    prompt: "백이 팻감을 썼어요. △ 흑 돌을 살려 받으세요.",
    follow: "",
    hint: "△ 흑 돌은 활로가 하나뿐이에요. 그 활로에 두어 이웃 흑 돌과 이어요.",
    solved: "받았어요!",
    wrong: "그 수로는 △ 흑 돌을 잃어요.",
  },
  connect: {
    prompt: "백이 팻감을 썼어요. 받을지, 패를 이을지 골라 두세요.",
    follow: "",
    hint: "△ 흑 돌 수와, 백이 패를 되따내면 잃는 흑 돌 수를 세어 봐요. 잃는 돌이 더 많으면 패를 이어요.",
    solved: "패를 이었어요!",
    wrong: "그 수로는 패를 지고 돌을 더 많이 잃어요.",
  },
} as const;

/** 끝내기 글. `follow`는 선수에 백이 받은 뒤 */
const ENDGAME_TEXT = {
  bigger: {
    prompt: "끝내기가 두 곳(A·B) 남았어요. 큰 곳에 두세요.",
    follow: "",
    hint: "A·B에 흑이 먼저 둘 때와 백이 먼저 둘 때를 견줘, 점수 차가 더 많이 나는 곳을 골라요.",
    wrong: "그곳은 작은 끝내기예요.",
  },
  sente: {
    prompt: "끝내기가 두 곳(A·B) 남았어요. 먼저 둘 곳에 두세요.",
    follow: "백이 받았어요. 남은 곳에 두세요.",
    hint: "두면 백 돌이 단수가 되는 곳이 있나 봐요. 백이 받아야 하는 수(선수)부터 둬요.",
    wrong: "그 수는 후수라 백이 남은 곳을 먼저 둬요.",
  },
  reverse: {
    prompt: "끝내기가 세 곳(A·B·C) 남았어요. 먼저 둘 곳에 두세요.",
    follow: "백이 뒀어요. 남은 곳에 두세요.",
    hint: "백이 두면 흑 돌이 단수가 되는 곳(백의 선수)이 있나 봐요. 그곳을 흑이 먼저 막아요.",
    wrong: "그곳부터 두면 백이 선수로 두고 남은 곳까지 가져가요.",
  },
  double: {
    prompt: "끝내기가 세 곳(A·B·C) 남았어요. 먼저 둘 곳에 두세요.",
    follow: "백이 받았어요. 남은 곳에 두세요.",
    hint: "흑이 두어도, 백이 두어도 상대 돌이 단수가 되는 곳을 찾아요. 그곳부터 둬요.",
    wrong: "그곳부터 두면 백이 양선수 자리에 선수로 둬요.",
  },
} as const;

/** 바둑 문제 하나. 흑이 둔다 */
export function BadukPuzzleScreen({
  puzzleId,
  onExit,
  onOpen,
  review,
}: {
  puzzleId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
  /** 「오늘 복습」으로 열었으면 복습 줄 */
  review?: ReviewRun | undefined;
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
      review={review}
    />
  );
}

function BadukPuzzleRun({
  set,
  index,
  puzzle,
  onExit,
  onOpen,
  review,
}: {
  set: BadukPuzzleSet;
  index: number;
  puzzle: BadukPuzzle;
  onExit: () => void;
  onOpen: (id: string) => void;
  /** 「오늘 복습」으로 열었으면 복습 줄 */
  review?: ReviewRun | undefined;
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
  const endgame = puzzle.kind === "endgame" ? ENDGAME_TEXT[puzzle.mode] : null;
  const live = puzzle.kind === "life" && puzzle.goal === "live";
  const shape = puzzle.kind === "life" ? puzzle.shape : undefined;
  const turnText = ko ?? endgame;
  const goal = turnText
    ? run.step === 0
      ? turnText.prompt
      : turnText.follow
    : capture
      ? run.step === 0
        ? capture.prompt
        : (capture.follow ?? "계속 몰아 따내세요.")
      : live
        ? "△ 흑 무리를 살리세요."
        : "△ 백 무리를 잡으세요.";
  const marks: Record<number, string> = {};
  if (puzzle.kind === "endgame") {
    // 끝내기 두 곳에서 흑이 둘 자리를 A·B로(처음 판에서 엔진이 고른다). 두어진 곳은 지운다
    const first = puzzleState(puzzle).board;
    spotsOf(puzzle).forEach((spot, i) => {
      const p = spotMoveOf(first, spot);
      if (state.board[p] === 0) marks[p] = SPOT_LABELS[i] ?? "";
    });
  } else if (puzzle.kind === "kofight") {
    // 팻감 쓰기: 첫 수 앞에는 되따낼 수 없는 자리를 ×로. 팻감 받기: 노림받은 흑 돌을 △로
    if (puzzle.mode === "threat" && run.step === 0 && status !== "solved")
      marks[koPointOf(puzzle)] = "×";
    if (puzzle.mode !== "threat" && state.board[target]) marks[target] = "△";
  } else {
    if (state.board[target]) marks[target] = "△";
    if (puzzle.kind === "capture")
      for (const name of [
        ...(puzzle.breaker ? [puzzle.breaker] : []),
        ...(puzzle.breakers ?? []),
      ]) {
        const breaker = pointAt(name, PUZZLE_SIZE);
        if (state.board[breaker]) marks[breaker] = "□";
      }
  }
  // 손가락은 한 번 겨누고 다시 눌러 둔다(대국 화면과 같다).
  const prompt =
    aim !== null
      ? `${pointName(aim, PUZZLE_SIZE)}: 한 번 더 누르면 둬요.`
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
        endgame
          ? "끝내기를 잘 골랐어요!"
          : ko
            ? ko.solved
            : capture
              ? "따냈어요!"
              : live
                ? "살았어요!"
                : "잡았어요!"
      }
      wrongText={
        endgame
          ? endgame.wrong
          : ko
            ? ko.wrong
            : capture
              ? "그 수로는 못 따내요."
              : live
                ? "그 수로는 살 수 없어요."
                : "그 수로는 백이 살아요."
      }
      wrongHint={
        endgame
          ? endgame.hint
          : ko
            ? ko.hint
            : capture
              ? capture.hint
              : shape
                ? `${LIFE_SHAPE_NAMES[shape]}의 급소를 먼저 차지해요.`
                : live
                  ? "눈 자리를 둘로 나누는 곳을 찾아요."
                  : "백이 두면 두 눈이 되는 자리(급소)를 먼저 차지해요."
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
      review={review}
      onExit={onExit}
    />
  );
}
