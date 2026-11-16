import {
  type AchievementSpec,
  type GameRecords,
  type KitResult,
  longestStreak,
  resultsOf,
} from "./outcome";
import type { RoundRecord } from "./records";

/*
 * 업적: 모든 게임에 같은 것(첫 승·연승·판 수·친구와 첫 승)과 게임 키트가 정한 그 게임만의 것.
 * 받았는지는 저장하지 않고 늘 기록에서 다시 계산한다. 기록을 지우면 업적도 사라지고, 가져오면 함께 온다.
 */

/** 모든 게임에 같은 업적. 하트처럼 게임으로 승패를 세면 「판」 대신 「게임」이라 쓴다 */
export function commonAchievements(result: KitResult): AchievementSpec[] {
  const unit = result.unit === "round" ? "판" : "게임";
  const wins = (records: GameRecords) =>
    resultsOf(result, records).filter((r) => r.outcome === "win");
  const streak = (n: number, name: string): AchievementSpec => ({
    id: `streak-${n}`,
    name,
    text: `${n}${unit}을 내리 이깁니다.`,
    earned: (records) => longestStreak(resultsOf(result, records)) >= n,
  });
  return [
    {
      id: "first-win",
      name: "첫 승",
      text: `처음으로 한 ${unit}을 이깁니다.`,
      earned: (records) => wins(records).length > 0,
    },
    streak(3, "3연승"),
    streak(5, "5연승"),
    streak(10, "10연승"),
    {
      id: "played-10",
      name: "열 판",
      text: "열 판을 끝까지 합니다.",
      earned: (records) => records.rounds.length >= 10,
    },
    {
      id: "played-100",
      name: "백 판",
      text: "백 판을 끝까지 합니다.",
      earned: (records) => records.rounds.length >= 100,
    },
    {
      id: "online-win",
      name: "친구와 첫 승",
      text: `친구와 하기에서 처음으로 한 ${unit}을 이깁니다.`,
      earned: (records) => wins(records).some((r) => r.mode === "online"),
    },
  ];
}

export interface AchievementState {
  id: string;
  name: string;
  text: string;
  earned: boolean;
}

/** 한 게임의 업적 모두(같은 것 먼저, 그 게임만의 것 다음)와 받았는지. `records`는 그 게임 기록만 */
export function achievementsOf(
  spec: { result: KitResult; achievements: readonly AchievementSpec[] },
  records: GameRecords,
): AchievementState[] {
  return [...commonAchievements(spec.result), ...spec.achievements].map(
    (a) => ({
      id: a.id,
      name: a.name,
      text: a.text,
      earned: a.earned(records),
    }),
  );
}

/** 게임 키트가 업적을 짧게 적는 도우미: 판 기록 하나라도 조건에 맞으면 받는다 */
export function anyRound<D>(
  id: string,
  name: string,
  text: string,
  test: (data: D, record: RoundRecord) => boolean,
): AchievementSpec {
  return {
    id,
    name,
    text,
    earned: (records) => records.rounds.some((r) => test(r.data as D, r)),
  };
}

/** 판 기록 가운데 조건에 맞는 것이 n개 이상이면 받는다 */
export function countRounds<D>(
  id: string,
  name: string,
  text: string,
  n: number,
  test: (data: D) => boolean,
): AchievementSpec {
  return {
    id,
    name,
    text,
    earned: (records) =>
      records.rounds.filter((r) => test(r.data as D)).length >= n,
  };
}
