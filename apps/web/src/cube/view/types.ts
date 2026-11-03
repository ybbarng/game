/**
 * 큐브 그리기·조작이 쓰는 공통 계약(docs/47 2-2).
 *
 * **엔진과 맞출 것**: `packages/cube-engine`이 같은 모양을 따로 만든다. 엔진이 들어오면 이 파일의 타입은
 * 엔진에서 가져오게 바꾸고, 뜻(좌표·층 번호·돌리는 방향·면 번호 차례)이 어긋나지 않는지 확인한다.
 *
 * - 좌표: 조각 중심은 큐브 가운데가 원점, 간격 1(n이 짝수면 ±0.5, ±1.5 …). +x = R, +y = U, +z = F(오른손 좌표계).
 * - 층 번호 1..n은 그 축의 **+ 끝에서부터** 센다.
 * - turns=1은 **+ 끝에서 가운데를 바라볼 때 시계 방향** 90°.
 *   R={x,1,1,1}, L={x,n,n,3}, U={y,1,1,1}, D={y,n,n,3}, F={z,1,1,1}, B={z,n,n,3}, x={x,1,n,1}.
 */

export type Axis = "x" | "y" | "z";

export interface CubeMove {
  axis: Axis;
  /** 층 범위(1..n, from ≤ to), + 끝에서부터 센다 */
  from: number;
  to: number;
  turns: 1 | 2 | 3;
}

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
}
