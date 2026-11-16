import { TIER_IDS, type TierId } from "../table";

/**
 * 3D 엠블럼의 미리 찍은 그림(docs/47 14-7, 고정 규칙 2-1절). 3D가 뜨기 전·못 뜰 때 보이는 그림을 3D 장면에서 미리 찍어
 * 둔다(`scripts/render-emblem-posters.mjs` → `public/cube/tiers/emblem3d/`). 3D 칸이 그리는 장을 그대로 찍어(`stage.ts`
 * `captureFrames`) 같은 카메라·같은 크기·같은 바탕이라, 3D 첫 장으로 바뀌어도 자리와 생김새가 그대로다. 큐브 첫 화면 대기
 * 그림(`cube/hero/poster.ts`)과 같은 방식이다.
 *
 * - 대기 그림: 티어 화면의 내 티어 3D 칸(`HERO_SIZE`)이 그리는 정면 한 장.
 * - 진열 칸 그림(sprite): 티어 사다리 칸(`LADDER_SIZE`)의 3D가 그리는 장을 좌우 각(`SPRITE_YAWS`)마다 한 장씩 가로로
 *   이어 붙인 그림. 칸은 이 그림을 넘겨 도는 것처럼 보이고(3D 문맥을 여럿 띄우지 않는다), 가운데 장이 그 칸 3D의 대기
 *   그림이다.
 *
 * 2026-11-12 사용자 「그래픽 로드 전에 뜨는 이미지랑 후의 이미지랑 크기나 스타일 차이가 커서 이질적」.
 */

/** 티어 화면 바탕(neutral-900). 배경판 가장자리가 이 색에 녹아든다. 사이트는 어두운 화면 하나다 */
export const POSTER_PAGE = "#171717";

/** 내 티어 3D 칸 한 변(CSS px, 휴대폰 너비에도 들어가게) */
export const HERO_SIZE = 280;
/** 사다리 칸 3D 한 변(CSS px): PC. 휴대폰은 같은 그림을 줄여 보인다(`LADDER_SIZE_PHONE`) */
export const LADDER_SIZE = 112;
export const LADDER_SIZE_PHONE = 60;
/** 찍는 화소 밀도(두 배 화면) */
export const POSTER_DPR = 2;

/** 진열 칸 그림의 좌우 각: 정면 둘레 ±0.5 라디안을 17장(가운데 9번째가 정면) */
export const SPRITE_FRAMES = 17;
export const SPRITE_AMP = 0.5;
export const SPRITE_YAWS: readonly number[] = Array.from(
  { length: SPRITE_FRAMES },
  (_, i) => -SPRITE_AMP + (2 * SPRITE_AMP * i) / (SPRITE_FRAMES - 1),
);
/** 정면 장 번호 */
export const SPRITE_FRONT = (SPRITE_FRAMES - 1) / 2;

export const POSTER_DIR = "/cube/tiers/emblem3d";
export const SPRITE_DIR = `${POSTER_DIR}/sprite`;

/** 찍어 둘 대기 그림: 열 티어, 어두운 바탕 */
export const POSTERS: readonly TierId[] = TIER_IDS;
export const posterFile = (tier: TierId): string => `${tier}-dark.webp`;
export const spriteFile = (tier: TierId): string => `${tier}.webp`;

/** 내 티어 3D 칸의 대기 그림 주소. 찍지 않은 크기·바탕이면 null(그때는 작은 로딩 표시) */
export function posterSrc(
  tier: TierId,
  size: number,
  pageColor: string | undefined,
): string | null {
  if (size !== HERO_SIZE) return null;
  if ((pageColor ?? POSTER_PAGE).toLowerCase() !== POSTER_PAGE) return null;
  return POSTERS.includes(tier) ? `${POSTER_DIR}/${posterFile(tier)}` : null;
}

/**
 * HDR 대기 그림(docs/47 14-7 「HDR 길」): HDR 화면에서 보석 티어 3D는 HDR 길로 반짝임을 흰색보다 밝게 그리므로, 대기
 * 그림도 HDR 길이 그리는 첫 장을 같은 밝기로 찍어 둔다(BT.2020 PQ AVIF, 보통 흰색 203 nit). 보이는 조건은 3D가 HDR 길을
 * 고르는 조건(`support.ts` `hdrScreen`)과 같은 CSS(`emblem.css` `.emblem3d-hdr-poster`)
 */
export const HDR_POSTERS: readonly TierId[] = [
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
];
export const posterHdrFile = (tier: TierId): string => `${tier}-dark-hdr.avif`;

/** 내 티어 3D 칸의 HDR 대기 그림 주소(보석 티어, 찍은 크기·바탕만) */
export function posterHdrSrc(
  tier: TierId,
  size: number,
  pageColor: string | undefined,
): string | null {
  if (!posterSrc(tier, size, pageColor)) return null;
  return HDR_POSTERS.includes(tier)
    ? `${POSTER_DIR}/${posterHdrFile(tier)}`
    : null;
}

/** 진열 칸 그림 주소 */
export const spriteSrc = (tier: TierId): string =>
  `${SPRITE_DIR}/${spriteFile(tier)}`;
