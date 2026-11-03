import {
  type CubeMove,
  formatMove,
  isRotation,
  parseMoves,
} from "@game/cube-engine";
import { FACES, type Face, movePermutation } from "@game/cube-solver";
import { type Cubie, readCubie } from "./cubie";
import { applyToFacelets, toFaceletMove } from "./facelets";

/**
 * 사람 흉내 해법이 공통으로 쓰는 판: 지금 스티커, 둔 수, 단계 경계.
 *
 * - 스티커는 실제 색 글자(맞춘 상태에서 있던 면 이름)로 든다.
 * - "기준 방향"(`frame`): 면마다 어느 색이 와야 맞춘 것인가. 3×3은 가운데 조각 색이 곧 기준이고,
 *   2×2는 가운데가 없어 처음에 정하고 큐브 돌리기(x·y·z)를 따라 함께 돌린다.
 * - `rel()`은 기준 방향 글자로 바꾼 스티커 문자열이다. 해법은 늘 이것을 보고 판단한다.
 *   그래서 큐브를 돌린(y 등) 뒤에도 "앞 오른쪽 자리" 같은 말이 그대로 통한다.
 */

export type StageName =
  | "solve"
  | "cross"
  | "corners"
  | "middle"
  | "f2l-1"
  | "f2l-2"
  | "f2l-3"
  | "f2l-4"
  | "eo"
  | "co"
  | "cp"
  | "ep"
  | "oll"
  | "pll"
  | "first-layer";

export const STAGE_LABELS: Readonly<Record<StageName, string>> = {
  solve: "맞추기",
  cross: "십자",
  corners: "첫 층 꼭짓점",
  middle: "둘째 층 모서리",
  "f2l-1": "F2L 첫째 짝",
  "f2l-2": "F2L 둘째 짝",
  "f2l-3": "F2L 셋째 짝",
  "f2l-4": "F2L 넷째 짝",
  eo: "노란 십자",
  co: "노란 면",
  cp: "위 꼭짓점 자리",
  ep: "위 모서리 자리",
  oll: "윗면(OLL)",
  pll: "윗층 자리(PLL)",
  "first-layer": "첫 층",
};

export interface SolveStage {
  name: StageName;
  /** 이 단계의 첫 수 번호(`moves` 안) */
  start: number;
  /** 이 단계 마지막 수 다음 번호. start === end면 수 없이 지나간 단계 */
  end: number;
}

export interface HumanSolve {
  /** WCA 표기 수 목록(큐브 돌리기 x·y·z, 3×3의 가운데 층 M·E·S 포함) */
  moves: string[];
  stages: SolveStage[];
}

const SOLVED_FRAME: readonly Face[] = FACES;

export class Solve {
  readonly n: number;
  f: string[];
  /** 2×2만: 면 k에 와야 할 색 글자. 3×3은 null(가운데 색을 본다) */
  frame: Face[] | null;
  readonly moves: CubeMove[];
  readonly stageList: { name: StageName; start: number; end: number }[];

  constructor(n: number, facelets: string, frame: Face[] | null = null) {
    this.n = n;
    this.f = facelets.split("");
    this.frame = n === 3 ? null : (frame ?? [...SOLVED_FRAME]);
    this.moves = [];
    this.stageList = [];
  }

  clone(): Solve {
    const s = new Solve(this.n, this.f.join(""), this.frame && [...this.frame]);
    return s;
  }

  /** 표기를 읽어 차례로 둔다 */
  apply(alg: string): this {
    for (const m of parseMoves(this.n, alg)) this.applyMove(m);
    return this;
  }

  applyMove(m: CubeMove): void {
    this.f = applyToFacelets(this.n, this.f, m);
    if (this.frame && isRotation(this.n, m))
      this.frame = rotateFrame(this.frame, m);
    this.moves.push(m);
  }

  /** 기준 방향 글자 문자열 */
  rel(): string {
    const nn = this.n * this.n;
    const toRel = new Map<string, Face>();
    for (let k = 0; k < 6; k++) {
      const color = this.frame
        ? (this.frame[k] as Face)
        : (this.f[k * nn + (nn - 1) / 2] as string);
      toRel.set(color, FACES[k] as Face);
    }
    let s = "";
    for (const c of this.f) s += toRel.get(c) as string;
    return s;
  }

  cubie(): Cubie {
    return readCubie(this.rel(), this.n);
  }

  /** 면마다 한 색인가(큐브 방향은 따지지 않는다) */
  isSolved(): boolean {
    const nn = this.n * this.n;
    for (let i = 0; i < this.f.length; i++)
      if (this.f[i] !== this.f[Math.floor(i / nn) * nn]) return false;
    return true;
  }

  /** 지금까지 둔 수 가운데 아직 단계에 들지 않은 수를 `name` 단계로 묶는다 */
  stage(name: StageName): void {
    const start = this.stageList.at(-1)?.end ?? 0;
    this.stageList.push({ name, start, end: this.moves.length });
  }

  /** 단계마다 이어진 같은 층 수를 합치고 WCA 표기로 낸다 */
  result(): HumanSolve {
    const moves: string[] = [];
    const stages: SolveStage[] = [];
    for (const st of this.stageList) {
      const merged = mergeMoves(this.moves.slice(st.start, st.end));
      const start = moves.length;
      for (const m of merged) moves.push(formatMove(this.n, m));
      stages.push({ name: st.name, start, end: moves.length });
    }
    return { moves, stages };
  }
}

/** 이어진 같은 층 수 합치기(U U → U2, R R' → 없음) */
export function mergeMoves(list: readonly CubeMove[]): CubeMove[] {
  const out: CubeMove[] = [];
  for (const m of list) {
    const last = out.at(-1);
    if (
      last &&
      last.axis === m.axis &&
      last.from === m.from &&
      last.to === m.to
    ) {
      const turns = (last.turns + m.turns) % 4;
      out.pop();
      if (turns !== 0) out.push({ ...m, turns: turns as 1 | 2 | 3 });
    } else {
      out.push(m);
    }
  }
  return out;
}

/** 큐브 돌리기 뒤의 기준 방향: 맞춘 3×3에 같은 돌리기를 두고 가운데가 어디로 갔나 본다 */
function rotateFrame(frame: readonly Face[], m: CubeMove): Face[] {
  const dest = movePermutation(3, { ...toFaceletMove(m), from: 1, to: 3 });
  const out = [...frame];
  for (let k = 0; k < 6; k++) {
    // 면 k의 가운데(k*9+4)는 dest를 따라 다른 면으로 간다
    const to = Math.floor((dest[k * 9 + 4] as number) / 9);
    out[to] = frame[k] as Face;
  }
  return out;
}

/** U를 a번(0..3) 돌리는 표기 */
export function uTurn(a: number): string {
  return ["", "U", "U2", "U'"][((a % 4) + 4) % 4] as string;
}

/** y를 k번(0..3) 돌리는 표기 */
export function yTurn(k: number): string {
  return ["", "y", "y2", "y'"][((k % 4) + 4) % 4] as string;
}
