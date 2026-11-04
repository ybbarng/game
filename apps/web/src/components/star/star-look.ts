/**
 * 별 하나를 「진한 색 + 이글거리는 원반」으로 그릴 때 쓰는 값(은하 한 바퀴 별 칸이 먼저 쓴다, docs/48 7-6).
 *
 * starship 하늘의 항성 표면(`sunFragment`)과 같은 생각을 가볍게 옮겼다.
 * - 색: 표면 온도 → 흑체 색을 옅게 하지 않고(별 따기 `tempColor`는 하늘 점이라 30% 옅게) 채도를 올린 「진한 색」.
 *   원반 가장자리는 같은 색을 어둡게 해 가장자리 어두워짐(limb darkening)을 낸다.
 * - 가운데 밝기: 뜨거운 별일수록 가운데가 하얗게 탄다(starship `surfacePeak`처럼 온도로, 차이는 줄여서).
 * - 크기: 겉보기 등급 → 빛의 양(10^(−0.4m))의 0.22제곱. 시리우스와 3.7등급 별이 약 3배 차이로, 밝기 순서가 바로 읽힌다.
 * 이글거림(쌀알 무늬가 천천히 도는 것)은 CSS가 맡는다(`StarGlyph`, globals.css `star-boil`).
 */

export type Rgb = readonly [number, number, number];

/** 흑체 색(Tanner Helland 근사, 1000~40000 K). 옅게 하지 않은 값 */
export function blackbody(k: number): Rgb {
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
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return [c(r), c(g), c(b)];
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === R
      ? ((G - B) / d + (G < B ? 6 : 0)) / 6
      : max === G
        ? ((B - R) / d + 2) / 6
        : ((R - G) / d + 4) / 6;
  return [h, s, l];
}

function toRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(ch(h + 1 / 3) * 255),
    Math.round(ch(h) * 255),
    Math.round(ch(h - 1 / 3) * 255),
  ];
}

/**
 * 진한 별 색: 흑체 색의 채도를 끌어올리고 밝기를 가운데쯤(0.62)에 둔다. 흰 별(7,000~10,000 K)도 옅은 하늘색·
 * 크림색으로 갈려, 판에서 푸른 별·흰 별·노란 별·주황 별·붉은 별이 서로 다르게 보인다
 */
export function deepColor(k: number): Rgb {
  const [h, s] = toHsl(blackbody(k));
  // 흑체 색은 6,500 K 언저리에서 거의 흰색이라 채도가 0에 가깝다. 바닥을 두어 색이 남게 한다
  // 푸른 별은 채도를 끝까지 올리면 짙은 남색이 되어 별빛으로 읽히지 않는다(2026-11-05 시범), 0.85까지·조금 밝게
  const blue = h > 0.5 && h < 0.75;
  return toRgb(
    h,
    Math.min(blue ? 0.8 : 0.95, 0.45 + s * 0.9),
    blue ? 0.68 : 0.62,
  );
}

/** 가장자리 색(가장자리 어두워짐): 같은 색을 어둡게 */
export function rimColor(k: number): Rgb {
  const [h, s, l] = toHsl(deepColor(k));
  return toRgb(h, s, l * 0.5);
}

/** 원반 가운데가 하얗게 타는 정도(0~1). 붉은 별은 거의 안 타고 푸른 별은 많이 탄다 */
export function coreHeat(k: number): number {
  return Math.min(1, Math.max(0.15, (k - 3000) / 17000));
}

/** 겉보기 등급 → 크기 배율(약 0.42 ~ 1.4). 등급 0이 1 */
export function sizeOf(mag: number): number {
  const flux = 10 ** (-0.4 * mag);
  return Math.min(1.4, Math.max(0.42, flux ** 0.22));
}

/** 빛줄기(＋ 모양)를 그릴 만큼 밝은가: 1등급보다 밝은 별 */
export function spiked(mag: number): boolean {
  return mag < 1;
}

/**
 * 별마다 다른 박자(이글거림 한 바퀴, 숨쉬기)를 정하는 씨앗 값. 같은 별은 늘 같다.
 * 여럿이 한꺼번에 같은 박자로 움직이지 않게 한다(docs/41 6절 「동시에 움직이지 않기」의 결)
 */
export function rhythm(seed: number): {
  boilMs: number;
  breatheMs: number;
  delayMs: number;
} {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const u = a - Math.floor(a);
  return {
    boilMs: Math.round(26000 + u * 18000),
    breatheMs: Math.round(3600 + u * 2600),
    delayMs: -Math.round(u * 9000),
  };
}

export const css = (c: Rgb, alpha = 1) =>
  alpha >= 1
    ? `rgb(${c[0]},${c[1]},${c[2]})`
    : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
