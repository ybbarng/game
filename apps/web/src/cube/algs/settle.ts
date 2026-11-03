// 입력이 멈춘 뒤 한 번만 검사한다. 칠 때마다 검사기를 돌리면 긴 공식에서 화면이 멈춘다.
import { type Clock, realClock } from "@game/fair-play";
import { useEffect, useMemo, useState } from "react";

/** 입력이 이만큼(ms) 멈추면 검사한다 */
export const CHECK_DELAY_MS = 250;

export interface Settler<T> {
  /** 새 값. ms 동안 다른 값이 오지 않으면 넘긴다 */
  push(value: T): void;
  /** 기다리지 않고 바로 넘긴다(단추로 바꾼 값 등) */
  now(value: T): void;
  cancel(): void;
}

/** 값이 ms 동안 바뀌지 않으면 onSettle로 넘긴다. 시간은 clock으로 잰다(시험은 ManualClock) */
export function createSettler<T>(
  clock: Clock,
  ms: number,
  onSettle: (value: T) => void,
): Settler<T> {
  let stop: (() => void) | null = null;
  const cancel = () => {
    stop?.();
    stop = null;
  };
  return {
    push(value) {
      cancel();
      stop = clock.after(ms, () => {
        stop = null;
        onSettle(value);
      });
    },
    now(value) {
      cancel();
      onSettle(value);
    },
    cancel,
  };
}

/** 멈춘 뒤의 값과 그 값을 바꾸는 Settler */
export function useSettled<T>(
  initial: T,
  clock: Clock = realClock,
  ms: number = CHECK_DELAY_MS,
): [T, Settler<T>] {
  const [settled, setSettled] = useState(initial);
  const settler = useMemo(
    () => createSettler<T>(clock, ms, setSettled),
    [clock, ms],
  );
  useEffect(() => () => settler.cancel(), [settler]);
  return [settled, settler];
}
