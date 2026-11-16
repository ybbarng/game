import type { Gesture, NakReason, Sticks } from "@game/yut-engine";

/**
 * 윷가락 던지기 궤적(docs/37 14절). three.js 없이 도는 순수 계산이라 단위 시험으로 본다.
 *
 * - **결과가 궤적을 정하지 않는다. 궤적을 결과에 맞춰 고른다.** 결과(가락 넷의 앞뒷면, 낙)는 엔진이 몸짓 봉인과
 *   모두의 고리로 이미 정했다(13-2). 여기서는 가락 하나가 멍석에 닿은 뒤 튀고 구르다 멈추는 「멈춤 궤적」을
 *   씨앗마다 작은 물리 흉내로 미리 만들어, 배가 위로 멈춘 것과 등이 위로 멈춘 것으로 나눠 둔다(`library`).
 *   던지기마다 가락의 정해진 면에 맞는 궤적을 그 모음에서 고른다.
 * - 고르기와 날아가는 길은 던지기 번호·몸짓 값·가락 번호로만 정한다(`planToss`). 다른 사람이 던져도 각 기기가
 *   그 사람 몸짓 값으로 같은 궤적을 다시 만든다.
 * - 모음은 고정한 씨앗(1부터)으로 처음 쓸 때 한 번 만든다. 기기마다 삼각함수 끝자리가 달라도 면이 바뀌지 않게,
 *   시작 값을 아주 조금 흔들어도 같은 면으로 멈추는 씨앗만 넣는다(`robustFace`).
 *
 * 좌표: 멍석 가운데가 원점, 멍석 반지름 1, y가 위. 가락은 길이 방향이 제 x축, 배(평평한 면)가 제 +y.
 * `roll`은 길이 축으로 돈 각(0이면 배가 위, π면 등이 위), `yaw`는 위에서 본 방향, `pitch`는 공중에서 재주넘는 각.
 */

/** 멍석 반지름 */
export const MAT_RADIUS = 1;
/** 가락 길이 */
export const STICK_LENGTH = 0.42;
/** 가락 반원 반지름(배에서 등 끝까지) */
export const STICK_RADIUS = 0.045;

/** 반원 단면의 무게중심이 원 중심(배 가운데)에서 등 쪽으로 떨어진 거리 */
const COM = (4 * STICK_RADIUS) / (3 * Math.PI);
/** 단면 관성 반지름의 제곱(반원기둥을 원기둥으로 어림) */
const K2 = (STICK_RADIUS * STICK_RADIUS) / 2;
/** 화면에서 알아보기 좋은 빠르기로 줄인 중력 */
const GRAVITY = 6;
/** 물리 흉내 한 걸음(초). 걸음 수는 정수라 기기마다 같은 순서로 돈다 */
const DT = 1 / 240;
/** 기록은 두 걸음에 한 번(120장/초) */
const RECORD_EVERY = 2;
/** 기록 한 장의 값 수: x, y, z, roll, yaw */
const STRIDE = 5;
/** 멈춤 궤적이 이보다 길면 버린다(초) */
const MAX_SETTLE = 5;

/** 결정적 난수(mulberry32). 정수 곱셈만 써서 기기마다 같다 */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 글 해시(FNV-1a 32비트) */
export function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 각을 (-π, π]로 */
function wrap(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** 단면에서 원 중심(배 가운데)부터 가장 낮은 점까지 높이: 등이 아래면 반지름, 배가 아래면 모서리까지 */
function support(roll: number): number {
  const a = wrap(roll);
  return Math.abs(a) <= Math.PI / 2
    ? STICK_RADIUS
    : STICK_RADIUS * Math.abs(Math.sin(a));
}

/** 바닥에 닿아 있을 때 무게중심 높이(위치 에너지 ÷ mg) */
function potential(roll: number): number {
  return support(roll) - COM * Math.cos(roll);
}

/** 닿은 점의 옆(단면 가로) 자리, 원 중심 기준 */
function contactLateral(roll: number): number {
  const a = wrap(roll);
  if (Math.abs(a) <= Math.PI / 2) return 0;
  // 배가 아래로 기울면 배 모서리가 닿는다(어느 모서리인지는 기운 쪽)
  return a > 0 ? STICK_RADIUS * Math.cos(a) : -STICK_RADIUS * Math.cos(a);
}

/** 멍석에 닿은 순간 하나(시각 초, 세기 0~1) */
export interface Impact {
  t: number;
  strength: number;
}

/** 멍석에 닿은 뒤 멈출 때까지의 궤적 하나(가락 하나) */
export interface Settle {
  seed: number;
  /** 멈췄을 때 배가 위인가 */
  flat: boolean;
  /** 멈출 때까지 걸린 시간(초) */
  duration: number;
  /** 닿을 때의 길이 축 각·각속도와 아래로 떨어지는 빠르기(날아오는 길이 여기에 이어 붙는다) */
  start: { roll: number; rollRate: number; fall: number };
  /** 기록: 장마다 x, y, z, roll, yaw (제 처음 자리·방향 기준) */
  frames: Float32Array;
  impacts: Impact[];
}

interface Start {
  roll: number;
  rollRate: number;
  fall: number;
  lateral: number;
  along: number;
  yawRate: number;
}

/** 이 번호부터의 씨앗은 「조금 더 구르는」 시작 값(더 세게 돌며 닿는다) */
export const LONG_SEED = 100_000;

function startOf(seed: number): Start {
  const r = rng(seed * 7919 + 17);
  const sign = () => (r() < 0.5 ? -1 : 1);
  const long = seed >= LONG_SEED;
  return {
    roll: r() * Math.PI * 2,
    rollRate: sign() * (long ? 34 + r() * 14 : 10 + r() * 18),
    fall: 1.2 + r() * 1.0,
    lateral: (r() - 0.5) * (long ? 1.2 : 0.6),
    along: 0.15 + r() * 0.45,
    yawRate: sign() * (0.5 + r() * 2.5),
  };
}

/**
 * 작은 물리 흉내: 단면(길이 축으로 돌기)은 튀기·마찰·굴러 흔들리기를, 길이 방향 미끄러짐과 위에서 본 돌기는
 * 마찰로 줄어들게 셈한다. 가락끼리 부딪는 것은 넣지 않는다(멈출 자리를 떨어뜨려 둔다). 멈추지 않으면 null
 */
function simulate(
  s: Start,
  record: boolean,
): {
  flat: boolean;
  steps: number;
  frames: number[];
  impacts: Impact[];
} | null {
  let x = 0;
  let z = 0;
  let y = support(s.roll) + 0.002;
  let vy = -s.fall;
  let roll = s.roll;
  let w = s.rollRate;
  let vLat = s.lateral;
  let vAlong = s.along;
  let yaw = 0;
  let wYaw = s.yawRate;
  let grounded = false;
  let still = 0;
  const frames: number[] = [];
  const impacts: Impact[] = [];
  const maxSteps = Math.round(MAX_SETTLE / DT);
  for (let step = 0; step <= maxSteps; step++) {
    if (record && step % RECORD_EVERY === 0) frames.push(x, y, z, roll, yaw);
    if (!grounded) {
      vy -= GRAVITY * DT;
      y += vy * DT;
      roll += w * DT;
      if (y <= support(roll) && vy < 0) {
        y = support(roll);
        const speed = -vy;
        // 닿은 점(무게중심 기준): 세로 힘은 길이 축 돌기를 바꾸고, 마찰은 미끄러짐을 줄인다
        const cy = -support(roll) + COM * Math.cos(roll);
        const cz = contactLateral(roll) + COM * Math.sin(roll);
        const impulse = speed * 1.3;
        vy = speed * 0.3;
        w += (-cz * impulse) / K2;
        const slip = vLat + w * cy;
        const need = -slip / (1 + (cy * cy) / K2);
        const limit = 0.5 * impulse;
        const jt = Math.max(-limit, Math.min(limit, need));
        vLat += jt;
        w += (cy * jt) / K2;
        // 너무 빨리 돌면 줄인다(멍석 짚이 받아 준다)
        w *= 0.82;
        if (speed > 0.15) impacts.push({ t: step * DT, strength: speed });
        if (vy < 0.25) {
          grounded = true;
          vy = 0;
        }
      }
    } else {
      const e = 1e-4;
      const slope = (potential(roll + e) - potential(roll - e)) / (2 * e);
      const a = wrap(roll);
      const onBack = Math.abs(a) <= Math.PI / 2;
      const damping = onBack ? 6 : 14;
      const acc =
        (-GRAVITY * slope) / (K2 + STICK_RADIUS * STICK_RADIUS) - damping * w;
      w += acc * DT;
      roll += w * DT;
      // 배가 바닥에 거의 다 닿고 느려지면 「탁」 하고 붙는다(납작한 면은 흔들리지 않는다)
      const flatGap = Math.PI - Math.abs(wrap(roll));
      if (flatGap < 0.05 && Math.abs(w) < 1.5) {
        roll += wrap(roll) > 0 ? flatGap : -flatGap;
        w = 0;
      }
      y = support(roll);
      // 등으로 구르면 옆으로 굴러가고, 배로 누우면 제자리에 멈춘다
      vLat = onBack ? w * STICK_RADIUS : vLat * (1 - 8 * DT);
    }
    // 바닥에서는 길이 방향 미끄러짐과 위에서 본 돌기가 마찰로 준다
    if (grounded) {
      const fr = 0.45 * GRAVITY * DT;
      vAlong = Math.abs(vAlong) <= fr ? 0 : vAlong - Math.sign(vAlong) * fr;
      wYaw *= 1 - 5 * DT;
      if (Math.abs(wYaw) < 0.02) wYaw = 0;
    }
    yaw += wYaw * DT;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    // 제 x축(길이) = (cos yaw, 0, -sin yaw), 제 z축(단면 가로) = (sin yaw, 0, cos yaw)
    x += (vAlong * c + vLat * sn) * DT;
    z += (-vAlong * sn + vLat * c) * DT;
    if (grounded) {
      const a = wrap(roll);
      const near = Math.min(Math.abs(a), Math.PI - Math.abs(a));
      const calm =
        Math.abs(w) < 0.15 &&
        Math.abs(vLat) < 0.01 &&
        vAlong === 0 &&
        wYaw === 0 &&
        near < 0.05;
      still = calm ? still + 1 : 0;
      if (still >= 12) {
        const flat = Math.abs(a) < Math.PI / 2;
        if (record) {
          // 마지막 장은 멈춘 각에 꼭 맞춘다(차이는 0.03 rad 안쪽이라 보이지 않는다)
          const rest = roll - a + (flat ? 0 : a > 0 ? Math.PI : -Math.PI);
          frames.push(x, support(rest), z, rest, yaw);
        }
        return { flat, steps: step, frames, impacts };
      }
    }
  }
  return null;
}

/** 시작 값을 아주 조금 흔들어도 같은 면으로 멈추면 그 면, 아니면 null(기기마다 끝자리가 달라도 면이 같게) */
export function robustFace(seed: number): boolean | null {
  const s = startOf(seed);
  const base = simulate(s, false);
  if (!base) return null;
  for (const d of [1e-6, -1e-6]) {
    const a = simulate({ ...s, roll: s.roll + d }, false);
    const b = simulate(
      { ...s, fall: s.fall + d, rollRate: s.rollRate - d },
      false,
    );
    if (a?.flat !== base.flat || b?.flat !== base.flat) return null;
  }
  return base.flat;
}

/** 씨앗 하나의 멈춤 궤적(멈추지 않으면 null) */
export function settleOf(seed: number): Settle | null {
  const s = startOf(seed);
  const run = simulate(s, true);
  if (!run) return null;
  return {
    seed,
    flat: run.flat,
    duration: run.steps * DT,
    start: { roll: s.roll, rollRate: s.rollRate, fall: s.fall },
    frames: Float32Array.from(run.frames),
    impacts: run.impacts,
  };
}

/** 면마다 보통 궤적과 조금 더 구르는 궤적 */
export interface Library {
  flat: { normal: Settle[]; long: Settle[] };
  round: { normal: Settle[]; long: Settle[] };
}

/** 면·종류마다 모아 둘 궤적 수 */
export const LIBRARY_SIZE = { normal: 8, long: 4 } as const;
/** 보통 궤적의 멈춤 시간 범위(초) */
const NORMAL_RANGE = [0.45, 1.45] as const;
/** 조금 더 구르는 궤적: 이 범위로 오래 구른다(초) */
const LONG_RANGE = [1.55, 3] as const;

/** 면·종류마다 고른 씨앗 번호 */
export type LibrarySeeds = {
  [F in "flat" | "round"]: { normal: number[]; long: number[] };
};

/**
 * 고정한 씨앗(보통은 1부터, 조금 더 구르는 것은 `LONG_SEED`부터)을 차례로 흉내 내어, 멈춤 시간이 범위 안이고 흔들어도
 * 면이 같은 것을 면·종류마다 정한 수만큼 고른다. 시간이 들어(맥북 약 0.25초) 화면에서는 부르지 않는다:
 * 결과를 `LIBRARY_SEEDS`에 적어 두고, 시험이 이 함수로 다시 찾아 같은지 본다
 */
export function findLibrarySeeds(): LibrarySeeds {
  const out: LibrarySeeds = {
    flat: { normal: [], long: [] },
    round: { normal: [], long: [] },
  };
  const fill = (kind: "normal" | "long", from: number) => {
    const [low, high] = kind === "normal" ? NORMAL_RANGE : LONG_RANGE;
    const enough = () =>
      out.flat[kind].length >= LIBRARY_SIZE[kind] &&
      out.round[kind].length >= LIBRARY_SIZE[kind];
    for (let seed = from; seed < from + 5000 && !enough(); seed++) {
      const settle = settleOf(seed);
      if (!settle || settle.duration < low || settle.duration > high) continue;
      const box = settle.flat ? out.flat : out.round;
      if (box[kind].length >= LIBRARY_SIZE[kind]) continue;
      if (robustFace(seed) !== settle.flat) continue;
      box[kind].push(seed);
    }
    if (!enough()) throw new Error("윷가락 궤적 모음을 채우지 못했다");
  };
  fill("normal", 1);
  fill("long", LONG_SEED);
  return out;
}

/** 미리 고른 씨앗(`findLibrarySeeds`의 결과, 시험이 같은지 본다) */
export const LIBRARY_SEEDS: LibrarySeeds = {
  flat: {
    normal: [1, 2, 5, 8, 10, 11, 14, 33],
    long: [100000, 100011, 100012, 100017],
  },
  round: {
    normal: [3, 4, 6, 9, 12, 15, 18, 19],
    long: [100016, 100184, 100323, 100611],
  },
};

let built: Library | null = null;

/** 미리 고른 씨앗으로 만든 궤적 모음(가락 스물넷을 흉내 낸다, 처음 부를 때 한 번) */
export function library(): Library {
  if (built) return built;
  const make = (seeds: readonly number[]) =>
    seeds.map((seed) => settleOf(seed) as Settle);
  built = {
    flat: {
      normal: make(LIBRARY_SEEDS.flat.normal),
      long: make(LIBRARY_SEEDS.flat.long),
    },
    round: {
      normal: make(LIBRARY_SEEDS.round.normal),
      long: make(LIBRARY_SEEDS.round.long),
    },
  };
  return built;
}

/** 기록에서 t초의 값(앞뒤 장 사이를 잇는다) */
function sample(
  settle: Settle,
  t: number,
): [number, number, number, number, number] {
  const f = settle.frames;
  const count = f.length / STRIDE;
  const pos = Math.max(0, t / (DT * RECORD_EVERY));
  const i = Math.min(count - 1, Math.floor(pos));
  const j = Math.min(count - 1, i + 1);
  const k = Math.min(1, pos - i);
  const v = (n: number) =>
    (f[i * STRIDE + n] as number) * (1 - k) + (f[j * STRIDE + n] as number) * k;
  return [v(0), v(1), v(2), v(3), v(4)];
}

/** 마지막 장 */
function restOf(settle: Settle): [number, number, number, number, number] {
  const f = settle.frames;
  const o = f.length - STRIDE;
  return [
    f[o] as number,
    f[o + 1] as number,
    f[o + 2] as number,
    f[o + 3] as number,
    f[o + 4] as number,
  ];
}

/**
 * 자리 방향(멍석 둘레, 라디안, 위에서 본 x-z 평면): 나는 언제나 화면 앞쪽(+z), 다른 사람은 내 다음 자리부터
 * 반시계로 둘레에 고르게 앉는다. `offset`은 (자리 − 내 자리) mod 인원
 */
export function seatAngle(offset: number, players: number): number {
  const n = Math.max(2, players);
  // 나: π/2 (+z). 다음 자리부터 반시계(화면에서 오른쪽 → 위 → 왼쪽)
  return Math.PI / 2 - ((((offset % n) + n) % n) * Math.PI * 2) / n;
}

/** 자리 방향의 둘레 점(x, z) */
export function seatPoint(angle: number, radius: number): [number, number] {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/** 가락 하나의 계획 */
export interface StickPlan {
  /** 던진 뒤 손을 떠나기까지(초) */
  delay: number;
  /** 날아가는 시간(초) */
  flight: number;
  /** 손을 떠난 자리 */
  launch: [number, number, number];
  /** 멍석에 처음 닿는 자리(x, z) */
  land: [number, number];
  /** 멈춤 궤적과 그것을 놓은 방향 */
  settle: Settle;
  heading: number;
  /** 공중에서 가장 높이 오르는 높이 */
  apex: number;
  /** 재주넘기 바퀴 수 */
  turns: number;
  /** 멍석 밖으로 나가 멈추는가(낙) */
  out: boolean;
  /** 멈추는 시각(던진 때부터, 초) */
  stop: number;
}

export interface TossPlan {
  sticks: StickPlan[];
  /** 모든 가락이 멈추는 시각(초) */
  duration: number;
  /** 멍석에 닿는 순간들(시각 순서) */
  impacts: { t: number; stick: number; strength: number }[];
  /** 멈춘 가락끼리 겹치지 않고 멍석 안팎에 알맞게 놓였다(시험이 본다) */
  fits: boolean;
}

export interface TossInput {
  /** 던지기 번호(엔진 `lastThrow.index`) */
  index: number;
  gesture: Gesture;
  sticks: Sticks;
  nak: NakReason | null;
  /** 던진 사람 자리 방향(`seatAngle`) */
  angle: number;
}

/** 가락이 하나씩 멈추는 간격(초): 무엇이 나왔는지 하나씩 알아볼 만큼 */
export const STOP_GAP = 0.32;
/** 마지막 가락은 이만큼 더 늦게 멈춘다(조금 더 구른다) */
export const LAST_GAP = 0.5;

/** 가락이 놓인 선분 두 끝(x, z) */
function segment(
  cx: number,
  cz: number,
  yaw: number,
): [number, number, number, number] {
  const hx = Math.cos(yaw) * (STICK_LENGTH / 2);
  const hz = -Math.sin(yaw) * (STICK_LENGTH / 2);
  return [cx - hx, cz - hz, cx + hx, cz + hz];
}

function pointSegment(
  px: number,
  pz: number,
  s: [number, number, number, number],
): number {
  const [ax, az, bx, bz] = s;
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const k =
    len === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len));
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}

/** 두 선분 사이 가장 가까운 거리(교차하지 않는다고 보고 끝점으로 잰다, 교차하면 0) */
function segmentGap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const cross = (
    o: [number, number],
    p: [number, number],
    q: [number, number],
  ) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const a1: [number, number] = [a[0], a[1]];
  const a2: [number, number] = [a[2], a[3]];
  const b1: [number, number] = [b[0], b[1]];
  const b2: [number, number] = [b[2], b[3]];
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(
    pointSegment(b[0], b[1], a),
    pointSegment(b[2], b[3], a),
    pointSegment(a[0], a[1], b),
    pointSegment(a[2], a[3], b),
  );
}

/** 멈춘 가락의 선분(x, z 두 끝) */
export function restSegment(
  stick: StickPlan,
): [number, number, number, number] {
  const [rx, , rz, , ryaw] = restOf(stick.settle);
  const c = Math.cos(stick.heading);
  const s = Math.sin(stick.heading);
  const wx = stick.land[0] + rx * c + rz * s;
  const wz = stick.land[1] - rx * s + rz * c;
  return segment(wx, wz, stick.heading + ryaw);
}

/** 원점에서 선분까지 가장 가까운 거리와 가장 먼 거리 */
export function radialExtent(seg: [number, number, number, number]): {
  near: number;
  far: number;
} {
  return {
    near: pointSegment(0, 0, seg),
    far: Math.max(Math.hypot(seg[0], seg[1]), Math.hypot(seg[2], seg[3])),
  };
}

/** 낙이면 멍석 밖으로 나갈 가락들: 쓸어 던지면 넷 모두, 아니면 하나나 둘 */
function outSticks(nak: NakReason | null, h: number): boolean[] {
  if (nak === null || nak === "unopened") return [false, false, false, false];
  if (nak === "sweep") return [true, true, true, true];
  const first = h % 4;
  const out = [false, false, false, false];
  out[first] = true;
  if ((h >>> 3) % 3 === 0) out[(first + 1 + ((h >>> 5) % 3)) % 4] = true;
  return out;
}

/**
 * 던지기 하나의 궤적 계획. 같은 입력이면 어느 기기에서나 같은 계획이 나온다. 가락마다 정해진 면(`sticks`)으로
 * 멈추는 궤적을 고르고, 낙이면 한두 가락(쓸어 던지면 넷)이 멍석 밖에서 멈춘다. 무효(`unopened`)는 그리지 않는다
 */
export function planToss(input: TossInput): TossPlan {
  const lib = library();
  const g = input.gesture;
  const key = `${input.index}|${g.height},${g.direction},${g.strength}`;
  const h = hashText(key);
  const r = rng(h);
  const out = outSticks(input.nak, hashText(`${key}|out`));
  // 하나가 조금 더 구른다: 멍석 안에 남는 가락 가운데 하나(모두 나가면 아무거나)
  const inside = [0, 1, 2, 3].filter((k) => !out[k]);
  const pool = inside.length > 0 ? inside : [0, 1, 2, 3];
  const longStick = pool[h % pool.length] as number;
  // 나머지 셋이 멈출 차례(0 먼저)
  const rest = [0, 1, 2, 3].filter((k) => k !== longStick);
  const rankOf: number[] = [];
  const shift = (h >>> 4) % 3;
  for (const [i, k] of rest.entries()) rankOf[k] = (i + shift) % 3;

  // 던지는 쪽(자리에서 가운데로)과 그 옆
  const ax = -Math.cos(input.angle);
  const az = -Math.sin(input.angle);
  const px = -az;
  const pz = ax;
  const side = g.direction / 90;
  // 겨눈 자리: 옆으로 튕긴 만큼 옆으로, 세게 던지면 조금 더 멀리
  const aimAlong = ((g.strength - 45) / 100) * 0.3;
  const aimSide = side * 0.45;
  const aimX = ax * aimAlong + px * aimSide;
  const aimZ = az * aimAlong + pz * aimSide;
  // 몸짓 높이: 높을수록 오래 난다
  const apex = 0.55 + (g.height / 100) * 1.25;
  const baseFlight =
    (0.62 + Math.sqrt(g.height / 100) * 0.55) *
    (1.12 - (g.strength / 100) * 0.25);
  // 손을 떠나는 자리: 그 사람 쪽 멍석 가장자리 바로 바깥(화면 안에 들어오게)
  const [lx, lz] = seatPoint(input.angle, 1.28);

  const sticks: StickPlan[] = [];
  let tries = 0;
  let fits = false;
  for (;;) {
    sticks.length = 0;
    const spin = r() * Math.PI * 2;
    // 멈출 자리 넷: 겨눈 자리 둘레에 서로 떨어뜨려 놓는다
    for (let k = 0; k < 4; k++) {
      const face = input.sticks[k] ? lib.flat : lib.round;
      const pick = hashText(`${key}|${k}|${tries}`);
      let settle: Settle;
      if (k === longStick)
        settle = face.long[pick % face.long.length] as Settle;
      else {
        // 멈추는 차례(rank)가 앞인 가락일수록 짧게 구르는 궤적에서 고른다(늦게 손을 떠나지 않아도 하나씩 멈추게)
        const rank = rankOf[k] as number;
        const sorted = [...face.normal].sort((a, b) => a.duration - b.duration);
        const third = Math.max(1, Math.floor(sorted.length / 3));
        settle = sorted[
          Math.min(sorted.length - 1, rank * third + (pick % third))
        ] as Settle;
      }
      let restX: number;
      let restZ: number;
      if (out[k]) {
        // 멍석 밖: 쓸어 던지면 튕긴 쪽 옆으로, 아니면 멀리 건너편 양옆으로
        const away = Math.atan2(az, ax);
        // 쓸어 던지면 넷이 튕긴 쪽 옆에 부채꼴로 흩어진다
        const toward =
          input.nak === "sweep"
            ? away +
              (side >= 0 ? -1 : 1) * (Math.PI / 2) * 0.95 +
              (k - 1.5) * 0.4 +
              (r() - 0.5) * 0.12
            : away + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7);
        const radius = 1.27 + (k % 2) * 0.06 + r() * 0.03;
        restX = Math.cos(toward) * radius;
        restZ = Math.sin(toward) * radius;
      } else {
        const a = spin + (k * Math.PI) / 2 + (r() - 0.5) * 0.5;
        const d = 0.24 + r() * 0.12;
        restX = aimX + Math.cos(a) * d;
        restZ = aimZ + Math.sin(a) * d;
        // 멍석 안쪽에 넉넉히
        const reach = Math.hypot(restX, restZ);
        if (reach > 0.62) {
          restX *= 0.62 / reach;
          restZ *= 0.62 / reach;
        }
      }
      const [rx, , rz] = restOf(settle);
      // 멈춤 궤적을 놓는 방향: 날아가는 쪽에서 조금 비튼다
      const heading = Math.atan2(-(restZ - lz), restX - lx) + (r() - 0.5) * 1.6;
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      const landX = restX - (rx * c + rz * s);
      const landZ = restZ - (-rx * s + rz * c);
      const flight = baseFlight * (0.94 + r() * 0.12);
      sticks.push({
        delay: k * 0.05 + r() * 0.03,
        flight,
        launch: [lx + px * (k - 1.5) * 0.05, 0.35, lz + pz * (k - 1.5) * 0.05],
        land: [landX, landZ],
        settle,
        heading,
        apex: apex * (0.92 + r() * 0.16),
        turns: g.strength > 55 ? 1 : 0,
        out: out[k] as boolean,
        stop: 0,
      });
    }
    // 멈춘 가락끼리 겹치지 않고, 안에 남는 가락은 멍석 안, 나간 가락은 멍석 밖에 온전히
    const segs = sticks.map(restSegment);
    let ok = true;
    for (let i = 0; i < 4 && ok; i++) {
      const e = radialExtent(segs[i] as [number, number, number, number]);
      if (
        sticks[i]?.out ? e.near < MAT_RADIUS + 0.04 : e.far > MAT_RADIUS - 0.06
      )
        ok = false;
      for (let j = i + 1; j < 4 && ok; j++)
        if (
          segmentGap(
            segs[i] as [number, number, number, number],
            segs[j] as [number, number, number, number],
          ) <
          STICK_RADIUS * 2 + 0.02
        )
          ok = false;
    }
    tries++;
    fits = ok;
    if (ok || tries > 60) break;
  }

  // 하나씩 멈추게: 멈추는 차례대로 간격을 벌리고, 조금 더 구르는 가락은 맨 뒤
  for (const s of sticks) s.stop = s.delay + s.flight + s.settle.duration;
  const order = [0, 1, 2, 3]
    .filter((k) => k !== longStick)
    .sort(
      (a, b) => (sticks[a] as StickPlan).stop - (sticks[b] as StickPlan).stop,
    );
  order.push(longStick);
  let prev = -Infinity;
  for (const [n, k] of order.entries()) {
    const s = sticks[k] as StickPlan;
    const gap = n === order.length - 1 ? LAST_GAP : STOP_GAP;
    const want = prev + gap;
    if (s.stop < want) {
      // 늦게 손을 떠나기보다 조금 더 높이·오래 난다(함께 던졌으니 손을 떠나는 때는 0.2초 안쪽)
      const extra = want - s.stop;
      const late = Math.min(extra, 0.2);
      const longer = extra - late;
      const flight = s.flight + longer;
      s.apex *= Math.min(1.8, (flight / s.flight) ** 2);
      s.flight = flight;
      s.delay += late;
      s.stop = want;
    }
    prev = s.stop;
  }

  const impacts: TossPlan["impacts"] = [];
  for (const [k, s] of sticks.entries()) {
    const landAt = s.delay + s.flight;
    // 처음 닿는 소리는 날아온 빠르기로, 그 뒤는 멈춤 궤적의 튐으로
    impacts.push({ t: landAt, stick: k, strength: 1 });
    for (const hit of s.settle.impacts)
      if (hit.t > 0.02)
        impacts.push({
          t: landAt + hit.t,
          stick: k,
          strength: Math.min(1, hit.strength / 2),
        });
  }
  impacts.sort((a, b) => a.t - b.t);
  return {
    sticks,
    duration: Math.max(...sticks.map((s) => s.stop)),
    impacts,
    fits,
  };
}

/** 한 순간 가락 하나의 자세 */
export interface Pose {
  x: number;
  y: number;
  z: number;
  roll: number;
  yaw: number;
  pitch: number;
}

/** 던진 때부터 t초에 가락 `k`의 자세 */
export function poseAt(plan: TossPlan, k: number, t: number): Pose {
  const s = plan.sticks[k] as StickPlan;
  const local = t - s.delay;
  const start = s.settle.start;
  const [, y0] = sample(s.settle, 0);
  if (local < s.flight) {
    // 날아가는 길: 손에서 닿는 자리까지 곧게, 높이는 포물선, 길이 축 돌기는 닿을 때의 각으로 이어진다
    const u = Math.max(0, local) / s.flight;
    const x = s.launch[0] + (s.land[0] - s.launch[0]) * u;
    const z = s.launch[2] + (s.land[1] - s.launch[2]) * u;
    const y = s.launch[1] + (y0 - s.launch[1]) * u + 4 * s.apex * u * (1 - u);
    const roll = start.roll - start.rollRate * (s.flight - Math.max(0, local));
    const left = 1 - u;
    const pitch = left * left * (Math.PI / 2 + s.turns * Math.PI * 2);
    const yaw = s.heading + left * 0.8;
    return { x, y, z, roll, yaw, pitch };
  }
  const [sx, sy, sz, roll, syaw] = sample(s.settle, local - s.flight);
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  return {
    x: s.land[0] + sx * c + sz * sn,
    y: sy,
    z: s.land[1] - sx * sn + sz * c,
    roll,
    yaw: s.heading + syaw,
    pitch: 0,
  };
}

/** 멈춘 가락이 배가 위인가(멈춘 길이 축 각으로) */
export function restsFlat(plan: TossPlan, k: number): boolean {
  const pose = poseAt(plan, k, plan.duration + 1);
  return Math.abs(wrap(pose.roll)) < Math.PI / 2;
}
