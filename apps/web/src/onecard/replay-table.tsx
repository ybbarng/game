"use client";

import {
  BLACK_JOKER,
  COLOR_JOKER,
  type GameEvent,
  type OnecardCard,
  type OnecardState,
  rankOf,
  suitOf,
} from "@game/onecard-engine";

import type { ReplayTable, ReplayTableProps } from "@/review/replay-table";

import { isRedSuit, SUIT_SYMBOLS } from "./cards";
import { OnecardGame } from "./components/OnecardGame";
import { OnecardReviewRound } from "./components/OnecardReviewRound";
import { onecardKit } from "./kit";
import { type OnecardHost, useOnecard } from "./store";

function OnecardReplayTable({ onExit, openHands, topInset }: ReplayTableProps) {
  return <OnecardGame onExit={onExit} replay={{ openHands, topInset }} />;
}

/** 상황판 카드 글자(무늬 기호 + 숫자, 조커는 이름) */
export function onecardChip(card: string): { label: string; red: boolean } {
  const c = card as OnecardCard;
  if (c === BLACK_JOKER) return { label: "흑백 조커", red: false };
  if (c === COLOR_JOKER) return { label: "컬러 조커", red: true };
  const suit = suitOf(c);
  return suit
    ? { label: `${SUIT_SYMBOLS[suit]}${rankOf(c)}`, red: isRedSuit(suit) }
    : { label: card, red: false };
}

/**
 * 원카드 판 위 다시 보기. 원카드는 한 판이 한 게임이라 판도 하나다(나눠 준 걸음 0부터 판 끝까지).
 * 상황판 「나온 카드」는 버린 더미다(다시 섞으면 비워진다)
 */
export const onecardReplayTable: ReplayTable = {
  kit: onecardKit as unknown as ReplayTable["kit"],
  attach: (host, seatNames, events) =>
    useOnecard
      .getState()
      .attachReplay(
        host as unknown as OnecardHost,
        seatNames,
        events as GameEvent[],
      ),
  // 나눠 주는 연출이 끝나면 다음 걸음(카드가 나는 연출은 `pauseMs` 안에 끝난다)
  useIdle: () => useOnecard((s) => s.dealing === null),
  pauseMs: 900,
  Table: OnecardReplayTable,
  spans: (replayed) => {
    const end = replayed.events.findIndex((list) =>
      (list as GameEvent[]).some((e) => e.type === "ended"),
    );
    return [{ number: 1, start: 0, end: end < 0 ? null : end }];
  },
  Round: OnecardReviewRound,
  hands: (state) => (state as OnecardState).hands,
  played: (state) => ({
    title: "버린 더미",
    cards: (state as OnecardState).pile,
  }),
  chip: onecardChip,
};
