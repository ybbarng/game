import {
  aboutTime,
  BOT_LEVEL_LABELS,
  BOT_LEVEL_PEOPLE,
  BOT_LEVELS,
  BOT_TARGET_MS,
  fitLevel,
  fitTargetMs,
  levelText,
} from "@game/cube-ai";

/**
 * 컴퓨터 단계 고르기(컴퓨터와 대결·온라인 방·오늘의 섞기·제한 도전이 함께 쓴다, docs/47 10-1).
 * 값은 단계 글(`levelText`)이고 「내 실력에 맞춤」은 `"fit"`(방이 방장 평균으로 목표 시간 글을 만든다, `CubeRoom.fitText`).
 */
export interface BotChoice {
  value: string;
  label: string;
  /** 예상 평균 시간 「약 1분」 */
  time: string;
  /** 사람으로 치면 */
  people: string;
}

export const FIT_CHOICE = "fit";

/** 크기 `n`의 고를 것. `average`는 이 기기의 그 크기 최근 평균(ms, 없으면 「내 실력에 맞춤」은 초보 목표) */
export function botChoices(
  n: number,
  average: number | null | undefined,
): BotChoice[] {
  const table = BOT_TARGET_MS[n] ?? BOT_TARGET_MS[3];
  const out: BotChoice[] = BOT_LEVELS.map((level) => ({
    value: levelText(level),
    label: BOT_LEVEL_LABELS[level],
    time: aboutTime(table?.[level] ?? 0),
    people: BOT_LEVEL_PEOPLE[level],
  }));
  const fit = fitLevel(n, fitTargetMs(n, average ?? null));
  out.push({
    value: FIT_CHOICE,
    label: "내 실력에 맞춤",
    time: aboutTime(fit.targetMs),
    people: average == null ? "기록이 없어 초보로" : "내 최근 평균",
  });
  return out;
}
