/**
 * 주사위 던지기 연출의 자리·돌기(순수 함수, 2026-11-05 사용자 「주사위가 매우 어색함. 좀 더 현실감 있으면 좋겠음」).
 * 주사위 둘이 오른쪽 아래에서 던져져 크게 한 번 날고, 점점 낮게 세 번 튕기고, 구르다 멈춘다.
 * 결과 눈은 함께 정한 난수 그대로이고 연출은 그 눈이 앞(보는 쪽)에 오게 멈출 뿐이다(눈을 바꾸지 않는다).
 * 단위는 주사위 한 변(d). 화면은 CSS 3D 정육면체로 그린다(`components/Dice3D.tsx`)
 */

/** 정육면체 면 배치: 앞 1, 뒤 6, 오른쪽 3, 왼쪽 4, 위 2, 아래 5(마주 보는 면의 합이 7) */
export const FACE_OF = {
  front: 1,
  back: 6,
  right: 3,
  left: 4,
  top: 2,
  bottom: 5,
} as const;

/** 눈 v가 앞에 오는 돌기(도). CSS `rotateX(x) rotateY(y)` 차례 */
export function restAngles(v: number): { x: number; y: number } {
  switch (v) {
    case 6:
      return { x: 0, y: 180 };
    case 3:
      return { x: 0, y: -90 };
    case 4:
      return { x: 0, y: 90 };
    case 2:
      return { x: -90, y: 0 };
    case 5:
      return { x: 90, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

export interface DiePose {
  /** 멈출 자리에서 어긋난 거리(d 단위, 오른쪽·아래가 +) */
  dx: number;
  dy: number;
  /** 바닥에서 뜬 높이(d 단위, 0 이상) */
  lift: number;
  /** 돌기(도). 화면에는 rotateZ(z) rotateX(x) rotateY(y) */
  x: number;
  y: number;
  z: number;
}

/** 튕김 토막: [끝나는 몫, 높이]. 첫 토막이 던져 나는 큰 호, 뒤로 갈수록 낮다 */
const ARCS: [number, number][] = [
  [0.42, 1.5],
  [0.66, 0.5],
  [0.82, 0.18],
  [0.92, 0.05],
];

/** 0~1 사이 결정적 수(같은 굴림은 늘 같은 모양으로 던져진다) */
function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 주사위 하나의 모습. `p`는 구르는 동안의 몫(0 던짐 → 1 멈춤), `which`는 둘 가운데 몇째, `seed`는 굴림마다 다른 수.
 * p ≥ 1이면 눈 `value`가 앞을 보고 바닥에 놓인다
 */
export function diePose(
  p: number,
  value: number,
  which: 0 | 1,
  seed: number,
): DiePose {
  const t = Math.min(1, Math.max(0, p));
  const r1 = hash(seed * 7 + which * 3 + 1);
  const r2 = hash(seed * 11 + which * 5 + 2);
  const r3 = hash(seed * 13 + which * 7 + 3);
  // 멈춘 뒤 살짝 비뚤어진 채 놓인다(앞면은 그대로 보는 쪽)
  const tilt = (r3 - 0.5) * 28;
  const rest = restAngles(value);
  // 미끄러지며 다가온다: 처음엔 빠르고 끝에 느려진다
  const travel = (1 - t) ** 2.2;
  const startX = 2.6 + r1 * 0.8 + which * 0.5;
  const startY = 1.8 + r2 * 0.6 - which * 0.3;
  // 높이: 토막마다 포물선
  let lift = 0;
  let from = 0;
  for (const [end, h] of ARCS) {
    if (t < end) {
      const u = (t - from) / (end - from);
      lift = h * 4 * u * (1 - u);
      break;
    }
    from = end;
  }
  // 돌기: 바퀴 수만큼 돌다가 점점 느려져 멈춘다(바퀴는 정수라 멈춘 면이 결과 눈)
  const spin = (1 - t) ** 2.6;
  const turnsX = (2 + Math.floor(r1 * 2)) * 360 * (r2 < 0.5 ? 1 : -1);
  const turnsY = (2 + Math.floor(r2 * 2)) * 360 * (r1 < 0.5 ? -1 : 1);
  const turnsZ = (1 + Math.floor(r3 * 2)) * 360;
  return {
    dx: startX * travel,
    dy: startY * travel,
    lift,
    x: rest.x + turnsX * spin,
    y: rest.y + turnsY * spin,
    z: tilt + turnsZ * spin,
  };
}
