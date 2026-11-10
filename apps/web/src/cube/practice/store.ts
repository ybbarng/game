// 공식 연습 기록(이 기기 localStorage, 키 `cube.practice.v1`). 따라 치기 시간은 결과 모양으로 채점하는 보고 치기·
// 옛 공식 훈련(`cube.train.v1`)과 섞지 않으려 따로 둔다. 모양은 같은 TrainBook이라 약한 것 다시 내기를 그대로 쓴다.
import {
  type CaseStats,
  type TrainBook,
  withFail,
  withSolve,
} from "../learn/progress";
import type { PracticeMode } from "./round";

export const PRACTICE_KEY = "cube.practice.v1";

/** 따라 치기 판을 이만큼 마친 단계는 판 끝에 「외워서 쳐 보기」를 권한다(잠그지는 않는다) */
export const SEE_SUGGEST_ROUNDS = 3;

export interface PracticeRecord {
  /** 따라 치기 상황별 기록(틀린 수가 있던 문제는 fails에도 하나) */
  follow: TrainBook;
  /** 단계별로 마친 판 수 */
  rounds: Record<string, { follow: number; see: number }>;
  /** 마지막으로 연 단계 */
  last?: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStats = (v: unknown): v is CaseStats =>
  isObject(v) &&
  typeof v.solves === "number" &&
  typeof v.fails === "number" &&
  Array.isArray(v.times) &&
  Array.isArray(v.moves);

export function loadPractice(storage = defaultStorage()): PracticeRecord {
  const out: PracticeRecord = { follow: {}, rounds: {} };
  try {
    const raw: unknown = JSON.parse(storage?.getItem(PRACTICE_KEY) ?? "null");
    if (!isObject(raw)) return out;
    if (isObject(raw.follow))
      for (const [id, s] of Object.entries(raw.follow))
        if (isStats(s)) out.follow[id] = s;
    if (isObject(raw.rounds))
      for (const [id, r] of Object.entries(raw.rounds))
        if (isObject(r))
          out.rounds[id] = {
            follow: typeof r.follow === "number" ? r.follow : 0,
            see: typeof r.see === "number" ? r.see : 0,
          };
    if (typeof raw.last === "string") out.last = raw.last;
  } catch {
    // 깨진 기록은 빈 기록으로
  }
  return out;
}

function save(
  rec: PracticeRecord,
  storage: StorageLike | null,
): PracticeRecord {
  try {
    storage?.setItem(PRACTICE_KEY, JSON.stringify(rec));
  } catch {
    // 저장소가 막혔으면 이번 기록만 잃는다
  }
  return rec;
}

/** 따라 치기 문제 하나를 마쳤다 */
export function recordFollow(
  caseId: string,
  ms: number,
  moves: number,
  misses: number,
  storage = defaultStorage(),
): PracticeRecord {
  const rec = loadPractice(storage);
  let follow = withSolve(rec.follow, caseId, ms, moves);
  if (misses > 0) follow = withFail(follow, caseId);
  return save({ ...rec, follow }, storage);
}

/** 한 판을 마쳤다 */
export function recordRound(
  stageId: string,
  mode: PracticeMode,
  storage = defaultStorage(),
): PracticeRecord {
  const rec = loadPractice(storage);
  const before = rec.rounds[stageId] ?? { follow: 0, see: 0 };
  const rounds = {
    ...rec.rounds,
    [stageId]: { ...before, [mode]: before[mode] + 1 },
  };
  return save({ ...rec, rounds }, storage);
}

/** 마지막으로 연 단계 */
export function rememberStage(
  stageId: string,
  storage = defaultStorage(),
): PracticeRecord {
  return save({ ...loadPractice(storage), last: stageId }, storage);
}

/** 판 끝에 「외워서 쳐 보기」를 권하나 */
export function suggestSee(rec: PracticeRecord, stageId: string): boolean {
  return (rec.rounds[stageId]?.follow ?? 0) >= SEE_SUGGEST_ROUNDS;
}
