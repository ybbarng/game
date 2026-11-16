"use client";

import type { MatchState as HeartsState } from "@game/hearts-engine";
import type { Card, MatchState } from "@game/mighty-engine";

import { GameTable } from "@/components/GameTable";
import { mightyKit } from "@/game/mighty-kit";
import { type AttachableHost, useGame } from "@/game/store";
import { HeartsTable } from "@/hearts/components/HeartsTable";
import { heartsKit } from "@/hearts/kit";
import { type HeartsHost, useHearts } from "@/hearts/store";
import { onecardReplayTable } from "@/onecard/replay-table";

import { HeartsRound } from "./HeartsRound";
import { MightyRound } from "./MightyRounds";
import type {
  AnyKit,
  ReplayRoundProps,
  ReplayTable,
  ReplayTableProps,
} from "./replay-table";
import { roundSpans } from "./rounds";

/** 마이티·하트 공통으로 있는 판 상태 모양(손패·턴) */
interface TrickState {
  roundNumber: number;
  round: {
    hands: string[][];
    trick: { plays: { seat: number; card: string }[] } | null;
    tricks: { plays: { seat: number; card: string }[] }[];
  };
}

const trickSpans: ReplayTable["spans"] = (replayed) =>
  roundSpans(
    replayed.events as { type: string }[][],
    (i) => (replayed.states[i] as TrickState).roundNumber,
  );

const trickPlayed: ReplayTable["played"] = (state) => {
  const { round } = state as TrickState;
  return {
    title: "이 판에 나온 카드",
    cards: [
      ...round.tricks.flatMap((t) => t.plays),
      ...(round.trick?.plays ?? []),
    ].map((p) => p.card),
  };
};

const trickHands: ReplayTable["hands"] = (state) =>
  (state as TrickState).round.hands;

function MightyReplayTable({ onExit, openHands, topInset }: ReplayTableProps) {
  return (
    <GameTable
      onExit={onExit}
      openHands={openHands as Card[][] | null}
      topInset={topInset}
    />
  );
}

function HeartsReplayTable({ onExit, openHands, topInset }: ReplayTableProps) {
  return (
    <HeartsTable
      onExit={onExit}
      openHands={openHands as Card[][] | null}
      topInset={topInset}
    />
  );
}

function MightyReviewRound(props: ReplayRoundProps) {
  return (
    <MightyRound {...props} states={props.states as readonly MatchState[]} />
  );
}

function HeartsReviewRound(props: ReplayRoundProps) {
  return (
    <HeartsRound {...props} states={props.states as readonly HeartsState[]} />
  );
}

const mightyReplayTable: ReplayTable = {
  kit: mightyKit as unknown as AnyKit,
  attach: (host, seatNames) =>
    useGame
      .getState()
      .attachReplay(host as unknown as AttachableHost, seatNames),
  useIdle: () => useGame((s) => !s.busy && s.queue.length === 0),
  pauseMs: 120,
  Table: MightyReplayTable,
  spans: trickSpans,
  Round: MightyReviewRound,
  hands: trickHands,
  played: trickPlayed,
};

const heartsReplayTable: ReplayTable = {
  kit: heartsKit as unknown as AnyKit,
  attach: (host, seatNames) =>
    useHearts.getState().attachReplay(host as unknown as HeartsHost, seatNames),
  useIdle: () => useHearts((s) => !s.busy && s.queue.length === 0),
  pauseMs: 120,
  Table: HeartsReplayTable,
  spans: trickSpans,
  Round: HeartsReviewRound,
  hands: trickHands,
  played: trickPlayed,
};

/** 판 위에서 다시 보는 카드 게임(그 밖의 게임은 게임마다 다시 보기 화면을 쓴다) */
const TABLES: Record<string, ReplayTable> = {
  mighty: mightyReplayTable,
  hearts: heartsReplayTable,
  onecard: onecardReplayTable,
};

export function replayTableFor(game: string): ReplayTable | null {
  return TABLES[game] ?? null;
}
