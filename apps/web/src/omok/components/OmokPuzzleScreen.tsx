"use client";

import { type OmokState, pointName, step, viewOf } from "@game/omok-engine";
import { useMemo, useState } from "react";

import {
  findInSets,
  PuzzleScreen,
  usePuzzleRun,
} from "@/components/study/PuzzleScreen";

import { useOmokStudyProgress } from "../progress";
import {
  OMOK_PUZZLE_SETS,
  type OmokPuzzle,
  type OmokPuzzleSet,
} from "../puzzles";
import {
  defenseFor,
  explainMarks,
  explainSolved,
  judgeMove,
  puzzleState,
  solutionOf,
} from "../study";
import { OmokBoard } from "./OmokBoard";

/** 몇 수 안인지 보일 때 쓰는 말 */
const COUNT = ["", "한", "두", "세", "네", "다섯"];

/** 오목 문제 하나. 흑이 둔다 */
export function OmokPuzzleScreen({
  puzzleId,
  onExit,
  onOpen,
}: {
  puzzleId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const found = findInSets<OmokPuzzle>(OMOK_PUZZLE_SETS, puzzleId);
  if (!found) return null;
  return (
    <OmokPuzzleRun
      set={found.set as OmokPuzzleSet}
      index={found.index}
      puzzle={found.puzzle}
      onExit={onExit}
      onOpen={onOpen}
    />
  );
}

function OmokPuzzleRun({
  set,
  index,
  puzzle,
  onExit,
  onOpen,
}: {
  set: OmokPuzzleSet;
  index: number;
  puzzle: OmokPuzzle;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const solve = useOmokStudyProgress((s) => s.solve);
  const miss = useOmokStudyProgress((s) => s.miss);
  const [aim, setAim] = useState<number | null>(null);
  // 금지 자리를 누르면 엔진이 받지 않으므로 까닭을 알린다(틀린 것으로 치지 않는다).
  const [notice, setNotice] = useState<string | null>(null);
  const run = usePuzzleRun<OmokState, number>({
    // 오목은 돌 놓는 소리(잡기가 없어 둘 다 같다)
    sounds: { move: "stone", capture: "stone" },
    initial: () => puzzleState(puzzle),
    judge: (state, move, at) => judgeMove(puzzle, state.board, move, at),
    apply: (state, move) => {
      const result = step(state, 0, { type: "place", at: move });
      return result.ok ? { state: result.state, capture: false } : null;
    },
    ...(puzzle.kind === "attack"
      ? {
          reply: (state: OmokState) => {
            const block = defenseFor(state.board, state.rules.variant);
            if (block === null) return null;
            const result = step(state, 1, { type: "place", at: block });
            if (!result.ok) return null;
            return { state: result.state, move: block, capture: false };
          },
        }
      : {}),
    explain: () => explainSolved(puzzle),
    solve: () => solve(puzzle.id),
    miss: () => miss(puzzle.id),
  });
  const { state, status, shown } = run;
  const view = useMemo(() => viewOf(state, 0), [state]);
  // 해설이 짚는 자리. 푼 뒤에만 보인다.
  const marks = useMemo(
    () => (status === "solved" ? explainMarks(puzzle) : null),
    [status, puzzle],
  );
  const nextId = set.puzzles[index + 1]?.id ?? null;
  const answer = solutionOf(puzzle);
  const result = state.result;

  const goal =
    puzzle.kind === "attack" && run.step > 0
      ? "계속 넷으로 몰아 다섯을 만드세요"
      : puzzle.goal
        ? puzzle.goal
        : puzzle.kind === "attack" && puzzle.moves >= 3
          ? `넷으로 몰아붙여 ${COUNT[puzzle.moves] ?? puzzle.moves} 수 안에 이기세요`
          : set.prompt;
  // 손가락은 한 번 겨누고 다시 눌러 둔다(대국 화면과 같다).
  /** 금지 자리면 까닭을 알리고 true(틀린 것으로 치지 않는다) */
  const warnForbidden = (at: number): boolean => {
    const banned = view.forbidden.find((f) => f.at === at);
    if (!banned) return false;
    setNotice(`${pointName(at)}: 흑은 ${banned.reason} 금지예요`);
    return true;
  };
  const prompt =
    notice ?? (aim !== null ? `${pointName(aim)}: 한 번 더 누르면 둔다` : goal);

  return (
    <PuzzleScreen
      game="omok"
      setTitle={set.title}
      index={index}
      total={set.puzzles.length}
      boardClassName="aspect-square w-[min(100%,calc(100dvh-16rem))] split:w-[min(calc(100dvh-1.5rem),36rem)]"
      board={
        <OmokBoard
          board={state.board}
          myStone={1}
          canPlay={status === "play"}
          lastMove={run.lastMove}
          winLine={result?.kind === "five" ? result.line : null}
          forbidden={status === "play" ? view.forbidden : []}
          coords
          marks={status === "solved" ? marks : null}
          aim={aim}
          onAim={(at) => {
            // 금지 자리를 겨누면(손가락 첫 누름·화살표) 바로 까닭을 알린다. 겨눔은 그대로 둬 화살표로 지나갈 수 있다.
            setAim(at);
            if (at === null || !warnForbidden(at)) setNotice(null);
          }}
          onPlace={(at) => {
            setAim(null);
            if (warnForbidden(at)) return;
            setNotice(null);
            run.play(at);
          }}
        />
      }
      status={status}
      prompt={prompt}
      waitingText="백이 막는 중…"
      solvedText={
        puzzle.kind === "attack"
          ? "다섯!"
          : puzzle.kind === "pick"
            ? "좋은 수예요!"
            : "막았어요!"
      }
      wrongText={
        puzzle.kind === "attack"
          ? puzzle.race
            ? "그 수로는 흑이 먼저 이기지 못해요"
            : "그 수로는 몰아붙일 수 없어요"
          : puzzle.kind === "pick"
            ? puzzle.reason === "opening"
              ? "그 자리는 흑이 이긴다고 알려진 모양(화월·포월)이 아니에요"
              : "그 수는 백 열린 셋을 못 막거나, 막아도 흑 열린 셋이 생기지 않아요"
            : "그 수로는 백의 공격을 못 막아요"
      }
      wrongHint={set.hint}
      shown={shown !== null}
      explain={run.explain}
      canHint={run.step === 0}
      onHint={() => {
        setNotice(null);
        setAim(answer);
      }}
      onReveal={() => {
        run.reveal(answer);
        setNotice(null);
        setAim(answer);
      }}
      onRestart={() => {
        run.restart();
        setNotice(null);
        setAim(null);
      }}
      onNext={nextId ? () => onOpen(nextId) : null}
      onExit={onExit}
    />
  );
}
