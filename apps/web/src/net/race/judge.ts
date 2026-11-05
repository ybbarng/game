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

/** 한 시각(맞춘 시각·중간 지점 시각)을 증인 하한으로 확인한 값 */
export interface CheckedTime {
  /** 인정 시각 = max(보고, 쓴 하한). 다툼이면 없다 */
  accepted?: number;
  /** 쓴 하한(약하지 않은 하한의 가운데 값, 짝수면 낮은 쪽). 없으면 null */
  used: number | null;
  /** 하한을 낸 기기가 하나뿐이고 하한이 보고보다 `disputeMs` 넘게 늦다(누가 거짓인지 가릴 수 없다) */
  disputed: boolean;
  /** 증인이 있었는데 쓸 수 있는 하한이 하나도 없다(끊김) */
  weak: boolean;
}

/**
 * 보고 시각과 증인들이 본 하한으로 인정 시각을 정한다. 맞춘 시각(`judge`)과 중간 지점 시각(체력바 대결 등)이 같은 규칙을 쓴다.
 * 1:1처럼 하한을 낸 기기가 하나뿐이면 둘 중 누가 거짓인지 가릴 수 없다: 증인이 하한을 부풀렸을 수도(game-85 ①),
 * 본인이 시간을 줄여 보고했을 수도 있다. 폭을 넘으면 어느 값도 믿지 않는다(인정 시각 없음)
 */
export function checkTime(
  reported: number,
  bounds: Record<string, number | null>,
  disputeMs?: number,
): CheckedTime {
  const strong = Object.values(bounds).filter((b): b is number => b !== null);
  const used = lowerMedian(strong);
  // 증인이 아무도 없으면(같은 기기의 컴퓨터만 있는 판) 약한 것이 아니라 잴 사람이 없는 것이다
  const weak = used === null && Object.keys(bounds).length > 0;
  const disputed =
    used !== null &&
    strong.length === 1 &&
    disputeMs !== undefined &&
    used - reported > disputeMs;
  return disputed
    ? { used, disputed, weak }
    : {
        accepted: used === null ? reported : Math.max(reported, used),
        used,
        disputed,
        weak,
      };
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
      const checked = checkTime(rec.reported, bounds, input.disputeMs);
      result.reported = rec.reported;
      result.bounds = sortedBounds;
      result.usedBound = checked.used;
      result.weak = checked.weak;
      // 다툼이면 인정 시간 없음, 순위 없음
      if (checked.disputed) {
        result.disputed = true;
        result.unranked = true;
      } else result.accepted = checked.accepted as number;
    }
    players[rec.id] = result;
  }
  // 맞춘 사람(순위 있음) → 맞췄지만 판정 못 함(순위 없음) → 못 맞춤 → 기권
  const rank = (p: PlayerResult) =>
    p.status === "done" ? (p.unranked ? 1 : 0) : p.status === "dnf" ? 2 : 3;
  const ranking = Object.values(players)
    .sort((x, y) => {
      const byStatus = rank(x) - rank(y);
      if (byStatus) return byStatus;
      if (x.status === "done" && !x.unranked) {
        const byTime =
          (x.accepted as number) - (y.accepted as number) ||
          (x.reported as number) - (y.reported as number);
        if (byTime) return byTime;
      }
      return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
    })
    .map((p) => p.id);
  // 판에 든 사람(기권 빼고)이 둘 이하인데 다툼이 있으면 그 판은 판정하지 않는다(승패·누적에 넣지 않는다).
  // 셋 이상이면 다툼인 사람만 순위 없음으로 빼고 나머지끼리 가른다
  const inRace = Object.values(players).filter((p) => p.status !== "forfeit");
  const noDecision =
    input.cancelled === undefined &&
    inRace.length <= 2 &&
    inRace.some((p) => p.disputed);
  return {
    ranking,
    players,
    ...(noDecision ? { noDecision: true } : {}),
    ...(input.cancelled !== undefined ? { cancelled: input.cancelled } : {}),
  };
}
