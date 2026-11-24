import type { ComponentType } from "react";

import type { GameKit } from "@/game/kit";

import type { Replayed } from "./replay";
import type { ReplayHost } from "./replay-host";
import type { RoundSpan } from "./rounds";

/**
 * 판 위에서 다시 보는 카드 게임(`replay-tables.tsx`의 TABLES와 같은 목록). 복기 화면이 어느 갈래로 그릴지
 * 정할 때 표 묶음(마이티·하트·원카드 게임 화면)을 불러오지 않고 고르려고 이름만 따로 둔다.
 * 어긋나지 않는지 `replay-tables.test.ts`가 본다
 */
export const CARD_REPLAY_GAMES: readonly string[] = [
  "mighty",
  "hearts",
  "onecard",
];

export type AnyKit = GameKit<
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown
>;
export type AnyReplayHost = ReplayHost<
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown
>;

/** 다시 보기로 그리는 게임 화면의 인자 */
export interface ReplayTableProps {
  onExit: () => void;
  /** 다른 사람 손패를 앞면으로 펼친다(자리마다 정렬한 패). null이면 숨긴다 */
  openHands: readonly (readonly string[])[] | null;
  /** 위에 다시 보기 막대가 있어 그 아래 공간에만 그린다(px) */
  topInset: number;
}

/** 복기 목록의 판 한눈에 보기 인자 */
export interface ReplayRoundProps {
  span: RoundSpan;
  states: readonly unknown[];
  /** 판의 걸음마다 사건(판 요약에 잡기·헛외침 수 등을 셀 때) */
  events: readonly (readonly unknown[])[];
  seat: number;
  name: (seat: number) => string;
  onReplay: (index: number) => void;
}

/**
 * 판 위 다시 보기(게임 화면을 그대로 쓰고 위에 막대와 상황판을 얹는다)에서 카드 게임마다 다른 것.
 * 마이티·하트·원카드가 쓴다(`replay-tables.tsx`). 기록 다시 돌리기·해설은 `kit.review`가 맡는다
 */
export interface ReplayTable {
  kit: AnyKit;
  /** 그 걸음을 게임 화면 상태에 붙인다. `events`는 그 걸음의 사건 */
  attach(
    host: AnyReplayHost,
    seatNames: string[] | null,
    events: readonly unknown[],
  ): void;
  /** 화면이 받은 사건을 다 보여 줬나(자동 재생이 다음 걸음으로 간다) */
  useIdle(): boolean;
  /** 자동 재생: 화면이 쉰 뒤 다음 걸음까지(ms) */
  pauseMs: number;
  Table: ComponentType<ReplayTableProps>;
  /** 판마다 처음과 끝 걸음 */
  spans(replayed: Replayed<unknown, unknown>): RoundSpan[];
  /** 복기 목록의 판 한눈에 보기 */
  Round: ComponentType<ReplayRoundProps>;
  /** 자리별 손패(상황판·펼친 패) */
  hands(state: unknown): readonly (readonly string[])[];
  /** 상황판 「나온 카드」: 이름과 카드 */
  played(state: unknown): { title: string; cards: readonly string[] };
  /** 상황판 카드 글자. 없으면 마이티 카드 이름 */
  chip?(card: string): { label: string; red: boolean };
}
