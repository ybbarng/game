import { TIER_IDS, type TierId } from "../table";

/**
 * 3D 엠블럼을 정면에서 찍은 정지 그림(docs/47 14-7 「정지 그림」, 고정 규칙 2-1절). 티어표·기록·티어 화면처럼 3D 장면을
 * 띄우지 않는 곳은 이 그림을 쓴다. GPU 없이 보이므로 3D를 못 그리는 기기에서도 같은 그림이다. 평면 SVG
 * 엠블럼(`TierEmblem`)은 이 그림 파일을 못 받았을 때의 마지막 대체로만 남는다.
 *
 * 투명 바탕(보석은 어두운 배경판을 굴절해 비춘 채로 몸 모양만 떼어 낸다, `stage.ts` `captureShots`). 크기 세 단계를 두
 * 배 화소로 찍고(`scripts/render-emblem-posters.mjs` → `public/cube/tiers/emblem3d/still/`), 칸보다 크거나 같은
 * 가장 작은 단계를 브라우저가 줄여 보인다. 작은 단계는 작게 봐도 알아보게 따로 맞춰 찍는다(엠블럼을 칸에 더 꽉 채우고
 * 조금 밝히고, 밝은 바탕에서도 가장자리가 서게 얇은 어두운 테두리를 두른다). Cubie 앱에 묶는 PNG(`apps/cubie/Resources/Emblems`)도 같은 길로 찍는다.
 *
 * 2026-11-13 사용자 「평면 모델로 만든 게 다 필요 없어지지 않아? 정말 저성능인 환경이나 캐주얼 환경에서 써 주든지」.
 */

export type StillStep = "s" | "m" | "l";

/** 단계마다 칸 한 변(CSS px). 파일은 두 배 화소 */
export const STILL_CSS: Record<StillStep, number> = { s: 32, m: 64, l: 128 };
export const STILL_STEPS = ["s", "m", "l"] as const satisfies StillStep[];
export const STILL_DPR = 2;
export const STILL_DIR = "/cube/tiers/emblem3d/still";

/** 작게 보일 단계(작은 칸에서 알아보게 따로 맞춰 찍는다) */
export const SMALL_STEP: StillStep = "s";

export interface StillSpec {
  tier: TierId;
  step: StillStep;
}

/** 찍어 둘 정지 그림 전부: 열 티어 × 세 단계 */
export const STILLS: readonly StillSpec[] = TIER_IDS.flatMap((tier) =>
  STILL_STEPS.map((step) => ({ tier, step })),
);

export const stillFile = (s: StillSpec): string => `${s.tier}-${s.step}.webp`;

/** 칸 한 변에 쓸 단계: 칸보다 크거나 같은 가장 작은 단계(가장 큰 단계보다 크면 가장 큰 단계) */
export function stillStep(size: number): StillStep {
  return STILL_STEPS.find((s) => STILL_CSS[s] >= size) ?? "l";
}

/** 이 티어·칸 크기의 정지 그림 주소 */
export function stillSrc(tier: TierId, size: number): string {
  return `${STILL_DIR}/${stillFile({ tier, step: stillStep(size) })}`;
}
