/**
 * 별 색 설명 페이지(/stardraw/colors)의 계산: 빛의 세기 곡선(스펙트럼) → 사람 눈에 보이는 색.
 *
 * - 별빛: 플랑크 곡선(흑체 복사). 표면 온도 하나로 모양이 정해진다.
 * - 눈: CIE 1931 등색 함수. Wyman·Sloan·Shirley(2013)의 여러 봉우리 근사식을 쓴다.
 * - 화면: XYZ → sRGB. 화면이 낼 수 없는 진한 색은 흰빛을 섞어 화면 안으로 들인다.
 *   밝기는 가장 밝은 칸을 1로 맞춰 색만 본다(별이 얼마나 밝은지는 따로).
 */

/** 파장(nm) → 세기. 크기는 상관없다(색만 본다) */
export type Spectrum = (nm: number) => number;

/** 봉우리 왼쪽과 오른쪽 폭이 다른 종 모양 */
function lobe(nm: number, mu: number, left: number, right: number): number {
  const s = nm < mu ? left : right;
  const t = (nm - mu) / s;
  return Math.exp(-0.5 * t * t);
}

/** 사람 눈의 세 감각(CIE 1931 x̄ ȳ z̄) */
export function eye(nm: number): [number, number, number] {
  const x =
    1.056 * lobe(nm, 599.8, 37.9, 31.0) +
    0.362 * lobe(nm, 442.0, 16.0, 26.7) -
    0.065 * lobe(nm, 501.1, 20.4, 26.2);
  const y =
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);
  const z =
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** hc/k (nm·K) */
const C2 = 1.4388e7;

/** 표면 온도 k(K)인 별의 빛 세기 곡선(플랑크 곡선) */
export function planck(k: number): Spectrum {
  return (nm) => nm ** -5 / Math.expm1(C2 / (nm * k));
}

/** 플랑크 곡선의 꼭대기 파장(빈의 법칙, nm) */
export function peakNm(k: number): number {
  return 2.8978e6 / k;
}

/** 봉우리 하나: 가운데 center(nm), 폭 width(nm, 표준편차) */
export function bump(center: number, width: number): Spectrum {
  return (nm) => lobe(nm, center, width, width);
}

/** 두 곡선을 더한 곡선 */
export function sum(...parts: Spectrum[]): Spectrum {
  return (nm) => parts.reduce((acc, f) => acc + f(nm), 0);
}

/** 눈이 느끼는 범위(nm) */
export const SEEN = [380, 780] as const;

/** 곡선 → 0~1 sRGB(감마 적용 전, 선형) */
export function linearRgb(f: Spectrum): [number, number, number] {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let nm = SEEN[0]; nm <= SEEN[1]; nm += 2) {
    const p = f(nm);
    const [x, y, z] = eye(nm);
    X += p * x;
    Y += p * y;
    Z += p * z;
  }
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  // 화면이 낼 수 없는 색(음수 칸)은 흰빛을 더해 들인다
  const low = Math.min(r, g, b, 0);
  r -= low;
  g -= low;
  b -= low;
  const high = Math.max(r, g, b);
  if (high <= 0) return [0, 0, 0];
  return [r / high, g / high, b / high];
}

function gamma(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/** 곡선 → 화면 색(0~255) */
export function spectrumRgb(f: Spectrum): [number, number, number] {
  const [r, g, b] = linearRgb(f);
  return [gamma(r), gamma(g), gamma(b)];
}

export function css([r, g, b]: [number, number, number]): string {
  return `rgb(${r},${g},${b})`;
}

/** 파장 하나뿐인 빛의 대략 색(무지개 띠 그림용) */
export function wavelengthCss(nm: number): string {
  return css(spectrumRgb(bump(nm, 4)));
}
