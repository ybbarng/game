import {
  applyMoves,
  type CubeMove,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { PieceMark } from "../piece-marks";
import { DEFAULT_HERO_HIGHLIGHT, type HeroHighlight } from "./highlight";
import type { HeroSize, HeroSolve } from "./methods";

/**
 * 큐브 첫 화면 위 그림의 연출 순서(docs/47 0절 2026-11-04). 3D 그리기와 떼어 둔 작은 상태 기계다.
 *
 *   맞춘 큐브 → 무작위 섞기(빠르게, 큐브 돌리기·가운데 층 포함) → 멈춤 → (홀수 크기) 방향 맞추기
 *   → 해법대로 맞추기(단계 사이 멈춤) → 멈춤 → 다시 섞기 …
 *
 * 해법은 받은 차례(`methods`, 설정의 「번갈아」면 그 크기의 해법 모두)를 돌아가며 쓴다. 풀이는 `solve`(워커)가
 * 섞는 동안 미리 만든다. 워커가 `workerWait` 안에 답하지 않으면 섞은 뒤 멈춤 동안 화면 스레드(`solveHere`)에서
 * 풀어, 섞기가 끝나고 몇 초 안에 반드시 맞추기 시작한다. 못 풀면 그 판을 건너뛰고 맞춘 큐브에서 다음 해법으로 다시 섞는다.
 * 시간은 `Clock`으로 재서 시험은 `ManualClock`으로 정확히 옮긴다.
 */

export const SCRAMBLING_LABEL = "섞는 중";
export const SOLVED_LABEL = "맞춤";

export interface HeroTiming {
  /** 섞기 한 수 */
  scrambleMove: number;
  /**
   * 섞은 뒤 멈춤. 섞인 큐브를 잠깐 보여 주고 풀기 시작한다(사용자 「잠깐만 쉬었다가(3~5초 정도?)」, 2026-11-05).
   * 풀이가 이 안에 와 있으면 섞기가 끝나고 정확히 이만큼 뒤에 맞추기 시작한다
   */
  afterScramble: number;
  /** 맞추기 한 수 */
  solveMove: number;
  /** 단계 사이 멈춤 */
  stage: number;
  /** 단계 안에서 다음 모양을 살피는 멈춤 */
  look: number;
  /**
   * 조각을 찾는 둘러보기와 그 되돌리기 한 번(2026-11-05). 살짝 기울였다 돌아오는 느낌으로 보통 수보다도 빠르게
   * (큐브 돌리기는 보통 수의 1.5배)
   */
  searchMove: number;
  /** 강조(넣을 곳·찾은 조각, 맞춘 조각)를 보이는 멈춤 */
  mark: number;
  /** 다 맞춘 뒤 멈춤 */
  solved: number;
  /** 섞는 수 */
  scrambleLength: number;
  /**
   * 워커 답을 기다리는 상한(풀이를 부탁한 때부터). 넘으면 워커 답은 버리고 화면 스레드에서 바로 푼다
   * (`HeroLoopOptions.solveHere`). 다만 섞는 동안에는 풀지 않고 섞은 뒤 멈춤에 들어선 뒤에 푼다: 큐브가 멈춰 있어
   * 화면 스레드가 잠깐 바빠도 연출이 끊겨 보이지 않는다
   */
  workerWait: number;
  /**
   * 섞은 뒤 멈춤이 끝나고도 풀이를 기다리는 상한(마지막 안전장치). 넘으면 그 풀이를 버리고 못 푼 판처럼 넘어간다
   * (해법 이름만 띄운 채 큐브가 멈춰 있지 않게). 멈춘 동안(안 보임·탭 숨김)은 재지 않는다
   */
  solveWait: number;
}

/** 크기마다 시간(ms). 큰 큐브는 풀이가 길어 수를 빠르게 둔다(휴대폰에서 오래 무겁지 않게) */
export function heroTiming(n: HeroSize): HeroTiming {
  const base = {
    afterScramble: 3000,
    workerWait: 2000,
    stage: 450,
    look: 220,
    mark: 500,
    solved: 1800,
  };
  // 풀이는 섞는 동안 미리 만들어 보통 섞기가 끝나기 전에 온다. 워커가 늦으면 `workerWait` 뒤 화면 스레드에서
  // 푼다(3×3 0.1초 안쪽). `solveWait`는 화면 스레드 풀이마저 안 끝날 때(청크를 못 받음 등)를 잡는 안전장치라 넉넉히
  if (n === 2)
    return {
      ...base,
      scrambleMove: 120,
      solveMove: 280,
      searchMove: 180,
      scrambleLength: 11,
      solveWait: 8000,
    };
  if (n === 3)
    return {
      ...base,
      scrambleMove: 110,
      solveMove: 240,
      searchMove: 160,
      scrambleLength: 20,
      solveWait: 8000,
    };
  return {
    ...base,
    // 축소법은 데스크톱 화면 스레드에서 1초 안쪽, 느린 휴대폰에서는 몇 초 걸릴 수 있다. 그 답도 받게 길게
    solveWait: 25_000,
    stage: 350,
    look: 120,
    scrambleMove: 80,
    solveMove: n === 4 ? 120 : 100,
    searchMove: 80,
    scrambleLength: n === 4 ? 30 : 36,
  };
}

const FACES = ["U", "D", "R", "L", "F", "B"] as const;
const SLICES = ["M", "E", "S"] as const;
const ROTATIONS = ["x", "y", "z"] as const;
const SUFFIXES = ["", "'", "2"] as const;

/** 섞기에 큐브 돌리기·가운데 층(4×4 이상은 안쪽 한 층)이 섞이는 비율 */
const ROTATION_RATE = 0.1;
const SLICE_RATE = 0.15;

const pick = <T>(rng: () => number, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length)] as T;

/** 섞기 한 수의 이름(돌리는 양 없이). 크기에 맞는 것만 */
function randomBase(rng: () => number, n: number): string {
  const r = rng();
  if (r < ROTATION_RATE) return pick(rng, ROTATIONS);
  if (n >= 3 && r < ROTATION_RATE + SLICE_RATE) {
    // 홀수는 정가운데 층(M E S)과 그 밖의 안쪽 층(5×5의 2R 등), 짝수는 안쪽 층(4×4의 2R)
    const inner: string[] = [];
    if (n % 2 === 1) inner.push(...SLICES);
    for (let layer = 2; layer <= Math.floor(n / 2); layer++)
      if (!(n % 2 === 1 && layer === (n + 1) / 2))
        for (const f of FACES) inner.push(`${layer}${f}`);
    if (inner.length) return pick(rng, inner);
  }
  const face = pick(rng, FACES);
  return n >= 4 && rng() < 0.4 ? `${face}w` : face;
}

const overlaps = (a: CubeMove, b: CubeMove) =>
  a.axis === b.axis && a.from <= b.to && b.from <= a.to;

/**
 * 무작위 섞기(WCA 표기 수 목록). 면 돌리기에 큐브 돌리기(x y z)와 가운데 층(M E S, 4×4 이상은 안쪽 한 층
 * `2R`)도 섞는다(2×2는 큐브 돌리기만). 한 섞기에 큐브 돌리기와 가운데 층이 적어도 하나씩 들어간다.
 * 같은 축에서 겹치는 층(같은 면, 큐브 돌리기와 그 축의 수)을 잇달아 돌리지 않고, 같은 축을 셋 잇달아 돌리지도
 * 않는다(U D U처럼 앞뒤가 겹치는 수). 4×4 이상은 바깥 두 층(Rw)도 섞는다. `rng`는 [0, 1) 수를 낸다.
 */
export function randomScramble(
  rng: () => number,
  length = 20,
  n = 3,
): string[] {
  const needSlice = n >= 3;
  let out: string[] = [];
  // 큐브 돌리기·가운데 층이 빠진 섞기는 다시 뽑는다(비율이 낮아 몇 번 안에 나온다)
  for (let attempt = 0; attempt < 50; attempt++) {
    out = [];
    const parsed: CubeMove[] = [];
    while (out.length < length) {
      const base = randomBase(rng, n);
      const [m] = parseMoves(n, base) as [CubeMove];
      const prev = parsed[parsed.length - 1];
      const prev2 = parsed[parsed.length - 2];
      if (prev && overlaps(prev, m)) continue;
      if (prev && prev2 && prev.axis === m.axis && prev2.axis === m.axis)
        continue;
      // 큐브 돌리기를 잇달아 두지 않는다(돌리기만 이어지면 섞이지 않는다)
      if (prev && isWholeMove(n, prev) && isWholeMove(n, m)) continue;
      parsed.push(m);
      out.push(`${base}${pick(rng, SUFFIXES)}`);
    }
    const hasRotation = parsed.some((m) => isWholeMove(n, m));
    const hasSlice = parsed.some((m) => m.from > 1 && m.to < n);
    if (hasRotation && (hasSlice || !needSlice)) break;
  }
  return out;
}

const isWholeMove = (n: number, m: CubeMove) => m.from === 1 && m.to === n;

/** 큐브 돌리기 표기: 없음, 한 번, 두 번(짧은 것부터). 24방향을 모두 덮는다 */
const ORIENT_LISTS: readonly string[][] = (() => {
  const single = ROTATIONS.flatMap((a) => [a, `${a}'`, `${a}2`]);
  return [
    [],
    ...single.map((t) => [t]),
    ...single.flatMap((a) =>
      single.filter((b) => b[0] !== a[0]).map((b) => [a, b]),
    ),
  ];
})();

/**
 * 풀기 전에 쥐는 방향을 맞추는 큐브 돌리기(홀수 크기). 섞기의 큐브 돌리기·가운데 층이 센터 블럭을 옮겨 두므로,
 * 흰 센터가 위·초록이 앞(해법이 기대하는 방향)으로 오게 가장 짧게 돌린다. 이미 그러면 빈 목록.
 * 짝수 크기는 정센터 블럭이 없어 해법이 어느 방향이든 받으므로 빈 목록이다.
 */
export function orientForSolve(n: number, state: PuzzleState): string[] {
  if (n % 2 === 0) return [];
  const nn = n * n;
  const c = (n - 1) / 2;
  const home = (s: PuzzleState) => {
    const colors = faceColors(n, s);
    for (let f = 0; f < 6; f++)
      if (colors[f * nn + c * n + c] !== f) return false;
    return true;
  };
  for (const list of ORIENT_LISTS) {
    const s = list.length
      ? applyMoves(n, state, parseMoves(n, list.join(" ")))
      : state;
    if (home(s)) return list;
  }
  throw new Error("쥐는 방향을 찾지 못했다");
}

export type HeroStep =
  | { kind: "move"; move: string; ms: number; label: string }
  | {
      kind: "wait";
      ms: number;
      label: string;
      /** 이 멈춤 동안 잠깐 빛낼 것(넣기 전: 넣을 곳·찾은 조각, 넣은 뒤: 맞춘 조각) */
      marks?: PieceMark[];
    };

/** 섞기 차례: 수마다 빠르게(큐브 돌리기는 무엇을 했는지 보이게 조금 느리게), 끝에 해법 이름을 보이며 멈춘다 */
export function scrambleSteps(
  scramble: readonly string[],
  methodLabel: string,
  t: HeroTiming,
): HeroStep[] {
  const steps: HeroStep[] = scramble.map((move) => ({
    kind: "move",
    move,
    ms: isRotationToken(move)
      ? Math.round(t.scrambleMove * ROTATION_SLOWER)
      : t.scrambleMove,
    label: SCRAMBLING_LABEL,
  }));
  steps.push({ kind: "wait", ms: t.afterScramble, label: methodLabel });
  return steps;
}

/**
 * 맞추기 차례: 단계마다 꼬리표(「초보자 해법 · 십자」)를 바꾸고, 단계 사이와 살피는 자리에서 잠깐 멈춘다.
 * 수 없이 지나간 단계는 건너뛴다. 끝에 「맞춤」으로 멈춘다.
 *
 * 강조(`highlight`가 끄기가 아니면): 조각마다 넣기 전에 넣을 곳·찾은 조각을, 넣은 뒤에 맞춘 조각을 `mark`만큼
 * 멈춰 빛낸다(살피는 멈춤·단계 사이 멈춤과 겹치면 하나로 둔다). 넣는 수 동안에는 빛내지 않는다. 찾는 돌리기
 * (`searches`)는 `searchMove`로 조금 빠르게 둔다. 같은 자리의 사건은 차례대로 멈춤 하나씩이고(맞춘 조각끼리,
 * 넣을 곳·찾은 조각끼리는 하나로 묶는다), `solo`인 사건은 따로 멈춘다. 끄기여도 이미 맞은 조각을 앞으로 돌려
 * 확인한 뒤(`check`)에는 살피듯 잠깐 멈춘다.
 */
export function solveSteps(
  solve: HeroSolve,
  methodLabel: string,
  t: HeroTiming,
  highlight: HeroHighlight = DEFAULT_HERO_HIGHLIGHT,
): HeroStep[] {
  const looks = new Set(solve.looks);
  const searches = new Set(solve.searches ?? []);
  const marksAt = new Map<number, PieceMark[]>();
  for (const { at, mark } of solve.marks ?? [])
    marksAt.set(at, [...(marksAt.get(at) ?? []), mark]);
  const on = highlight !== "off";
  const steps: HeroStep[] = [];
  /** 수 i 앞의 사건을 멈춤 하나씩으로 묶는다 */
  const groupsAt = (i: number): PieceMark[][] => {
    const out: PieceMark[][] = [];
    for (const m of marksAt.get(i) ?? []) {
      const last = out.at(-1);
      const prev = last?.at(-1);
      const join =
        last &&
        prev &&
        !m.solo &&
        !prev.solo &&
        (m.kind === "placed") === (prev.kind === "placed");
      if (join) last.push(m);
      else out.push([m]);
    }
    return out;
  };
  const isPlaced = (g: readonly PieceMark[]) => g[0]?.kind === "placed";
  /** 수 i 앞의 멈춤들(맞춘 조각 → 단계 사이 → 넣을 곳·찾은 조각, 사건이 쌓인 차례) */
  const pauses = (i: number, label: string, stageStart: boolean) => {
    const groups = groupsAt(i);
    const wait = (ms: number, m: readonly PieceMark[]) => {
      const step: HeroStep = { kind: "wait", ms, label };
      if (on && m.length) step.marks = [...m];
      steps.push(step);
    };
    let k = 0;
    if (stageStart) {
      // 단계 사이 멈춤에 맞춘 조각을 싣는다
      const g = groups[0] && isPlaced(groups[0]) ? groups[k++] : null;
      wait(on && g ? Math.max(t.stage, t.mark) : t.stage, g ?? []);
    }
    let look = !stageStart && looks.has(i);
    if (on)
      for (; k < groups.length; k++) {
        const g = groups[k] as PieceMark[];
        // 살피는 멈춤은 넣을 곳·찾은 조각 멈춤과 하나로
        const ms = !isPlaced(g) && look ? Math.max(t.look, t.mark) : t.mark;
        if (!isPlaced(g)) look = false;
        wait(ms, g);
      }
    const target = groups.some((g) => !isPlaced(g));
    const checked = groups.some((g) => g.some((m) => m.check));
    if (on) {
      if (look) wait(t.look, []);
    } else if (look || checked || (target && searches.has(i - 1)))
      // 끄기여도 찾은 뒤·맞은 조각을 확인한 뒤에는 살피듯 잠깐 멈춘다
      wait(t.look, []);
  };
  let first = true;
  for (const stage of solve.stages) {
    if (stage.end <= stage.start) continue;
    const label = `${methodLabel} · ${stage.label}`;
    pauses(stage.start, label, !first);
    first = false;
    for (let i = stage.start; i < stage.end; i++) {
      const move = solve.moves[i];
      if (move === undefined) continue;
      if (i !== stage.start) pauses(i, label, false);
      // 큐브 전체 돌리기(연출이 돌려 쥔 것)는 조금 느리게: 무엇을 했는지 보이게. 찾는 돌리기는 조금 빠르게
      const ms = searches.has(i)
        ? t.searchMove
        : isRotationToken(move)
          ? Math.round(t.solveMove * ROTATION_SLOWER)
          : t.solveMove;
      steps.push({ kind: "move", move, ms, label });
    }
  }
  const end = (marksAt.get(solve.moves.length) ?? []).filter(
    (m) => m.kind === "placed",
  );
  const done: HeroStep = {
    kind: "wait",
    ms: t.solved,
    label: `${methodLabel} · ${SOLVED_LABEL}`,
  };
  if (on && end.length) done.marks = end;
  steps.push(done);
  return steps;
}

export const ORIENT_LABEL = "방향 맞추기";

/** 풀기 전 쥐는 방향 맞추기 차례(`orientForSolve`의 돌리기). 없으면 빈 차례 */
export function orientSteps(
  tokens: readonly string[],
  methodLabel: string,
  t: HeroTiming,
): HeroStep[] {
  if (tokens.length === 0) return [];
  const label = `${methodLabel} · ${ORIENT_LABEL}`;
  const steps: HeroStep[] = tokens.map((move) => ({
    kind: "move",
    move,
    ms: Math.round(t.solveMove * ROTATION_SLOWER),
    label,
  }));
  steps.push({ kind: "wait", ms: t.stage, label });
  return steps;
}

/** 큐브 전체 돌리기는 보통 수보다 이만큼 느리게 */
export const ROTATION_SLOWER = 1.5;
const isRotationToken = (move: string) => /^[xyz]/.test(move);

export interface HeroLoopOptions {
  n: HeroSize;
  /** 돌아가며 쓸 해법(표의 id와 이름). 하나면 그것만 */
  methods: readonly { id: string; label: string }[];
  clock: Clock;
  /** [0, 1) 수 */
  rng: () => number;
  /** 사람 해법(워커). 거부되면 그 판을 건너뛴다 */
  solve: (methodId: string, state: PuzzleState) => Promise<HeroSolve>;
  /**
   * 같은 해법을 화면 스레드에서(워커가 `workerWait` 안에 답하지 않을 때). 없으면 워커 답만 기다린다.
   * 이것을 부른 뒤에 온 워커 답은 버린다
   */
  solveHere?: (methodId: string, state: PuzzleState) => Promise<HeroSolve>;
  /** 수 하나(WCA 표기)를 둔다. `ms`는 다음 걸음까지의 시간(회전 빠르기를 맞출 때) */
  onMove: (move: string, ms: number, parsed: readonly CubeMove[]) => void;
  /** 꼬리표가 바뀔 때 */
  onLabel: (label: string) => void;
  /** 그림을 이 상태로 바로 바꾼다(풀이 실패 뒤 맞춘 큐브로) */
  onReset: (state: PuzzleState) => void;
  /** 강조(기본 「잠깐」). 바꾸려면 `setHighlight` */
  highlight?: HeroHighlight;
  /**
   * 지금 빛낼 스티커(정체 번호)가 바뀔 때. 「계속」이면 맞춘 조각이 판이 끝날 때까지 남는다. 빈 목록이면 끈다
   */
  onMarks?: (marks: readonly PieceMark[]) => void;
  /** 시간(기본 `heroTiming(n)`) */
  timing?: HeroTiming;
}

/**
 * 연출을 끝없이 되풀이한다. `pause`·`resume`은 화면에 안 보이거나 탭이 숨을 때 쓴다(멈춘 자리에서 이어 간다).
 */
export class HeroLoop {
  private readonly o: HeroLoopOptions;
  private readonly n: HeroSize;
  private readonly t: HeroTiming;
  private state: PuzzleState;
  private cycle = 0;
  private steps: HeroStep[] = [];
  private index = 0;
  /** 이 판의 풀이 약속(다른 판의 늦은 답을 가려낸다) */
  private pendingSolve: Promise<HeroSolve | null> | null = null;
  /** 받은 풀이. 아직이면 undefined, 못 풀었으면 null */
  private solved: HeroSolve | null | undefined;
  private method: { id: string; label: string };
  /** 이 판의 풀기 전 방향 맞추기(`orientForSolve`) */
  private orient: string[] = [];
  /** 이 판에서 풀 상태(섞고 방향을 맞춘 뒤) */
  private target: PuzzleState;
  /** 워커에 풀이를 부탁한 시각 */
  private askedAt = 0;
  /** 화면 스레드 풀이로 넘어갔는지(그 뒤 워커 답은 버린다) */
  private here = false;
  /** 워커 기다림(`workerWait`) 끄기 */
  private hereTimer: (() => void) | null = null;
  private phase: "scramble" | "solve" = "scramble";
  private cancel: (() => void) | null = null;
  /** 섞기를 다 두고 풀이를 기다리는 상한(`solveWait`) 끄기 */
  private waitTimer: (() => void) | null = null;
  private running = false;
  private stopped = false;
  private label = "";
  /** 지금 걸음의 수를 이미 두었는지(멈췄다 이어 갈 때 다시 두지 않게) */
  private entered = false;
  private highlight: HeroHighlight;
  /** 「계속」에서 이 판에 맞춘 조각 */
  private kept: PieceMark[] = [];
  /** 마지막으로 알린 강조 */
  private shownMarks: readonly PieceMark[] = [];

  constructor(options: HeroLoopOptions) {
    if (options.methods.length === 0) throw new Error("해법이 없다");
    this.o = options;
    this.n = options.n;
    this.t = options.timing ?? heroTiming(options.n);
    this.state = solvedCube(this.n);
    this.target = this.state;
    this.method = options.methods[0] as { id: string; label: string };
    this.highlight = options.highlight ?? DEFAULT_HERO_HIGHLIGHT;
  }

  /** 강조를 바꾼다. 다음 판의 걸음부터 따른다(지금 판의 남긴 표시는 끄기면 바로 지운다) */
  setHighlight(mode: HeroHighlight): void {
    this.highlight = mode;
    if (mode !== "keep") this.kept = [];
    if (mode === "off") this.showMarks([]);
  }

  get currentHighlight(): HeroHighlight {
    return this.highlight;
  }

  private showMarks(marks: readonly PieceMark[]): void {
    const same =
      marks.length === this.shownMarks.length &&
      marks.every((m, i) => m === this.shownMarks[i]);
    if (same) return;
    this.shownMarks = marks;
    this.o.onMarks?.(marks);
  }

  /** 걸음에 들어설 때: 그 멈춤의 강조와 「계속」으로 남긴 것을 보인다 */
  private enterMarks(step: HeroStep): void {
    const brief =
      step.kind === "wait" && this.highlight !== "off"
        ? (step.marks ?? [])
        : [];
    if (this.highlight === "keep")
      for (const m of brief) if (m.kind === "placed") this.kept.push(m);
    const extra =
      this.highlight === "keep"
        ? brief.filter((m) => m.kind !== "placed")
        : brief;
    this.showMarks(
      this.kept.length || extra.length ? [...this.kept, ...extra] : [],
    );
  }

  /** 지금 상태(엔진). 연출이 그린 것과 같다 */
  get current(): PuzzleState {
    return this.state;
  }

  get currentLabel(): string {
    return this.label;
  }

  get currentMethod(): string {
    return this.method.id;
  }

  start(): void {
    if (this.stopped || this.running) return;
    this.running = true;
    if (this.steps.length === 0) this.beginCycle();
    this.run();
  }

  pause(): void {
    this.running = false;
    this.cancel?.();
    this.cancel = null;
    // 멈춘 동안은 풀이 기다림을 재지 않는다(이으면 처음부터 다시 잰다)
    this.clearWait();
  }

  private clearWait(): void {
    this.waitTimer?.();
    this.waitTimer = null;
    this.hereTimer?.();
    this.hereTimer = null;
  }

  resume(): void {
    this.start();
  }

  stop(): void {
    this.pause();
    this.stopped = true;
    this.pendingSolve = null;
  }

  private beginCycle(): void {
    const methods = this.o.methods;
    this.method = methods[this.cycle % methods.length] as {
      id: string;
      label: string;
    };
    this.cycle++;
    this.kept = [];
    const scramble = randomScramble(this.o.rng, this.t.scrambleLength, this.n);
    let after = this.state;
    for (const m of scramble)
      after = applyMoves(this.n, after, parseMoves(this.n, m));
    // 섞기의 큐브 돌리기·가운데 층이 옮긴 방향을 풀기 전에 되돌려 쥔다(해법은 흰 위·초록 앞에서 시작)
    this.orient = orientForSolve(this.n, after);
    if (this.orient.length)
      after = applyMoves(
        this.n,
        after,
        parseMoves(this.n, this.orient.join(" ")),
      );
    this.phase = "scramble";
    this.steps = scrambleSteps(scramble, this.method.label, this.t);
    this.index = 0;
    this.entered = false;
    this.solved = undefined;
    this.target = after;
    this.here = false;
    this.askedAt = this.o.clock.now();
    this.expect(this.ask(this.o.solve, after), true);
  }

  /** 풀이를 부탁한다(던지거나 거부되면 null) */
  private ask(
    solve: (methodId: string, state: PuzzleState) => Promise<HeroSolve>,
    state: PuzzleState,
  ): Promise<HeroSolve | null> {
    try {
      return solve(this.method.id, state).then(
        (s) => s,
        () => null,
      );
    } catch {
      return Promise.resolve(null);
    }
  }

  /** 이 판의 풀이로 받는다. 다른 판의 답이나, 화면 스레드로 넘어간 뒤 온 워커 답은 버린다 */
  private expect(p: Promise<HeroSolve | null>, fromWorker: boolean): void {
    this.pendingSolve = p;
    void p.then((s) => {
      if (this.pendingSolve !== p || (fromWorker && this.here)) return;
      this.solved = s;
      this.clearWait();
      // 섞기를 다 두고 풀이를 기다리던 중이면 이어 간다
      if (
        this.running &&
        !this.cancel &&
        this.phase === "scramble" &&
        this.index >= this.steps.length
      )
        this.run();
    });
  }

  /**
   * 섞은 뒤 멈춤에 들어섰거나 그 뒤로 기다리는 중이면, 워커 답을 `workerWait`까지만 기다리고 화면 스레드에서 푼다.
   * 멈췄다 이으면 남은 시간만 다시 건다(워커는 멈춘 동안에도 일하므로 부탁한 때부터 잰다)
   */
  private armHere(): void {
    const solveHere = this.o.solveHere;
    if (!solveHere || this.here || this.solved !== undefined || this.hereTimer)
      return;
    const go = () => {
      this.hereTimer = null;
      if (this.here || this.solved !== undefined) return;
      this.here = true;
      this.expect(this.ask(solveHere, this.target), false);
    };
    const left = this.askedAt + this.t.workerWait - this.o.clock.now();
    if (left <= 0) go();
    else this.hereTimer = this.o.clock.after(left, go);
  }

  private setLabel(label: string): void {
    if (label === this.label) return;
    this.label = label;
    this.o.onLabel(label);
  }

  /** 지금 걸음을 하고, 시간이 지나면 다음 걸음으로 */
  private run(): void {
    if (!this.running || this.cancel) return;
    if (this.index >= this.steps.length) {
      if (this.phase === "scramble") {
        if (this.solved === undefined) {
          this.armHere();
          // 풀이를 기다린다(오면 다시 부른다). 상한을 넘으면 그 풀이를 버리고 못 푼 판처럼 넘어간다
          this.waitTimer ??= this.o.clock.after(this.t.solveWait, () => {
            this.waitTimer = null;
            if (this.solved !== undefined) return;
            this.pendingSolve = null;
            this.solved = null;
            this.run();
          });
          return;
        }
        this.clearWait();
        const solve = this.solved;
        this.pendingSolve = null;
        if (!solve) {
          // 풀이를 못 만들었다: 그 판은 건너뛰고 맞춘 큐브에서 다음 해법으로
          this.state = solvedCube(this.n);
          this.o.onReset(this.state);
          this.beginCycle();
        } else {
          this.phase = "solve";
          this.steps = [
            ...orientSteps(this.orient, this.method.label, this.t),
            ...solveSteps(solve, this.method.label, this.t, this.highlight),
          ];
          this.index = 0;
          this.entered = false;
        }
      } else {
        this.beginCycle();
      }
    }
    const step = this.steps[this.index];
    if (!step) return;
    // 섞은 뒤 멈춤(섞기 차례의 끝 걸음)에 들어섰다: 워커가 늦으면 여기서부터 화면 스레드에서 푼다
    if (this.phase === "scramble" && this.index === this.steps.length - 1)
      this.armHere();
    this.setLabel(step.label);
    if (!this.entered) this.enterMarks(step);
    if (step.kind === "move" && !this.entered) {
      const parsed = parseMoves(this.n, step.move);
      this.state = applyMoves(this.n, this.state, parsed);
      this.o.onMove(step.move, step.ms, parsed);
    }
    this.entered = true;
    this.cancel = this.o.clock.after(step.ms, () => {
      this.cancel = null;
      this.index++;
      this.entered = false;
      this.run();
    });
  }
}
