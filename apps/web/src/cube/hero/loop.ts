import {
  applyMoves,
  type CubeMove,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { HeroSize, HeroSolve } from "./methods";

/**
 * 큐브 첫 화면 위 그림의 연출 순서(docs/47 0절 2026-11-04). 3D 그리기와 떼어 둔 작은 상태 기계다.
 *
 *   맞춘 큐브 → 무작위 섞기(빠르게) → 멈춤 → 해법대로 맞추기(단계 사이 멈춤) → 멈춤 → 다시 섞기 …
 *
 * 해법은 받은 차례(`methods`, 설정의 「번갈아」면 그 크기의 해법 모두)를 돌아가며 쓴다. 풀이는 `solve`(워커)가
 * 섞는 동안 미리 만든다. 못 풀면 그 판을 건너뛰고 맞춘 큐브에서 다음 해법으로 다시 섞는다.
 * 시간은 `Clock`으로 재서 시험은 `ManualClock`으로 정확히 옮긴다.
 */

export const SCRAMBLING_LABEL = "섞는 중";
export const SOLVED_LABEL = "맞춤";

export interface HeroTiming {
  /** 섞기 한 수 */
  scrambleMove: number;
  /** 섞은 뒤 멈춤 */
  afterScramble: number;
  /** 맞추기 한 수 */
  solveMove: number;
  /** 단계 사이 멈춤 */
  stage: number;
  /** 단계 안에서 다음 모양을 살피는 멈춤 */
  look: number;
  /** 다 맞춘 뒤 멈춤 */
  solved: number;
  /** 섞는 수 */
  scrambleLength: number;
}

/** 크기마다 시간(ms). 큰 큐브는 풀이가 길어 수를 빠르게 둔다(휴대폰에서 오래 무겁지 않게) */
export function heroTiming(n: HeroSize): HeroTiming {
  const base = {
    afterScramble: 900,
    stage: 450,
    look: 220,
    solved: 1800,
  };
  if (n === 2)
    return { ...base, scrambleMove: 120, solveMove: 280, scrambleLength: 11 };
  if (n === 3)
    return { ...base, scrambleMove: 110, solveMove: 240, scrambleLength: 20 };
  return {
    ...base,
    stage: 350,
    look: 120,
    scrambleMove: 80,
    solveMove: n === 4 ? 120 : 100,
    scrambleLength: n === 4 ? 30 : 36,
  };
}

const FACES = ["U", "D", "R", "L", "F", "B"] as const;
const AXIS: Record<(typeof FACES)[number], number> = {
  U: 0,
  D: 0,
  R: 1,
  L: 1,
  F: 2,
  B: 2,
};
const SUFFIXES = ["", "'", "2"] as const;

/**
 * 무작위 섞기(WCA 표기 수 목록). 같은 면을 잇달아 돌리지 않고, 같은 축을 셋 잇달아 돌리지도 않는다
 * (U D U처럼 앞뒤가 겹치는 수). 4×4 이상은 바깥 두 층(Rw)도 섞는다. `rng`는 [0, 1) 수를 낸다.
 */
export function randomScramble(
  rng: () => number,
  length = 20,
  n = 3,
): string[] {
  const out: string[] = [];
  const faces: (typeof FACES)[number][] = [];
  while (out.length < length) {
    const face = FACES[Math.floor(rng() * FACES.length)] ?? "U";
    const prev = faces[faces.length - 1];
    const prev2 = faces[faces.length - 2];
    if (prev === face) continue;
    if (
      prev !== undefined &&
      prev2 !== undefined &&
      AXIS[prev] === AXIS[face] &&
      AXIS[prev2] === AXIS[face]
    )
      continue;
    faces.push(face);
    const wide = n >= 4 && rng() < 0.4 ? "w" : "";
    const suffix = SUFFIXES[Math.floor(rng() * SUFFIXES.length)] ?? "";
    out.push(`${face}${wide}${suffix}`);
  }
  return out;
}

export type HeroStep =
  | { kind: "move"; move: string; ms: number; label: string }
  | { kind: "wait"; ms: number; label: string };

/** 섞기 차례: 수마다 빠르게, 끝에 해법 이름을 보이며 멈춘다 */
export function scrambleSteps(
  scramble: readonly string[],
  methodLabel: string,
  t: HeroTiming,
): HeroStep[] {
  const steps: HeroStep[] = scramble.map((move) => ({
    kind: "move",
    move,
    ms: t.scrambleMove,
    label: SCRAMBLING_LABEL,
  }));
  steps.push({ kind: "wait", ms: t.afterScramble, label: methodLabel });
  return steps;
}

/**
 * 맞추기 차례: 단계마다 꼬리표(「초보자 해법 · 십자」)를 바꾸고, 단계 사이와 살피는 자리에서 잠깐 멈춘다.
 * 수 없이 지나간 단계는 건너뛴다. 끝에 「맞춤」으로 멈춘다.
 */
export function solveSteps(
  solve: HeroSolve,
  methodLabel: string,
  t: HeroTiming,
): HeroStep[] {
  const looks = new Set(solve.looks);
  const steps: HeroStep[] = [];
  let first = true;
  for (const stage of solve.stages) {
    if (stage.end <= stage.start) continue;
    const label = `${methodLabel} · ${stage.label}`;
    if (!first) steps.push({ kind: "wait", ms: t.stage, label });
    first = false;
    for (let i = stage.start; i < stage.end; i++) {
      const move = solve.moves[i];
      if (move === undefined) continue;
      if (i !== stage.start && looks.has(i))
        steps.push({ kind: "wait", ms: t.look, label });
      steps.push({ kind: "move", move, ms: t.solveMove, label });
    }
  }
  steps.push({
    kind: "wait",
    ms: t.solved,
    label: `${methodLabel} · ${SOLVED_LABEL}`,
  });
  return steps;
}

export interface HeroLoopOptions {
  n: HeroSize;
  /** 돌아가며 쓸 해법(표의 id와 이름). 하나면 그것만 */
  methods: readonly { id: string; label: string }[];
  clock: Clock;
  /** [0, 1) 수 */
  rng: () => number;
  /** 사람 해법(워커). 거부되면 그 판을 건너뛴다 */
  solve: (methodId: string, state: PuzzleState) => Promise<HeroSolve>;
  /** 수 하나(WCA 표기)를 둔다. `ms`는 다음 걸음까지의 시간(회전 빠르기를 맞출 때) */
  onMove: (move: string, ms: number, parsed: readonly CubeMove[]) => void;
  /** 꼬리표가 바뀔 때 */
  onLabel: (label: string) => void;
  /** 그림을 이 상태로 바로 바꾼다(풀이 실패 뒤 맞춘 큐브로) */
  onReset: (state: PuzzleState) => void;
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
  private phase: "scramble" | "solve" = "scramble";
  private cancel: (() => void) | null = null;
  private running = false;
  private stopped = false;
  private label = "";
  /** 지금 걸음의 수를 이미 두었는지(멈췄다 이어 갈 때 다시 두지 않게) */
  private entered = false;

  constructor(options: HeroLoopOptions) {
    if (options.methods.length === 0) throw new Error("해법이 없다");
    this.o = options;
    this.n = options.n;
    this.t = options.timing ?? heroTiming(options.n);
    this.state = solvedCube(this.n);
    this.method = options.methods[0] as { id: string; label: string };
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
    const scramble = randomScramble(this.o.rng, this.t.scrambleLength, this.n);
    let after = this.state;
    for (const m of scramble)
      after = applyMoves(this.n, after, parseMoves(this.n, m));
    this.phase = "scramble";
    this.steps = scrambleSteps(scramble, this.method.label, this.t);
    this.index = 0;
    this.entered = false;
    this.solved = undefined;
    let p: Promise<HeroSolve | null>;
    try {
      p = this.o.solve(this.method.id, after).then(
        (s) => s,
        () => null,
      );
    } catch {
      p = Promise.resolve(null);
    }
    this.pendingSolve = p;
    void p.then((s) => {
      if (this.pendingSolve !== p) return;
      this.solved = s;
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
        if (this.solved === undefined) return; // 풀이를 기다린다(오면 다시 부른다)
        const solve = this.solved;
        this.pendingSolve = null;
        if (!solve) {
          // 풀이를 못 만들었다: 그 판은 건너뛰고 맞춘 큐브에서 다음 해법으로
          this.state = solvedCube(this.n);
          this.o.onReset(this.state);
          this.beginCycle();
        } else {
          this.phase = "solve";
          this.steps = solveSteps(solve, this.method.label, this.t);
          this.index = 0;
          this.entered = false;
        }
      } else {
        this.beginCycle();
      }
    }
    const step = this.steps[this.index];
    if (!step) return;
    this.setLabel(step.label);
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
