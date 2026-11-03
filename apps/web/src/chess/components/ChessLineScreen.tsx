"use client";

import {
  type ChessState,
  createChessScenario,
  legalFor,
  type Move,
  PROMOTIONS,
  parseFen,
  START_FEN,
  sameMove,
  sanToMove,
  step,
} from "@game/chess-engine";
import { useState } from "react";

import { LineScreen, useLineRun } from "@/components/study/LineScreen";
import type { StudyLine } from "@/study/line";

import { CHESS_OPENING_SET } from "../openings";
import { useChessStudyProgress } from "../progress";
import { useChessSettings } from "../settings";
import { ChessBoard } from "./ChessBoard";

/**
 * 배우는 사람의 편. learner는 「수순 안의 차례」라(0 = moves[0]을 두는 편),
 * 시작 판(FEN)의 둘 차례 편을 기준으로 정한다. 흑 차례로 시작하는 장면에서도 편이 뒤집히지 않는다
 */
export function learnerSide(line: StudyLine): "w" | "b" {
  const first = parseFen(line.start ?? START_FEN).turn;
  if (line.learner === 0) return first;
  return first === "w" ? "b" : "w";
}

/** 수순 처음 판. 배우는 사람 자리(0번)가 그 편을 쥔다 */
function lineState(line: StudyLine): ChessState {
  return createChessScenario({
    fen: line.start ?? START_FEN,
    me: learnerSide(line),
  });
}

/** 체스 오프닝 수순 하나를 따라 둔다 */
export function ChessLineScreen({
  lineId,
  onExit,
  onOpen,
}: {
  lineId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const lines = CHESS_OPENING_SET.lines;
  const index = lines.findIndex((l) => l.id === lineId);
  const line = lines[index];
  if (!line) return null;
  return (
    <ChessLineRun
      line={line}
      index={index}
      total={lines.length}
      nextId={lines[index + 1]?.id ?? null}
      onExit={onExit}
      onOpen={onOpen}
    />
  );
}

function ChessLineRun({
  line,
  index,
  total,
  nextId,
  onExit,
  onOpen,
}: {
  line: StudyLine;
  index: number;
  total: number;
  nextId: string | null;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const coordinates = useChessSettings((s) => s.coordinates);
  const solve = useChessStudyProgress((s) => s.solve);
  const miss = useChessStudyProgress((s) => s.miss);
  const [selected, setSelected] = useState<number | null>(null);
  const run = useLineRun<ChessState, Move>({
    line,
    initial: () => lineState(line),
    parse: (state, san) => sanToMove(state.position, san),
    same: sameMove,
    apply: (state, move) => {
      // 둘 차례 편의 자리로 둔다(상대 수도 같은 함수로 둔다).
      const seat =
        state.position.turn === "w" ? state.whiteSeat : 1 - state.whiteSeat;
      const result = step(state, seat, { type: "move", ...move });
      if (!result.ok) return null;
      return {
        state: result.state,
        capture: Boolean(state.position.board[move.to]),
      };
    },
    solve: () => solve(line.id),
    miss: () => miss(line.id),
  });
  const { state, status, shown } = run;
  const legal = status === "play" ? legalFor(state, 0) : [];

  /** 수순에는 승급이 없지만, 고르면 퀸으로 둔다 */
  const play = (picked: Move) => {
    const move =
      legal.find(
        (m) =>
          m.from === picked.from &&
          m.to === picked.to &&
          (m.promotion === undefined || m.promotion === PROMOTIONS[0]),
      ) ?? picked;
    run.play(move);
  };

  return (
    <LineScreen
      game="chess"
      setTitle={CHESS_OPENING_SET.title}
      line={line}
      index={index}
      total={total}
      boardClassName="aspect-square w-[min(100%,calc(100dvh-18rem))] split:w-[min(calc(100dvh-1.5rem),36rem)]"
      board={
        <ChessBoard
          board={state.position.board}
          flipped={learnerSide(line) === "b"}
          legal={shown ? legal.filter((m) => sameMove(m, shown)) : legal}
          selected={selected}
          onSelect={setSelected}
          onMove={(m) => {
            setSelected(null);
            play(m);
          }}
          lastMove={run.lastMove}
          checkedKing={null}
          coordinates={coordinates}
        />
      }
      status={status}
      history={run.history}
      mistake={run.mistake}
      revealed={run.revealed}
      waitingText={
        learnerSide(line) === "w" ? "흑이 두는 중…" : "백이 두는 중…"
      }
      moveLabel={(ply, san) => (ply % 2 === 0 ? `${ply / 2 + 1}. ${san}` : san)}
      onHint={() => setSelected(run.expected()?.from ?? null)}
      onReveal={() => {
        run.reveal();
        setSelected(run.expected()?.from ?? null);
      }}
      onRestart={() => {
        run.restart();
        setSelected(null);
      }}
      onNext={nextId ? () => onOpen(nextId) : null}
      onExit={onExit}
    />
  );
}
