import { FACES, type Face, solvedFacelets } from "@game/cube-solver";
import { applyToFacelets } from "./facelets";

/**
 * 조각 표현(cubie)과 조각 하나하나의 좌표 수 표.
 *
 * 자리·조각 번호와 방향 뜻은 cube-solver와 같다(Kociemba).
 * - 꼭짓점: URF UFL ULB UBR DFR DLF DBL DRB (0..7), 방향 = U·D색 스티커가 몇 번째 스티커에 있나(0..2)
 * - 모서리: UR UF UL UB DR DF DL DB FR FL BL BR (0..11), 방향 0·1
 *
 * 글자는 "지금 큐브 방향 기준" 면 이름이다(`Solve.rel()`). 그래서 같은 번호라도
 * 큐브를 돌리면(y 등) 가리키는 실제 조각이 바뀐다. 사람이 "앞 오른쪽 자리"라고 부르는 것과 같다.
 *
 * 남은 일: 조각 번호 표가 cube-solver의 facelets 표, cube-reduction `three.ts`의 표와 겹친다.
 * cube-solver가 표를 내보내게 하고 하나로 합친다(game-85 #52 검토).
 */

export interface Cubie {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

/** 3×3 스티커 번호로 적은 꼭짓점 자리(U·D 스티커가 먼저, 그다음 시계 방향) */
const CORNER_FACELETS_3 = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
] as const;

export const EDGE_FACELETS = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
] as const;

export const CORNER_NAMES = [
  "URF",
  "UFL",
  "ULB",
  "UBR",
  "DFR",
  "DLF",
  "DBL",
  "DRB",
] as const;

export const EDGE_NAMES = [
  "UR",
  "UF",
  "UL",
  "UB",
  "DR",
  "DF",
  "DL",
  "DB",
  "FR",
  "FL",
  "BL",
  "BR",
] as const;

const cornerTableCache = new Map<number, number[][]>();

/** n×n 큐브의 꼭짓점 스티커 자리(3×3 자리에서 줄·칸 0과 2를 0과 n-1로) */
export function cornerFacelets(n: number): number[][] {
  let hit = cornerTableCache.get(n);
  if (!hit) {
    hit = CORNER_FACELETS_3.map((corner) =>
      corner.map((i) => {
        const face = Math.floor(i / 9);
        const p = i % 9;
        const r = Math.floor(p / 3) === 0 ? 0 : n - 1;
        const c = p % 3 === 0 ? 0 : n - 1;
        return face * n * n + r * n + c;
      }),
    );
    cornerTableCache.set(n, hit);
  }
  return hit;
}

/**
 * 기준 방향 글자 문자열 → 조각 표현. n=2면 꼭짓점만(ep·eo는 빈 배열).
 * 맞지 않는 조각(색 조합이 없는 것)이 있으면 오류.
 */
export function readCubie(rel: string, n: number): Cubie {
  const cp: number[] = [];
  const co: number[] = [];
  for (const slot of cornerFacelets(n)) {
    const t = slot.map((i) => rel[i] as string);
    const ori = t.findIndex((x) => x === "U" || x === "D");
    const name = `${t[ori]}${t[(ori + 1) % 3]}${t[(ori + 2) % 3]}`;
    const piece = (CORNER_NAMES as readonly string[]).indexOf(name);
    if (ori < 0 || piece < 0) throw new Error(`꼭짓점 색 조합이 없다: ${t}`);
    cp.push(piece);
    co.push(ori);
  }
  const ep: number[] = [];
  const eo: number[] = [];
  if (n === 3) {
    for (const [a, b] of EDGE_FACELETS) {
      const x = rel[a] as string;
      const y = rel[b] as string;
      let piece = (EDGE_NAMES as readonly string[]).indexOf(`${x}${y}`);
      let ori = 0;
      if (piece < 0) {
        piece = (EDGE_NAMES as readonly string[]).indexOf(`${y}${x}`);
        ori = 1;
      }
      if (piece < 0) throw new Error(`모서리 색 조합이 없다: ${x}${y}`);
      ep.push(piece);
      eo.push(ori);
    }
  }
  return { cp, co, ep, eo };
}

// ---------- 조각 하나의 좌표 ----------

/** 바깥 면 18수: 번호 = 면 × 3 + (돌린 횟수 - 1), 면 차례 U R F D L B */
export const FACE_MOVE_COUNT = 18;

export function faceMoveName(m: number): string {
  return `${FACES[Math.floor(m / 3)] as Face}${["", "2", "'"][m % 3]}`;
}

export interface CoordTables {
  /** 꼭짓점 좌표(자리×3+방향, 0..23) × 18수 → 새 좌표 */
  corner: Uint8Array;
  /** 모서리 좌표(자리×2+방향, 0..23) × 18수 → 새 좌표 */
  edge: Uint8Array;
}

let coordTables: CoordTables | null = null;

const AXIS_OF: Readonly<Record<Face, "x" | "y" | "z">> = {
  U: "y",
  R: "x",
  F: "z",
  D: "y",
  L: "x",
  B: "z",
};

/**
 * 조각 하나가 바깥 면 수로 어디로 가나. 맞춘 3×3에 수를 두고 읽은 조각 표현 M으로 만든다:
 * 자리 s·방향 o의 조각은 수 뒤에 M.cp[s'] = s인 자리 s'로 가고 방향은 o + M.co[s'].
 */
export function coordMoveTables(): CoordTables {
  if (coordTables) return coordTables;
  const corner = new Uint8Array(24 * FACE_MOVE_COUNT);
  const edge = new Uint8Array(24 * FACE_MOVE_COUNT);
  const solved = solvedFacelets(3).split("");
  for (let m = 0; m < FACE_MOVE_COUNT; m++) {
    const face = FACES[Math.floor(m / 3)] as Face;
    const positive = face === "U" || face === "R" || face === "F";
    const turns = (m % 3) + 1;
    const layer = positive ? 1 : 3;
    // 엔진 수는 + 쪽에서 본 시계 방향이라 D·L·B는 방향을 뒤집는다
    const t = (positive ? turns : 4 - turns) as 1 | 2 | 3;
    const after = applyToFacelets(3, solved, {
      axis: AXIS_OF[face],
      from: layer,
      to: layer,
      turns: t,
    });
    const M = readCubie(after.join(""), 3);
    for (let s2 = 0; s2 < 8; s2++) {
      const s = M.cp[s2] as number;
      for (let o = 0; o < 3; o++) {
        corner[(s * 3 + o) * FACE_MOVE_COUNT + m] =
          s2 * 3 + ((o + (M.co[s2] as number)) % 3);
      }
    }
    for (let s2 = 0; s2 < 12; s2++) {
      const s = M.ep[s2] as number;
      for (let o = 0; o < 2; o++) {
        edge[(s * 2 + o) * FACE_MOVE_COUNT + m] =
          s2 * 2 + ((o + (M.eo[s2] as number)) % 2);
      }
    }
  }
  coordTables = { corner, edge };
  return coordTables;
}

/** 조각 표현에서 꼭짓점 조각 `piece`의 좌표(자리×3+방향) */
export function cornerCoord(c: Cubie, piece: number): number {
  const s = c.cp.indexOf(piece);
  return s * 3 + (c.co[s] as number);
}

/** 조각 표현에서 모서리 조각 `piece`의 좌표(자리×2+방향) */
export function edgeCoord(c: Cubie, piece: number): number {
  const s = c.ep.indexOf(piece);
  return s * 2 + (c.eo[s] as number);
}
