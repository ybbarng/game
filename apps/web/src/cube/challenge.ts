// 제한 도전(docs/51 2-3, docs/47 8-10). 혼자 맞추기에 체력바를 단 것이다. 화면을 모르는 규칙·점수와 이 기기 저장.
//
// - 시간 체력: 처음 시간에서 줄어들고, 이정표 칩 하나(같은 순간에 켜진 이정표는 하나)를 지날 때마다 몇 초씩 채워진다.
//   0이 되면 끝. 다 맞춘 수는 채우지 않는다(남은 시간이 점수라 마지막 칩이 점수를 부풀리지 않게).
// - 수 체력: 이 섞기의 짧은 풀이 수 + 여유. 면 돌리기 하나에 1씩 깎인다. 세는 법은 십자 훈련과 같다(HTM: 같은 층을
//   이어 돌리면 한 수, 되돌려 지우면 돌려받음, 큐브 돌리기는 깎지 않음, 가운데 층은 2). 체력을 넘는 수를 두면 끝.
// - 점수: 지난 단계(칩) 수 × 100 + 남은 체력(시간은 0.1초에 1점, 수는 한 수에 10점). 같은 크기·체력·어려움끼리만 견준다.
// - 체력의 실제 진행(시계·수마다)은 `SolveSession`의 `limit`이 맡는다. 시간은 `Clock`으로 잰다.

import type { CubeMove } from "@game/cube-engine";

import type { Split } from "./records";

export type ChallengeKind = "time" | "moves";
export type ChallengeLevel = "easy" | "normal" | "hard";

/** 고를 수 있는 크기(앞이 기본). 수 체력에 짧은 풀이가 필요해 2×2·3×3만 */
export const CHALLENGE_SIZES = [3, 2] as const;
export const CHALLENGE_KINDS: readonly ChallengeKind[] = ["time", "moves"];
export const CHALLENGE_LEVELS: readonly ChallengeLevel[] = [
  "easy",
  "normal",
  "hard",
];

export const KIND_LABEL: Record<ChallengeKind, string> = {
  time: "시간",
  moves: "수",
};
export const LEVEL_LABEL: Record<ChallengeLevel, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

/** 시간 체력: [처음 시간, 칩마다 채움](ms). 3×3 보통이 정의의 60초 */
const TIME_RULES: Record<number, Record<ChallengeLevel, [number, number]>> = {
  3: {
    easy: [90_000, 15_000],
    normal: [60_000, 10_000],
    hard: [40_000, 6_000],
  },
  2: {
    easy: [45_000, 15_000],
    normal: [30_000, 10_000],
    hard: [20_000, 6_000],
  },
};

/**
 * 수 체력의 여유(짧은 풀이에 더하는 수). 초보자 해법은 3×3에 100수 안팎, 프리드리히는 55~65수라 쉬움은 초보자 해법,
 * 보통은 서툰 프리드리히, 어려움은 익숙한 프리드리히가 겨우 닿게 잡았다
 */
const SPARE: Record<number, Record<ChallengeLevel, number>> = {
  3: { easy: 120, normal: 80, hard: 50 },
  2: { easy: 60, normal: 40, hard: 25 },
};

/** 짧은 풀이를 못 구했을 때 쓰는 값(신의 수 근처) */
export const SHORT_FALLBACK: Record<number, number> = { 2: 9, 3: 20 };

/** 체력이 이 몫 아래로 내려가면 경고(막대 색·소리 한 번) */
export const LOW_RATIO = 0.2;

export type SessionLimit =
  | { kind: "time"; startMs: number; refillMs: number }
  | { kind: "moves"; budget: number };

export function timeRule(
  n: number,
  level: ChallengeLevel,
): { startMs: number; refillMs: number } {
  const [startMs, refillMs] = (TIME_RULES[n] ?? TIME_RULES[3])?.[level] ?? [
    60_000, 10_000,
  ];
  return { startMs, refillMs };
}

export function spareMoves(n: number, level: ChallengeLevel): number {
  return (SPARE[n] ?? SPARE[3])?.[level] ?? 80;
}

/** 한 판의 체력. 수 체력은 짧은 풀이(`short`)가 있어야 정해진다 */
export function limitFor(
  n: number,
  kind: ChallengeKind,
  level: ChallengeLevel,
  short: number | null,
): SessionLimit {
  if (kind === "time") return { kind: "time", ...timeRule(n, level) };
  return {
    kind: "moves",
    budget: (short ?? SHORT_FALLBACK[n] ?? 20) + spareMoves(n, level),
  };
}

/** 규칙 한 줄(고를 때 보인다) */
export function ruleText(
  n: number,
  kind: ChallengeKind,
  level: ChallengeLevel,
): string {
  if (kind === "time") {
    const { startMs, refillMs } = timeRule(n, level);
    return `처음 ${startMs / 1000}초 · 단계마다 +${refillMs / 1000}초`;
  }
  return `짧은 풀이 + ${spareMoves(n, level)}수`;
}

/** 점수: 지난 단계 × 100 + 남은 체력(시간 0.1초에 1점, 수 한 수에 10점) */
export function challengeScore(
  kind: ChallengeKind,
  stages: number,
  left: number,
): number {
  const rest = kind === "time" ? Math.floor(left / 100) : left * 10;
  return stages * 100 + Math.max(0, rest);
}

/**
 * 수 체력의 수 세기(HTM). 십자 훈련(`cross/session.ts`)과 같은 규칙: 같은 층을 이어 돌리면 합치고(U U → U2 한 수),
 * 돌려 지우면 빼고(U U′ → 0), 큐브 돌리기는 0수로 합치기만 끊는다. 가운데 층(M·E·S)은 2수
 */
export class MoveCounter {
  private stack: { key: string; turns: number; cost: number }[] = [];

  get count(): number {
    let c = 0;
    for (const x of this.stack) c += x.cost;
    return c;
  }

  push(move: CubeMove, rotation: boolean, n: number): void {
    if (rotation) {
      this.stack.push({ key: "rot", turns: 0, cost: 0 });
      return;
    }
    const key = `${move.axis}${move.from}${move.to}`;
    const top = this.stack.at(-1);
    if (top && top.key === key) {
      top.turns = (((top.turns + move.turns) % 4) + 4) % 4;
      if (top.turns === 0) this.stack.pop();
      return;
    }
    // 홀수 크기의 가운데 한 층만 돌리기(3×3의 M·E·S)
    const middle =
      n % 2 === 1 && move.from === move.to && move.from === (n + 1) / 2;
    this.stack.push({ key, turns: move.turns, cost: middle ? 2 : 1 });
  }

  reset(): void {
    this.stack = [];
  }
}

/** 지난 단계(칩) 수: 같은 순간에 켜진 이정표는 하나 */
export function stageCount(splits: readonly Split[]): number {
  return new Set(splits.map((s) => s.ms)).size;
}

// ── 이 기기 저장(`cube.challenge.v1`) ──────────────────────────────

export const CHALLENGE_KEY = "cube.challenge.v1";
export const MAX_CHALLENGE = 300;

export interface ChallengeEntry {
  /** 끝난 시각(Date.now) */
  at: number;
  n: number;
  kind: ChallengeKind;
  level: ChallengeLevel;
  /** 다 맞췄는가 */
  ok: boolean;
  score: number;
  /** 지난 단계(칩) 수 */
  stages: number;
  /** 남은 체력(시간은 ms, 수는 수) */
  left: number;
  /** 맞추기 시작부터 끝날 때까지(ms). 살펴보기에서 끝났으면 0 */
  ms: number;
  /** 체력으로 센 수(HTM) */
  moves: number;
  /** 수 체력: 처음 체력, 시간 체력: 처음 시간(ms) */
  budget: number;
  /** 수 체력: 짧은 풀이 수 */
  short?: number;
  scramble: string;
  seed?: number;
  /** 구간 기록(`records.ts`의 `formatSplits` 꼴) */
  splits?: string;
  /** 왜 끝났나(성공이면 없음) */
  reason?: "time" | "moves" | "inspection";
}

export interface ChallengePick {
  n: number;
  kind: ChallengeKind;
  level: ChallengeLevel;
}

export const DEFAULT_PICK: ChallengePick = {
  n: 3,
  kind: "time",
  level: "normal",
};

interface Book {
  version: 1;
  entries: ChallengeEntry[];
  pick?: ChallengePick;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const isKind = (x: unknown): x is ChallengeKind =>
  x === "time" || x === "moves";
const isLevel = (x: unknown): x is ChallengeLevel =>
  x === "easy" || x === "normal" || x === "hard";

function isEntry(x: unknown): x is ChallengeEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Partial<ChallengeEntry>;
  return (
    typeof e.at === "number" &&
    typeof e.n === "number" &&
    isKind(e.kind) &&
    isLevel(e.level) &&
    typeof e.ok === "boolean" &&
    typeof e.score === "number" &&
    Number.isFinite(e.score)
  );
}

function readBook(storage: StorageLike | null): Book {
  try {
    const text = storage?.getItem(CHALLENGE_KEY);
    if (!text) return { version: 1, entries: [] };
    const data = JSON.parse(text) as Partial<Book> | null;
    if (!data || typeof data !== "object") return { version: 1, entries: [] };
    const entries = Array.isArray(data.entries)
      ? data.entries.filter(isEntry)
      : [];
    const p = data.pick;
    const pick =
      p &&
      CHALLENGE_SIZES.includes(p.n as 2 | 3) &&
      isKind(p.kind) &&
      isLevel(p.level)
        ? { n: p.n, kind: p.kind, level: p.level }
        : undefined;
    const { pick: _raw, ...rest } = data;
    return {
      ...rest,
      version: 1,
      entries: [...entries].sort((a, b) => b.at - a.at),
      ...(pick ? { pick } : {}),
    } as Book;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeBook(book: Book, storage: StorageLike | null): void {
  try {
    storage?.setItem(CHALLENGE_KEY, JSON.stringify(book));
  } catch {
    // 저장을 못 해도 이번 화면에서는 보인다
  }
}

/** 저장된 도전(새것이 앞). 깨진 칸·모르는 꼴은 건너뛴다 */
export function loadChallenges(
  storage: StorageLike | null = defaultStorage(),
): ChallengeEntry[] {
  return readBook(storage).entries;
}

/** 도전 하나를 더하고 새 목록을 돌려준다 */
export function addChallenge(
  entry: ChallengeEntry,
  storage: StorageLike | null = defaultStorage(),
): ChallengeEntry[] {
  const book = readBook(storage);
  const entries = [entry, ...book.entries].slice(0, MAX_CHALLENGE);
  writeBook({ ...book, entries }, storage);
  return entries;
}

/** 지난번 고른 크기·체력·어려움(없으면 기본) */
export function loadPick(
  storage: StorageLike | null = defaultStorage(),
): ChallengePick {
  return readBook(storage).pick ?? DEFAULT_PICK;
}

export function savePick(
  pick: ChallengePick,
  storage: StorageLike | null = defaultStorage(),
): void {
  const book = readBook(storage);
  writeBook({ ...book, pick }, storage);
}

/** 같은 크기·체력·어려움의 기록 */
export function entriesFor(
  entries: readonly ChallengeEntry[],
  pick: ChallengePick,
): ChallengeEntry[] {
  return entries.filter(
    (e) => e.n === pick.n && e.kind === pick.kind && e.level === pick.level,
  );
}

/** 같은 크기·체력·어려움의 가장 높은 점수(없으면 null) */
export function bestScore(
  entries: readonly ChallengeEntry[],
  pick: ChallengePick,
): number | null {
  let best: number | null = null;
  for (const e of entriesFor(entries, pick))
    if (best === null || e.score > best) best = e.score;
  return best;
}
