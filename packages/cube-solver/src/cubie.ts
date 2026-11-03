/**
 * 꼭짓점·모서리 조각 표현(cubie). 해법기 안에서만 쓰는 표현이다.
 *
 * - 꼭짓점 자리 순서: URF UFL ULB UBR DFR DLF DBL DRB (0..7)
 * - 모서리 자리 순서: UR UF UL UB DR DF DL DB FR FL BL BR (0..11)
 * - `cp[i]`는 자리 i에 있는 꼭짓점 번호, `co[i]`는 그 꼭짓점의 돌아간 정도(0..2,
 *   U·D색 스티커가 U·D면에 있으면 0). 모서리도 같다(`ep`, `eo` 0..1).
 * - 상태 A에 수 M을 두면 A·M(아래 `multiply`).
 */
import { FACES, type Face, movePermutation, solvedFacelets } from "./facelets";

export interface CubieCube {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

/** 3×3 스티커 번호로 적은 꼭짓점 스티커 자리(U·D 스티커가 먼저, 그다음 시계 방향). */
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

export const CORNER_COLORS: readonly (readonly [Face, Face, Face])[] = [
  ["U", "R", "F"],
  ["U", "F", "L"],
  ["U", "L", "B"],
  ["U", "B", "R"],
  ["D", "F", "R"],
  ["D", "L", "F"],
  ["D", "B", "L"],
  ["D", "R", "B"],
];

export const EDGE_COLORS: readonly (readonly [Face, Face])[] = [
  ["U", "R"],
  ["U", "F"],
  ["U", "L"],
  ["U", "B"],
  ["D", "R"],
  ["D", "F"],
  ["D", "L"],
  ["D", "B"],
  ["F", "R"],
  ["F", "L"],
  ["B", "L"],
  ["B", "R"],
];

/** n×n 큐브의 꼭짓점 스티커 자리. 3×3 자리에서 줄·칸 0과 2를 0과 n-1로 옮긴다. */
export function cornerFacelets(n: number): number[][] {
  return CORNER_FACELETS_3.map((corner) =>
    corner.map((i) => {
      const face = Math.floor(i / 9);
      const p = i % 9;
      const r = Math.floor(p / 3) === 0 ? 0 : n - 1;
      const c = p % 3 === 0 ? 0 : n - 1;
      return face * n * n + r * n + c;
    }),
  );
}

export function solvedCubie(): CubieCube {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export function cloneCubie(c: CubieCube): CubieCube {
  return { cp: [...c.cp], co: [...c.co], ep: [...c.ep], eo: [...c.eo] };
}

/** 상태 a 다음에 b를 둔 결과(a·b). */
export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  const r = solvedCubie();
  cornerMultiply(a, b, r);
  edgeMultiply(a, b, r);
  return r;
}

export function cornerMultiply(a: CubieCube, b: CubieCube, out: CubieCube) {
  for (let i = 0; i < 8; i++) {
    const from = b.cp[i] as number;
    out.cp[i] = a.cp[from] as number;
    out.co[i] = ((a.co[from] as number) + (b.co[i] as number)) % 3;
  }
}

export function edgeMultiply(a: CubieCube, b: CubieCube, out: CubieCube) {
  for (let i = 0; i < 12; i++) {
    const from = b.ep[i] as number;
    out.ep[i] = a.ep[from] as number;
    out.eo[i] = ((a.eo[from] as number) + (b.eo[i] as number)) % 2;
  }
}

/** 꼭짓점 자리 i에서 어느 꼭짓점이 어느 방향으로 있는지 읽는다. 못 읽으면 null. */
function readCorner(
  f: string,
  facelets: readonly number[],
): { piece: number; ori: number } | null {
  for (let ori = 0; ori < 3; ori++) {
    const top = f[facelets[ori] as number];
    if (top !== "U" && top !== "D") continue;
    const c1 = f[facelets[(ori + 1) % 3] as number];
    const c2 = f[facelets[(ori + 2) % 3] as number];
    for (let j = 0; j < 8; j++) {
      const col = CORNER_COLORS[j] as readonly [Face, Face, Face];
      if (col[0] === top && col[1] === c1 && col[2] === c2) {
        return { piece: j, ori };
      }
    }
    return null;
  }
  return null;
}

/** 스티커 문자열의 꼭짓점 부분을 읽는다(2×2·3×3 모두). 맞지 않는 조각이 있으면 오류. */
export function readCorners(
  f: string,
  n: number,
): { cp: number[]; co: number[] } {
  const table = cornerFacelets(n);
  const cp: number[] = [];
  const co: number[] = [];
  for (let i = 0; i < 8; i++) {
    const got = readCorner(f, table[i] as number[]);
    if (!got) throw new Error(`꼭짓점 ${i}번 자리의 색 조합이 맞지 않는다`);
    cp.push(got.piece);
    co.push(got.ori);
  }
  checkPermutation(cp, "꼭짓점");
  if (co.reduce((s, x) => s + x, 0) % 3 !== 0) {
    throw new Error("꼭짓점 방향 합이 맞지 않는다(꼭짓점 하나가 돌아가 있다)");
  }
  return { cp, co };
}

/** 3×3 스티커 문자열 → 조각 표현. 맞출 수 없는 상태면 오류. */
export function faceletsToCubie(f: string): CubieCube {
  if (f.length !== 54)
    throw new Error(`3×3 스티커는 54글자여야 한다: ${f.length}`);
  for (let k = 0; k < 6; k++) {
    if (f[k * 9 + 4] !== FACES[k]) {
      throw new Error("가운데 조각이 기본 방향(U 위, F 앞)에 있어야 한다");
    }
  }
  const { cp, co } = readCorners(f, 3);
  const ep: number[] = [];
  const eo: number[] = [];
  for (let i = 0; i < 12; i++) {
    const [a, b] = EDGE_FACELETS[i] as readonly [number, number];
    let found = false;
    for (let j = 0; j < 12; j++) {
      const col = EDGE_COLORS[j] as readonly [Face, Face];
      if (f[a] === col[0] && f[b] === col[1]) {
        ep.push(j);
        eo.push(0);
        found = true;
        break;
      }
      if (f[a] === col[1] && f[b] === col[0]) {
        ep.push(j);
        eo.push(1);
        found = true;
        break;
      }
    }
    if (!found) throw new Error(`모서리 ${i}번 자리의 색 조합이 맞지 않는다`);
  }
  checkPermutation(ep, "모서리");
  if (eo.reduce((s, x) => s + x, 0) % 2 !== 0) {
    throw new Error("모서리 방향 합이 맞지 않는다(모서리 하나가 뒤집혀 있다)");
  }
  if (parity(cp) !== parity(ep)) {
    throw new Error(
      "꼭짓점과 모서리 순열의 홀짝이 맞지 않는다(두 조각이 바뀌어 있다)",
    );
  }
  return { cp, co, ep, eo };
}

/** 조각 표현 → 스티커 문자열. n=2면 꼭짓점만 쓴다. */
export function cubieToFacelets(c: CubieCube, n = 3): string {
  const out = solvedFacelets(n).split("");
  const table = cornerFacelets(n);
  for (let i = 0; i < 8; i++) {
    const j = c.cp[i] as number;
    const ori = c.co[i] as number;
    const facelets = table[i] as number[];
    for (let k = 0; k < 3; k++) {
      out[facelets[(k + ori) % 3] as number] = (
        CORNER_COLORS[j] as readonly Face[]
      )[k] as Face;
    }
  }
  if (n === 3) {
    for (let i = 0; i < 12; i++) {
      const j = c.ep[i] as number;
      const ori = c.eo[i] as number;
      const facelets = EDGE_FACELETS[i] as readonly number[];
      for (let k = 0; k < 2; k++) {
        out[facelets[(k + ori) % 2] as number] = (
          EDGE_COLORS[j] as readonly Face[]
        )[k] as Face;
      }
    }
  }
  return out.join("");
}

function checkPermutation(p: number[], name: string) {
  const seen = new Set(p);
  if (seen.size !== p.length) throw new Error(`${name} 조각이 겹친다`);
}

/** 순열의 홀짝(0 짝, 1 홀). */
export function parity(p: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      if ((p[j] as number) < (p[i] as number)) s ^= 1;
    }
  }
  return s;
}

/**
 * 18가지 바깥 면 수의 조각 표현. 번호 m = 면×3 + (돌린 횟수-1), 면 순서 U R F D L B.
 * 스티커 시뮬레이터로 맞춘 큐브에 수를 두고 읽어 만든다.
 */
let moveCubies: CubieCube[] | null = null;

export function faceMoveCubies(): CubieCube[] {
  if (!moveCubies) {
    const solved = solvedFacelets(3);
    moveCubies = [];
    for (const face of FACES) {
      for (const turns of [1, 2, 3] as const) {
        const dest = movePermutation(3, { face, from: 1, to: 1, turns });
        const next = new Array<string>(54);
        for (let i = 0; i < 54; i++)
          next[dest[i] as number] = solved[i] as string;
        moveCubies.push(faceletsToCubie(next.join("")));
      }
    }
  }
  return moveCubies;
}

/** 수 번호 → WCA 표기. */
export function moveName(m: number): string {
  const face = FACES[Math.floor(m / 3)] as Face;
  return face + ["", "2", "'"][m % 3];
}
