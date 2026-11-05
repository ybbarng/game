/**
 * 3×3 2단계 해법(Kociemba two-phase). 알고리즘은 공개된 지식을 따라 직접 구현했다.
 *
 * 1단계: 아무 수(18가지)로 큐브를 G1 = <U, D, R2, L2, F2, B2> 안으로 보낸다. G1이란
 *   꼭짓점 방향(2187)·모서리 방향(2048)이 모두 0이고 가운데 층 모서리 4개가 가운데 층에 있는
 *   (495가지 가운데 하나) 상태다.
 * 2단계: G1 안의 수(10가지)만으로 꼭짓점 순열(40320)·위아래 층 모서리 순열(40320)·가운데 층
 *   모서리 순열(24)을 맞춘다.
 *
 * 좌표마다 수 표(좌표, 수 → 다음 좌표)를 두고, 두 좌표 짝마다 너비 우선으로 구한 거리를
 * 가지치기 표로 둔다(1단계: 가운데 층×꼭짓점 방향, 가운데 층×모서리 방향, 2단계: 가운데 층
 * 순열×꼭짓점 순열, 가운데 층 순열×위아래 모서리 순열). 탐색은 두 단계 모두 IDA*다.
 * 1단계 길이를 0부터 늘려 가며, 1단계 끝마다 남은 길이 안에서 2단계를 찾고, 처음 찾은 해를 낸다.
 *
 * 표는 처음 부를 때(`init3x3`) 만든다. 모두 순수 계산이라 웹 워커에서 그대로 부를 수 있다.
 */
import {
  type CubieCube,
  cloneCubie,
  cornerMultiply,
  edgeMultiply,
  faceletsToCubie,
  faceMoveCubies,
  moveName,
  solvedCubie,
} from "./cubie";
import { FACES } from "./facelets";
import { rankPermutation, unrankPermutation } from "./perm";

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_PERM8 = 40320;
const N_SLICE_PERM = 24;
const N_MOVES = 18;

/** 2단계에서 쓰는 수: U U2 U' D D2 D' R2 F2 L2 B2 */
const P2_MOVES = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16];
const N_P2 = P2_MOVES.length;
/** 18수 번호가 2단계 수인가 */
const IS_P2_MOVE = new Array<boolean>(N_MOVES)
  .fill(false)
  .map((_, m) => P2_MOVES.includes(m));

/** 12자리 가운데 가운데 층 모서리가 있는 네 자리(비트 묶음) ↔ 번호 */
const SLICE_MASKS: number[] = [];
const SLICE_INDEX = new Int16Array(1 << 12).fill(-1);
for (let mask = 0; mask < 1 << 12; mask++) {
  let bits = 0;
  for (let i = 0; i < 12; i++) if (mask & (1 << i)) bits++;
  if (bits === 4) {
    SLICE_INDEX[mask] = SLICE_MASKS.length;
    SLICE_MASKS.push(mask);
  }
}
const SLICE_SOLVED = SLICE_INDEX[0b111100000000] as number;

function twistOf(c: CubieCube): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + (c.co[i] as number);
  return t;
}

function setTwist(c: CubieCube, t: number) {
  let sum = 0;
  for (let i = 6; i >= 0; i--) {
    const o = t % 3;
    c.co[i] = o;
    sum += o;
    t = Math.floor(t / 3);
  }
  c.co[7] = (3 - (sum % 3)) % 3;
}

function flipOf(c: CubieCube): number {
  let t = 0;
  for (let i = 0; i < 11; i++) t = t * 2 + (c.eo[i] as number);
  return t;
}

function setFlip(c: CubieCube, t: number) {
  let sum = 0;
  for (let i = 10; i >= 0; i--) {
    const o = t & 1;
    c.eo[i] = o;
    sum += o;
    t >>= 1;
  }
  c.eo[11] = sum % 2;
}

function sliceOf(c: CubieCube): number {
  let mask = 0;
  for (let i = 0; i < 12; i++) if ((c.ep[i] as number) >= 8) mask |= 1 << i;
  return SLICE_INDEX[mask] as number;
}

function setSlice(c: CubieCube, s: number) {
  const mask = SLICE_MASKS[s] as number;
  let slice = 8;
  let other = 0;
  for (let i = 0; i < 12; i++) c.ep[i] = mask & (1 << i) ? slice++ : other++;
}

function cpermOf(c: CubieCube): number {
  return rankPermutation(c.cp);
}

function udEdgeOf(c: CubieCube): number {
  return rankPermutation(c.ep.slice(0, 8));
}

function slicePermOf(c: CubieCube): number {
  return rankPermutation(c.ep.slice(8).map((e) => e - 8));
}

interface Tables {
  twistMove: Uint16Array;
  flipMove: Uint16Array;
  sliceMove: Uint16Array;
  cpermMove: Uint16Array;
  udEdgeMove: Uint16Array;
  slicePermMove: Uint8Array;
  pruneTwist: Uint8Array;
  pruneFlip: Uint8Array;
  pruneCperm: Uint8Array;
  pruneUdEdge: Uint8Array;
}

let tables: Tables | null = null;

/** 좌표 하나의 수 표를 만든다. */
function buildMoveTable(
  count: number,
  moves: readonly number[],
  set: (c: CubieCube, x: number) => void,
  get: (c: CubieCube) => number,
  part: "corner" | "edge",
): Uint16Array {
  const all = faceMoveCubies();
  const table = new Uint16Array(count * moves.length);
  const a = solvedCubie();
  const out = solvedCubie();
  const mul = part === "corner" ? cornerMultiply : edgeMultiply;
  for (let x = 0; x < count; x++) {
    set(a, x);
    for (let k = 0; k < moves.length; k++) {
      mul(a, all[moves[k] as number] as CubieCube, out);
      table[x * moves.length + k] = get(out);
    }
  }
  return table;
}

/**
 * 순열 좌표(0..n!-1)의 수 표. `buildMoveTable`과 같은 표를 내지만, 4만 개 순열마다 조각 표현을 만들고
 * 곱하는 대신 작은 배열 하나로 풀고 접어 표 만들기 시간을 줄인다(타이머 첫 섞기가 이 표를 기다린다).
 * `perms[k][i]`는 수 k 뒤 자리 i에 오는 조각이 수 앞에 있던 자리(곱셈 A·M에서 M.cp/ep의 앞 n칸).
 */
function buildPermMoveTable(
  n: number,
  perms: readonly (readonly number[])[],
): Uint16Array {
  let count = 1;
  for (let i = 2; i <= n; i++) count *= i;
  const fact = new Int32Array(n + 1);
  fact[0] = 1;
  for (let i = 1; i <= n; i++) fact[i] = (fact[i - 1] as number) * i;
  const nm = perms.length;
  const table = new Uint16Array(count * nm);
  const p = new Int8Array(n);
  const q = new Int8Array(n);
  const left = new Int8Array(n);
  for (let x = 0; x < count; x++) {
    // 번호 x → 순열 p(`unrankPermutation`과 같은 차례)
    for (let i = 0; i < n; i++) left[i] = i;
    let r = x;
    let size = n;
    for (let i = 0; i < n; i++) {
      const f = fact[n - 1 - i] as number;
      const k = Math.floor(r / f);
      r -= k * f;
      p[i] = left[k] as number;
      for (let j = k; j < size - 1; j++) left[j] = left[j + 1] as number;
      size--;
    }
    for (let m = 0; m < nm; m++) {
      const perm = perms[m] as readonly number[];
      for (let i = 0; i < n; i++) q[i] = p[perm[i] as number] as number;
      // 순열 q → 번호(`rankPermutation`과 같다)
      let rank = 0;
      for (let i = 0; i < n; i++) {
        let smaller = 0;
        const v = q[i] as number;
        for (let j = i + 1; j < n; j++) if ((q[j] as number) < v) smaller++;
        rank += smaller * (fact[n - 1 - i] as number);
      }
      table[x * nm + m] = rank;
    }
  }
  return table;
}

/**
 * 두 좌표 짝(a: 가운데 층 쪽, b: 다른 쪽)의 거리표. 번호는 a × countB + b.
 * 칸이 반 넘게 차면 거꾸로(빈 칸에서 이미 찬 칸을 찾는 쪽으로) 채워 빨리 끝낸다.
 */
function buildPruneTable(
  countA: number,
  moveA: ArrayLike<number>,
  countB: number,
  moveB: ArrayLike<number>,
  nMoves: number,
  startA: number,
): Uint8Array {
  const total = countA * countB;
  const t = new Uint8Array(total).fill(255);
  t[startA * countB] = 0;
  let filled = 1;
  // a·b를 두 겹 고리로 돌아 칸마다 나눗셈을 하지 않는다(표 만들기 시간을 줄인다, 결과는 같다)
  const rowA = new Int32Array(nMoves);
  for (let d = 0; filled < total; d++) {
    const backward = filled > total / 2;
    const want = backward ? 255 : d;
    const before = filled;
    for (let a = 0, i = 0; a < countA; a++) {
      for (let m = 0; m < nMoves; m++)
        rowA[m] = (moveA[a * nMoves + m] as number) * countB;
      for (let b = 0; b < countB; b++, i++) {
        if (t[i] !== want) continue;
        const rowB = b * nMoves;
        for (let m = 0; m < nMoves; m++) {
          const j = (rowA[m] as number) + (moveB[rowB + m] as number);
          if (backward) {
            if (t[j] === d) {
              t[i] = d + 1;
              filled++;
              break;
            }
          } else if (t[j] === 255) {
            t[j] = d + 1;
            filled++;
          }
        }
      }
    }
    if (filled === before) throw new Error("가지치기 표를 다 채우지 못했다");
  }
  return t;
}

/** 3×3 해법 표를 만든다. 이미 만들었으면 아무것도 하지 않는다. */
export function init3x3(): void {
  if (tables) return;
  const all18 = Array.from({ length: N_MOVES }, (_, m) => m);
  const twistMove = buildMoveTable(N_TWIST, all18, setTwist, twistOf, "corner");
  const flipMove = buildMoveTable(N_FLIP, all18, setFlip, flipOf, "edge");
  const sliceMove = buildMoveTable(N_SLICE, all18, setSlice, sliceOf, "edge");
  // 2단계 수는 위아래 층 엣지를 위아래 층 안에서만 옮기므로 ep의 앞 8칸만 보면 된다
  const all = faceMoveCubies();
  const p2 = P2_MOVES.map((m) => all[m] as CubieCube);
  const cpermMove = buildPermMoveTable(
    8,
    p2.map((c) => c.cp),
  );
  const udEdgeMove = buildPermMoveTable(
    8,
    p2.map((c) => c.ep.slice(0, 8)),
  );
  const slicePermMove = Uint8Array.from(
    buildMoveTable(
      N_SLICE_PERM,
      P2_MOVES,
      (c, x) => {
        c.ep = [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          ...unrankPermutation(x, 4).map((e) => e + 8),
        ];
      },
      slicePermOf,
      "edge",
    ),
  );
  tables = {
    twistMove,
    flipMove,
    sliceMove,
    cpermMove,
    udEdgeMove,
    slicePermMove,
    pruneTwist: buildPruneTable(
      N_SLICE,
      sliceMove,
      N_TWIST,
      twistMove,
      N_MOVES,
      SLICE_SOLVED,
    ),
    pruneFlip: buildPruneTable(
      N_SLICE,
      sliceMove,
      N_FLIP,
      flipMove,
      N_MOVES,
      SLICE_SOLVED,
    ),
    pruneCperm: buildPruneTable(
      N_SLICE_PERM,
      slicePermMove,
      N_PERM8,
      cpermMove,
      N_P2,
      0,
    ),
    pruneUdEdge: buildPruneTable(
      N_SLICE_PERM,
      slicePermMove,
      N_PERM8,
      udEdgeMove,
      N_P2,
      0,
    ),
  };
}

export interface Solve3x3Options {
  /** 해의 최대 길이(HTM). 기본 21. 줄이면 더 오래 찾는다(20 아래는 매우 오래 걸릴 수 있다). */
  maxLength?: number;
  /**
   * 해의 첫 수로 두지 않을 축(그 면과 맞은편 면 모두). 예: "R"이면 R·L로 시작하지 않는다.
   * 블라인드 섞기에서 섞기 마지막 수(= 해 첫 수의 거꾸로)가 뒤에 붙는 방향 돌리기와 같은 축이
   * 되지 않게 한다(TNoodle firstAxisRestriction).
   */
  firstAxisNot?: "U" | "R" | "F" | "D" | "L" | "B";
  /**
   * 탐색 도중 때때로(탐색 마디 1024개마다) 부른다. true를 돌려주면 탐색을 멈추고 `SolveStopped`를 던진다.
   * 시간 상한을 둘 때 쓴다(동기 탐색이라 밖에서 끊을 수 없다).
   */
  shouldStop?: (() => boolean) | undefined;
}

/** `shouldStop`이 true를 돌려주어 탐색을 멈췄다 */
export class SolveStopped extends Error {
  constructor() {
    super("탐색을 멈췄다");
    this.name = "SolveStopped";
  }
}

/** 3×3 스티커의 글자를 가운데 색 기준 면 이름으로 바꾼다(가운데 여섯이 서로 달라야 한다). */
function relabelByCenters(facelets: string): string {
  if (facelets.length !== 54) return facelets;
  const rename = new Map<string, string>();
  for (let k = 0; k < 6; k++) {
    rename.set(facelets[k * 9 + 4] as string, FACES[k] as string);
  }
  if (rename.size !== 6) throw new Error("가운데 조각 색이 겹친다");
  let out = "";
  for (const ch of facelets) {
    const r = rename.get(ch);
    if (r === undefined) throw new Error(`모르는 글자: ${ch}`);
    out += r;
  }
  return out;
}

/** 한 번의 탐색이 쓰는 상태(동기 탐색이라 모듈 안에 둔다). */
const seq = new Int8Array(64);
let start: CubieCube = solvedCubie();
let limit = 21;
/** 첫 수로 막은 축(0 U·D, 1 R·L, 2 F·B), 없으면 -1 */
let bannedFirstAxis = -1;
let shouldStop: (() => boolean) | null = null;
let nodes = 0;

/** 탐색 마디마다 부른다. 멈춤 확인은 1024마디에 한 번 */
function checkStop(): void {
  if (shouldStop !== null && (++nodes & 1023) === 0 && shouldStop())
    throw new SolveStopped();
}

/** 직전 수 다음에 두지 않을 수: 같은 면, 그리고 맞은편 면은 U·R·F 쪽이 먼저 오게. */
function skip(face: number, depth: number): boolean {
  if (depth === 0) return face % 3 === bannedFirstAxis;
  const prev = Math.floor((seq[depth - 1] as number) / 3);
  return face === prev || face === prev - 3;
}

function phase1(
  t: Tables,
  twist: number,
  flip: number,
  slice: number,
  depth: number,
  togo: number,
): boolean {
  checkStop();
  if (togo === 0) {
    if (twist !== 0 || flip !== 0 || slice !== SLICE_SOLVED) return false;
    // 2단계 수로 끝나면 그 수를 뺀 더 짧은 1단계 해가 이미 있다
    if (depth > 0 && IS_P2_MOVE[seq[depth - 1] as number]) return false;
    return phase2Start(t, depth);
  }
  for (let m = 0; m < N_MOVES; m++) {
    if (skip(Math.floor(m / 3), depth)) continue;
    const nt = t.twistMove[twist * N_MOVES + m] as number;
    const nf = t.flipMove[flip * N_MOVES + m] as number;
    const ns = t.sliceMove[slice * N_MOVES + m] as number;
    const h = Math.max(
      t.pruneTwist[ns * N_TWIST + nt] as number,
      t.pruneFlip[ns * N_FLIP + nf] as number,
    );
    if (h > togo - 1) continue;
    seq[depth] = m;
    if (phase1(t, nt, nf, ns, depth + 1, togo - 1)) return true;
  }
  return false;
}

function phase2Start(t: Tables, depth1: number): boolean {
  const moves = faceMoveCubies();
  let c = cloneCubie(start);
  const out = solvedCubie();
  for (let i = 0; i < depth1; i++) {
    const mv = moves[seq[i] as number] as CubieCube;
    cornerMultiply(c, mv, out);
    edgeMultiply(c, mv, out);
    c = cloneCubie(out);
  }
  const cp = cpermOf(c);
  const ue = udEdgeOf(c);
  const sp = slicePermOf(c);
  const h0 = Math.max(
    t.pruneCperm[sp * N_PERM8 + cp] as number,
    t.pruneUdEdge[sp * N_PERM8 + ue] as number,
  );
  for (let d2 = h0; d2 <= limit - depth1; d2++) {
    if (phase2(t, cp, ue, sp, depth1, d2)) {
      solutionLength = depth1 + d2;
      return true;
    }
  }
  return false;
}

let solutionLength = 0;

function phase2(
  t: Tables,
  cp: number,
  ue: number,
  sp: number,
  depth: number,
  togo: number,
): boolean {
  checkStop();
  if (togo === 0) return cp === 0 && ue === 0 && sp === 0;
  for (let k = 0; k < N_P2; k++) {
    const m = P2_MOVES[k] as number;
    if (skip(Math.floor(m / 3), depth)) continue;
    const ncp = t.cpermMove[cp * N_P2 + k] as number;
    const nue = t.udEdgeMove[ue * N_P2 + k] as number;
    const nsp = t.slicePermMove[sp * N_P2 + k] as number;
    const h = Math.max(
      t.pruneCperm[nsp * N_PERM8 + ncp] as number,
      t.pruneUdEdge[nsp * N_PERM8 + nue] as number,
    );
    if (h > togo - 1) continue;
    seq[depth] = m;
    if (phase2(t, ncp, nue, nsp, depth + 1, togo - 1)) return true;
  }
  return false;
}

/**
 * 3×3 스티커 문자열(54글자, Kociemba 순서)을 맞추는 수를 WCA 표기로 낸다. 맞춘 상태면 빈 문자열.
 * 같은 입력이면 늘 같은 해가 나온다. 맞출 수 없는 상태면 오류. `shouldStop`으로 멈추면 `SolveStopped`.
 *
 * 큐브가 돌아가 있어도(가운데가 기본 방향이 아님: x·y로 돌렸거나 Rw·Uw로 끝난 섞기) 된다.
 * 가운데 색을 기준으로 면 이름을 다시 붙여 푼다. 바깥 면 수는 공간에 붙은 면(위·오른쪽…)을
 * 돌리는 것이라, 해는 그대로 그 큐브에 두면 맞는다(맞춘 뒤 큐브 방향은 처음 방향 그대로).
 */
export function solve3x3(
  facelets: string,
  options: Solve3x3Options = {},
): string {
  const cube = faceletsToCubie(relabelByCenters(facelets));
  init3x3();
  const t = tables as Tables;
  start = cube;
  limit = options.maxLength ?? 21;
  bannedFirstAxis =
    options.firstAxisNot === undefined
      ? -1
      : FACES.indexOf(options.firstAxisNot) % 3;
  shouldStop = options.shouldStop ?? null;
  nodes = 0;
  const twist = twistOf(cube);
  const flip = flipOf(cube);
  const slice = sliceOf(cube);
  for (let d1 = 0; d1 <= limit; d1++) {
    if (phase1(t, twist, flip, slice, 0, d1)) {
      const out: string[] = [];
      for (let i = 0; i < solutionLength; i++)
        out.push(moveName(seq[i] as number));
      return out.join(" ");
    }
  }
  throw new Error(`${limit}수 안에서 해를 찾지 못했다`);
}
