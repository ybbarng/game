import {
  checkScheduleChange,
  isAlignedEpoch,
  liveStart,
  type Phase,
  roundAt,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  scheduleFromRecords,
  schedulePending,
} from "@mighty/stardraw-core";

import { LIVE_ROUND_SECONDS } from "./config";
import type { Store } from "./store";

/**
 * 일정 바꾸기 예약(docs/36 11-6, 11-32): 장부를 새로 만들지 않고, 일정표 한 줄을 다음에 닫히는 회차 기록에 싣는다.
 * 같은 단계 안에서 회차 길이만 바꾸는 것(시험 20분 → 시험 1시간, 정식 1시간 → 정식 2시간)과
 * 시험 → 정식(정식 시작)을 같은 길로 한다. 규칙의 3회차 예고를 그대로 따르므로 새 줄은 그 기록 회차 + 4회차부터다.
 * 여기서는 규칙을 미리 확인해 저장소에 예약만 하고, 실제로 싣는 것은 돌고 있는 서버(엔진)가 한다.
 * 기본 길은 국장 관리 화면(/stardraw/admin, 국장 서명 운영 기록, docs/36 11-12)이고, 이 명령은 국장 열쇠가 없을 때의 예비다.
 */

export interface ScheduleLiveResult {
  change: ScheduleEntry;
  /** 일정 바꾸기를 실을 회차(다음에 닫히는 기록) */
  decidedIn: number;
}

/** 저장소의 처음 일정표에 기록들의 일정 바꾸기(옛 칸과 국장 운영 기록, 취소 반영)를 모두 반영한 지금 일정표 */
export function currentSchedule(store: Store): Schedule {
  const genesis = store.storedGenesis();
  if (!genesis) throw new Error("장부가 없다. 서버를 먼저 띄운다");
  const records = [];
  for (let r = 1; r <= store.recordCount(); r++) {
    const record = store.record(r);
    if (record) records.push(record);
  }
  return scheduleFromRecords(genesis, records);
}

/**
 * 일정 바꾸기를 예약한다. `phase`를 주지 않으면 지금 단계(마지막 줄) 그대로 회차 길이만 바꾼다.
 * 새 줄은 마지막 줄의 마감 여유·작업 증명 목표값을 그대로 잇는다(국장 화면과 같다).
 * 확인: 단계가 있는 장부인지, 이미 예약·예고 중인 일정 바꾸기가 없는지, 바뀌는 것이 있는지,
 * 새 회차 길이로 추첨이 그 길이의 배수 시각에 오는지(1시간이면 x:55 시작, 정각 추첨),
 * 시작이 지금 일정표의 회차가 열리는 시각인지, 3회차 예고(다음 기록 회차 + 4회차 이후)인지
 */
export function scheduleChange(
  store: Store,
  from: number,
  roundSeconds: number,
  phase?: Phase,
): ScheduleLiveResult {
  const schedule = currentSchedule(store);
  const last = schedule.entries.at(-1);
  if (!last?.phase) throw new Error("단계가 있는 서버 장부가 아니다");
  const decidedIn = store.recordCount() + 1;
  if (schedulePending(schedule, decidedIn))
    throw new Error(
      `예고 중인 일정 바꾸기가 있다(${last.fromRound}회차부터). 효력이 생긴 뒤에 다시 예약한다`,
    );
  if (store.directorOps().some(({ op }) => op.kind === "schedule"))
    throw new Error("국장이 보낸 일정 바꾸기 요청이 다음 기록을 기다린다");
  if (store.pendingChange())
    throw new Error(
      "이미 예약한 일정 바꾸기가 있다(서버가 다음 기록에 싣는다)",
    );
  const nextPhase = phase ?? last.phase;
  if (nextPhase === last.phase && roundSeconds === last.length)
    throw new Error("지금 일정과 같다(회차 길이·단계가 바뀌지 않는다)");
  if (!isAlignedEpoch(from, roundSeconds))
    throw new Error(
      `새 회차는 추첨이 회차 길이의 배수 시각에 오게 시작해야 한다(${alignedHint(roundSeconds)})`,
    );
  const fromRound = roundAt(schedule, from);
  if (fromRound === null || roundTimes(schedule, fromRound).opensAt !== from)
    throw new Error(
      "시작 시각이 지금 일정표의 회차가 열리는 시각과 맞지 않는다",
    );
  const change: ScheduleEntry = {
    ...last,
    fromRound,
    length: roundSeconds,
    phase: nextPhase,
  };
  const problem = checkScheduleChange(schedule, change, decidedIn);
  if (problem) throw new Error(`${problem}(${decidedIn}회차 기록에 실린다)`);
  store.setPendingChange(change);
  return { change, decidedIn };
}

/** 정식 단계 예약(docs/36 11-6): 시험 단계 장부에서만, 기본 1시간 회차 */
export function scheduleLive(
  store: Store,
  from: number,
  roundSeconds = LIVE_ROUND_SECONDS,
): ScheduleLiveResult {
  const schedule = currentSchedule(store);
  if (schedule.entries[0]?.phase !== "trial")
    throw new Error("시험 단계로 시작한 장부가 아니다");
  const live = liveStart(schedule);
  if (live !== null) throw new Error(`이미 ${live}회차부터 정식 단계다`);
  return scheduleChange(store, from, roundSeconds, "live");
}

/** 새 회차 길이에서 첫 회차가 열릴 수 있는 시각 안내(1시간이면 "x:55") */
export function alignedHint(length: number): string {
  const minutes = length / 60;
  if (length <= 3600 && 3600 % length === 0) {
    const first = (minutes - 5 + 60) % 60;
    const marks = Array.from(
      { length: 3600 / length },
      (_, i) => `x:${String((first + i * minutes) % 60).padStart(2, "0")}`,
    );
    return `${minutes}분 회차면 ${marks.join("·")}`;
  }
  return `${minutes}분 회차면 추첨(시작 + 길이 + 5분)이 유닉스 시각 ${length}초의 배수인 시각`;
}

/**
 * `schedule-live --from <ISO> [--round-seconds <초>]`,
 * `schedule-change --from <ISO> --round-seconds <초> [--phase trial|live]`
 */
export function parseScheduleLiveArgs(args: readonly string[]): {
  from: number;
  roundSeconds?: number;
  phase?: Phase;
} {
  const value = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fromText = value("--from");
  const ms = fromText ? Date.parse(fromText) : Number.NaN;
  if (!Number.isFinite(ms) || ms % 1000 !== 0)
    throw new Error(
      "--from <ISO 시각>이 필요하다(예: 2026-11-02T08:55:00+09:00)",
    );
  const seconds = value("--round-seconds");
  if (seconds !== undefined && !/^\d+$/.test(seconds))
    throw new Error(`--round-seconds는 초(정수): ${seconds}`);
  const phase = value("--phase");
  if (phase !== undefined && phase !== "trial" && phase !== "live")
    throw new Error(`--phase는 trial이나 live: ${phase}`);
  return {
    from: ms / 1000,
    ...(seconds ? { roundSeconds: Number(seconds) } : {}),
    ...(phase ? { phase } : {}),
  };
}
