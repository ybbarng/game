import type { GalaxyBoard } from "@game/galaxy-engine";

/**
 * 별빛 색과 크기(별 따기 `stardraw/sky.ts`의 `tempColor`와 같은 식). 별 따기의 별 자료를 함께 묶지 않으려고
 * 식만 옮겼다(같은 별은 두 게임에서 같은 색이다).
 */
const STAR_PALE = 0.3;

/** 표면 온도 → 별빛 색(흑체 근사, 채도를 낮춘 sRGB) */
export function tempColor(k: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, k)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b =
    t >= 66
      ? 255
      : t <= 19
        ? 0
        : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const pale = (v: number) => {
    const c = Math.min(255, Math.max(0, v));
    return Math.round(c + (255 - c) * STAR_PALE);
  };
  return [pale(r), pale(g), pale(b)];
}

export function starRgb(k: number, alpha = 1): string {
  const [r, g, b] = tempColor(k);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** 밝기(등급) → 점 크기 배율(0.45 ~ 1). 시리우스가 가장 크고 3등급 별은 작다 */
export function magScale(mag: number): number {
  return Math.max(0.45, Math.min(1, 0.78 - mag * 0.13));
}

/** 계절마다 별자리 띠 색 둘(가을·겨울·봄·여름, 변 안 앞·뒤 별자리) */
const SEASON_COLORS: Record<string, [string, string]> = {
  autumn: ["#f59e0b", "#fb923c"],
  winter: ["#60a5fa", "#818cf8"],
  spring: ["#4ade80", "#2dd4bf"],
  summer: ["#f472b6", "#c084fc"],
};

/** 별자리 띠 색 */
export function groupColor(board: GalaxyBoard, group: number): string {
  const g = board.groups[group];
  const pair = SEASON_COLORS[g?.season ?? ""] ?? ["#94a3b8", "#cbd5e1"];
  return pair[group % 2] as string;
}
