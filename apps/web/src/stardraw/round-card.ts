import {
  acceptFrom,
  DRAND_DELAY,
  roundTimes,
  type Schedule,
} from "@game/stardraw-core";

import type { LedgerStatus } from "./local-ledger";
import { roundShort } from "./round-label";

const CLOCK = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
});
/** 시각만 "오후 3:00" */
export function clockOf(seconds: number): string {
  return CLOCK.format(new Date(seconds * 1000));
}

/**
 * 홈 회차 카드의 단계.
 * open 예측 받는 중(예측 안 함) · entered 예측서를 냄(마감 전) · drawing 마감 뒤 관측 전 · observing 관측 시각이 지나
 * 다음 회차 접수 전(관측 1분, 또는 기록이 늦게 오는 동안)
 */
export type RoundCardState = "open" | "entered" | "drawing" | "observing";

export interface RoundCardText {
  /** 지금 회차(waiting이면 앞 회차) */
  round: number;
  state: RoundCardState;
  /** 관측 시각(초) */
  drawAt: number;
  /** 다음 회차 예측을 받기 시작하는 때(초) */
  nextOpens: number;
  headline: string;
  note: string;
  /** 시험·화면 시험이 찾는 표시 */
  noteKey: string;
  /** 크게 세는 시계. 관측이 시작된 뒤에는 셀 것이 없어 null */
  countdown: { label: string; kind: "close" | "draw"; left: number } | null;
  foot: string;
}

/**
 * 홈 회차 카드의 글(실시간 관측 카드·결과 봉투 카드는 따로).
 * 관측 시각이 지난 뒤 다음 회차 접수 전까지는 「관측까지 0:00」에 멈추지 않고 관측 중이라고 말한다
 * (홈 상태 줄 `gateStatusLine`과 같은 기준, docs/36 11-67)
 */
export function roundCardText(
  schedule: Schedule,
  s: LedgerStatus,
  hasTicket: (round: number) => boolean,
): RoundCardText {
  // 앞 회차 추첨을 기다리거나 그 관측 1분(모두의 의무 시간) 동안은 그 회차가 지금 회차다
  const drawWaiting = s.phase === "waiting" && s.round > 1;
  const round = drawWaiting ? Math.min(s.nextDrawRound, s.round - 1) : s.round;
  const drawAt = roundTimes(schedule, round).closesAt + DRAND_DELAY;
  const nextOpens = acceptFrom(schedule, round + 1);
  const closed = s.phase !== "open";
  const ticket = hasTicket(round);
  const name = roundShort(schedule, round);
  const nextLine = `다음 회차는 ${clockOf(nextOpens)}부터 예측할 수 있어요.`;
  const base = { round, drawAt, nextOpens };

  if (closed && s.now >= drawAt)
    return {
      ...base,
      state: "observing",
      headline: `지금 ${name} 관측 중이에요.`,
      noteKey: ticket ? "observing-entered" : "observing-none",
      note: ticket
        ? "관측지에서 함께 지켜봐 주세요."
        : "관측지는 누구나 들어갈 수 있어요. 관측지로 가 볼까요?",
      countdown: null,
      foot: nextLine,
    };
  if (closed)
    return {
      ...base,
      state: "drawing",
      headline: `${name} 예측을 마감했어요.`,
      noteKey: ticket ? "closed-entered" : "closed-none",
      note: ticket
        ? "곧 관측이 시작됩니다. 관측지로 가 볼까요?"
        : "관측지는 누구나 들어갈 수 있어요. 관측지로 가 볼까요?",
      countdown: { label: "관측까지", kind: "draw", left: drawAt - s.now },
      foot: ticket ? `관측 ${clockOf(drawAt)}` : nextLine,
    };
  if (ticket)
    return {
      ...base,
      state: "entered",
      headline: `${name} 예측서를 냈어요.`,
      noteKey: "open-entered",
      note: `${clockOf(drawAt)} 관측을 함께 지켜봐 주세요.`,
      countdown: { label: "관측까지", kind: "draw", left: drawAt - s.now },
      foot: `마감 ${clockOf(s.times.closesAt)} · 예측서 ${s.entries}장`,
    };
  return {
    ...base,
    state: "open",
    headline: `지금 ${name} 예측을 받고 있어요.`,
    noteKey: "open-none",
    note: "아직 이번 회차에 예측하지 않으셨어요.",
    countdown: {
      label: "마감까지",
      kind: "close",
      left: s.times.entryDeadline - s.now,
    },
    foot: `관측 ${clockOf(drawAt)} · 예측서 ${s.entries}장`,
  };
}
