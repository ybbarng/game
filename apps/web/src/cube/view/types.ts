/**
 * 큐브 그리기·조작이 쓰는 공통 계약(docs/47 2-2).
 *
 * 수(`CubeMove`)는 엔진(`@game/cube-engine`)의 타입을 그대로 쓴다. 스티커 모양(`Sticker`)은 그리기 쪽 계약이고,
 * 엔진 상태에서 만드는 변환은 `cube/bridge.ts`에 있다. 두 쪽의 뜻이 같은지는 `bridge.test.ts`가 확인한다.
 *
 * - 좌표: 조각 중심은 큐브 가운데가 원점, 간격 1(n이 짝수면 ±0.5, ±1.5 …). +x = R, +y = U, +z = F(오른손 좌표계).
 * - 층 번호 1..n은 그 축의 **+ 끝에서부터** 센다.
 * - turns=1은 **+ 끝에서 가운데를 바라볼 때 시계 방향** 90°.
 *   R={x,1,1,1}, L={x,n,n,3}, U={y,1,1,1}, D={y,n,n,3}, F={z,1,1,1}, B={z,n,n,3}, x={x,1,n,1}.
 */

import type { CubeMove } from "@game/cube-engine";
import type { SwipeHit } from "./swipe";

export type { Axis, CubeMove } from "@game/cube-engine";

export type Normal = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

/**
 * 면 번호(색 번호). 스티커의 `color`는 이 번호다. 차례는 U R F D L B(코시엠바 차례).
 * 엔진과 맞출 것.
 */
export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type Face = (typeof FACES)[number];

/** 면마다 바깥을 향하는 방향 */
export const FACE_NORMAL: Record<Face, Normal> = {
  U: "+y",
  R: "+x",
  F: "+z",
  D: "-y",
  L: "-x",
  B: "-z",
};

/** 대회 표준 색(위 흰·앞 초록·오른쪽 빨강, 맞은편 노랑·파랑·주황). FACES 차례 */
export const DEFAULT_COLORS: readonly number[] = [
  0xffffff, // U 흰
  0xc8102e, // R 빨강
  0x009b48, // F 초록
  0xffd500, // D 노랑
  0xff5800, // L 주황
  0x0046ad, // B 파랑
];

/**
 * 스티커 하나. `center`는 **스티커가 붙은 조각의 중심**(위 좌표), `normal`은 스티커가 향하는 쪽.
 * `color`는 면 번호(FACES 차례, 0~5), `null`이면 가림(까맣게·회색).
 * 엔진과 맞출 것.
 */
export interface Sticker {
  center: readonly [number, number, number];
  normal: Normal;
  color: number | null;
}

/**
 * 그릴 수 있는 크기. 엔진 `packages/cube-engine`의 `MIN_SIZE`·`MAX_SIZE`와 같은 값이다.
 * 웹이 엔진을 잇는 단계에서 엔진의 상수를 가져오게 바꾼다.
 */
export const MIN_CUBE_SIZE = 2;
export const MAX_CUBE_SIZE = 7;

export type Quality = "high" | "medium" | "low";

export interface CubeViewOptions {
  /** 한 변의 조각 수(2~7) */
  n: number;
  /** 면 번호별 색(FACES 차례). 빠지면 DEFAULT_COLORS */
  colors?: readonly number[];
  quality?: Quality;
  /** 스티커 없는 모양(색 플라스틱 조각) */
  stickerless?: boolean;
  /** 한 수 회전 시간(ms, 0~200). 기본 90 */
  moveMs?: number;
  /** 회전 끝에 아주 살짝 넘쳤다 돌아오기. 기본 끔 */
  overshoot?: boolean;
  /** 가린 스티커 색. 기본 검정 */
  hidden?: "black" | "gray";
  /** 회전 하나가 끝날 때마다(줄을 빨리 넘긴 수 포함). 지금까지 끝낸 수를 준다 */
  onMoveDone?: (done: number) => void;
  /**
   * 밀어서 돌리기(휴대폰). 있으면 손가락·펜으로 칸 위를 밀 때 그 층의 수를, 빈 곳을 밀 때 큐브 전체 돌리기를 준다.
   * 장면은 스스로 돌리지 않는다(받은 쪽이 엔진에 넣고 받아들였으면 `enqueue`한다). 없으면 끌기는 보기만 돌린다
   */
  onSwipe?: (move: CubeMove) => void;
  /**
   * 누르기(손가락·마우스로 거의 움직이지 않고 뗌). 그 점 아래 칸(조각 중심과 칸이 향하는 쪽)을 준다.
   * 배우기의 「조각 찾기」가 쓴다. 빈 곳을 누르면 부르지 않는다
   */
  onTap?: (hit: SwipeHit) => void;
  /** 마우스로 끌어도 큐브 전체를 돌린다(키 배치 「사용자」의 마우스 돌리기). 기본 끔: 마우스 끌기는 보기만 */
  swipeMouse?: boolean;
}
