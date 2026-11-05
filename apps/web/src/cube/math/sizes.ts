import { cubeTopology, parseMoves } from "@game/cube-engine";

import { cycleParity, pieceCycles } from "./pieces";

/**
 * 크기마다 날개 묶음과 안쪽 한 층 돌리기의 홀짝(「크기와 패리티」 카드). 엔진의 조각 자리로 센다.
 * 날개 묶음 = 서로 자리를 바꿀 수 있는 날개 무리(엔진의 궤도). 「고리」는 한 바퀴 도는 자리 순환이다.
 */

export interface SliceEffect {
  /** 안쪽 한 층 표기(예: 2R, 3R) */
  move: string;
  /** 날개 묶음마다 움직인 고리 길이(움직이지 않으면 빈 목록) */
  wings: number[][];
  /** 가운데 엣지 고리 길이 */
  midges: number[];
  /** 코너 고리 길이 */
  corners: number[];
}

export interface SizeFacts {
  n: number;
  /** 날개 묶음 수 */
  wingOrbits: number;
  /** 한가운데 엣지(3×3 엣지처럼 움직이는 조각)가 있나 */
  midges: boolean;
  /** 안쪽 층 하나씩 90° 돌렸을 때 */
  slices: SliceEffect[];
  /** 3×3처럼 맞추는 단계에서 엣지 하나만 뒤집힌 꼴(OLL 패리티)이 보일 수 있나 */
  ollParity: boolean;
  /** 3×3처럼 맞추는 단계에서 엣지 둘만 바뀐 꼴(PLL 패리티)이 보일 수 있나 */
  pllParity: boolean;
  /** 엣지 짝짓기 마지막에 날개 짝 하나가 뒤집힌 꼴이 보일 수 있나(가운데 엣지가 기준이 되는 홀수 크기) */
  pairingParity: boolean;
}

export function sizeFacts(n: number): SizeFacts {
  const topo = cubeTopology(n);
  const wingOrbitIds = topo.orbits
    .map((o, i) => (o.kind === "wing" ? i : -1))
    .filter((i) => i >= 0);
  const midges = topo.orbits.some((o) => o.kind === "edge");
  const slices: SliceEffect[] = [];
  for (let l = 2; l <= Math.floor(n / 2); l++) {
    const move = `${l}R`;
    const cycles = pieceCycles(n, parseMoves(n, move));
    slices.push({
      move,
      wings: wingOrbitIds.map((id) => cycles[id]?.cycles ?? []),
      midges: cycles.find((c) => c.kind === "edge")?.cycles ?? [],
      corners: cycles.find((c) => c.kind === "corner")?.cycles ?? [],
    });
  }
  const wingOdd = slices.some((s) => s.wings.some((w) => cycleParity(w) === 1));
  return {
    n,
    wingOrbits: wingOrbitIds.length,
    midges,
    slices,
    // 짝수 크기: 날개 자리의 홀짝을 정해 줄 기준 조각이 없어 3×3 단계까지 남는다
    ollParity: !midges && wingOdd,
    pllParity: !midges && wingOdd,
    pairingParity: midges && wingOdd,
  };
}
