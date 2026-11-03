import type { Clock } from "@game/fair-play";
import { type ActionId, actionsFor, isAvailable } from "../input/actions";
import { chordsFor, type KeyChord, type Keymap } from "../input/keymaps";
import type { CubeMove } from "../view/types";
import { type MatchResult, MoveMatcher, pressesFor } from "./reach";

/**
 * 조작 훈련(`/cube/keys/drill`, docs/47 4절). 화면을 모르는 순수 로직: 단계별 문제 묶음, 약한 키를 더 자주 내는
 * 가중치 고르기, 한 판(30초 또는 30수) 진행·채점, 키 보고 맞히기 퀴즈. 무작위는 `rand`(0 이상 1 미만)를, 시간은
 * `Clock`을 넣는다(시험은 고정 값·`ManualClock`).
 */

export type DrillLevel = "faces" | "primes" | "rotations" | "layers" | "inner";

export const DRILL_LEVELS: { id: DrillLevel; title: string }[] = [
  { id: "faces", title: "면만" },
  { id: "primes", title: "반대 포함" },
  { id: "rotations", title: "큐브 돌리기" },
  { id: "layers", title: "넓게·가운데" },
  { id: "inner", title: "안쪽 층(4×4 이상)" },
];

const FACES = ["R", "L", "U", "D", "F", "B"];
const primeOf = (xs: string[]) => xs.map((x) => `${x}'`);

/** 단계의 큐브 크기. 안쪽 층만 4×4 이상(고른 크기), 나머지는 3×3 */
export function levelSize(level: DrillLevel, bigN = 4): number {
  return level === "inner" ? Math.max(4, Math.min(7, bigN)) : 3;
}

/** 단계에서 낼 수 있는 표기(배치로 거르기 전). 앞 단계를 모두 포함한다 */
export function levelNotations(level: DrillLevel, n: number): string[] {
  const out = [...FACES];
  if (level === "faces") return out;
  out.push(...primeOf(FACES));
  if (level === "primes") return out;
  const rot = ["x", "y", "z"];
  out.push(...rot, ...primeOf(rot));
  if (level === "rotations") return out;
  const wide = FACES.map((f) => `${f}w`);
  out.push(...wide, ...primeOf(wide));
  if (n % 2 === 1) out.push("M", "E", "S", "M'", "E'", "S'");
  if (level === "layers") return out;
  for (const a of actionsFor(n))
    if (
      (a.group === "inner" || (a.group === "wide" && /^\d/.test(a.id))) &&
      !a.id.endsWith("2")
    )
      out.push(a.id);
  return out;
}

/** 지금 배치로 칠 수 있는 문제만 */
export function drillPool(
  keymap: Keymap,
  level: DrillLevel,
  n: number,
): string[] {
  return levelNotations(level, n).filter(
    (t) => isAvailable(n, t) && pressesFor(keymap, n, t).length > 0,
  );
}

// ---------------------------------------------------------------- 기록

export interface KeyStat {
  /** 낸 횟수 */
  tries: number;
  /** 한 번에 맞힌 횟수 */
  hits: number;
  /** 반응 시간 합(ms) */
  ms: number;
}

export type DrillStats = Record<ActionId, KeyStat>;

export function recordAnswer(
  stats: DrillStats,
  action: ActionId,
  ok: boolean,
  ms: number,
): DrillStats {
  const s = stats[action] ?? { tries: 0, hits: 0, ms: 0 };
  return {
    ...stats,
    [action]: {
      tries: s.tries + 1,
      hits: s.hits + (ok ? 1 : 0),
      ms: s.ms + Math.max(0, Math.round(ms)),
    },
  };
}

export const hitRate = (s: KeyStat) => (s.tries > 0 ? s.hits / s.tries : 0);
export const avgMs = (s: KeyStat) => (s.tries > 0 ? s.ms / s.tries : 0);

/**
 * 고를 무게. 처음 보는 키는 조금 더(1.5), 틀린 비율만큼 크게(최대 +4), 느린 만큼(1.5초 넘는 1초마다 +1, 최대 +2).
 * 잘 맞히고 빠른 키는 1.
 */
export function weightOf(s: KeyStat | undefined): number {
  if (!s || s.tries === 0) return 1.5;
  const miss = 1 - hitRate(s);
  const slow = Math.min(2, Math.max(0, (avgMs(s) - 1500) / 1000));
  return 1 + 4 * miss + slow;
}

/** 무게대로 하나 고른다. `avoid`(바로 앞 문제)는 다른 것이 있으면 내지 않는다 */
export function pickWeighted(
  pool: readonly string[],
  stats: DrillStats,
  rand: () => number,
  avoid?: string,
): string {
  const list = pool.length > 1 ? pool.filter((p) => p !== avoid) : [...pool];
  if (list.length === 0) throw new Error("빈 문제 묶음");
  const weights = list.map((p) => weightOf(stats[p]));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [i, p] of list.entries()) {
    r -= weights[i] as number;
    if (r < 0) return p;
  }
  return list[list.length - 1] as string;
}

export interface WeakKey {
  action: ActionId;
  rate: number;
  avgMs: number;
  weight: number;
}

/** 약한 키(세 번 넘게 나온 것 가운데 무게가 큰 차례) */
export function weakKeys(
  stats: DrillStats,
  pool?: readonly string[],
  limit = 5,
): WeakKey[] {
  return Object.entries(stats)
    .filter(([a, s]) => s.tries >= 3 && (!pool || pool.includes(a)))
    .map(([action, s]) => ({
      action,
      rate: hitRate(s),
      avgMs: avgMs(s),
      weight: weightOf(s),
    }))
    .filter((w) => w.weight > 1.25)
    .sort((a, b) => b.weight - a.weight || a.action.localeCompare(b.action))
    .slice(0, limit);
}

// ---------------------------------------------------------------- 한 판

export type RoundLimit =
  | { kind: "time"; ms: number }
  | { kind: "count"; moves: number };

export const ROUND_LIMITS: { id: string; title: string; limit: RoundLimit }[] =
  [
    { id: "time30", title: "30초", limit: { kind: "time", ms: 30_000 } },
    { id: "count30", title: "30수", limit: { kind: "count", moves: 30 } },
  ];

export interface RoundAnswer {
  prompt: string;
  ok: boolean;
  ms: number;
}

export interface RoundSnapshot {
  phase: "ready" | "running" | "done";
  prompt: string;
  hits: number;
  misses: number;
  answers: RoundAnswer[];
  /** 지금 문제에서 이미 틀렸는지 */
  missedThis: boolean;
  startedAt: number;
  endedAt: number | null;
}

/**
 * 「수 보고 치기」 한 판. `start` 뒤 문제가 하나씩 뜨고, 친 수가 맞으면 다음 문제로. 틀리면 그 문제는 「한 번에
 * 못 맞힘」으로 남고 맞힐 때까지 그대로. 30초가 지나거나 30문제를 마치면 끝.
 */
export class DrillRound {
  private snap: RoundSnapshot;
  private stats: DrillStats;
  private matcher: MoveMatcher;
  private promptAt = 0;
  private cancelTimer: (() => void) | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly opts: {
      n: number;
      pool: readonly string[];
      stats: DrillStats;
      limit: RoundLimit;
      clock: Clock;
      rand: () => number;
    },
  ) {
    this.stats = opts.stats;
    const prompt = pickWeighted(opts.pool, this.stats, opts.rand);
    this.matcher = new MoveMatcher(opts.n, prompt);
    this.snap = {
      phase: "ready",
      prompt,
      hits: 0,
      misses: 0,
      answers: [],
      missedThis: false,
      startedAt: 0,
      endedAt: null,
    };
  }

  get snapshot(): RoundSnapshot {
    return this.snap;
  }

  /** 이 판까지 쌓인 기록(판 앞 기록 + 이 판) */
  get statsNow(): DrillStats {
    return this.stats;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(next: Partial<RoundSnapshot>): void {
    this.snap = { ...this.snap, ...next };
    for (const fn of this.listeners) fn();
  }

  start(): void {
    if (this.snap.phase !== "ready") return;
    const now = this.opts.clock.now();
    this.promptAt = now;
    if (this.opts.limit.kind === "time")
      this.cancelTimer = this.opts.clock.after(this.opts.limit.ms, () =>
        this.finish(),
      );
    this.set({ phase: "running", startedAt: now });
  }

  /** 남은 시간(ms, 시간 제한일 때) */
  remainingMs(): number | null {
    if (this.opts.limit.kind !== "time") return null;
    if (this.snap.phase === "ready") return this.opts.limit.ms;
    const end = this.snap.endedAt ?? this.opts.clock.now();
    return Math.max(0, this.opts.limit.ms - (end - this.snap.startedAt));
  }

  feed(move: CubeMove): MatchResult | null {
    if (this.snap.phase !== "running") return null;
    const r = this.matcher.feed(move);
    if (r === "partial") return r;
    if (r === "miss") {
      this.set({ misses: this.snap.misses + 1, missedThis: true });
      return r;
    }
    const now = this.opts.clock.now();
    const ok = !this.snap.missedThis;
    const answer = { prompt: this.snap.prompt, ok, ms: now - this.promptAt };
    this.stats = recordAnswer(this.stats, answer.prompt, ok, answer.ms);
    const answers = [...this.snap.answers, answer];
    const hits = this.snap.hits + 1;
    if (this.opts.limit.kind === "count" && hits >= this.opts.limit.moves) {
      this.set({ hits, answers, missedThis: false });
      this.finish();
      return r;
    }
    const prompt = pickWeighted(
      this.opts.pool,
      this.stats,
      this.opts.rand,
      this.snap.prompt,
    );
    this.matcher = new MoveMatcher(this.opts.n, prompt);
    this.promptAt = now;
    this.set({ hits, answers, prompt, missedThis: false });
    return r;
  }

  finish(): void {
    if (this.snap.phase === "done") return;
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.set({ phase: "done", endedAt: this.opts.clock.now() });
  }
}

export interface RoundSummary {
  hits: number;
  misses: number;
  /** 한 번에 맞힌 비율 */
  firstTry: number;
  avgMs: number;
}

export function summarize(s: RoundSnapshot): RoundSummary {
  const n = s.answers.length;
  return {
    hits: s.hits,
    misses: s.misses,
    firstTry: n > 0 ? s.answers.filter((a) => a.ok).length / n : 0,
    avgMs: n > 0 ? s.answers.reduce((a, b) => a + b.ms, 0) / n : 0,
  };
}

// ---------------------------------------------------------------- 키 보고 맞히기

export interface QuizQuestion {
  /** 빛나는 키(조합 포함) */
  chord: KeyChord;
  answer: ActionId;
  choices: ActionId[];
}

/**
 * 키 하나로 바로 치는 문제만 낸다. 보기 넷: 정답 + 같은 키의 다른 층·같은 면 다른 방향을 먼저, 모자라면 묶음에서.
 */
export function makeQuiz(
  keymap: Keymap,
  pool: readonly string[],
  stats: DrillStats,
  rand: () => number,
  avoid?: string,
): QuizQuestion | null {
  const direct = pool.filter((p) => chordsFor(keymap, p).length > 0);
  if (direct.length < 4) return null;
  const answer = pickWeighted(direct, stats, rand, avoid);
  const chords = chordsFor(keymap, answer);
  const chord = chords[Math.floor(rand() * chords.length)] as KeyChord;
  const near = direct.filter(
    (p) =>
      p !== answer &&
      (p[0] === answer[0] ||
        chordsFor(keymap, p).some((c) => c.code === chord.code)),
  );
  const far = direct.filter((p) => p !== answer && !near.includes(p));
  const others: string[] = [];
  for (const list of [shuffle(near, rand), shuffle(far, rand)])
    for (const p of list) if (others.length < 3) others.push(p);
  const choices = shuffle([answer, ...others], rand);
  return { chord, answer, choices };
}

export function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** 시험·화면이 함께 쓰는 작은 결정적 난수(mulberry32) */
export function seededRand(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
