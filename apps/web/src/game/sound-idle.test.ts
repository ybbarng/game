import { ManualClock } from "@game/fair-play/clock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 소리 엔진 닫기(`closeAudioWhenIdle`, Cubie 큐브 미니의 메모리 줄이기, docs/52 2절). 소리를 합성하는 노드는
 * 무엇이든 받는 가짜로 두고, 소리 엔진을 열고 닫은 횟수만 본다
 */

/** 무엇을 부르거나 읽어도 다시 자기를 돌려주는 가짜 오디오 노드 */
function anyNode(): unknown {
  const f = () => undefined;
  return new Proxy(f, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : anyNode()),
    set: () => true,
    apply: () => anyNode(),
  });
}

let opened = 0;
let closed = 0;

class FakeAudioContext {
  state = "running";
  sampleRate = 0;
  currentTime = 0;
  constructor() {
    opened++;
    // biome-ignore lint/correctness/noConstructorReturn: 노드 만들기(createGain 등)를 모두 받는 가짜
    return new Proxy(this, {
      get: (t, key) => (key in t ? t[key as keyof typeof t] : anyNode()),
    });
  }
  close(): Promise<void> {
    closed++;
    this.state = "closed";
    return Promise.resolve();
  }
}

type SoundModule = typeof import("./sound");
let sound: SoundModule;

beforeEach(async () => {
  opened = 0;
  closed = 0;
  vi.stubGlobal("window", {
    AudioContext: FakeAudioContext,
    addEventListener: () => undefined,
  });
  vi.resetModules();
  sound = await import("./sound");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("closeAudioWhenIdle", () => {
  it("켜지 않으면 소리 엔진을 닫지 않는다(사이트의 다른 화면)", () => {
    sound.play("cubeTurn");
    expect(opened).toBe(1);
    sound.play("cubeTurn");
    expect(opened).toBe(1);
    expect(closed).toBe(0);
  });

  it("마지막 소리 뒤 정한 시간 동안 소리가 없으면 닫고, 다음 소리에 새로 연다", () => {
    const clock = new ManualClock();
    sound.closeAudioWhenIdle(clock, 20_000);
    sound.play("cubeTurn");
    clock.advance(15_000);
    // 그 사이 소리가 나면 기다림을 처음부터 다시 잰다
    sound.play("cubeTurn");
    clock.advance(15_000);
    expect(closed).toBe(0);
    clock.advance(5_000);
    expect(closed).toBe(1);
    sound.play("cubeTurn");
    expect(opened).toBe(2);
  });

  it("끄면 더 닫지 않는다", () => {
    const clock = new ManualClock();
    const stop = sound.closeAudioWhenIdle(clock, 20_000);
    sound.play("cubeTurn");
    stop();
    clock.advance(60_000);
    expect(closed).toBe(0);
  });

  it("켜기 전에 열린 소리 엔진도 그때부터 잰다", () => {
    sound.play("cubeTurn");
    const clock = new ManualClock();
    sound.closeAudioWhenIdle(clock, 20_000);
    clock.advance(20_000);
    expect(closed).toBe(1);
  });
});
