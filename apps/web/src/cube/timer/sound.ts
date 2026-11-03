/**
 * 타이머 소리. 공통 효과음(`src/game/sound.ts`)처럼 음원 없이 Web Audio로 합성한다.
 * 짧은 알림 몇 개뿐이라 공통 모듈의 소리 목록에 넣지 않고 여기에 둔다(큐브 화면이 따로 소리를 늘리는
 * 중이라 겹치지 않게). 소리를 낼 수 없는 브라우저면 조용히 넘어간다.
 */

export type TimerCue = "warn8" | "warn12" | "start" | "stop";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        typeof window === "undefined"
          ? undefined
          : (window.AudioContext ??
            (window as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext);
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(
  a: AudioContext,
  freq: number,
  at: number,
  duration: number,
  gain: number,
): void {
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export function playTimerCue(cue: TimerCue): void {
  const a = audio();
  if (!a) return;
  switch (cue) {
    case "warn8":
      // 8초: 한 번
      beep(a, 880, 0, 0.18, 0.25);
      return;
    case "warn12":
      // 12초: 높게 두 번
      beep(a, 1175, 0, 0.14, 0.25);
      beep(a, 1175, 0.18, 0.14, 0.25);
      return;
    case "start":
      beep(a, 1320, 0, 0.06, 0.15);
      return;
    case "stop":
      beep(a, 660, 0, 0.09, 0.18);
      return;
  }
}

/** 첫 누름 안에서 소리를 열어 둔다(iOS는 누름 밖에서 연 소리를 막는다) */
export function unlockTimerAudio(): void {
  audio();
}
