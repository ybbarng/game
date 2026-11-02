import {
  acceptFrom,
  DRAND_DELAY,
  fixedThrough,
  OBSERVE_SECONDS,
  roundTimes,
  type Schedule,
} from "@game/stardraw-core";

/**
 * 관측 시간표(/stardraw/timetable, 2026-11-02 사용자): 지금 회차부터 앞으로의 예측 접수·관측 시각.
 * 시각은 장부의 일정표만으로 계산하고, 장부 규칙상 바뀔 수 없는 회차(`fixedThrough`)는 「확정」,
 * 그 뒤는 「예정」으로 가른다. 예정 회차에만 「사정에 따라 바뀔 수 있다」는 안내를 단다
 */

/** 시간표 한 줄의 지금 단계 */
export type TimetableState =
  /** 아직 열리지 않았다 */
  | "upcoming"
  /** 예측을 받는다 */
  | "open"
  /** 예측을 마감하고 관측을 기다린다 */
  | "closed"
  /** 관측 중(관측지 연출) */
  | "observing";

export interface TimetableRow {
  round: number;
  /**
   * 예측 접수 시작: 앞 회차 관측이 끝난 때(core `acceptFrom`, 관측 시각 + 관측 1분). 서버도 그 전에는 받지 않는다.
   * 장부 일정표의 회차 칸 시작(앞 회차 마감)보다 6분 늦다. 1회차는 칸 시작 그대로
   */
  opensAt: number;
  /** 화면이 예측을 막는 시각(마감) */
  deadline: number;
  /** 서버 마감(마감 여유가 끝나는 때) */
  closesAt: number;
  /** 관측 시각(마감 + drand 지연, 홈 회차 카드와 같다) */
  observeAt: number;
  /** 관측이 끝나는 때(관측 1분 뒤). 다음 회차 접수가 이때 열린다 */
  observeEnd: number;
  /** 장부 규칙상 시각이 바뀔 수 없다 */
  fixed: boolean;
  state: TimetableState;
}

export interface Timetable {
  rows: TimetableRow[];
  /** 시각이 확정된 마지막 회차 */
  fixedThrough: number;
  /** 예고 중인 일정 변경(효력 회차와 새 회차 길이). 없으면 null */
  change: { fromRound: number; length: number } | null;
}

/** 예정 회차를 확정 뒤로 몇 줄 더 보일지 */
const PLANNED_ROWS = 3;
/** 적어도 이만큼은 보인다(확정 범위가 짧아도) */
const MIN_ROWS = 6;

/**
 * @param lastRecordRound 장부에 실린 마지막 기록 회차(아직 없으면 0)
 * @param current 지금 응모받는(또는 곧 받을) 회차
 * @param observing 지금 관측(연출) 중이거나 관측을 기다리는 회차(`watchRound`). 있으면 그 줄부터 보인다
 * @param live 그 회차가 지금 관측 연출 중인지
 */
export function timetable(
  schedule: Schedule,
  lastRecordRound: number,
  now: number,
  current: number,
  observing: number | null,
  live: boolean,
): Timetable {
  const fixed = fixedThrough(schedule, lastRecordRound);
  const first = observing ?? current;
  const last = Math.max(fixed + PLANNED_ROWS, first + MIN_ROWS - 1);
  const rows: TimetableRow[] = [];
  for (let round = first; round <= last; round++) {
    const t = roundTimes(schedule, round);
    const observeAt = t.closesAt + DRAND_DELAY;
    const opensAt = acceptFrom(schedule, round);
    const state: TimetableState =
      round === observing
        ? live || now >= observeAt
          ? "observing"
          : "closed"
        : now < opensAt
          ? "upcoming"
          : now < t.entryDeadline
            ? "open"
            : "closed";
    rows.push({
      round,
      opensAt,
      deadline: t.entryDeadline,
      closesAt: t.closesAt,
      observeAt,
      observeEnd: observeAt + OBSERVE_SECONDS,
      fixed: round <= fixed,
      state,
    });
  }
  const lastEntry = schedule.entries.at(-1);
  const change =
    lastEntry &&
    lastEntry.fromRound > 1 &&
    lastEntry.fromRound > lastRecordRound
      ? { fromRound: lastEntry.fromRound, length: lastEntry.length }
      : null;
  return { rows, fixedThrough: fixed, change };
}
