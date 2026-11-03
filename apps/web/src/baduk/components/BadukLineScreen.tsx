"use client";

import {
  type BadukState,
  createBadukScenario,
  legalPoints,
  pointAt,
  STANDARD_RULES,
  seatOfStone,
  step,
  stoneOfSeat,
} from "@game/baduk-engine";
import { useState } from "react";

import { LineScreen, useLineRun } from "@/components/study/LineScreen";
import type { StudyLine } from "@/study/line";

import { BADUK_JOSEKI_SET, parseJosekiStart } from "../joseki";
import { useBadukStudyProgress } from "../progress";
import { BadukBoard } from "./BadukBoard";

/** 정석은 19줄 판에서 둔다 */
const SIZE = 19;
const JOSEKI_RULES = { ...STANDARD_RULES, size: SIZE } as const;

/**
 * 수순 처음 판. 배우는 사람 자리(0번)가 수순 안의 그 차례 돌을 쥔다.
 * 시작 판 글자(`start`)의 놓인 돌과 먼저 둘 편을 그대로 따른다
 */
function lineState(line: StudyLine): BadukState {
  const start = parseJosekiStart(line.start ?? "");
  if (!start) throw new Error(`정석 시작 판을 읽지 못했다: ${line.id}`);
  const other = start.toPlay === 1 ? 2 : 1;
  const mine = line.learner === 0 ? start.toPlay : other;
  const state = createBadukScenario({
    rules: JOSEKI_RULES,
    black: start.black,
    white: start.white,
    me: mine,
  });
  return { ...state, toPlay: start.toPlay };
}

/** 바둑 정석 수순 하나를 따라 둔다 */
export function BadukLineScreen({
  lineId,
  onExit,
  onOpen,
}: {
  lineId: string;
  onExit: () => void;
  onOpen: (id: string) => void;
}) {
  const lines = BADUK_JOSEKI_SET.lines;
  const index = lines.findIndex((l) => l.id === lineId);
  const line = lines[index];
  if (!line) return null;
  return (
    <BadukLineRun
      line={line}
      index={index}
      total={lines.length}
      nextId={lines[index + 1]?.id ?? null}
      onExit={onExit}
      onOpen={onOpen}
    />
  );
}

function BadukLineRun({
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
  const solve = useBadukStudyProgress((s) => s.solve);
  const miss = useBadukStudyProgress((s) => s.miss);
  const [aim, setAim] = useState<number | null>(null);
  const run = useLineRun<BadukState, number>({
    line,
    // 바둑 돌 소리(문제 화면 BadukPuzzleScreen과 같다). 넘기지 않으면 장기·체스 기물 소리가 난다
    sounds: { move: "stone", capture: "badukCapture" },
    initial: () => lineState(line),
    parse: (_state, name) => {
      try {
        return pointAt(name, SIZE);
      } catch {
        return null;
      }
    },
    same: (a, b) => a === b,
    apply: (state, at) => {
      // 둘 차례 돌의 자리로 둔다(상대 수도 같은 함수로 둔다).
      const seat = seatOfStone(state, state.toPlay);
      const result = step(state, seat, { type: "place", at });
      if (!result.ok) return null;
      const before = state.prisoners[1] + state.prisoners[2];
      const after = result.state.prisoners[1] + result.state.prisoners[2];
      return { state: result.state, capture: after > before };
    },
    solve: () => solve(line.id),
    miss: () => miss(line.id),
  });
  const { state, status, shown } = run;
  const myStone = stoneOfSeat(state, 0);
  const legal = status === "play" ? legalPoints(state) : [];

  return (
    <LineScreen
      game="baduk"
      setTitle={BADUK_JOSEKI_SET.title}
      line={line}
      index={index}
      total={total}
      boardClassName="aspect-square w-[min(100%,calc(100dvh-18rem))] split:w-[min(calc(100dvh-1.5rem),36rem)]"
      board={
        <BadukBoard
          board={state.board}
          size={SIZE}
          myStone={myStone}
          canPlay={status === "play"}
          legal={shown !== null ? [shown] : legal}
          lastMove={run.lastMove}
          aim={aim}
          onAim={setAim}
          onPlace={(at) => {
            setAim(null);
            run.play(at);
          }}
        />
      }
      status={status}
      history={run.history}
      mistake={run.mistake}
      revealed={run.revealed}
      waitingText={myStone === 1 ? "백이 두는 중…" : "흑이 두는 중…"}
      moveLabel={(ply, name) => {
        // 수순 첫 수를 두는 편부터 번갈아 흑·백을 붙인다.
        const start = parseJosekiStart(line.start ?? "");
        const first = start?.toPlay ?? 1;
        const black = (ply % 2 === 0) === (first === 1);
        return `${ply + 1}. ${black ? "흑" : "백"} ${name}`;
      }}
      onHint={() => setAim(run.expected())}
      onReveal={() => {
        run.reveal();
        setAim(run.expected());
      }}
      onRestart={() => {
        run.restart();
        setAim(null);
      }}
      onNext={nextId ? () => onOpen(nextId) : null}
      onExit={onExit}
    />
  );
}
