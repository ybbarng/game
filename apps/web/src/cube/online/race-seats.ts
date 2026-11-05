/**
 * 대결 화면의 둘러앉은 자리(docs/47 9-9, 2026-11-05 사용자 제안). 내 큐브는 가운데, 상대는 테두리 자리에 하나씩.
 * 카드 게임의 자리 계산(`layout/compute-layout.ts`)은 손패·바닥을 둔 절대 좌표 무대이고 일곱 명까지라, 큐브는
 * 흐름 배치(위 줄·왼쪽 칸·오른쪽 칸)로 따로 나눈다. 순수 함수라 사람 수·화면 모양마다 시험한다.
 */

/**
 * 화면 모양.
 * - `wide`: 데스크톱. 위쪽과 양옆을 따라 앉는다
 * - `short`: 낮은 가로 화면(휴대폰 가로). 위 줄을 두면 큐브가 작아지므로 양옆에만 앉는다
 * - `narrow`: 좁은 세로 화면(휴대폰 세로). 위쪽 가장자리에 한 줄, 많으면 두 줄
 */
export type SeatMode = "wide" | "short" | "narrow";

export interface SeatPlan<T> {
  /** 왼쪽 칸(아래에서 위로가 아니라 위에서 아래로 그린다) */
  left: T[];
  /** 위 줄(왼쪽에서 오른쪽으로). `narrow`는 여기에 모두 둔다 */
  top: T[];
  /** 오른쪽 칸(위에서 아래로) */
  right: T[];
  /** 위 줄 한 줄에 놓을 칸 수 */
  topColumns: number;
}

/** 데스크톱에서 상대 수(1~7)마다 [왼쪽, 위, 오른쪽] 몇 자리. 위 줄은 큐브를 밀어 내리므로 셋까지만 */
const WIDE_SPLIT: Record<number, [number, number, number]> = {
  1: [0, 1, 0],
  2: [1, 0, 1],
  3: [1, 1, 1],
  4: [1, 2, 1],
  5: [2, 1, 2],
  6: [2, 2, 2],
  7: [2, 3, 2],
};

/** 화면 모양 고르기: 768px 아래는 좁은 화면, 그 위에서 높이가 560px 아래면 낮은 화면 */
export function seatModeOf(width: number, height: number): SeatMode {
  if (width < 768) return "narrow";
  if (height < 560) return "short";
  return "wide";
}

/**
 * 상대를 자리에 나눈다. `others`는 나 다음 차례부터(방의 참가자 차례). 둘러앉은 판처럼 시계 방향으로
 * 왼쪽 칸(아래 → 위) → 위 줄(왼쪽 → 오른쪽) → 오른쪽 칸(위 → 아래)에 앉힌다
 */
export function planSeats<T>(
  others: readonly T[],
  mode: SeatMode,
): SeatPlan<T> {
  const c = others.length;
  if (mode === "narrow")
    return {
      left: [],
      top: [...others],
      right: [],
      topColumns: c <= 4 ? Math.max(1, c) : Math.ceil(c / 2),
    };
  let split: [number, number, number];
  if (mode === "short") {
    const left = Math.floor(c / 2);
    split = [left, 0, c - left];
  } else
    split = WIDE_SPLIT[c] ?? [
      Math.ceil((c - 3) / 2),
      3,
      c - 3 - Math.ceil((c - 3) / 2),
    ];
  const [l, t] = split;
  // 왼쪽 칸은 시계 방향으로 아래에서 위로 앉으므로, 위에서 아래로 그릴 때는 뒤집는다
  const left = others.slice(0, l).reverse();
  const top = others.slice(l, l + t);
  const right = others.slice(l + t);
  return { left, top, right, topColumns: Math.max(1, t) };
}
