/**
 * 판정 계산(순수 함수). 기기마다 같은 입력을 넣으면 같은 결과가 나온다.
 * 시계·전송은 모르고, `race-session.ts`가 모은 값만 받는다.
 */
import type {
  PlayerResult,
  RaceResult,
  SuspicionFlags,
  SuspicionRules,
} from "./types";

/**
 * 도착 시각 하한(docs/46 3-2). 관측자 B가 자기 공개값을 보낸 시각 s와 A의 "맞췄다"가 닿은 시각 a로
 * `(a − s) − 살펴보기 − cap`. 모두 B 시계 안 길이라 기기 사이 시계 차이와 상관없다
 */
export function arrivalBound(
  sentRevealAt: number,
  arrivedAt: number,
  inspectionMs: number,
  capMs: number,
): number {
  return arrivedAt - sentRevealAt - inspectionMs - capMs;
}

/**
 * 가운데 값. 개수가 짝수면 **낮은 쪽**을 쓴다. 관측자 둘(3명 판)일 때 한 사람이 남의 도착 시각을
 * 늦게 보고해 그 사람 시간을 늘리지 못하게 하려는 것이다(정직한 사람을 벌하지 않는 쪽, docs/43 1-2).
 * 대신 두 관측자 중 한 사람이 거짓 보고자와 짜고 낮은 하한을 내면 그 둘의 이득은 막지 못한다(README 남은 일)
 */
export function lowerMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor((sorted.length - 1) / 2)] as number;
}

/** 수 사이 간격의 변동 계수(표준편차 / 평균). 간격이 둘 아래이거나 평균이 0이면 null */
export function intervalCv(times: number[]): number | null {
  if (times.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++)
    gaps.push((times[i] as number) - (times[i - 1] as number));
  const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
  if (mean <= 0) return null;
  const variance =
    gaps.reduce((x, g) => x + (g - mean) * (g - mean), 0) / gaps.length;
  return Math.sqrt(variance) / mean;
}

/**
 * 보고된 수 시각으로 본 그럴듯함 표시. 결과는 바꾸지 않는다.
 * `moveTimes`는 모든 수(몰아친 수), `turnTimes`는 센 수(수가 적음·고른 간격·첫 수 빠르기). 없으면 모든 수로 센다
 */
export function suspicionFlags(
  moveTimes: number[],
  rules: SuspicionRules | undefined,
  turnTimes: number[] = moveTimes,
): SuspicionFlags {
  const windowMs = rules?.windowMs ?? 500;
  let best = 0;
  let lo = 0;
  for (let hi = 0; hi < moveTimes.length; hi++) {
    while ((moveTimes[hi] as number) - (moveTimes[lo] as number) >= windowMs)
      lo++;
    best = Math.max(best, hi - lo + 1);
  }
  const cv = intervalCv(turnTimes);
  const firstN = rules?.fastStartMoves;
  return {
    maxMovesInWindow: best,
    peakMovesPerSecond: (best * 1000) / windowMs,
    burst:
      rules?.maxMovesInWindow !== undefined && best > rules.maxMovesInWindow,
    fewMoves:
      rules?.minMoves !== undefined && turnTimes.length < rules.minMoves,
    even:
      rules?.evenCv !== undefined &&
      turnTimes.length >= (rules.evenMinMoves ?? 0) &&
      cv !== null &&
      cv < rules.evenCv,
    fastStart:
      firstN !== undefined &&
      rules?.fastStartMs !== undefined &&
      turnTimes.length >= firstN &&
      (turnTimes[firstN - 1] as number) <= rules.fastStartMs,
    intervalCv: cv,
  };
}

/** 판정에 넣는 한 사람의 기록 */
export interface PlayerRecord {
  id: string;
  /** 판 끝에 아직 "playing"이면 시간 안에 못 맞춘 것으로 본다 */
  status: "playing" | "done" | "dnf" | "forfeit";
  reason?: string;
  /** 보고된 수 시각(순서대로, 확인된 만큼) */
  moveTimes: number[];
  /** 그 가운데 센 수의 시각(`RaceGame.isTurn`). 없으면 모든 수를 센다 */
  turnTimes?: number[];
  reported?: number;
}

export interface JudgeInput {
  records: PlayerRecord[];
  /** bounds[of][observer] = 관측자가 본 하한(null = 확인 약함). 관측자 = of를 뺀 판의 사람 */
  bounds: Record<string, Record<string, number | null>>;
  suspicion?: SuspicionRules;
  /**
   * 하한을 낸 기기가 하나뿐일 때 하한 − 보고가 이보다 크면 가르지 않는다(「확인 안 됨」, 보고 시간을 쓴다).
   * 없으면 늘 하한을 쓴다
   */
  disputeMs?: number;
  cancelled?: string;
}

export function judge(input: JudgeInput): RaceResult {
  const players: Record<string, PlayerResult> = {};
  for (const rec of input.records) {
    const status = rec.status === "playing" ? "dnf" : rec.status;
    const reason =
      rec.status === "playing" ? "시간 안에 맞추지 못함" : rec.reason;
    const result: PlayerResult = {
      id: rec.id,
      status,
      moves: rec.moveTimes.length,
      ...(rec.turnTimes !== undefined ? { turns: rec.turnTimes.length } : {}),
      ...(reason !== undefined ? { reason } : {}),
    };
    if (status !== "forfeit")
      result.flags = suspicionFlags(
        rec.moveTimes,
        input.suspicion,
        rec.turnTimes,
      );
    if (status === "done" && rec.reported !== undefined) {
      const bounds = input.bounds[rec.id] ?? {};
      const sortedBounds: Record<string, number | null> = {};
      for (const k of Object.keys(bounds).sort())
        sortedBounds[k] = bounds[k] as number | null;
      const strong = Object.values(bounds).filter(
        (b): b is number => b !== null,
      );
      const used = lowerMedian(strong);
      result.reported = rec.reported;
      result.bounds = sortedBounds;
      result.usedBound = used;
      // 증인이 아무도 없으면(같은 기기의 컴퓨터만 있는 판) 약한 것이 아니라 잴 사람이 없는 것이다
      result.weak = used === null && Object.keys(bounds).length > 0;
      // 1:1처럼 하한을 낸 기기가 하나뿐이면 그 한 기기가 마음대로 늘릴 수 있다(game-85 ①). 폭을 넘으면 가르지 않는다
      const disputed =
        used !== null &&
        strong.length === 1 &&
        input.disputeMs !== undefined &&
        used - rec.reported > input.disputeMs;
      if (disputed) result.disputed = true;
      result.accepted =
        used === null || disputed ? rec.reported : Math.max(rec.reported, used);
    }
    players[rec.id] = result;
  }
  const order: Record<string, number> = { done: 0, dnf: 1, forfeit: 2 };
  const ranking = Object.values(players)
    .sort((x, y) => {
      const byStatus =
        (order[x.status] as number) - (order[y.status] as number);
      if (byStatus) return byStatus;
      if (x.status === "done") {
        const byTime =
          (x.accepted as number) - (y.accepted as number) ||
          (x.reported as number) - (y.reported as number);
        if (byTime) return byTime;
      }
      return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
    })
    .map((p) => p.id);
  return {
    ranking,
    players,
    ...(input.cancelled !== undefined ? { cancelled: input.cancelled } : {}),
  };
}
