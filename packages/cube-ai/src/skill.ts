import type { SolveMethod } from "./methods";

/**
 * 컴퓨터 단계(docs/47 10-1). 사람 기록에 맞춘 다섯 단계와 「내 실력에 맞춤」(목표 시간).
 *
 * 방 상태로 보내는 값은 글(`botSkillText`)이다. 계획 표의 버전(`BOT_PLAN_VERSION`)을 앞에 붙여, 표가 바뀐 기기끼리
 * 서로의 컴퓨터를 「계획과 다름」으로 잘못 보지 않게 한다(모르는 버전이면 확인하지 않고 「다른 버전」으로 보인다).
 * 버전 없는 옛 값(`beginner` 등, 2026-11-05 전)은 옛 계획 그대로 다시 계산한다(`legacy`).
 */

export type BotLevel = "novice" | "casual" | "club" | "fast" | "pro";

export const BOT_LEVELS: readonly BotLevel[] = [
  "novice",
  "casual",
  "club",
  "fast",
  "pro",
];

export const BOT_LEVEL_LABELS: Readonly<Record<BotLevel, string>> = {
  novice: "입문",
  casual: "초보",
  club: "중수",
  fast: "고수",
  pro: "초고수",
};

/** 사람으로 치면(단계 고르기 설명) */
export const BOT_LEVEL_PEOPLE: Readonly<Record<BotLevel, string>> = {
  novice: "막 배운 사람",
  casual: "층별로 익숙한 사람",
  club: "4단계 마지막 층 CFOP",
  fast: "전체 CFOP",
  pro: "대회 상위권",
};

/** 2026-11-05 전 단계 값. 계획은 옛 표 그대로(`plan.ts` `legacyPlan`) */
export type LegacyBotLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "expert";

export const LEGACY_BOT_LEVELS: readonly LegacyBotLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
];

/** 옛 값을 새 단계 이름으로 읽기(보이는 이름만). 옛 표의 평균 시간이 가장 가까운 단계(docs/47 10-1 표) */
export const LEGACY_AS: Readonly<Record<LegacyBotLevel, BotLevel>> = {
  beginner: "novice",
  intermediate: "club",
  advanced: "pro",
  expert: "pro",
};

export type BotSkill =
  | { kind: "level"; level: BotLevel }
  | { kind: "fit"; targetMs: number }
  | { kind: "legacy"; level: LegacyBotLevel };

/** 계획 표 버전. 단계의 해법·빠르기·목표 표를 바꾸면 올린다(다른 표를 쓰는 기기가 계획을 맞춰 보지 않게) */
export const BOT_PLAN_VERSION = 3;

/** 크기별 단계 목표(한 판 평균, ms). 근거는 docs/47 10-1 */
export const BOT_TARGET_MS: Readonly<Record<number, Record<BotLevel, number>>> =
  {
    2: {
      novice: 45_000,
      casual: 20_000,
      club: 10_000,
      fast: 5_500,
      pro: 3_000,
    },
    3: {
      novice: 120_000,
      casual: 60_000,
      club: 35_000,
      fast: 18_000,
      pro: 10_000,
    },
    // 4×4·5×5는 3×3 단계와 같은 티어 자리(2026-11-09, docs/47 10-3): 입문 실버 IV·초보 골드 IV·중수 플래티넘 IV·
    // 고수 에메랄드 II·초고수 마스터 IV 진입 시간
    4: {
      novice: 540_000,
      casual: 270_000,
      club: 160_000,
      fast: 80_000,
      pro: 45_000,
    },
    5: {
      novice: 1_020_000,
      casual: 510_000,
      club: 300_000,
      fast: 150_000,
      pro: 85_000,
    },
  };

/** 단계마다 쓰는 해법(크기마다). 4×4·5×5는 축소법 뒤 이 3×3 해법 */
export const LEVEL_METHOD: Readonly<
  Record<"2" | "3" | "big", Record<BotLevel, SolveMethod>>
> = {
  2: {
    novice: "beginner",
    casual: "beginner",
    club: "intermediate",
    fast: "advanced",
    pro: "advanced",
  },
  3: {
    novice: "beginner",
    casual: "intermediate",
    club: "fourlook",
    fast: "advanced",
    pro: "advanced",
  },
  big: {
    novice: "beginner",
    casual: "intermediate",
    club: "fourlook",
    fast: "advanced",
    pro: "advanced",
  },
};

export function levelMethod(level: BotLevel, size: number): SolveMethod {
  const key = size === 2 ? "2" : size === 3 ? "3" : "big";
  return LEVEL_METHOD[key][level];
}

/** 「내 실력에 맞춤」 목표 범위(ms, 보낼 수 있는 값). 그 크기 단계 표 밖은 가까운 끝으로 줄인다(`fitLevel`) */
export const FIT_MIN_MS = 1_000;
export const FIT_MAX_MS = 3_600_000;

/** 기록이 없을 때 「내 실력에 맞춤」이 서는 단계 */
export const FIT_DEFAULT_LEVEL: BotLevel = "casual";

/** 내 평균(없으면 null) → 그 크기의 「내 실력에 맞춤」 목표(100ms 단위) */
export function fitTargetMs(size: number, average: number | null): number {
  const ms =
    average ??
    (BOT_TARGET_MS[size] ?? (BOT_TARGET_MS[3] as Record<BotLevel, number>))[
      FIT_DEFAULT_LEVEL
    ];
  return Math.min(FIT_MAX_MS, Math.max(FIT_MIN_MS, Math.round(ms / 100) * 100));
}

/**
 * 목표 시간에 맞는 단계(해법·빠르기 모양)와 실제로 쓸 목표. 목표가 가장 가까운(비율로) 단계를 고르고,
 * 목표는 초고수 목표 × 0.7 ~ 입문 목표 × 1.5 안으로 줄인다(사람 해법으로 낼 수 있는 빠르기 안)
 */
export function fitLevel(
  size: number,
  targetMs: number,
): { level: BotLevel; targetMs: number } {
  const table =
    BOT_TARGET_MS[size] ?? (BOT_TARGET_MS[3] as Record<BotLevel, number>);
  const t = Math.min(table.novice * 1.5, Math.max(table.pro * 0.7, targetMs));
  let best: BotLevel = "novice";
  let gap = Number.POSITIVE_INFINITY;
  for (const level of BOT_LEVELS) {
    const g = Math.abs(Math.log(t / table[level]));
    if (g < gap) {
      gap = g;
      best = level;
    }
  }
  return { level: best, targetMs: t };
}

/** 방 상태로 보낼 글 */
export function botSkillText(skill: BotSkill): string {
  if (skill.kind === "legacy") return skill.level;
  if (skill.kind === "level") return `${BOT_PLAN_VERSION}:${skill.level}`;
  return `${BOT_PLAN_VERSION}:fit:${Math.round(skill.targetMs)}`;
}

/** 단계 하나의 글(시험·화면 편의) */
export const levelText = (level: BotLevel): string =>
  botSkillText({ kind: "level", level });

/**
 * 받은 글 읽기. 버전 없는 옛 값은 `legacy`, 이 기기가 모르는 버전·모양은 null(다른 버전 기기의 컴퓨터:
 * 계획을 다시 계산하지 않는다)
 */
export function readBotSkill(text: unknown): BotSkill | null {
  if (typeof text !== "string") return null;
  if ((LEGACY_BOT_LEVELS as readonly string[]).includes(text))
    return { kind: "legacy", level: text as LegacyBotLevel };
  const m = /^(\d+):(.+)$/.exec(text);
  if (!m || Number(m[1]) !== BOT_PLAN_VERSION) return null;
  const rest = m[2] as string;
  if ((BOT_LEVELS as readonly string[]).includes(rest))
    return { kind: "level", level: rest as BotLevel };
  const fit = /^fit:(\d{1,7})$/.exec(rest);
  if (fit) {
    const targetMs = Number(fit[1]);
    if (targetMs >= FIT_MIN_MS && targetMs <= FIT_MAX_MS)
      return { kind: "fit", targetMs };
  }
  return null;
}

/** 버전 없는 옛 값이나 지금 버전의 글인가(모양만, 방 상태 확인) */
export function isBotSkillText(text: unknown): boolean {
  return typeof text === "string" && text.length <= 32 && text.length > 0;
}

/** 초 단위 짧은 시간 글(「약 1분」「약 35초」「약 1분 30초」) */
export function aboutTime(ms: number): string {
  const sec =
    ms >= 60_000 ? Math.round(ms / 10_000) * 10 : Math.round(ms / 1000);
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  if (min === 0) return `약 ${sec}초`;
  return rest === 0 ? `약 ${min}분` : `약 ${min}분 ${rest}초`;
}

/** 보이는 이름. 모르는 버전이면 「컴퓨터(다른 버전)」 */
export function botSkillLabel(text: unknown, size?: number): string {
  const skill = readBotSkill(text);
  if (!skill) return "다른 버전";
  if (skill.kind === "level") return BOT_LEVEL_LABELS[skill.level];
  if (skill.kind === "legacy") return BOT_LEVEL_LABELS[LEGACY_AS[skill.level]];
  const t =
    size === undefined
      ? skill.targetMs
      : fitLevel(size, skill.targetMs).targetMs;
  return `내 실력에 맞춤 ${aboutTime(t)}`;
}
