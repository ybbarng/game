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

/**
 * 진열 흔들기(티어 화면, docs/47 14-7 「진열」, 2026-11-13 사용자 「3D들은 자동으로 빙글빙글 돌거나, 좌우로 움직여도
 * 좋을 것 같아」). 엠블럼은 앞을 보는 물건이라 한 바퀴 돌리지 않고 정면 둘레를 좌우로 천천히 흔든다. 각이 바뀌는 동안
 * 반짝임이 면을 따라 지나간다.
 *
 * - `SWAY_AMP` 좌우 폭(라디안), `SWAY_PERIOD` 한 번 왕복(ms). 반짝임이 지나가는 게 보일 만큼 여유 있게.
 * - 처음 시작하거나 끌기를 놓은 뒤 다시 흔들 때는 `SWAY_EASE` 동안 빠르기를 0에서 천천히 올린다(갑자기 움직이지 않게).
 * - 놓은 각이 흔들 폭 밖이면 그 차이를 `SWAY_EASE`의 시간 상수로 줄여 가까운 정면 쪽으로 돌아온다.
 */
export const SWAY_AMP = 0.5;
export const SWAY_PERIOD = 9000;
export const SWAY_EASE = 1500;
/** 끌기를 놓고(미끄러짐이 끝나고) 이만큼(ms) 그 각에 머문 뒤 다시 흔든다 */
export const SWAY_RESUME_MS = 1600;

export interface Sway {
  /** 흔드는 가운데(정면 = 2π의 배수) */
  center: number;
  /** 흔들기 시계(ms, 빠르기를 올리는 동안은 느리게 간다) */
  t: number;
  /** 다시 흔든 뒤 흐른 실제 시간(ms) */
  since: number;
  /** 흔들 폭 밖에서 시작한 몫(라디안), 시간이 갈수록 준다 */
  offset: number;
}

/** 지금 각 `yaw`에서 흔들기를 다시 시작한다: 가까운 정면을 가운데로, 그 각이 폭 안이면 같은 자리 위상에서 */
export function swayFrom(yaw: number): Sway {
  const turn = Math.PI * 2;
  const center = Math.round(yaw / turn) * turn;
  const v = Math.max(-1, Math.min(1, (yaw - center) / SWAY_AMP));
  const t = (Math.asin(v) / turn) * SWAY_PERIOD;
  return { center, t, since: 0, offset: yaw - center - SWAY_AMP * v };
}

/** 흔들기를 `dt`(ms) 나아가게 한다 */
export function swayStep(s: Sway, dt: number): Sway {
  const ramp = Math.min(1, s.since / SWAY_EASE);
  // 빠르기를 매끈하게(smoothstep) 올린다
  const rate = ramp * ramp * (3 - 2 * ramp);
  return {
    center: s.center,
    t: s.t + dt * rate,
    since: s.since + dt,
    offset: s.offset * Math.exp(-dt / SWAY_EASE),
  };
}

/** 흔들기의 지금 각 */
export function swayYaw(s: Sway): number {
  return (
    s.center + SWAY_AMP * Math.sin((Math.PI * 2 * s.t) / SWAY_PERIOD) + s.offset
  );
}
