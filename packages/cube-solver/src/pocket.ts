/**
 * 2×2 최적 해.
 *
 * 2×2에는 가운데 조각이 없어서 DBL 꼭짓점을 기준으로 고정하고 U·R·F만 쓴다. 그러면 상태는
 * 나머지 꼭짓점 7개의 순열(5040) × 방향(3^6 = 729) = 3,674,160개다. 처음 부를 때 맞춘
 * 상태에서 너비 우선으로 모든 상태의 거리를 구해 Uint8Array에 둔다(약 3.6MB). 그 뒤로는
 * 거리가 하나씩 줄어드는 수를 따라가면 최적 해(HTM, 최대 11수)가 바로 나온다.
 */
import {
  type CubieCube,
  cornerMultiply,
  faceMoveCubies,
  moveName,
  readCorners,
  solvedCubie,
} from "./cubie";
import { type Face, sizeOf } from "./facelets";
import { rankPermutation, unrankPermutation } from "./perm";

const PERM_COUNT = 5040;
const ORI_COUNT = 729;
export const POCKET_STATE_COUNT = PERM_COUNT * ORI_COUNT;

/** 쓰는 수: U U2 U' R R2 R' F F2 F' (전체 18수 번호로) */
const MOVES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/** 고정한 DBL을 뺀 꼭짓점 자리 */
const SLOTS = [0, 1, 2, 3, 4, 5, 7];
const DBL = 6;

const OPPOSITE: Record<Face, Face> = {
  U: "D",
  D: "U",
  R: "L",
  L: "R",
  F: "B",
  B: "F",
};

interface Tables {
  permMove: Uint16Array;
  oriMove: Uint16Array;
  dist: Uint8Array;
}

let tables: Tables | null = null;

function toSlot(piece: number): number {
  return piece < DBL ? piece : piece - 1;
}

function permCoord(c: CubieCube): number {
  return rankPermutation(SLOTS.map((i) => toSlot(c.cp[i] as number)));
}

function oriCoord(c: CubieCube): number {
  let t = 0;
  for (let k = 0; k < 6; k++) t = t * 3 + (c.co[SLOTS[k] as number] as number);
  return t;
}

function setPerm(c: CubieCube, coord: number) {
  const p = unrankPermutation(coord, 7);
  for (let k = 0; k < 7; k++) {
    c.cp[SLOTS[k] as number] = SLOTS[p[k] as number] as number;
  }
  c.cp[DBL] = DBL;
}

function setOri(c: CubieCube, coord: number) {
  let sum = 0;
  for (let k = 5; k >= 0; k--) {
    const o = coord % 3;
    c.co[SLOTS[k] as number] = o;
    sum += o;
    coord = Math.floor(coord / 3);
  }
  c.co[7] = (3 - (sum % 3)) % 3;
  c.co[DBL] = 0;
}

/** 2×2 거리표를 만든다. 이미 만들었으면 아무것도 하지 않는다. */
export function init2x2(): void {
  if (tables) return;
  const moves = faceMoveCubies();
  const permMove = new Uint16Array(PERM_COUNT * 9);
  const oriMove = new Uint16Array(ORI_COUNT * 9);
  const a = solvedCubie();
  const out = solvedCubie();
  for (let p = 0; p < PERM_COUNT; p++) {
    setPerm(a, p);
    for (let k = 0; k < 9; k++) {
      cornerMultiply(a, moves[MOVES[k] as number] as CubieCube, out);
      permMove[p * 9 + k] = permCoord(out);
    }
  }
  a.cp = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let o = 0; o < ORI_COUNT; o++) {
    setOri(a, o);
    for (let k = 0; k < 9; k++) {
      cornerMultiply(a, moves[MOVES[k] as number] as CubieCube, out);
      oriMove[o * 9 + k] = oriCoord(out);
    }
  }

  const dist = new Uint8Array(POCKET_STATE_COUNT).fill(255);
  dist[0] = 0;
  let filled = 1;
  for (let d = 0; filled < POCKET_STATE_COUNT; d++) {
    for (let s = 0; s < POCKET_STATE_COUNT; s++) {
      if (dist[s] !== d) continue;
      const p = Math.floor(s / ORI_COUNT);
      const o = s - p * ORI_COUNT;
      for (let k = 0; k < 9; k++) {
        const t =
          (permMove[p * 9 + k] as number) * ORI_COUNT +
          (oriMove[o * 9 + k] as number);
        if (dist[t] === 255) {
          dist[t] = d + 1;
          filled++;
        }
      }
    }
  }
  tables = { permMove, oriMove, dist };
}

/**
 * 2×2 스티커(24글자)를 DBL 기준 상태 번호로 바꾼다. 큐브가 어느 방향으로 들려 있어도 되도록
 * DBL 자리 꼭짓점의 색을 D·B·L로 보고 나머지 색 이름을 다시 붙인다.
 */
export function pocketIndex(facelets: string): number {
  if (facelets.length !== 24 || sizeOf(facelets) !== 2) {
    throw new Error(`2×2 스티커는 24글자여야 한다: ${facelets.length}`);
  }
  // DBL 자리 스티커: D3(=D7), B4(=B9), L3(=L7)
  const d = facelets[14] as Face;
  const b = facelets[23] as Face;
  const l = facelets[18] as Face;
  const rename = new Map<string, Face>([
    [d, "D"],
    [b, "B"],
    [l, "L"],
    [OPPOSITE[d], "U"],
    [OPPOSITE[b], "F"],
    [OPPOSITE[l], "R"],
  ]);
  if (rename.size !== 6) throw new Error("DBL 꼭짓점의 색 조합이 맞지 않는다");
  const renamed = facelets
    .split("")
    .map((ch) => {
      const r = rename.get(ch);
      if (!r) throw new Error(`모르는 글자: ${ch}`);
      return r;
    })
    .join("");
  const { cp, co } = readCorners(renamed, 2);
  const c: CubieCube = { ...solvedCubie(), cp, co };
  if (cp[DBL] !== DBL || co[DBL] !== 0) {
    throw new Error("DBL 꼭짓점이 거울에 비친 모양이다");
  }
  return permCoord(c) * ORI_COUNT + oriCoord(c);
}

/** 상태 번호 → 그 상태의 조각 표현(꼭짓점만, DBL 고정). 무작위 섞기에 쓴다. */
export function pocketCubie(index: number): CubieCube {
  const c = solvedCubie();
  setPerm(c, Math.floor(index / ORI_COUNT));
  setOri(c, index % ORI_COUNT);
  return c;
}

function pocketDistanceOf(index: number): number {
  init2x2();
  return (tables as Tables).dist[index] as number;
}

/** 상태 번호의 최적 해. U·R·F만 쓴 WCA 표기, 맞춘 상태면 빈 문자열. */
export function solvePocketIndex(index: number): string {
  init2x2();
  const { permMove, oriMove, dist } = tables as Tables;
  const out: string[] = [];
  let s = index;
  let d = dist[s] as number;
  while (d > 0) {
    const p = Math.floor(s / ORI_COUNT);
    const o = s - p * ORI_COUNT;
    let next = -1;
    for (let k = 0; k < 9; k++) {
      const t =
        (permMove[p * 9 + k] as number) * ORI_COUNT +
        (oriMove[o * 9 + k] as number);
      if (dist[t] === d - 1) {
        out.push(moveName(MOVES[k] as number));
        next = t;
        break;
      }
    }
    if (next < 0) throw new Error("2×2 거리표가 어긋났다");
    s = next;
    d--;
  }
  return out.join(" ");
}

/** 2×2 최적 해 길이(HTM). */
export function distance2x2(facelets: string): number {
  return pocketDistanceOf(pocketIndex(facelets));
}

/**
 * 상태 번호에 수 하나를 돌린 상태 번호. `move`는 0~8(U U2 U' R R2 R' F F2 F').
 * 정해진 길이의 섞기를 찾는 탐색(cube-scramble)에 쓴다.
 */
export function pocketApply(index: number, move: number): number {
  init2x2();
  const { permMove, oriMove } = tables as Tables;
  const p = Math.floor(index / ORI_COUNT);
  const o = index - p * ORI_COUNT;
  return (
    (permMove[p * 9 + move] as number) * ORI_COUNT +
    (oriMove[o * 9 + move] as number)
  );
}

/** 2×2 상태 번호의 최적 해 길이. */
export function pocketDistance(index: number): number {
  return pocketDistanceOf(index);
}

/** 2×2 최적 해(U·R·F만 쓴 WCA 표기). 맞춘 상태면 빈 문자열. */
export function solve2x2(facelets: string): string {
  return solvePocketIndex(pocketIndex(facelets));
}
