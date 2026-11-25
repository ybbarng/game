// 분해한 큐브의 속 3D(core-scene.ts)가 도는 각도 계산. three.js 없이 시험한다(core-spin.test.ts).
// 세로축으로 천천히 한 바퀴씩 돌고(2026-11-26 사용자 「회전을 더 시켜서 엣지 반대쪽도 보이게」), 끌어 돌리면 그 각도를
// 남겼다가 잠시 뒤 거기서 다시 돈다. 동작 줄이기면 멈춘다.

/** 한 바퀴 도는 시간(ms). 무엇이 보이는지 알아볼 만큼 천천히(docs/standing-rules.md 3절 연출) */
export const SPIN_PERIOD = 40_000;
/** 끌어 돌린 뒤 다시 저절로 돌 때까지(ms) */
export const RESUME_AFTER = 2_500;
/** 끌기 1px당 돌리는 각(라디안) */
export const DRAG_RATE = 0.012;
/** 한 장 사이가 이보다 길면(탭을 가렸다 돌아옴) 이만큼만 돈다(ms) */
const MAX_STEP = 100;
/**
 * 처음 각도이자 동작 줄이기의 멈춘 각도: 큐브를 왼쪽으로 150° 돌려 뒤-왼쪽 위에서 본다. 엣지 블럭의 흰 스티커와
 * 가운데로 뻗은 넓은 혀(양옆 홈까지), 코너 블럭의 흰 스티커와 기둥·발이 서로 가리지 않고 보인다
 */
export const REST_YAW = (150 * Math.PI) / 180;

export interface SpinState {
  yaw: number;
  /** 마지막으로 손을 뗀 때(ms). 이때부터 RESUME_AFTER 동안은 그 각도에 머문다 */
  releasedAt: number | null;
  dragging: boolean;
}

/** 지난 장에서 `dt`(ms) 뒤의 각도. 끄는 중·동작 줄이기·손 뗀 직후에는 그대로 */
export function nextYaw(
  s: SpinState,
  now: number,
  dt: number,
  reduced: boolean,
): number {
  if (s.dragging || reduced) return s.yaw;
  if (s.releasedAt !== null && now - s.releasedAt < RESUME_AFTER) return s.yaw;
  return s.yaw + (Math.min(dt, MAX_STEP) / SPIN_PERIOD) * Math.PI * 2;
}

/** 끌기: 누른 때 각도에서 가로로 민 만큼 */
export const dragYaw = (startYaw: number, dx: number) =>
  startYaw + dx * DRAG_RATE;
