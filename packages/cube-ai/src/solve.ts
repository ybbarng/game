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
  | "first-layer"
  // 4×4·5×5(축소법)
  | "centers-ud"
  | "centers-rest"
  | "edges"
  | "last-edges"
  | "oll-parity"
  | "pll-parity"
  | "three";

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
  "centers-ud": "흰·노랑 가운데",
  "centers-rest": "나머지 가운데",
  edges: "모서리 짝",
  "last-edges": "마지막 두 모서리",
  "oll-parity": "패리티(모서리 뒤집기)",
  "pll-parity": "패리티(모서리 맞바꾸기)",
  three: "3×3 맞추기",
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
  /**
   * 단계 안에서 사람이 다음 모양을 살피느라 잠깐 멈추는 자리(이 번호의 수 앞, 늘어나는 차례).
   * 입문이 같은 공식을 되풀이할 때 공식 묶음 사이가 그런 자리다. 단계 첫 수는 넣지 않는다
   * (단계 사이 멈춤이 따로 있다).
   */
  looks: number[];
}

const SOLVED_FRAME: readonly Face[] = FACES;

export class Solve {
  readonly n: number;
  f: string[];
  /** 2×2만: 면 k에 와야 할 색 글자. 3×3은 null(가운데 색을 본다) */
  frame: Face[] | null;
  readonly moves: CubeMove[];
  readonly stageList: { name: StageName; start: number; end: number }[];
  /** 살피는 멈춤이 드는 자리(`moves` 번호). `look()`으로 더한다 */
  readonly lookList: number[];

  constructor(n: number, facelets: string, frame: Face[] | null = null) {
    this.n = n;
    this.f = facelets.split("");
    this.frame = n === 3 ? null : (frame ?? [...SOLVED_FRAME]);
    this.moves = [];
    this.stageList = [];
    this.lookList = [];
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

  /** 다음 수 앞에서 다음 모양을 살핀다(공식을 되풀이하는 단계의 한 바퀴 시작) */
  look(): void {
    if (this.lookList.at(-1) !== this.moves.length)
      this.lookList.push(this.moves.length);
  }

  /** 단계마다 이어진 같은 층 수를 합치고 WCA 표기로 낸다 */
  result(): HumanSolve {
    const moves: string[] = [];
    const stages: SolveStage[] = [];
    const looks: number[] = [];
    const lookSet = new Set(this.lookList);
    for (const st of this.stageList) {
      const raw = this.moves
        .slice(st.start, st.end)
        .map((m, i) => ({ m, look: lookSet.has(st.start + i) }));
      const merged = mergeMarked(raw);
      const start = moves.length;
      merged.forEach(({ m, look }, i) => {
        if (look && i > 0) looks.push(moves.length);
        moves.push(formatMove(this.n, m));
      });
      stages.push({ name: st.name, start, end: moves.length });
    }
    return { moves, stages, looks };
  }
}

interface Marked {
  m: CubeMove;
  look: boolean;
}

/** 합치기와 같고, 멈춤 표시는 합쳐진 수의 앞쪽에, 지워진 수의 표시는 다음 수에 넘긴다 */
function mergeMarked(list: readonly Marked[]): Marked[] {
  const out: Marked[] = [];
  let carry = false;
  for (const item of list) {
    const last = out.at(-1);
    const m = item.m;
    if (
      last &&
      last.m.axis === m.axis &&
      last.m.from === m.from &&
      last.m.to === m.to
    ) {
      const turns = (last.m.turns + m.turns) % 4;
      out.pop();
      if (turns !== 0)
        out.push({
          m: { ...m, turns: turns as 1 | 2 | 3 },
          look: last.look || item.look,
        });
      else carry = carry || last.look || item.look;
    } else {
      out.push({ m, look: item.look || carry });
      carry = false;
    }
  }
  return out;
}

/** 이어진 같은 층 수 합치기(U U → U2, R R' → 없음) */
export function mergeMoves(list: readonly CubeMove[]): CubeMove[] {
  return mergeMarked(list.map((m) => ({ m, look: false }))).map((x) => x.m);
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
