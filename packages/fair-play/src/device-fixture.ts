/** 멘탈 포커 기기 시험이 같이 쓰는 도우미. 시험이 오래 걸려 파일을 나눠 동시에 돌린다 */
declare function setTimeout(callback: () => void, ms: number): unknown;

import { deckFor, presetRules } from "@game/mighty-engine";

import { ManualClock } from "./clock";
import { FairDevice, type FairWire, prepareGroup } from "./device";

// 실제 방과 같은 타원곡선 군(r255)으로 시험한다.
await prepareGroup("r255");

/**
 * 기기 시험 덱: 마이티 덱 앞 8장. 섞기·가리기·열기·증명 규칙은 덱 크기와 상관없어 작게 본다
 * (53장 실제 판은 방 시험이 돌린다). 자리 0~3은 0번 기기(방장과 컴퓨터), 4·5는 1번, 6·7은 2번.
 */
export const TEST_DECK = deckFor(presetRules("standard5")).slice(0, 8);
export const TEST_OWNERS: ReadonlyMap<number, number> = new Map([
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 1],
  [5, 1],
  [6, 2],
  [7, 2],
]);

export interface TestNetwork {
  devices: FairDevice[];
  /** 제한 시간은 시험이 이 시계를 옮길 때만 지난다 */
  clock: ManualClock;
  /** 가는 중인 메시지가 없고 모든 기기가 할 일(섞기 증명 계산까지)을 마칠 때까지 기다린다 */
  settle(): Promise<void>;
}

/**
 * 할 일을 다 마치고, 걸린 기다림(미룬 섞기 증명, 증명 응답 기다리기 등)을 하나씩 그 시각에 지나게 한다.
 * 기다림 하나가 지날 때마다 기기가 할 일을 마칠 때까지 기다린다. 시계를 한 번에 크게 옮기면 미룬 증명이
 * 시작만 하고 계산이 끝나기 전에 그 뒤 기다림(응답 30초 등)까지 지나, 정직한 기기가 늦은 것처럼 된다
 * (실제 시간에서는 계산이 먼저 끝난다). 안전장치: 기다림이 끝없이 다시 걸리면 멈춘다
 */
export async function passWaits(net: {
  clock: ManualClock;
  settle(): Promise<void>;
}): Promise<void> {
  await net.settle();
  for (let i = 0; net.clock.advanceToNext(); i++) {
    if (i > 200) throw new Error("기다림이 끝나지 않는다");
    await net.settle();
  }
}

/** 기기들을 메모리로 잇는다(메시지는 비동기로, 보낸 기기 번호와 함께) */
export function network(
  ids: number[],
  options: {
    /** 보내지 않을 메시지(고친 프로그램이 일부러 빼먹는 것) */
    drop?: (message: FairWire, from: number) => boolean;
    /** 보내기 전에 바꿀 메시지(고친 프로그램이 증명 값을 꾸미는 것). 받는 기기 모두가 바꾼 것을 받는다 */
    rewrite?: (message: FairWire, from: number) => FairWire;
  } = {},
): TestNetwork {
  const clock = new ManualClock();
  const devices: FairDevice[] = [];
  let inFlight = 0;
  for (const id of ids)
    devices.push(
      new FairDevice({
        id,
        group: "r255",
        clock,
        send: (sent: FairWire) => {
          if (options.drop?.(sent, id)) return;
          const m = options.rewrite ? options.rewrite(sent, id) : sent;
          for (const d of devices)
            if (d.id !== id) {
              inFlight++;
              setTimeout(() => {
                inFlight--;
                d.receive(m, id);
              }, 0);
            }
        },
      }),
    );
  const settle = async () => {
    // 기기가 일을 마치며 새 메시지를 보낼 수 있어, 메시지와 일이 함께 비는 때까지 되풀이한다.
    // 여러 기기를 함께 기다리는 동안 먼저 빈 기기가 다시 메시지를 받아 일을 시작할 수 있어,
    // 다 기다린 뒤 모든 기기가 비었는지 다시 본다.
    for (;;) {
      await new Promise<void>((r) => setTimeout(() => r(), 0));
      await Promise.all(devices.map((d) => d.idle()));
      if (inFlight === 0 && devices.every((d) => !d.busy())) return;
    }
  };
  return { devices, clock, settle };
}
