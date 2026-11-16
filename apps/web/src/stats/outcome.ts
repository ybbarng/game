import type { GameRecord, RoundRecord, StatsMode } from "./records";

/*
 * 게임마다 다른 「이겼나」를 한 모양으로 맞춘다. 같이 한 사람별 기록과 업적이 이것을 쓴다.
 * 무엇을 한 번으로 셀지(판 또는 게임)와 그 기록의 승패는 게임 키트의 `stats.result`가 정한다.
 */

export type Outcome = "win" | "loss" | "draw";

export interface KitResult {
  /** 승패를 세는 단위. 하트처럼 판마다 이기고 지는 것이 없으면 게임 */
  unit: "round" | "game";
  /** 그 기록(`data`)의 승패. 세지 않을 기록(마이티에서 죽어 빠진 판, 그만둔 게임 등)은 null */
  outcome(data: unknown): Outcome | null;
}

/** 한 게임의 기록(판과 게임, 그 게임 것만) */
export interface GameRecords {
  rounds: readonly RoundRecord[];
  games: readonly GameRecord[];
}

/** 업적 하나. 따로 저장하지 않고 기록에서 다시 계산한다(기록과 어긋나지 않게) */
export interface AchievementSpec {
  /** 게임 안에서 겹치지 않는 이름표(화면 시험·key) */
  id: string;
  name: string;
  /** 받는 조건. 문장이므로 마침표로 끝낸다 */
  text: string;
  earned(records: GameRecords): boolean;
}

/** 승패 하나: 언제, 어느 대국, 혼자·친구와, 결과, 같이 한 사람 */
export interface Result {
  at: number;
  /** 대국 키(혼자 `solo:시드`, 온라인 `online:방`) */
  key: string;
  mode: StatsMode;
  outcome: Outcome;
  with?: readonly string[];
}

/** 판 기록 id(`대국 키:판 번호`)에서 대국 키 */
export function matchKey(roundId: string): string {
  const cut = roundId.lastIndexOf(":");
  return cut < 0 ? roundId : roundId.slice(0, cut);
}

/** 기록을 오래된 것부터 승패 목록으로. 세지 않을 기록은 뺀다 */
export function resultsOf(spec: KitResult, records: GameRecords): Result[] {
  const source =
    spec.unit === "round"
      ? records.rounds.map((r) => ({ record: r, key: matchKey(r.id) }))
      : records.games.map((g) => ({ record: g, key: g.id }));
  const out: Result[] = [];
  for (const { record, key } of source) {
    const outcome = spec.outcome(record.data);
    if (outcome === null) continue;
    out.push({
      at: record.at,
      key,
      mode: record.mode,
      outcome,
      ...(record.with ? { with: record.with } : {}),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** 가장 길게 내리 이긴 수(비기거나 지면 끊긴다) */
export function longestStreak(results: readonly Result[]): number {
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r.outcome === "win" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
