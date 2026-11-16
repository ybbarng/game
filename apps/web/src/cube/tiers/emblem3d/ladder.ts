import type { TierId } from "../table";
import { BASE_BLOOM, GEM_STYLE_LOOK, TIER_STYLE } from "./gemStyle";
import type { LookParts, LookStat } from "./lookStats";
import { GEM_BACK_GAIN, GEM_BIG_PANEL, GEM_GAIN, LOOK } from "./scene";

/**
 * 밝기 사다리(docs/47 14-7 「밝기 사다리」, 고정 규칙 2-1절): 위 티어일수록 밝고 화려하게, 숫자로 확인한다.
 *
 * 2026-11-13 사용자 「마스터가 그랜드마스터보다 더 밝아 보여」, 「주변 장식도 그랜드마스터가 좀 더 빛이 적어 보여」, 이어
 * 「에메랄드, 다이아몬드, 마스터가 지금의 그마 틀 밝기가 되고, 그마가 얘네 밝기를 가지는 게 더 나은 것 같아」.
 *
 * 찍기 스크립트(`scripts/render-emblem-posters.mjs`, `ONLY=ladder`)가 3D 첫 장을 재서(`stage.ts` `measureEmblem`)
 * `ladder-measure.json`에 남기고, 이 규칙을 어기면 실패한다. 단위 시험(`ladder.test.ts`)은 남긴 숫자가 지금 값 표
 * (`lookPrint`)로 잰 것인지와 규칙을 지키는지 본다. 값을 바꾸고 다시 재지 않으면 시험이 잡는다.
 */

/** 재는 티어: 열 티어 모두(금속 다섯의 순서와 플래티넘 < 에메랄드도 본다, 2026-11-16) */
export const MEASURE_TIERS = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
] as const satisfies readonly TierId[];
export type MeasureTier = (typeof MEASURE_TIERS)[number];

/** 재는 조건: 바탕 둘 × 각 둘(정면, 돌린 각 0.6 라디안) */
export const MEASURE_BGS = ["dark", "light"] as const;
export const MEASURE_YAWS = [0, 0.6] as const;
/** 재는 칸 크기(CSS px, 두 배 화소로 그린다) */
export const MEASURE_SIZE = 300;

export interface LadderMeasure {
  /** 잴 때 값 표(`lookPrint`) */
  print: string;
  /** 티어 → 조건(`dark-0`, `light-0.6` …) → 영역별 값 */
  tiers: Record<MeasureTier, Record<string, LookParts>>;
}

/** 조건 이름 */
export const condKey = (bg: string, yaw: number) => `${bg}-${yaw}`;

/** 네 조건 평균 */
export function average(
  m: LadderMeasure,
  tier: MeasureTier,
  part: keyof LookParts,
): Pick<LookStat, "meanL" | "sparkle"> {
  const all = Object.values(m.tiers[tier]).map((p) => p[part]);
  const n = Math.max(1, all.length);
  return {
    meanL: all.reduce((s, x) => s + x.meanL, 0) / n,
    sparkle: all.reduce((s, x) => s + x.sparkle, 0) / n,
  };
}

/** 같다고 볼 차(L* 1, 반짝임 0.3%p): 정한 순서를 지키되 같은 단계 안의 작은 차는 허용 */
export const TOLERANCE = { meanL: 1, sparkle: 0.003 } as const;

/** 규칙 하나: `low`의 값 ≤ `high`의 값(+ 허용 차). `strict`면 `low` < `high`. `metrics`는 볼 값(기본 밝기·반짝임 둘 다) */
export interface LadderRule {
  part: keyof LookParts;
  low: MeasureTier;
  high: MeasureTier;
  strict?: boolean;
  metrics?: readonly ("meanL" | "sparkle")[];
}

/** 금속 다섯과 그 위 에메랄드: 아래 티어부터 */
const METAL_CHAIN = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
] as const;

/**
 * 금속 사다리: 장식과 엠블럼 전체의 밝기가 아이언 < 브론즈 < 실버 < 골드 < 플래티넘 < 에메랄드(같아도 안 된다). 반짝임
 * (L* 85 넘는 화소 몫)은 금속끼리 견주지 않는다: 흰 금속(실버·플래티넘)은 같은 밝기에서도 색 금속(브론즈·골드)보다 흰
 * 화소가 많다. 플래티넘 < 에메랄드는 장식 반짝임도 본다. 큐브는 금속 거울 조각과 보석 조각이라 견주지 않는다
 */
const METAL_RULES: LadderRule[] = [
  ...METAL_CHAIN.slice(1).flatMap((high, i) =>
    (["deco", "body"] as const).map(
      (part): LadderRule => ({
        part,
        low: METAL_CHAIN[i] as MeasureTier,
        high,
        strict: true,
        metrics: ["meanL"],
      }),
    ),
  ),
  { part: "deco", low: "platinum", high: "emerald", metrics: ["sparkle"] },
];

/**
 * 지킬 순서(밝기·반짝임 둘 다). 보석 다섯을 아래부터 에메랄드 < 다이아몬드 < 마스터 < 그랜드마스터 < 챌린저로 본다.
 * - 장식(틀·날개·볏·왕관·빛살): 에메랄드·다이아몬드·마스터는 한 단계(예전 그랜드마스터 장식 밝기)로 두고
 *   (`DECO_BAND`), 그랜드마스터는 그 셋보다, 챌린저는 그랜드마스터보다 크거나 같다(사용자 지정, 장식 밝기를 서로 바꿈).
 * - 큐브(보석 속): 다이아몬드 > 에메랄드, 마스터 ≤ 그랜드마스터 ≤ 챌린저. 무색 다이아몬드와 색 보석 마스터는 견주지
 *   않는다(색 보석은 빛을 먹어 무색보다 어둡다).
 * - 엠블럼 전체: 에메랄드 ≤ 다이아몬드, 마스터 ≤ 그랜드마스터 ≤ 챌린저. 다이아몬드와 마스터는 위와 같은 까닭으로 견주지
 *   않는다(장식이 한 단계라 무색 보석이 밝은 쪽이 전체도 밝다).
 * 금속 다섯과 플래티넘 < 에메랄드는 `METAL_RULES`.
 */
export const LADDER_RULES: readonly LadderRule[] = [
  ...METAL_RULES,
  { part: "deco", low: "emerald", high: "grandmaster" },
  { part: "deco", low: "diamond", high: "grandmaster" },
  { part: "deco", low: "master", high: "grandmaster" },
  { part: "deco", low: "grandmaster", high: "challenger" },
  { part: "core", low: "emerald", high: "diamond", strict: true },
  { part: "core", low: "master", high: "grandmaster" },
  { part: "core", low: "grandmaster", high: "challenger" },
  { part: "body", low: "emerald", high: "diamond" },
  { part: "body", low: "master", high: "grandmaster" },
  { part: "body", low: "grandmaster", high: "challenger" },
];

/** 에메랄드·다이아몬드·마스터 장식 밝기(L*)가 한 단계로 묶이는 폭: 가장 밝은 것과 어두운 것의 차가 이 안 */
export const DECO_BAND = {
  tiers: ["emerald", "diamond", "master"],
  meanL: 6,
} as const;

/** 규칙을 어긴 것(사람이 읽는 줄). 없으면 빈 목록 */
export function ladderViolations(m: LadderMeasure): string[] {
  const out: string[] = [];
  for (const r of LADDER_RULES)
    for (const metric of r.metrics ?? (["meanL", "sparkle"] as const)) {
      const a = average(m, r.low, r.part)[metric];
      const b = average(m, r.high, r.part)[metric];
      const ok = r.strict ? a < b : a <= b + TOLERANCE[metric];
      if (!ok)
        out.push(
          `${r.part} ${metric}: ${r.low} ${a.toFixed(3)} ${r.strict ? "<" : "≤"} ${r.high} ${b.toFixed(3)} 아님`,
        );
    }
  const band = DECO_BAND.tiers.map((t) => average(m, t, "deco").meanL);
  const spread = Math.max(...band) - Math.min(...band);
  if (spread > DECO_BAND.meanL)
    out.push(
      `deco meanL: 에메랄드·다이아몬드·마스터 차 ${spread.toFixed(2)} > ${DECO_BAND.meanL}(한 단계가 아님)`,
    );
  return out;
}

/** 문자열의 짧은 지문(FNV-1a 32비트, 16진) */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * 잰 티어의 생김새를 정하는 값 표의 지문. 이 값이 바뀌었는데 다시 재지 않으면 단위 시험이 잡는다
 * (셰이더·조명 코드 자체를 바꾼 것은 잡지 못한다. 그때는 손으로 다시 잰다)
 */
export function lookPrint(): string {
  const looks = Object.fromEntries(MEASURE_TIERS.map((t) => [t, LOOK[t]]));
  return fnv(
    JSON.stringify({
      looks,
      styles: GEM_STYLE_LOOK,
      tierStyle: TIER_STYLE,
      base: BASE_BLOOM,
      gain: [GEM_GAIN, GEM_BACK_GAIN, GEM_BIG_PANEL],
    }),
  );
}
