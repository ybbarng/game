/**
 * 타이머 소리. 공통 효과음(`src/game/sound.ts`)의 큐브 소리를 낸다(`/sounds`에서 미리 듣고 크기를 맞춘다).
 * 살펴보기 알림은 혼자 맞추기와 같은 소리로, 8초는 한 번, 12초는 두 번 울린다.
 * 게임 센터 전체 소리를 끈 사람에게는 내지 않는다. 첫 누름에서 소리를 여는 일은 공통 모듈이 맡는다(iOS).
 */
import { useSettings } from "@/game/settings";
import { type Cue, play } from "@/game/sound";

export type TimerCue = "warn8" | "warn12" | "start" | "stop";

const CUE: Record<TimerCue, { cue: Cue; times: number }> = {
  warn8: { cue: "cubeInspect", times: 1 },
  warn12: { cue: "cubeInspect", times: 2 },
  start: { cue: "cubeTimerStart", times: 1 },
  stop: { cue: "cubeTimerStop", times: 1 },
};

export function playTimerCue(cue: TimerCue): void {
  if (!useSettings.getState().sound) return;
  const { cue: c, times } = CUE[cue];
  play(c, { times });
}
