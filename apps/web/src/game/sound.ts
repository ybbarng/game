/**
 * 효과음 내기. 소리 이름(`Cue`)·크기·합성은 `sound/render.ts`에 있고, 이 파일은 소리 상자(AudioContext)를 열고
 * 닫으며 소리를 낸다.
 *
 * 소리 짜기(`sound/render.ts`, 2천 줄 가까이)는 첫 화면 묶음에 싣지 않고 첫 누름이나 첫 소리 때 따로 불러온다
 * (2026-11-25 첫 화면 가볍게). 불러오는 사이에 부른 소리는 불러온 뒤 바로 낸다.
 *
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막는다. 첫 누름에서 AudioContext를 열어 두어
 * 컴퓨터 차례처럼 누름 없이 나는 첫 소리도 막히지 않게 한다(특히 iOS).
 */
import type { Clock } from "@game/fair-play/clock";
import { random } from "./sound/random";
import type { Cue, PlayOptions } from "./sound/render";
import { getVolume, onVolume } from "./volume";

export type { Cue, PlayOptions, StarSound } from "./sound/render";

export interface Graph {
  /** 마른 소리와 울림으로 함께 보내는 입구 */
  out: GainNode;
  /** 울림 없이 마른 소리만 보내는 입구(`DRY` 소리) */
  dry: GainNode;
  /** 전체 음량 */
  master: GainNode;
  noise: AudioBuffer;
}

interface Audio extends Graph {
  ctx: AudioContext;
}

type RenderModule = typeof import("./sound/render");

let audioState: Audio | null = null;
let renderer: RenderModule | null = null;
let loading: Promise<RenderModule> | null = null;

/** 소리 짜기 모듈을 한 번 불러온다. 받지 못했으면(연결 끊김) 다음 소리에서 다시 받는다 */
function loadRenderer(): Promise<RenderModule> {
  loading ??= import("./sound/render").then(
    (m) => {
      renderer = m;
      return m;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

function createAudio(): Audio | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext === "undefined"
  )
    return null;
  const ctx = new window.AudioContext();
  return { ctx, ...buildGraph(ctx, getVolume()) };
}

export function buildGraph(ctx: BaseAudioContext, gain: number): Graph {
  const master = ctx.createGain();
  master.gain.value = gain;
  // 여러 소리가 겹쳐도 깨지지 않게 살짝 누른다. 문턱을 더 낮추면 압축기가 전체를
  // 자동으로 키워(makeup gain) 오히려 커지므로, 소리 사이 크기는 `TRIM_DB`로 맞춘다.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.ratio.value = 6;
  master.connect(limiter).connect(ctx.destination);

  // 작은 방 울림. 합성음이 덜 딱딱하게 들린다.
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 1.3);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  reverb.connect(wet).connect(master);

  const out = ctx.createGain();
  out.connect(master);
  out.connect(reverb);
  const dry = ctx.createGain();
  dry.connect(master);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return { out, dry, master, noise };
}

function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++)
      data[i] = (random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function audio(): Audio | null {
  audioState ??= createAudio();
  if (audioState?.ctx.state === "suspended") void audioState.ctx.resume();
  if (audioState) armIdleClose();
  return audioState;
}

/** `closeAudioWhenIdle`로 켰을 때: 시계, 기다릴 시간, 걸어 둔 닫기 끄기 */
let idleClose: {
  clock: Clock;
  ms: number;
  cancel: (() => void) | null;
} | null = null;

function armIdleClose(): void {
  if (!idleClose) return;
  idleClose.cancel?.();
  idleClose.cancel = idleClose.clock.after(idleClose.ms, closeAudio);
}

/** 소리 엔진을 닫는다. 다음 소리는 `audio()`가 새로 연다 */
function closeAudio(): void {
  if (idleClose) idleClose.cancel = null;
  const a = audioState;
  if (!a) return;
  audioState = null;
  renderer?.forgetVoices();
  void a.ctx.close().catch(() => undefined);
}

/**
 * 소리 엔진을 마지막으로 쓴 뒤 `ms` 동안 소리가 없으면 닫는다(돌려준 함수로 끈다). 열린 AudioContext는 잔향·잡음
 * 버퍼와 소리 스레드로 웹 프로세스 메모리를 계속 쥔다(Cubie 큐브 미니에서 약 15MB, docs/52 2절). `ms`는 가장 긴
 * 소리(잔향 꼬리 포함)보다 넉넉히 둔다. 브라우저는 누름 밖에서 새로 연 소리를 막을 수 있어, 누름 없이도 소리를
 * 여는 Cubie 앱의 웹 화면에서만 켠다
 */
export function closeAudioWhenIdle(clock: Clock, ms: number): () => void {
  idleClose?.cancel?.();
  const mine = { clock, ms, cancel: null as (() => void) | null };
  idleClose = mine;
  if (audioState) armIdleClose();
  return () => {
    if (idleClose !== mine) return;
    mine.cancel?.();
    idleClose = null;
  };
}

/**
 * 사용자가 처음 누를 때 소리를 열어 둔다. 누름 안에서 열어야 iOS가 막지 않는다.
 * 소리 짜기 모듈도 이때 받아 두어 첫 소리가 늦지 않게 한다
 */
function unlockOnFirstGesture(): void {
  if (typeof window === "undefined") return;
  const events = ["pointerdown", "keydown", "touchend"] as const;
  const unlock = () => {
    void loadRenderer().catch(() => undefined);
    const a = audio();
    if (!a) return;
    // 아주 짧은 빈 소리를 내야 iOS Safari가 열린 것으로 본다.
    const src = a.ctx.createBufferSource();
    src.buffer = a.ctx.createBuffer(1, 1, a.ctx.sampleRate);
    src.connect(a.ctx.destination);
    src.start();
    if (a.ctx.state === "running")
      for (const e of events) window.removeEventListener(e, unlock, true);
  };
  for (const e of events)
    window.addEventListener(e, unlock, { capture: true, passive: true });
}
unlockOnFirstGesture();

// 설정의 전체 음량을 따라간다(아직 소리를 낸 적이 없으면 첫 소리부터 적용된다)
onVolume((volume) => {
  if (audioState) audioState.master.gain.value = volume;
});

export function play(cue: Cue, options: PlayOptions = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + (options.delay ?? 0);
  if (renderer) {
    renderer.playOn(a, t0, cue, options);
    return;
  }
  void loadRenderer().then(
    (r) => {
      // 불러오는 사이 소리 상자를 닫았으면 내지 않는다
      if (audioState !== a) return;
      r.playOn(a, Math.max(t0, a.ctx.currentTime), cue, options);
    },
    () => undefined,
  );
}

/**
 * 음량 막대를 놓을 때 들려준다. 카드 내기(가장 작은 쪽)만 들려주면 게임 중 큰 장면 소리가
 * 5~6dB 더 크게 들려, 작은 쪽과 큰 쪽(프렌드 공개)을 이어서 들려준다
 */
export function previewVolume(): void {
  play("card");
  play("friend", { delay: 0.3 });
}

/**
 * 소리 하나를 재생하지 않고 그려 본다. 미리 듣기 화면에서 크기와 모양을 보는 데 쓴다.
 * 난수 씨앗을 고정해 같은 소리는 늘 똑같이 그려진다
 */
export async function renderCue(
  ...args: Parameters<RenderModule["renderCue"]>
): Promise<AudioBuffer> {
  return (await loadRenderer()).renderCue(...args);
}
