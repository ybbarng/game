/**
 * 엠블럼 밝기·반짝임을 숫자로 잰다(docs/47 14-7 「밝기 사다리」, 2026-11-13 사용자 「마스터가 그랜드마스터보다 더 밝아
 * 보여」·「주변 장식도 그랜드마스터가 좀 더 빛이 적어 보여」). 그리기와 떨어진 순수 계산이다. 화소는 3D 첫 장(번짐까지
 * 거친 실제 화면 그림)이고, 영역은 같은 각에서 몸만 흰색으로 그린 본으로 고른다(`stage.ts` `measureEmblem`).
 *
 * - 밝기: 영역 화소의 지각 밝기 L*(CIE 1976, 0~100) 평균. 사람 눈이 느끼는 밝기에 가깝다.
 * - 반짝임: 영역 화소 가운데 L*가 `SPARKLE_L` 이상인 화소의 몫(0~1). 반짝 점·흰 쐐기·번짐이 많을수록 크다.
 */

/** 반짝이는 화소로 셀 L* 문턱 */
export const SPARKLE_L = 85;

export interface LookStat {
  /** 영역 평균 L* */
  meanL: number;
  /** L* ≥ SPARKLE_L 화소 몫 */
  sparkle: number;
  /** 영역 화소 수 */
  area: number;
}

/** sRGB 한 채널(0~255) → 선형 */
function linear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB 화소의 지각 밝기 L* */
export function lightness(r: number, g: number, b: number): number {
  const y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const f =
    y > 216 / 24389 ? Math.cbrt(y) : ((24389 / 27) * y) / 116 + 16 / 116;
  return 116 * f - 16;
}

/**
 * RGBA 화소(`color`)에서 `inside(i)`가 참인 화소(i는 화소 번호)의 밝기·반짝임. 영역이 비면 모두 0
 */
export function lookStat(
  color: ArrayLike<number>,
  inside: (i: number) => boolean,
): LookStat {
  let sum = 0;
  let hot = 0;
  let area = 0;
  for (let i = 0, k = 0; k + 3 < color.length; i++, k += 4) {
    if (!inside(i)) continue;
    const l = lightness(color[k] ?? 0, color[k + 1] ?? 0, color[k + 2] ?? 0);
    sum += l;
    if (l >= SPARKLE_L) hot++;
    area++;
  }
  return area
    ? { meanL: sum / area, sparkle: hot / area, area }
    : { meanL: 0, sparkle: 0, area: 0 };
}

/** 흰 본(검은 바탕에 흰 몸, RGBA)에서 i번째 화소가 몸인지 */
export const inMask =
  (mask: ArrayLike<number>) =>
  (i: number): boolean =>
    (mask[i * 4] ?? 0) > 127;

/** 잰 영역 셋: 엠블럼 전체, 큐브(보석 조각 27개), 장식(전체에서 큐브를 뺀 틀·날개·볏·왕관·빛살) */
export interface LookParts {
  body: LookStat;
  core: LookStat;
  deco: LookStat;
}

export function lookParts(
  color: ArrayLike<number>,
  bodyMask: ArrayLike<number>,
  coreMask: ArrayLike<number>,
): LookParts {
  const body = inMask(bodyMask);
  const core = inMask(coreMask);
  return {
    body: lookStat(color, body),
    core: lookStat(color, (i) => body(i) && core(i)),
    deco: lookStat(color, (i) => body(i) && !core(i)),
  };
}
