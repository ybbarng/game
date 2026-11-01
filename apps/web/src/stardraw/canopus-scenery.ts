/**
 * 「제주에서 보는 카노푸스」 그림의 땅과 바다: 서울 남쪽의 산 능선과 마라도 앞바다의 배.
 * 자리는 모두 고정값이라 그림이 늘 같다. 단위는 하늘과 같은 방위·고도(도)
 */

/** 능선 꼭짓점 [방위, 고도] */
export type RidgePoint = readonly [az: number, alt: number];

/**
 * 서울 남쪽 산 능선 두 겹(먼 산, 가까운 산). 정남(180°)에 가까운 산의 골짜기가 지평선(0°)까지 패여 있고,
 * 먼 산도 그 사이에서는 지평선 아래로 내려가 있어 골짜기로 남쪽 끝 하늘이 트인다
 */
export const SEOUL_RIDGES: { far: RidgePoint[]; near: RidgePoint[] } = {
  far: [
    [116, 3.6],
    [121, 4.8],
    [126, 4.1],
    [133, 5.6],
    [139, 4.4],
    [145, 4.9],
    [151, 3.7],
    [158, 5.2],
    [164, 3.9],
    [169, 2.0],
    [173, 0.6],
    [176, 0],
    [184, 0],
    [187, 0.8],
    [191, 2.4],
    [197, 4.6],
    [203, 5.9],
    [209, 4.8],
    [216, 5.3],
    [223, 3.9],
    [230, 4.7],
    [237, 3.6],
    [244, 4.2],
  ],
  near: [
    [116, 2.0],
    [122, 2.9],
    [127, 2.2],
    [134, 3.2],
    [141, 2.4],
    [148, 3.5],
    [155, 2.7],
    [162, 3.8],
    [168, 3.1],
    [173, 2.2],
    [176.5, 1.1],
    [178.8, 0.3],
    [180, 0],
    [181.3, 0.3],
    [183.5, 1.2],
    [187, 2.5],
    [192, 3.3],
    [199, 2.6],
    [206, 3.4],
    [213, 2.3],
    [220, 3.0],
    [228, 2.1],
    [236, 2.8],
    [244, 2.3],
  ],
};

/** 꺾은선 능선의 그 방위 고도(범위 밖이면 끝점 고도) */
export function ridgeAt(ridge: readonly RidgePoint[], az: number): number {
  const first = ridge[0];
  const last = ridge[ridge.length - 1];
  if (!first || !last) return 0;
  if (az <= first[0]) return first[1];
  if (az >= last[0]) return last[1];
  for (let i = 1; i < ridge.length; i++) {
    const a = ridge[i - 1] as RidgePoint;
    const b = ridge[i] as RidgePoint;
    if (az <= b[0]) return a[1] + ((az - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return last[1];
}

/** 서울에서 그 방위의 하늘이 산에 가리는 높이(두 겹 가운데 높은 쪽, 도) */
export function seoulSkyline(az: number): number {
  return Math.max(
    0,
    ridgeAt(SEOUL_RIDGES.far, az),
    ridgeAt(SEOUL_RIDGES.near, az),
  );
}

/** 별이 서울 남쪽 산 위로 보이는가(겉보기 고도가 능선보다 높을 때) */
export function aboveSeoulRidge(az: number, alt: number): boolean {
  return alt > seoulSkyline(az);
}

/**
 * 마라도 앞바다의 배. `az`는 배 가운데 방위, `water`는 물에 닿는 높이(가까울수록 수평선 아래로 내려온다),
 * `length`는 배 길이(방위 도), `lamps`는 고기잡이 불 개수(0이면 돛대 불 하나)
 */
export interface Boat {
  az: number;
  water: number;
  length: number;
  lamps: number;
  /** 뱃머리가 오른쪽(서쪽)을 보면 1, 왼쪽이면 −1 */
  facing: 1 | -1;
}

/** 카노푸스(정남)와 그 수면 반영을 비켜 양옆에 둔다 */
export const MARADO_BOATS: readonly Boat[] = [
  { az: 139, water: -0.5, length: 5, lamps: 6, facing: 1 },
  { az: 160, water: -0.1, length: 2.4, lamps: 0, facing: -1 },
  { az: 207, water: -2.4, length: 8.5, lamps: 0, facing: -1 },
  { az: 228, water: -0.7, length: 4.4, lamps: 5, facing: 1 },
];
