/**
 * 타이머 모드의 종목(docs/47 6절). 이름은 WCA 종목 번호(`333`, `333bf` 등)를 그대로 쓴다.
 * 섞기 패키지(`cube-scramble`)도 같은 번호로 받는다.
 */
export const TIMER_EVENTS = [
  "222",
  "333",
  "444",
  "555",
  "666",
  "777",
  "333bf",
] as const;

export type TimerEvent = (typeof TIMER_EVENTS)[number];

export interface EventInfo {
  /** 큐브 크기(n×n) */
  readonly size: number;
  /** 화면에 보일 이름 */
  readonly label: string;
  /** 블라인드: 살펴보기 없이 외우기·맞추기 시간을 나눠 잰다. 3×3 블라인드는 5번 중 최고(Bo5)로 순위를 정하고 5번 평균(Ao5)을 따로 본다(WCA 9b3) */
  readonly blind: boolean;
}

export const EVENT_INFO: Readonly<Record<TimerEvent, EventInfo>> = {
  "222": { size: 2, label: "2×2", blind: false },
  "333": { size: 3, label: "3×3", blind: false },
  "444": { size: 4, label: "4×4", blind: false },
  "555": { size: 5, label: "5×5", blind: false },
  "666": { size: 6, label: "6×6", blind: false },
  "777": { size: 7, label: "7×7", blind: false },
  "333bf": { size: 3, label: "3×3 블라인드", blind: true },
};

export function isTimerEvent(value: unknown): value is TimerEvent {
  return (
    typeof value === "string" &&
    (TIMER_EVENTS as readonly string[]).includes(value)
  );
}
