// 큐브 게임 소리를 고르는 곳(docs/51 5절). 화면을 모르는 순수 함수라, 무엇이 언제 몇 번 나는지를 시험한다.
// 소리 자체는 `src/game/sound.ts`(크기 기준은 e2e/sounds.spec.ts), 내는 일은 화면이 `playCubeCue`로 한다.
// - 계속 나는 소리(면 돌기·콤보 단계)는 작게, 한 번 나는 사건 소리(이정표·골드·개인 최고 등)는 또렷하게.
// - 대결에서 상대가 이정표를 지나는 것은 소리 없이 톡만 띄운다. 1등이 바뀔 때만 짧게 낸다.
import type { Cue } from "@/game/sound";

import { comboLevel, type FlowStrip } from "./flow/strip";
import type { SessionCue } from "./solve-session";

export interface CubeSound {
  cue: Cue;
  /** 몇 번 이어서(12초 알림은 두 번) */
  times?: number;
  /** 단계(콤보 1~4) */
  step?: number;
}

/** 혼자 맞추기·제한 도전 세션 신호 → 소리. `gold`는 방금 켜진 칩이 골드인가, `best`는 이번 판이 개인 최고인가 */
export function soloSound(
  cue: SessionCue,
  { gold = false, best = false }: { gold?: boolean; best?: boolean } = {},
): CubeSound {
  switch (cue) {
    case "inspect8":
      return { cue: "cubeInspect" };
    case "inspect12":
      return { cue: "cubeInspect", times: 2 };
    case "inspect15":
      return { cue: "cubeInspectEnd" };
    case "milestone":
      // 골드면 띵 대신 반짝임(둘을 겹치지 않는다)
      return { cue: gold ? "cubeGold" : "cubeMilestone" };
    case "solved":
      // 개인 최고면 맞춤 소리 대신 팡파르
      return { cue: best ? "cubeBest" : "cubeSolved" };
    case "low":
      return { cue: "cubeLow" };
    case "dnf":
      return { cue: "invalid" };
  }
}

/**
 * 흐름 콤보가 단계(4·12·24·40수)를 넘었으면 그 단계(1~4), 아니면 0. 이어 친 수가 하나 늘어 단계가 오른 때만이라,
 * 끊겼다 다시 시작하거나 큐브 돌리기(콤보가 그대로)로는 나지 않는다
 */
export function comboStep(before: FlowStrip, after: FlowStrip): number {
  if (after.combo !== before.combo + 1) return 0;
  const level = comboLevel(after.combo);
  return level > comboLevel(before.combo) ? level : 0;
}

/** 콤보 단계 소리 */
export function comboSound(step: number): CubeSound | null {
  return step > 0 ? { cue: "cubeCombo", step } : null;
}

/**
 * 대결에서 이정표를 지난 사람들(`passed`)이 생긴 때의 소리. 1등이 바뀌었으면(처음 1등이 정해진 때는 빼고) 「1등이 바뀜」
 * 하나만, 아니면 내가 지났을 때 「띵」. 상대만 지났으면 없다. 내가 방금 다 맞췄으면(`meDone`) 맞춤 소리가 맡아 내지 않는다
 */
export function raceMilestoneSound({
  passed,
  me,
  prevLeader,
  leader,
  meDone = false,
}: {
  passed: readonly string[];
  me: string;
  prevLeader: string | undefined;
  leader: string | undefined;
  meDone?: boolean;
}): CubeSound | null {
  if (meDone && passed.includes(me)) return null;
  if (prevLeader !== undefined && leader !== undefined && leader !== prevLeader)
    return { cue: "cubeLead" };
  if (passed.includes(me)) return { cue: "cubeMilestone" };
  return null;
}

/** 대결 살펴보기(15초에 모두 출발): 지난 시각 `prevMs`에서 `nowMs`로 오는 사이 넘은 8·12초 알림 */
export function raceInspectSound(
  prevMs: number,
  nowMs: number,
): CubeSound | null {
  if (prevMs < 12_000 && nowMs >= 12_000)
    return { cue: "cubeInspect", times: 2 };
  if (prevMs < 8_000 && nowMs >= 8_000) return { cue: "cubeInspect" };
  return null;
}
