import { COLOR_SCHEMES, type CubeSettings } from "../settings";
import { HERO_SIZES, type HeroSize } from "./methods";

/**
 * 첫 화면 큐브의 대기 그림(3D가 뜨기 전·못 뜰 때·움직임 줄이기). 연출은 맞춘 큐브에서 시작하므로
 * 3D 첫 장면(맞춘 큐브, 같은 카메라·같은 그리기 품질)을 미리 찍어 둔 이미지를 쓴다
 * (`scripts/render-cube-posters.mjs`가 찍어 `public/cube/hero/`에 둔다).
 * 색을 직접 고른 사람·스티커 없는 모양은 찍은 이미지가 없어 비스듬한 큐브 SVG(`CubePoster`)로 대신한다.
 */

/** 3D 첫 화면 캔버스 크기(CSS 픽셀). `CubeHero`의 틀과 찍는 스크립트가 함께 쓴다 */
export const HERO_BOX = { width: 192, height: 160 } as const;

export const POSTER_SCHEMES = [
  "standard",
  "highContrast",
  "colorblind",
] as const;
export type PosterScheme = (typeof POSTER_SCHEMES)[number];

export const posterFile = (n: HeroSize, scheme: PosterScheme): string =>
  `${n}-${scheme}.webp`;

/** 찍은 이미지 주소. 맞는 이미지가 없으면 null(SVG로 대신) */
export function heroPosterSrc(
  s: Pick<CubeSettings, "heroSize" | "colorScheme" | "colors" | "stickerless">,
): string | null {
  if (s.stickerless) return null;
  if (!HERO_SIZES.includes(s.heroSize)) return null;
  const scheme = POSTER_SCHEMES.find((p) => p === s.colorScheme);
  if (!scheme) return null;
  // 이름은 색 묶음인데 색이 달라졌으면(옛 저장값 등) 이미지와 어긋나니 쓰지 않는다
  const want = COLOR_SCHEMES[scheme];
  if (s.colors.length !== 6 || s.colors.some((c, i) => c !== want[i]))
    return null;
  return `/cube/hero/${posterFile(s.heroSize, scheme)}`;
}
