import {
  acceptFrom,
  DRAND_DELAY,
  roundTimes,
  type Schedule,
} from "@game/stardraw-core";

import { formatLeft } from "./components/parts";
import type { LedgerStatus } from "./local-ledger";
import { roundShort } from "./round-label";

const CLOCK = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
/** 관측 안내·관측 시간표와 같은 "15:01" 꼴 */
export const gateClock = (s: number) => CLOCK.format(new Date(s * 1000));

/**
 * 홈 첫 화면(등록 전)의 회차 상태 한 줄.
 * 앞 회차 마감부터 다음 회차 접수 전까지(waiting) 장부 status의 round는 다음 회차라, 마감·관측은 앞 회차로 말하고
 * 다음 회차는 접수 시각만 말한다(관측 안내 `OnAirGuide`·관측 시간표와 같은 시각 표기)
 */
export function gateStatusLine(
  schedule: Schedule,
  s: LedgerStatus,
  live: number | null,
): string {
  // 관측 1분 내내 다음 회차 접수 시각도 함께(예전에는 실시간 관측 중이면 앞 말만이라 끝 몇 초만 보였다)
  if (live !== null) return observingLine(schedule, live);
  const name = roundShort(schedule, s.round);
  if (s.phase === "open")
    return `지금 ${name} 예측을 받고 있어요 · 마감까지 ${formatLeft(s.times.entryDeadline - s.now)}`;
  // closing은 지금 회차를, waiting은 기록을 기다리거나 관측 1분 중인 앞 회차를 말한다
  const closed =
    s.phase === "closing"
      ? s.round
      : s.round > 1
        ? Math.min(s.nextDrawRound, s.round - 1)
        : null;
  if (closed === null)
    return `${name} 예측은 ${gateClock(acceptFrom(schedule, s.round))}부터 받아요.`;
  const closedName = roundShort(schedule, closed);
  const drawAt = roundTimes(schedule, closed).closesAt + DRAND_DELAY;
  if (s.now < drawAt)
    return `${closedName} 예측을 마감했어요 · 관측까지 ${formatLeft(drawAt - s.now)}`;
  return observingLine(schedule, closed);
}

/** 관측 중인 회차와 다음 회차 접수 시각 */
function observingLine(schedule: Schedule, round: number): string {
  const next = round + 1;
  return `지금 ${roundShort(schedule, round)} 관측 중이에요 · ${roundShort(schedule, next)} 예측은 ${gateClock(acceptFrom(schedule, next))}부터`;
}
