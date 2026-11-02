import {
  RANKS,
  type Rank,
  type RoundRecord,
  rankOf,
} from "@game/stardraw-core";

import { type CelebrationPlan, METEOR_MS } from "./celebrate";
import { winnerCounts } from "./results";

/*
 * 관측이 끝난 뒤(docs/36 11-44): 등수별 인원 한 줄, 언덕 위 얼굴의 등수 표지와 최고 등수 강조, 1~3등 소감.
 * 화면이 이미 가진 값(회차 기록, 봉인 뒤 공개된 고른 별)으로만 계산한다
 */

/**
 * 결과 카드 아래 등수별 인원 한 줄. 당첨이 있는 등수만 높은 등수부터 「4등 3명 · 5등 12명」, 아무도 없으면 한 문장.
 * 무효 회차는 null(카드가 무효를 따로 말한다). 회차마다 1인 1장이라 당첨 예측서 수가 곧 사람 수다
 */
export function winnersLine(record: RoundRecord): string | null {
  if (record.void) return null;
  const counts = winnerCounts(record);
  const parts = RANKS.filter((r) => counts[r] > 0).map(
    (r) => `${r}등 ${counts[r]}명`,
  );
  return parts.length > 0
    ? parts.join(" · ")
    : "이번 관측에서는 입상자가 없었습니다.";
}

/** 언덕 위 사람마다 등수(봉인 뒤 공개된 고른 별과 당첨 번호로). 당첨이 아닌 사람은 넣지 않는다 */
export function hillRanks(
  record: RoundRecord | null | undefined,
  byPerson: Readonly<Record<string, readonly number[]>> | null | undefined,
): Map<string, Rank> {
  const out = new Map<string, Rank>();
  if (!record || record.void || !byPerson) return out;
  for (const [id, numbers] of Object.entries(byPerson)) {
    const rank = rankOf(record, numbers);
    if (rank) out.set(id, rank);
  }
  return out;
}

/** 언덕에 있는 사람 가운데 가장 높은 등수(없으면 null). 금빛 테두리는 이 등수의 얼굴(들)에 */
export function bestRank(
  ranks: ReadonlyMap<string, Rank>,
  present: readonly string[],
): Rank | null {
  let best: Rank | null = null;
  for (const id of present) {
    const r = ranks.get(id);
    if (r && (best === null || r < best)) best = r;
  }
  return best;
}

/**
 * 언덕에 보일 얼굴(앞에서 `limit`개, 나머지는 +n). 얼굴이 넘칠 때만 당첨된 얼굴을 높은 등수부터 앞으로 당겨
 * 최고 등수가 +n 속에 묻히지 않게 한다. 넘치지 않으면 온 차례 그대로(얼굴이 자리를 옮기지 않게)
 */
export function hillFaces(
  visible: readonly string[],
  ranks: ReadonlyMap<string, Rank>,
  limit: number,
): string[] {
  if (visible.length <= limit || ranks.size === 0)
    return visible.slice(0, limit);
  const ranked = visible
    .filter((id) => ranks.has(id))
    .sort((a, b) => (ranks.get(a) ?? 9) - (ranks.get(b) ?? 9));
  const rest = visible.filter((id) => !ranks.has(id));
  return [...ranked, ...rest].slice(0, limit);
}

/** 관측이 끝난 뒤 등수 표지까지 쉬는 시간(ms). 결과 카드가 올라온 다음에 */
export const MARKS_DELAY_MS = 1500;

/**
 * 관측 연출이 끝나고 등수 표지가 붙기까지(ms). 내가 당첨이면 하늘의 축하 연출(별자리·별똥별·직인)이 끝난 뒤에
 * (언덕과 하늘이 동시에 움직이지 않게)
 */
export function marksDelay(plan: CelebrationPlan | null): number {
  if (!plan) return MARKS_DELAY_MS;
  const end = Math.max(
    plan.sparkleAt + 600,
    plan.sealAt === null ? 0 : plan.sealAt + 900,
    ...plan.meteors.map((m) => m.at + METEOR_MS),
  );
  return Math.max(MARKS_DELAY_MS, end + 700);
}

/** 소감이 떠 있는 시간(ms) */
export const SPEECH_MS = 9000;

/**
 * 이 말이 당첨 소감인지: 관측이 끝난 뒤, 말한 사람이 이 회차 1~3등이고, 관측 뒤 그 사람의 첫 말일 때. 소감이면 그 등수
 */
export function speechRank({
  after,
  rank,
  spokeBefore,
}: {
  /** 말이 온 때 관측 연출이 끝났는지 */
  after: boolean;
  rank: Rank | null | undefined;
  /** 관측이 끝난 뒤 이 사람이 이미 말했는지(이 화면이 받은 것 기준) */
  spokeBefore: boolean;
}): Rank | null {
  if (!after || spokeBefore || !rank || rank > 3) return null;
  return rank;
}

/**
 * 소감이 뜰 시각(ms): 표지가 붙은 뒤이고, 앞 소감이 걷힌 뒤(여럿이 동시에 크게 뜨지 않게 차례로)
 */
export function speechAt(arrived: number, marksAt: number, queueEnd: number) {
  return Math.max(arrived, marksAt, queueEnd);
}
