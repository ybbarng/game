/**
 * 3D 엠블럼 시안의 끌어 돌리기 계산(그리기와 떨어진 순수 함수, docs/47 14-7).
 *
 * - 좌우로 끌면 Y축(yaw)으로 돈다. 한 바퀴를 넘어 계속 돌 수 있다.
 * - 위아래로 끌면 아주 조금(`PITCH_MAX`까지)만 기운다. 엠블럼은 앞을 보는 물건이라 크게 뒤집히면 무엇인지 알아보기 어렵다.
 * - 손을 떼면 그 각도에 남는다(standing-rules 2-1). 놓을 때 빠르게 밀었으면 짧게(`COAST_MS` 안팎) 미끄러진다.
 *   동작 줄이기면 미끄러지지 않는다.
 * - 「처음 각도로」는 가까운 쪽으로 돌아 정면(yaw 0, pitch 0)에 선다.
 */

export interface Spin {
  /** 위에서 봐서 오른쪽으로 돈 각(라디안), 제한 없음 */
  yaw: number;
  /** 위쪽이 보는 사람 쪽으로 기운 각(라디안), ±PITCH_MAX */
  pitch: number;
}

export const FRONT: Spin = { yaw: 0, pitch: 0 };

/** 위아래 기울기 한도(10°) */
export const PITCH_MAX = (10 * Math.PI) / 180;
/** 엠블럼 칸 너비만큼 끌면 도는 각(약 200°) */
const YAW_PER_WIDTH = Math.PI * 1.1;
/** 위아래는 좌우의 1/4만 */
const PITCH_PER_WIDTH = YAW_PER_WIDTH / 4;
/** 미끄러짐이 줄어드는 시간 상수(ms) */
export const COAST_MS = 160;
/** 이보다 느리면(라디안/ms) 미끄러짐을 멈춘다 */
const COAST_STOP = 0.00004;
/** 놓을 때 빠르기를 잴 최근 구간(ms) */
const FLING_WINDOW = 90;
/** 미끄러짐 처음 빠르기 상한(라디안/ms, 1초에 약 2바퀴) */
const FLING_MAX = 0.012;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** 끌기 시작한 각에서 dx, dy(px)만큼 끈 각. width는 엠블럼 칸 너비(px) */
export function dragSpin(
  start: Spin,
  dx: number,
  dy: number,
  width: number,
): Spin {
  const w = Math.max(1, width);
  return {
    yaw: start.yaw + (dx / w) * YAW_PER_WIDTH,
    pitch: clamp(
      start.pitch + (dy / w) * PITCH_PER_WIDTH,
      -PITCH_MAX,
      PITCH_MAX,
    ),
  };
}

/** 끄는 동안 남긴 (시각 ms, yaw) 가운데 마지막 FLING_WINDOW 안의 평균 빠르기(라디안/ms) */
export function flingSpeed(
  samples: readonly { t: number; yaw: number }[],
): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    if (!s || last.t - s.t > FLING_WINDOW) break;
    first = s;
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return clamp((last.yaw - first.yaw) / dt, -FLING_MAX, FLING_MAX);
}

/** 미끄러짐 dt(ms) 뒤의 yaw와 빠르기. 빠르기가 멈출 만큼 줄면 0 */
export function coast(
  yaw: number,
  speed: number,
  dt: number,
): { yaw: number; speed: number } {
  // 빠르기가 exp(-t/τ)로 줄 때 dt 동안 간 거리 = v·τ·(1 - exp(-dt/τ))
  const k = Math.exp(-dt / COAST_MS);
  const next = speed * k;
  return {
    yaw: yaw + speed * COAST_MS * (1 - k),
    speed: Math.abs(next) < COAST_STOP ? 0 : next,
  };
}

/** yaw를 (-π, π] 안으로 */
export function wrapYaw(yaw: number): number {
  const t = (((yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return t === 0 ? Math.PI : t - Math.PI;
}

/** 정면에서 벗어나 있는지(「처음 각도로」 단추를 보일지) */
export function isTurned(s: Spin): boolean {
  return Math.abs(wrapYaw(s.yaw)) > 1e-3 || Math.abs(s.pitch) > 1e-3;
}

/** 「처음 각도로」 걸리는 시간(ms) */
export const HOME_MS = 420;

/** 처음 각도로 돌아가는 중 t(0~1)의 각. 가까운 쪽으로 돈다 */
export function homeSpin(from: Spin, t: number): Spin {
  const u = clamp(t, 0, 1);
  const e = 1 - (1 - u) ** 3;
  const y = wrapYaw(from.yaw);
  return { yaw: y * (1 - e), pitch: from.pitch * (1 - e) };
}
